// Daily learning job: updates each UK reference station's rolling record of model errors, scores yesterday's
// learned forecast out of sample, and writes fits.json for get_learned_forecast.
//
// Usage: node scripts/learning/daily.mjs [--out DIR] [--max-bootstrap N] [--only-near SITES.json] [--radius KM]
//   --out            where state.json, fits.json and scores.json live (default .cache/learning)
//   --max-bootstrap  new stations to backfill this run (each costs a 62-day archived-forecast request; default 60)
//   --only-near      limit to stations within --radius km (default 40) of the sites in a JSON list (for local tests)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { distanceKm } from "../../src/mcp/geo.ts";
import { emptyState, errorDays, exportFits, prune, scoreDay, updateDays } from "../../src/mcp/learning-store.ts";
import { AI_FROM_LEAD, LEARN_LEADS, modelsFor, WINDOW_DAYS } from "../../src/mcp/learned.ts";
import { ghcnhYearUrl, parsePsv, parseStationList } from "../../src/mcp/sources/ghcnh.ts";
import { hourKey, parseCsv } from "../../src/mcp/sources/iem.ts";
import { inUk } from "../../src/mcp/observations.ts";
import { RETRY, retryDelayMs, shouldRetry } from "../../src/mcp/retry.ts";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]?.startsWith("--") || all[i + 1] == null ? "true" : all[i + 1]]] : acc), []));
const OUT = args.out ?? ".cache/learning";
const MAX_BOOTSTRAP = Number(args["max-bootstrap"] ?? 60);
const RECENT_DAYS = 6;
const KEEP_DAYS = WINDOW_DAYS + 15;
const MIN_TRAIN_DAYS = 20;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const ESOH = "https://api.meteogate.eu/eu-eumetnet-surface-observations/collections/observations";
const UK_BBOX = [-8.7, 49.8, 2.0, 61.0];
const ALL_MODELS = [...new Set(LEARN_LEADS.flatMap(modelsFor))];
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = Date.now();
const today = new Date(now).toISOString().slice(0, 10);
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const log = (...a) => console.log(...a);
const stats = { requests: 0, failures: 0 };

/**
 * GET text with retries; `validate` rejects a 200 whose body is not what was asked for (Open-Meteo can do this).
 * Every failed attempt counts towards the limit (L-24), and waits grow from 5 to 40 s (L-21).
 */
async function getText(url, { validate = null, retries = RETRY.attempts, timeout = 120_000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    stats.requests++;
    let status = null;
    let reason = "";
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { "user-agent": "AceWeather learning job (non-commercial)" } });
      status = r.status;
      const text = await r.text();
      if (r.status === 404) return null;
      const valid = !validate || validate(text);
      if (r.ok && valid) return text;
      reason = r.ok ? "invalid response body" : `HTTP ${r.status}`;
      if (!shouldRetry(r.status, valid)) { stats.failures++; throw new Error(reason); }
    } catch (error) {
      if (status != null && !shouldRetry(status, false)) throw error;
      reason ||= String(error?.cause?.code ?? error?.message ?? error);
    }
    if (attempt >= retries) { stats.failures++; throw new Error(`${reason} after ${attempt} attempts`); }
    await sleep(retryDelayMs(attempt));
  }
}
const isJson = (t) => { try { JSON.parse(t); return true; } catch { return false; } };
const getJson = async (url, opts) => { const t = await getText(url, { ...opts, validate: isJson }); return t == null ? null : JSON.parse(t); };

/** Nearest-hour value within 20 minutes, preferring the closest report. */
function nearestHour(target, ms, value) {
  const hour = Math.round(ms / HOUR) * HOUR;
  const dt = Math.abs(ms - hour);
  if (dt > 20 * 60_000 || value == null || !Number.isFinite(value)) return;
  const key = hourKey(hour);
  const seen = target.get(key);
  if (!seen || dt < seen[1]) target.set(key, [value, dt]);
}

