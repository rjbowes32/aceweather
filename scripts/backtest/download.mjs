// Downloads and caches every input the learning backtest needs. Safe to rerun: cached files are reused.
// Usage: node scripts/backtest/download.mjs
//   BACKTEST_SITES=sites-uk.json   site list in scripts/backtest (default sites.json)
//   BACKTEST_EXTRA_MODELS=ecmwf_aifs025_single   extra models (the live forecast adds AIFS from lead day 3)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { distanceKm } from "../../src/mcp/geo.ts";
import { hourKey, parseCsv } from "../../src/mcp/sources/iem.ts";
import { ghcnhYearUrl, parsePsv, parseStationList } from "../../src/mcp/sources/ghcnh.ts";
import { dailyTotals } from "../../src/mcp/verification.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CACHE = join(ROOT, ".cache", "backtest");
export const PERIOD = { trainStart: "2025-08-01", evalStart: "2025-10-01", end: "2026-09-17" };
export const LEADS = [1, 3, 5];
/** Extra models for an experiment, e.g. BACKTEST_EXTRA_MODELS=ecmwf_aifs025_single (separate cache files and results). */
export const EXTRA_MODELS = (process.env.BACKTEST_EXTRA_MODELS ?? "").split(",").filter(Boolean);
export const MODELS = ["ecmwf_ifs025", "gfs_seamless", "icon_seamless", "ukmo_seamless", ...EXTRA_MODELS];
export const SITES_FILE = process.env.BACKTEST_SITES ?? "sites.json";
export const RESULTS_TAG = `${SITES_FILE === "sites.json" ? "" : `-${SITES_FILE.replace(/^sites-|\.json$/g, "")}`}${EXTRA_MODELS.length ? `-${EXTRA_MODELS.join("+")}` : ""}`;
/** ECMWF's AI model only joins the blend from this lead day, as in the live forecast. */
export const AI_MODEL = "ecmwf_aifs025_single";
export const AI_FROM_LEAD = 3;
export const blendModels = (lead) => (lead < AI_FROM_LEAD ? MODELS.filter((m) => m !== AI_MODEL) : MODELS);
const SEARCH_KM = 80;
const RAIN_SEARCH_KM = 25;
/** A temperature reference more than this far above or below the location is not representative of it. */
const MAX_HEIGHT_DIFF_M = 250;
const MIN_HOURS = 5000;
mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** GET with a disk cache and polite retries. Returns text. */
export async function cachedText(url, { label = "", retries = 4, validate = null } = {}) {
  const file = join(CACHE, createHash("sha1").update(url).digest("hex"));
  if (existsSync(file)) {
    const text = readFileSync(file, "utf8");
    if (!validate || validate(text)) return text;
    console.log(`  discarding invalid cached ${label}`);
  }
  for (let attempt = 1; ; attempt++) {
    const started = Date.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(180_000), headers: { "user-agent": "AceWeather backtest (personal research)" } });
      const text = await response.text();
      // Open-Meteo can time out mid-stream yet still answer 200 with an error message as the body.
      if (response.ok && (!validate || validate(text))) {
        writeFileSync(file, text);
        console.log(`  fetched ${label} ${(text.length / 1e6).toFixed(1)} MB in ${((Date.now() - started) / 1000).toFixed(0)} s`);
        return text;
      }
      if (attempt >= retries || (!response.ok && response.status < 500 && response.status !== 429)) throw new Error(`${label} HTTP ${response.status}: ${text.slice(0, 200)}`);
    } catch (error) {
      if (attempt >= retries) throw error;
    }
    await sleep(15_000 * attempt);
  }
}
const isJson = (text) => { try { JSON.parse(text); return true; } catch { return false; } };
export const cachedJson = async (url, opts = {}) => JSON.parse(await cachedText(url, { ...opts, validate: isJson }));

/** Representativeness: kilometres plus 10 km per 100 m of height difference. */
const score = (site, s) => s.distance_km + Math.abs((site.elevation_m ?? 0) - (s.elevation_m ?? 0)) / 10;
const RAIN_COSMOS_KM = 40;
const MIN_RAIN_DAYS = 300;
const SEPA = "https://timeseries.sepa.org.uk/KiWIS/KiWIS?service=kisters&type=queryServices&datasource=0&format=json";

