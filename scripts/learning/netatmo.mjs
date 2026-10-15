// Netatmo citizen stations for the daily learning job (docs/mcp/LEARNING-DAILY.md, "Citizen stations").
// Off unless NETATMO_CLIENT_ID, NETATMO_CLIENT_SECRET, NETATMO_REFRESH_TOKEN and NETATMO_STATE_KEY are set.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { distanceKm } from "../../src/mcp/geo.ts";
import { anonId, emptyRegistry, gapPoints, hourlyTemperature, NETATMO_API, parseMeasure, parsePublicData, pickStation, rainDayTotals, seal, unseal } from "../../src/mcp/sources/netatmo.ts";

const DAY = 86_400_000;
/** Netatmo allows 500 requests an hour per user; stay under it in one run. */
const MAX_REQUESTS = 450;
const RETRY_POINT_DAYS = 90;
const DROP_UNSEEN_DAYS = 14;
/** A station whose fits are still not exported after this many days failed quality control. */
const QC_GRACE_DAYS = 45;

/**
 * Loads the sealed registry, refreshes the OAuth token, finds new stations in gaps of the official networks
 * and returns one learning item per tracked station, plus `finish(fits)` to drop failed or silent stations and save.
 */
export async function netatmoStations({ out, now, getText, log, max, discoverLimit, official, gauges }) {
  const env = process.env;
  const info = { enabled: false, tracked: 0, added: 0, observed: 0, requests: 0, error: null };
  const none = { items: [], info, finish: async () => {} };
  if (!env.NETATMO_CLIENT_ID || !env.NETATMO_CLIENT_SECRET || !env.NETATMO_REFRESH_TOKEN || !env.NETATMO_STATE_KEY) return none;
  info.enabled = true;
  const key = env.NETATMO_STATE_KEY;
  const file = join(out, "netatmo.enc");
  const today = new Date(now).toISOString().slice(0, 10);
  let registry = emptyRegistry();
  try { if (existsSync(file)) registry = unseal(readFileSync(file, "utf8"), key); } catch { log("  netatmo: registry could not be unsealed (key changed?); starting a new one"); }
  const save = () => writeFileSync(file, seal(registry, key));

  // Refresh tokens rotate: keep the newest, and fall back to the secret if a new one was set by hand.
  let access = null;
  for (const refresh of [...new Set([registry.refresh_token, env.NETATMO_REFRESH_TOKEN].filter(Boolean))]) {
    const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: env.NETATMO_CLIENT_ID, client_secret: env.NETATMO_CLIENT_SECRET });
    const text = await getText(`${NETATMO_API}/oauth2/token`, { retries: 2, init: { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } } }).catch(() => null);
    const token = text ? JSON.parse(text) : null;
    if (token?.access_token) {
      access = token.access_token;
      registry.refresh_token = token.refresh_token ?? refresh;
      save();
      break;
    }
  }
  if (!access) { info.error = "token refresh failed: generate a new refresh token and update NETATMO_REFRESH_TOKEN"; return { ...none, info }; }

  const api = async (path, params) => {
    if (info.requests >= MAX_REQUESTS) throw new Error("Netatmo request budget for this run used");
    info.requests++;
    const text = await getText(`${NETATMO_API}/api/${path}?${new URLSearchParams(params)}`, { retries: 3, init: { headers: { authorization: `Bearer ${access}` } } });
    return text ? JSON.parse(text) : null;
  };

  const tracked = () => Object.values(registry.stations);
  if (tracked().length < max) {
    const exclude = new Set([...tracked().map((s) => s.device_id), ...registry.rejected]);
    const points = gapPoints(official, gauges)
      .filter((p) => !registry.tried[p.key] || now - Date.parse(registry.tried[p.key]) > RETRY_POINT_DAYS * DAY)
      .filter((p) => !tracked().some((s) => distanceKm(p.latitude, p.longitude, s.latitude, s.longitude) < 10))
      .slice(0, discoverLimit);
    for (const p of points) {
      if (tracked().length >= max) break;
      const body = await api("getpublicdata", { lat_ne: p.latitude + 0.1, lon_ne: p.longitude + 0.15, lat_sw: p.latitude - 0.1, lon_sw: p.longitude - 0.15, required_data: "temperature", filter: "true" }).catch(() => null);
      registry.tried[p.key] = today;
      const s = body ? pickStation(parsePublicData(body), p, exclude) : null;
      if (!s) continue;
      registry.stations[anonId(s.device_id, key)] = { device_id: s.device_id, temp_module: s.temp_module, rain_module: s.rain_module, latitude: s.latitude, longitude: s.longitude, added: today, last_seen: null };
      exclude.add(s.device_id);
      info.added++;
    }
    save();
  }

  const measure = async (station, module, type, startMs, endMs) => parseMeasure(await api("getmeasure", {
    device_id: station.device_id, module_id: module, scale: "max", type, optimize: "false",
    date_begin: String(Math.floor(startMs / 1000)), date_end: String(Math.floor(endMs / 1000)), limit: "1024",
  }));
  const items = Object.entries(registry.stations).map(([id, s]) => ({
    meta: { id, name: "Citizen station (Netatmo)", network: "netatmo", latitude: round2(s.latitude), longitude: round2(s.longitude), elevation_m: null },
    // Netatmo data is real time, so the last two complete days are enough (and fit in one 1024-reading request).
    observe: async (startMs, endMs) => {
      const from = Math.max(startMs, endMs - 2 * DAY);
      const t = hourlyTemperature(await measure(s, s.temp_module, "temperature", from, endMs));
      const rain = s.rain_module ? rainDayTotals(await measure(s, s.rain_module, "rain", from, endMs)) : new Map();
      if (t.size || rain.size) { s.last_seen = today; info.observed++; }
      return { t, rain };
    },
  }));
  info.tracked = items.length;

  const finish = async (fits) => {
    const exported = new Set(fits.stations.map((st) => st.meta.id));
    for (const [id, s] of Object.entries(registry.stations)) {
      const silent = now - Date.parse(s.last_seen ?? s.added) > DROP_UNSEEN_DAYS * DAY;
      const failedQc = now - Date.parse(s.added) > QC_GRACE_DAYS * DAY && !exported.has(id);
      if (!silent && !failedQc) continue;
      delete registry.stations[id];
      if (failedQc) registry.rejected.push(s.device_id);
      log(`  netatmo: dropped ${id} (${failedQc ? "failed quality control" : "no data for two weeks"})`);
    }
    save();
  };
  return { items, info, finish };
}

const round2 = (x) => Math.round(x * 100) / 100;