/** One UK-wide MeteoGate query: every Met Office station's last 25 hours of temperature and 10 m wind. */
async function esohUk() {
  const since = new Date(Math.floor(now / HOUR) * HOUR - 25 * HOUR).toISOString().replace(".000", "");
  const [w, s, e, n] = UK_BBOX;
  const body = await getJson(`${ESOH}/area?coords=POLYGON((${w}%20${s},${e}%20${s},${e}%20${n},${w}%20${n},${w}%20${s}))&datetime=${since}/..&standard_name=air_temperature,wind_speed`);
  const byId = new Map();
  for (const c of body?.coverages ?? []) {
    const id = c["metocean:wigosId"];
    if (!/^0-20000-0-(03|99)\d{3}$|^0-826-/.test(id ?? "")) continue;
    const entry = byId.get(id) ?? { id, latitude: c.domain.axes.y.values[0], longitude: c.domain.axes.x.values[0], t: new Map(), w: new Map() };
    const times = c.domain.axes.t.values;
    for (const [key, range] of Object.entries(c.ranges ?? {})) {
      const target = key.startsWith("air_temperature:") ? entry.t : key.startsWith("wind_speed:10.0") ? entry.w : null;
      if (!target) continue;
      times.forEach((time, i) => nearestHour(target, Date.parse(time), key.startsWith("wind") ? (range.values[i] ?? NaN) * 3.6 : range.values[i]));
    }
    byId.set(id, entry);
  }
  const names = await getJson(`${ESOH}/locations?bbox=${UK_BBOX.join(",")}`).catch(() => null);
  const nameOf = new Map((names?.features ?? []).map((f) => [f.id, String(f.properties?.name ?? f.id)]));
  return [...byId.values()].map((e) => ({ ...e, name: tidy(nameOf.get(e.id) ?? e.id), t: flat(e.t), w: flat(e.w) }));
}
const flat = (m) => new Map([...m].map(([k, [v]]) => [k, v]));
const tidy = (raw) => raw.replace(/_/g, " ").replace(/,\s*/g, ", ").replace(/\s+Auto.*$/i, "").toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).trim();

async function discover(state) {
  const [esoh, iem, cos, ghList] = await Promise.all([
    esohUk(),
    getJson("https://mesonet.agron.iastate.edu/geojson/network/GB__ASOS.geojson"),
    getJson("https://cosmos-api.ceh.ac.uk/collections/30M/locations"),
    getText("https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/doc/ghcnh-station-list.csv").then(parseStationList).catch(() => []),
  ]);
  const ghByWmo = new Map();
  for (const g of ghList) { const wmo = g.id.match(/^UKM000(\d{5})$/)?.[1]; if (wmo) ghByWmo.set(wmo, g); }

  // Met Office stations from MeteoGate; drop a national-id duplicate of a WMO-id site.
  const wmoSites = esoh.filter((e) => e.id.startsWith("0-20000-0-"));
  const metoffice = esoh.filter((e) => e.id.startsWith("0-20000-0-") || !wmoSites.some((w) => distanceKm(w.latitude, w.longitude, e.latitude, e.longitude) < 2));
  const metars = (iem?.features ?? []).filter((f) => f.properties.archive_end == null && f.properties.online !== false)
    .map((f) => ({ id: `metar:${f.id}`, icao: f.id, name: tidy(f.properties.sname), latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0], elevation_m: f.properties.elevation }))
    .filter((m) => !metoffice.some((e) => distanceKm(e.latitude, e.longitude, m.latitude, m.longitude) < 2));
  const cosmos = (cos?.features ?? []).filter((f) => String(f.properties.datetime).split("/")[1] >= dayOf(now - 3 * DAY))
    .map((f) => ({ id: `cosmos:${f.id}`, site: f.id, name: f.properties.label, latitude: f.geometry.coordinates[0], longitude: f.geometry.coordinates[1], elevation_m: f.properties.siteInfo?.altitude?.value ?? null }));

  const metas = [
    ...metoffice.map((e) => {
      const wmo = e.id.match(/^0-20000-0-(\d{5})$/)?.[1];
      const gh = wmo ? ghByWmo.get(wmo) : null;
      const known = state.stations[e.id]?.meta;
      return { meta: { id: e.id, name: e.name, network: "metoffice", latitude: e.latitude, longitude: e.longitude, elevation_m: known?.elevation_m ?? gh?.elevation_m ?? null, ghcnh_id: gh?.id ?? null }, esoh: e };
    }),
    ...metars.map((m) => ({ meta: { id: m.id, name: m.name, network: "metar", latitude: m.latitude, longitude: m.longitude, elevation_m: m.elevation_m }, icao: m.icao })),
    ...cosmos.map((c) => ({ meta: { id: c.id, name: c.name, network: "cosmos_uk", latitude: c.latitude, longitude: c.longitude, elevation_m: c.elevation_m }, site: c.site })),
  ];
  // Fill missing elevations from Open-Meteo's terrain model, 100 at a time.
  const missing = metas.filter((m) => m.meta.elevation_m == null);
  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    const elev = await getJson(`https://api.open-meteo.com/v1/elevation?latitude=${chunk.map((m) => m.meta.latitude.toFixed(4)).join(",")}&longitude=${chunk.map((m) => m.meta.longitude.toFixed(4)).join(",")}`).catch(() => null);
    chunk.forEach((m, k) => { m.meta.elevation_m = elev?.elevation?.[k] ?? null; });
  }
  // Only stations where the learned forecast can be used (L-22): the Iowa archive's GB network also lists Jersey and Guernsey.
  const inArea = metas.filter((m) => inUk(m.meta, 0));
  if (inArea.length < metas.length) log(`  ${metas.length - inArea.length} station(s) outside the learning area skipped: ${metas.filter((m) => !inUk(m.meta, 0)).map((m) => m.meta.name).join(", ")}`);
  return inArea;
}