export async function referenceStations(sites) {
  const elev = await cachedJson(`https://api.open-meteo.com/v1/elevation?latitude=${sites.map((s) => s.latitude).join(",")}&longitude=${sites.map((s) => s.longitude).join(",")}`, { label: "site elevations" });
  sites.forEach((s, i) => { s.elevation_m = elev.elevation[i]; });

  const iem = await cachedJson("https://mesonet.agron.iastate.edu/geojson/network/GB__ASOS.geojson", { label: "METAR station list" });
  const metars = iem.features.filter((f) => f.properties.archive_end == null && f.properties.online !== false)
    .map((f) => ({ id: f.id, name: f.properties.sname, network: "metar", latitude: f.geometry.coordinates[1], longitude: f.geometry.coordinates[0], elevation_m: f.properties.elevation }));
  const ghcnh = parseStationList(await cachedText("https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/doc/ghcnh-station-list.csv", { label: "GHCNh station list" }))
    .filter((s) => /^UK[MI]/.test(s.id)).map((s) => ({ ...s, network: "ghcnh" }));
  const airports = [...ghcnh, ...metars.filter((m) => !ghcnh.some((g) => distanceKm(g.latitude, g.longitude, m.latitude, m.longitude) < 2))];
  const cos = await cachedJson("https://cosmos-api.ceh.ac.uk/collections/30M/locations", { label: "COSMOS-UK site list" });
  // Active sites: the end of the published date range ("start/end") is this month.
  const cosmos = cos.features.filter((f) => String(f.properties.datetime).split("/")[1] >= PERIOD.end.slice(0, 7))
    .map((f) => ({ id: f.id, name: f.properties.label, network: "cosmos_uk", latitude: f.geometry.coordinates[0], longitude: f.geometry.coordinates[1], elevation_m: f.properties.siteInfo?.altitude?.value ?? null }));
  const sepa = (await cachedJson(`${SEPA}&request=getTimeseriesList&ts_name=Hour.Total&parametertype_name=Precip&returnfields=ts_id,station_name,station_no,station_latitude,station_longitude`, { label: "SEPA rain gauge list" }))
    .slice(1).map(([ts_id, name, no, lat, lon]) => ({ id: no, name, network: "sepa", ts_id, latitude: Number(lat), longitude: Number(lon), elevation_m: null }))
    .filter((g) => Number.isFinite(g.latitude) && Number.isFinite(g.longitude));

  for (const site of sites) {
    const near = (list, km) => list.map((s) => ({ ...s, distance_km: distanceKm(site.latitude, site.longitude, s.latitude, s.longitude) })).filter((s) => s.distance_km <= km);
    site.temperature_candidates = near([...airports, ...cosmos], SEARCH_KM)
      .filter((s) => Math.abs((s.elevation_m ?? 0) - (site.elevation_m ?? 0)) <= MAX_HEIGHT_DIFF_M)
      .sort((a, b) => score(site, a) - score(site, b)).slice(0, 8);
    site.wind_candidates = near(airports, SEARCH_KM).sort((a, b) => score(site, a) - score(site, b)).slice(0, 6);

    const hyd = await cachedJson(`https://environment.data.gov.uk/hydrology/id/stations.json?observedProperty=rainfall&lat=${site.latitude}&long=${site.longitude}&dist=${RAIN_SEARCH_KM}&_limit=20`, { label: `${site.name} gauges` });
    const ea = hyd.items.map((g) => {
      const measure = (g.measures ?? []).map((m) => m["@id"].split("/").pop()).find((id) => id.endsWith("-rainfall-t-900-mm-qualified"));
      return measure ? { id: g.stationReference ?? g.wiskiID ?? g.notation, name: g.label, network: "ea_hydrology", measure, latitude: g.lat, longitude: g.long, elevation_m: null } : null;
    }).filter(Boolean);
    const byDistance = (list, km) => near(list, km).sort((a, b) => a.distance_km - b.distance_km).slice(0, 3);
    site.rain_candidates = [...byDistance(ea, RAIN_SEARCH_KM), ...byDistance(sepa, RAIN_SEARCH_KM), ...byDistance(cosmos, RAIN_COSMOS_KM)];
  }
  return sites;
}

