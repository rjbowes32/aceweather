/**
 * Netatmo citizen weather stations for the daily learning job (learning only: no readings are republished).
 * Parsing, anonymising and sealing only; the job does the fetching (scripts/learning/netatmo.mjs).
 *
 * Station ids and exact positions are personal data, so the public learning files carry an HMAC of the
 * device id and a position rounded to 0.01°. The private registry (device ids, the rotating OAuth refresh
 * token) is stored AES-256-GCM sealed with NETATMO_STATE_KEY.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { distanceKm } from "../geo.ts";
import { hourKey } from "./iem.ts";

export const NETATMO_API = "https://api.netatmo.com";
const HOUR = 3600_000;
const TEMP_RANGE = [-30, 45] as const;
/** Rain readings must be continuous: no gap longer than this between readings, nor at either end of the day. */
const MAX_RAIN_GAP_MS = 15 * 60_000;

export type PublicStation = { device_id: string; latitude: number; longitude: number; temp_module: string | null; rain_module: string | null };
export type RegistryStation = { device_id: string; temp_module: string; rain_module: string | null; latitude: number; longitude: number; added: string; last_seen: string | null };
export type Registry = { refresh_token: string | null; stations: Record<string, RegistryStation>; tried: Record<string, string>; rejected: string[] };

export const emptyRegistry = (): Registry => ({ refresh_token: null, stations: {}, tried: {}, rejected: [] });

/** getpublicdata: each station's position and its outdoor (NAModule1) and rain (NAModule3) module ids. */
export function parsePublicData(body: any): PublicStation[] {
  const out: PublicStation[] = [];
  for (const s of (body?.body ?? []) as any[]) {
    const [longitude, latitude] = s?.place?.location ?? [];
    if (typeof s?._id !== "string" || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const types: Record<string, string> = s.module_types ?? {};
    const measures: Record<string, any> = s.measures ?? {};
    const find = (type: string, test: (m: any) => boolean) => Object.keys(types).find((id) => types[id] === type) ?? Object.keys(measures).find((id) => test(measures[id])) ?? null;
    out.push({
      device_id: s._id, latitude, longitude,
      temp_module: find("NAModule1", (m) => Array.isArray(m?.type) && m.type.includes("temperature")),
      rain_module: find("NAModule3", (m) => m?.rain_60min != null || m?.rain_24h != null),
    });
  }
  return out;
}

/** getmeasure, with optimize=false ({"<unix>": [value]}) or optimize=true ([{beg_time, step_time, value: [[v], ...]}]). */
export function parseMeasure(body: any): Array<{ ms: number; value: number }> {
  const b = body?.body;
  const out: Array<{ ms: number; value: number }> = [];
  if (Array.isArray(b)) {
    for (const block of b) (block?.value ?? []).forEach((v: any[], i: number) => { if (typeof v?.[0] === "number") out.push({ ms: (block.beg_time + i * (block.step_time ?? 0)) * 1000, value: v[0] }); });
  } else if (b && typeof b === "object") {
    for (const [t, v] of Object.entries(b)) if (typeof (v as any[])?.[0] === "number") out.push({ ms: Number(t) * 1000, value: (v as number[])[0] });
  }
  return out.sort((a, b) => a.ms - b.ms);
}

/** Temperature on the hour: the reading nearest each hour within 20 minutes, inside a plausible range. */
export function hourlyTemperature(rows: Array<{ ms: number; value: number }>): Map<string, number> {
  const best = new Map<string, [number, number]>();
  for (const { ms, value } of rows) {
    if (value < TEMP_RANGE[0] || value > TEMP_RANGE[1]) continue;
    const hour = Math.round(ms / HOUR) * HOUR;
    const dt = Math.abs(ms - hour);
    if (dt > 20 * 60_000) continue;
    const key = hourKey(hour);
    const seen = best.get(key);
    if (!seen || dt < seen[1]) best.set(key, [value, dt]);
  }
  return new Map([...best].map(([k, [v]]) => [k, v]));
}

/**
 * UTC-day rain totals; each reading is the rain since the previous one, so it belongs to the interval ending at
 * its time. A day counts only when its readings run without a gap of more than 15 minutes from start to end;
 * an implausible value or a conflicting duplicate voids the day.
 */
export function rainDayTotals(rows: Array<{ ms: number; value: number }>): Map<string, number> {
  const byTime = new Map<number, number | null>();
  for (const { ms, value } of rows) {
    const v = value >= 0 && value <= 100 ? value : null;
    byTime.set(ms, byTime.has(ms) && byTime.get(ms) !== v ? null : v);
  }
  const days = new Map<string, Array<[number, number | null]>>();
  for (const [ms, v] of [...byTime].sort((a, b) => a[0] - b[0])) {
    const day = new Date(ms - 1).toISOString().slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), [ms, v]]);
  }
  const out = new Map<string, number>();
  for (const [day, readings] of days) {
    const start = Date.parse(`${day}T00:00:00Z`);
    const edges = [start, ...readings.map(([ms]) => ms), start + 24 * HOUR];
    if (readings.some(([, v]) => v == null) || edges.some((ms, i) => i > 0 && ms - edges[i - 1] > MAX_RAIN_GAP_MS)) continue;
    out.set(day, Math.round(readings.reduce((a, [, v]) => a + (v as number), 0) * 10) / 10);
  }
  return out;
}

const keyOf = (secret: string) => createHash("sha256").update(secret).digest();

export const anonId = (deviceId: string, secret: string) => `netatmo:${createHmac("sha256", keyOf(secret)).update(deviceId).digest("hex").slice(0, 12)}`;

export function seal(registry: Registry, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(registry), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

export function unseal(text: string, secret: string): Registry {
  const raw = Buffer.from(text.trim(), "base64");
  const decipher = createDecipheriv("aes-256-gcm", keyOf(secret), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8"));
}

export type GapPoint = { key: string; latitude: number; longitude: number; air: boolean; rain: boolean };

/**
 * Points on a grid over the learning area (every 0.25° of latitude, 0.4° of longitude, about 28 km) that are
 * more than `airKm` from an official temperature station or `rainKm` from a public rain gauge.
 */
export function gapPoints(air: Array<{ latitude: number; longitude: number }>, gauges: Array<{ latitude: number; longitude: number }>, airKm = 25, rainKm = 12): GapPoint[] {
  const out: GapPoint[] = [];
  const far = (list: typeof air, lat: number, lon: number, km: number) => !list.some((s) => distanceKm(lat, lon, s.latitude, s.longitude) <= km);
  for (let lat = 49.875; lat < 61; lat += 0.25) {
    for (let lon = -8.6; lon < 2; lon += 0.4) {
      const point = { key: `${lat.toFixed(3)},${lon.toFixed(1)}`, latitude: lat, longitude: lon, air: far(air, lat, lon, airKm), rain: far(gauges, lat, lon, rainKm) };
      if (point.air || point.rain) out.push(point);
    }
  }
  return out;
}

/** The station nearest a gap point with an outdoor thermometer, and a rain gauge too where the gap is in rainfall only. */
export function pickStation(stations: PublicStation[], point: GapPoint, exclude: Set<string>): PublicStation | null {
  const ok = stations.filter((s) => s.temp_module && !exclude.has(s.device_id) && (point.air || s.rain_module));
  ok.sort((a, b) => distanceKm(point.latitude, point.longitude, a.latitude, a.longitude) - distanceKm(point.latitude, point.longitude, b.latitude, b.longitude));
  return ok[0] ?? null;
}