async function metarObs(icao, startMs, endMs) {
  const s = new Date(startMs); const e = new Date(endMs + DAY);
  const url = `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${icao}&data=tmpc&data=sknt&year1=${s.getUTCFullYear()}&month1=${s.getUTCMonth() + 1}&day1=${s.getUTCDate()}&year2=${e.getUTCFullYear()}&month2=${e.getUTCMonth() + 1}&day2=${e.getUTCDate()}&tz=Etc%2FUTC&format=onlycomma&latlon=no&elev=no&missing=null&trace=null&direct=no&report_type=3&report_type=4`;
  const p = parseCsv((await getText(url)) ?? "station,valid,tmpc,sknt");
  return { t: p.temperature_c, w: p.wind_speed_kmh };
}

async function cosmosObs(site, startMs, endMs) {
  const iso = (ms) => new Date(ms).toISOString().replace(".000", "");
  const body = await getJson(`https://cosmos-api.ceh.ac.uk/collections/30M/locations/${site}?datetime=${iso(startMs)}/${iso(endMs)}&parameter-name=ta`);
  const c = body?.coverages?.[0];
  const t = new Map();
  (c?.domain?.axes?.t?.values ?? []).forEach((time, i) => { const ms = Date.parse(time); const v = c.ranges?.ta?.values?.[i]; if (ms % HOUR === 0 && typeof v === "number") t.set(hourKey(ms), v); });
  return { t, w: new Map() };
}

async function ghcnhObs(id, startMs, endMs) {
  const t = new Map(); const w = new Map();
  for (let y = new Date(startMs).getUTCFullYear(); y <= new Date(endMs).getUTCFullYear(); y++) {
    const text = await getText(ghcnhYearUrl(id, y), { timeout: 180_000 }).catch(() => null);
    if (!text) continue;
    const p = parsePsv(text);
    for (const [k, v] of p.temperature_c) if (Date.parse(`${k}:00Z`) >= startMs) t.set(k, v);
    for (const [k, v] of p.wind_speed_kmh) if (Date.parse(`${k}:00Z`) >= startMs) w.set(k, v);
  }
  return { t, w };
}

function previousRunsUrl(meta, pastDays, variables) {
  const hourly = variables.flatMap((v) => LEARN_LEADS.map((l) => `${v}_previous_day${l}`)).join(",");
  const elevation = meta.elevation_m != null ? `&elevation=${Math.round(meta.elevation_m)}` : "";
  return `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${meta.latitude.toFixed(4)}&longitude=${meta.longitude.toFixed(4)}${elevation}&hourly=${hourly}&models=best_match,${ALL_MODELS.join(",")}&past_days=${pastDays}&forecast_days=1&timezone=UTC&wind_speed_unit=kmh`;
}