/** Hourly observed temperature (°C) for a METAR, GHCNh or COSMOS-UK reference, as Map(hourKey -> value). */
export async function temperatureObs(ref) {
  if (ref.network === "metar") return parseCsv(await cachedText(metarUrl(ref.id), { label: `${ref.id} METAR history` })).temperature_c;
  if (ref.network === "ghcnh") return (await ghcnhObs(ref.id)).temperature_c;
  const out = new Map();
  for (const url of cosmosUrls(ref.id, "ta")) {
    const c = JSON.parse(await cachedText(url, { label: `${ref.id} COSMOS chunk` })).coverages?.[0];
    const t = c?.domain?.axes?.t?.values ?? [];
    const v = c?.ranges?.ta?.values ?? [];
    t.forEach((time, i) => { const ms = Date.parse(time); if (ms % 3_600_000 === 0 && typeof v[i] === "number") out.set(hourKey(ms), v[i]); });
  }
  return out;
}

/** Hourly observed 10 m wind (km/h) for a METAR or GHCNh reference. */
export async function windObs(ref) {
  if (ref.network === "metar") return parseCsv(await cachedText(metarUrl(ref.id), { label: `${ref.id} METAR history` })).wind_speed_kmh;
  return (await ghcnhObs(ref.id)).wind_speed_kmh;
}

const ghcnhMemo = new Map();
function ghcnhObs(id) {
  if (!ghcnhMemo.has(id)) ghcnhMemo.set(id, loadGhcnh(id));
  return ghcnhMemo.get(id);
}

async function loadGhcnh(id) {
  const out = { temperature_c: new Map(), wind_speed_kmh: new Map() };
  for (const year of [Number(PERIOD.trainStart.slice(0, 4)), Number(PERIOD.end.slice(0, 4))].filter((y, i, a) => a.indexOf(y) === i)) {
    let text = "";
    try { text = await cachedText(ghcnhYearUrl(id, year), { label: `${id} GHCNh ${year}`, retries: 2 }); } catch { continue; }
    const p = parsePsv(text);
    for (const [k, v] of p.temperature_c) if (k >= PERIOD.trainStart && k <= `${PERIOD.end}T23:00`) out.temperature_c.set(k, v);
    for (const [k, v] of p.wind_speed_kmh) if (k >= PERIOD.trainStart && k <= `${PERIOD.end}T23:00`) out.wind_speed_kmh.set(k, v);
  }
  return out;
}

/** Complete UTC-day rainfall totals for an EA hydrology gauge, SEPA gauge or COSMOS-UK site. */
export async function rainDays(ref) {
  if (ref.network === "ea_hydrology") {
    const readings = [];
    for (const line of (await cachedText(hydrologyUrl(ref.measure), { label: `${ref.name} gauge history` })).trim().split(/\r?\n/).slice(1)) {
      const [, dateTime, , value, , quality] = line.split(",").map((c) => c.replace(/^"|"$/g, ""));
      if (!value || ["Suspect", "Missing", "Rejected"].includes(quality)) continue;
      readings.push({ time: `${dateTime}Z`, value: Number(value) });
    }
    return dailyTotals(readings, 96);
  }
  if (ref.network === "sepa") {
    const body = await cachedJson(`${SEPA}&request=getTimeseriesValues&ts_id=${ref.ts_id}&from=${PERIOD.trainStart}T00:00:00Z&to=${addDays(PERIOD.end, 1)}T00:00:00Z&returnfields=Timestamp,Value`, { label: `${ref.name} SEPA history` });
    const data = body?.[0]?.data ?? [];
    return dailyTotals(data.map(([time, value]) => ({ time, value: typeof value === "number" ? value : null })), 24);
  }
  const readings = [];
  for (const url of cosmosUrls(ref.id, "precip")) {
    const c = JSON.parse(await cachedText(url, { label: `${ref.id} COSMOS rain chunk` })).coverages?.[0];
    (c?.domain?.axes?.t?.values ?? []).forEach((time, i) => readings.push({ time, value: c.ranges?.precip?.values?.[i] ?? null }));
  }
  return dailyTotals(readings, 48);
}