async function processStation(state, item, bootstrap) {
  const { meta } = item;
  const st = state.stations[meta.id] ?? { meta, days: {} };
  st.meta = { ...st.meta, ...meta };
  // A full 60-day request only pays off when there are 60 days of observations to score it against;
  // Met Office stations without a NOAA backfill build their history from daily MeteoGate data instead.
  const canBackfill = meta.network !== "metoffice" || Boolean(meta.ghcnh_id);
  const pastDays = bootstrap && canBackfill ? WINDOW_DAYS + 2 : RECENT_DAYS;
  const startMs = Date.parse(`${today}T00:00:00Z`) - pastDays * DAY;
  const endMs = Date.parse(`${today}T00:00:00Z`);

  let obs = { t: new Map(), w: new Map() };
  if (meta.network === "metar") obs = await metarObs(item.icao, startMs, endMs);
  else if (meta.network === "cosmos_uk") obs = await cosmosObs(item.site, startMs, endMs);
  else {
    st.obs ??= {};
    for (const [k, v] of item.esoh.t) st.obs[k] = [v, st.obs[k]?.[1] ?? null];
    for (const [k, v] of item.esoh.w) st.obs[k] = [st.obs[k]?.[0] ?? null, v];
    if (bootstrap && meta.ghcnh_id) {
      obs = await ghcnhObs(meta.ghcnh_id, startMs, endMs);
      // Keep the backfill's last days so the next daily runs can recompute them with full coverage.
      for (const [k, v] of obs.t) if (endMs - Date.parse(`${k}:00Z`) <= 10 * DAY) st.obs[k] = [st.obs[k]?.[0] ?? v, st.obs[k]?.[1] ?? obs.w.get(k) ?? null];
    }
    for (const [k, [t, w]] of Object.entries(st.obs)) { if (t != null) obs.t.set(k, t); if (w != null) obs.w.set(k, w); }
  }
  const inWindow = (m) => new Map([...m].filter(([k]) => { const ms = Date.parse(`${k}:00Z`); return ms >= startMs && ms < endMs; }));
  obs = { t: inWindow(obs.t), w: inWindow(obs.w) };
  if (obs.t.size < 12) { state.stations[meta.id] = st; return { id: meta.id, skipped: `only ${obs.t.size} hours observed` }; }
  if (bootstrap && !canBackfill) st.bootstrapped_at = new Date(now).toISOString();

  const variables = obs.w.size >= 12 ? ["temperature_2m", "wind_speed_10m"] : ["temperature_2m"];
  const body = await getJson(previousRunsUrl(meta, pastDays, variables), { timeout: bootstrap ? 180_000 : 60_000 });
  const h = body?.hourly ?? {};
  const forecasts = { time: (h.time ?? []).filter((t) => t < `${today}T00:00`), series: (v, lead, m) => h[`${v}_previous_day${lead}_${m}`] ?? [] };
  let written = 0;
  for (const v of variables) written += updateDays(st, v, errorDays(forecasts, v, v === "temperature_2m" ? obs.t : obs.w, LEARN_LEADS, modelsFor));

  // Out-of-sample scores for fully observed days: the recent days on a normal run, the whole window on a backfill.
  for (let k = 1; k <= pastDays - 1; k++) {
    const day = dayOf(endMs - k * DAY);
    if (!st.days[day]) continue;
    const score = {};
    for (const v of variables) {
      const o = v === "temperature_2m" ? obs.t : obs.w;
      const hours = [...o.keys()].filter((key) => key.startsWith(day)).length;
      if (hours < 20) continue;
      for (const [lead, s] of Object.entries(scoreDay(st, v, day, forecasts, o, LEARN_LEADS, modelsFor, WINDOW_DAYS, MIN_TRAIN_DAYS, true))) (score[lead] ??= {})[v === "temperature_2m" ? "t" : "w"] = s;
    }
    if (Object.keys(score).length) st.days[day].score = score;
  }
  prune(st, today, KEEP_DAYS);
  if (bootstrap) st.bootstrapped_at = new Date(now).toISOString();
  state.stations[meta.id] = st;
  return { id: meta.id, days: written, hours: obs.t.size };
}