/** The first candidate that actually reported for most of the period (some sensors are silent for months). */
async function firstWithData(candidates, load, minimum) {
  for (const c of candidates) {
    const size = (await load(c).catch(() => new Map())).size;
    if (size >= minimum) return { ...c, size };
    console.log(`  skipping ${c.name} (${c.network}): only ${size} usable ${minimum === MIN_RAIN_DAYS ? "days" : "hours"}`);
  }
  return null;
}

export function previousRunsUrl(point, variables) {
  const hourly = variables.flatMap((v) => LEADS.map((l) => `${v}_previous_day${l}`)).join(",");
  const elevation = point.elevation_m != null ? `&elevation=${Math.round(point.elevation_m)}` : "";
  return `https://previous-runs-api.open-meteo.com/v1/forecast?latitude=${point.latitude.toFixed(4)}&longitude=${point.longitude.toFixed(4)}${elevation}&hourly=${hourly}&models=best_match,${MODELS.join(",")}&start_date=${PERIOD.trainStart}&end_date=${PERIOD.end}&timezone=UTC&wind_speed_unit=kmh`;
}

export function metarUrl(id) {
  const [y1, m1, d1] = PERIOD.trainStart.split("-").map(Number);
  const [y2, m2, d2] = addDays(PERIOD.end, 1).split("-").map(Number);
  return `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${id}&data=tmpc&data=sknt&year1=${y1}&month1=${m1}&day1=${d1}&year2=${y2}&month2=${m2}&day2=${d2}&tz=Etc%2FUTC&format=onlycomma&latlon=no&elev=no&missing=null&trace=null&direct=no&report_type=3&report_type=4`;
}

/** COSMOS-UK history in quarter-year chunks to keep responses small. */
export function cosmosUrls(id, parameter = "ta") {
  const urls = [];
  for (let start = PERIOD.trainStart; start <= PERIOD.end; start = addDays(start, 92)) {
    const end = addDays(start, 92) > addDays(PERIOD.end, 1) ? addDays(PERIOD.end, 1) : addDays(start, 92);
    urls.push(`https://cosmos-api.ceh.ac.uk/collections/30M/locations/${id}?datetime=${start}T00:00:00Z/${end}T00:00:00Z&parameter-name=${parameter}`);
  }
  return urls;
}

export const hydrologyUrl = (measure) => `https://environment.data.gov.uk/hydrology/id/measures/${measure}/readings.csv?mineq-date=${PERIOD.trainStart}&max-date=${addDays(PERIOD.end, 1)}&_limit=80000`;

async function main() {
  const sites = await referenceStations(JSON.parse(readFileSync(join(ROOT, "scripts", "backtest", SITES_FILE), "utf8")));
  for (const site of sites) {
    site.temperature_ref = await firstWithData(site.temperature_candidates, temperatureObs, MIN_HOURS);
    site.wind_ref = await firstWithData(site.wind_candidates, windObs, MIN_HOURS);
    site.rain_ref = await firstWithData(site.rain_candidates, rainDays, MIN_RAIN_DAYS);
    const label = (r) => (r ? `${r.name} (${r.network}, ${Math.round(r.distance_km)} km)` : "none");
    console.log(`${site.name} (${Math.round(site.elevation_m)} m): temperature ${label(site.temperature_ref)}, wind ${label(site.wind_ref)}, rain ${label(site.rain_ref)}`);
    const t = site.temperature_ref;
    const w = site.wind_ref;
    if (t) await cachedJson(previousRunsUrl(t, t.id === w?.id ? ["temperature_2m", "wind_speed_10m"] : ["temperature_2m"]), { label: `${t.id} archived forecasts` });
    if (w && w.id !== t?.id) await cachedJson(previousRunsUrl(w, ["wind_speed_10m"]), { label: `${w.id} archived wind forecasts` });
    if (site.rain_ref) await cachedJson(previousRunsUrl(site.rain_ref, ["precipitation"]), { label: `${site.rain_ref.name} archived rain forecasts` });
  }
  writeFileSync(join(CACHE, `sites-resolved${RESULTS_TAG}.json`), JSON.stringify(sites, null, 1));
  console.log("done");
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error); process.exit(1); });