async function main() {
  const statePath = join(OUT, "state.json");
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : emptyState();
  let items = await discover(state);
  if (args["only-near"]) {
    const sites = JSON.parse(readFileSync(args["only-near"], "utf8"));
    const radius = Number(args.radius ?? 40);
    items = items.filter((it) => sites.some((s) => distanceKm(s.latitude, s.longitude, it.meta.latitude, it.meta.longitude) <= radius));
  }
  const existing = items.filter((it) => state.stations[it.meta.id]?.bootstrapped_at);
  const fresh = items.filter((it) => !state.stations[it.meta.id]?.bootstrapped_at);
  // Stations with a NOAA backfill first: they become useful immediately; the rest build history from daily MeteoGate data.
  fresh.sort((a, b) => Number(Boolean(b.meta.ghcnh_id) || b.meta.network !== "metoffice") - Number(Boolean(a.meta.ghcnh_id) || a.meta.network !== "metoffice"));
  const toBootstrap = fresh.slice(0, MAX_BOOTSTRAP);
  log(`${items.length} stations (${items.filter((i) => i.meta.network === "metoffice").length} Met Office, ${items.filter((i) => i.meta.network === "metar").length} airport, ${items.filter((i) => i.meta.network === "cosmos_uk").length} COSMOS-UK); ${existing.length} to update, ${toBootstrap.length} of ${fresh.length} new to backfill`);
  const results = [];
  for (const [list, bootstrap] of [[existing, false], [toBootstrap, true]]) {
    for (const item of list) {
      try { results.push(await processStation(state, item, bootstrap)); } catch (error) { results.push({ id: item.meta.id, error: String(error.message ?? error).slice(0, 120) }); }
      await sleep(250);
    }
  }
  // Met Office stations not backfilled this run still keep today's MeteoGate hours so their history grows.
  for (const item of fresh.slice(MAX_BOOTSTRAP)) {
    if (item.meta.network !== "metoffice") continue;
    const st = state.stations[item.meta.id] ?? { meta: item.meta, days: {}, obs: {} };
    st.obs ??= {};
    for (const [k, v] of item.esoh.t) st.obs[k] = [v, st.obs[k]?.[1] ?? null];
    for (const [k, v] of item.esoh.w) st.obs[k] = [st.obs[k]?.[0] ?? null, v];
    prune(st, today, KEEP_DAYS);
    state.stations[item.meta.id] = st;
  }
  state.updated_at = new Date(now).toISOString();
  writeFileSync(statePath, JSON.stringify(state));
  const fits = exportFits(state, today, LEARN_LEADS, modelsFor, WINDOW_DAYS, MIN_TRAIN_DAYS, AI_FROM_LEAD, state.updated_at);
  writeFileSync(join(OUT, "fits.json"), JSON.stringify(fits));
  const scoresPath = join(OUT, "scores.json");
  const history = existsSync(scoresPath) ? JSON.parse(readFileSync(scoresPath, "utf8")) : [];
  const entry = { date: today, stations_fitted: fits.stations.length, recent_scores: fits.recent_scores };
  writeFileSync(scoresPath, JSON.stringify([...history.filter((h) => h.date !== today), entry].slice(-120), null, 1));
  const ok = results.filter((r) => r.days != null).length;
  writeFileSync(join(OUT, "run.json"), JSON.stringify({
    date: today, processed: results.length, updated: ok, skipped: results.filter((r) => r.skipped).length, failed: results.filter((r) => r.error).length,
    requests: stats.requests, gave_up: stats.failures, errors: results.filter((r) => r.error).slice(0, 20).map((r) => ({ id: r.id, error: r.error })),
  }, null, 1));
  log(`updated ${ok}, skipped ${results.filter((r) => r.skipped).length}, failed ${results.filter((r) => r.error).length}; ${fits.stations.length} stations have fits; ${stats.requests} requests (${stats.failures} gave up)`);
  for (const r of results.filter((r) => r.error || r.skipped).slice(0, 10)) log("  ", r.id, r.error ?? r.skipped);
  for (const [variable, byLead] of Object.entries(fits.recent_scores)) for (const [lead, s] of Object.entries(byLead)) log(`  last 30 days ${variable} day ${lead}: learned ${s.learned_mae.toFixed(2)} vs standard ${s.standard_mae.toFixed(2)} (${s.stations} stations, ${s.hours} hours)`);
}

main().catch((error) => { console.error(error); process.exit(1); });
