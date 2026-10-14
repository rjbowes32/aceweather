/* AceWeather's learned forecast (models blended by their recent accuracy at nearby stations) laid over the
   Open-Meteo forecast the dashboard already has. Only temperature, wind and rain for the next 7 days change;
   everything else (humidity, cloud, soil, probabilities, current conditions) stays as Open-Meteo's. */
import type { AwLocation, ForecastResponse } from "./open-meteo.ts";

export type LearnedOverlay = {
  learning_source: "daily" | "on_demand" | "none";
  fits_generated_at: string | null;
  applied: { temperature: boolean; wind_speed: boolean; rainfall: boolean; bias_correction: boolean };
  reference: { name: string; network: string; distance_km: number } | null;
  timezone: string;
  hourly: Array<{ time: string; temperature_c: number | null; wind_speed_kmh: number | null; precipitation_mm: number | null }>;
};

export type LearnedMeta = {
  source: LearnedOverlay["learning_source"];
  station: string | null;
  distanceKm: number | null;
  temperature: boolean;
  wind: boolean;
  rain: boolean;
  hours: number;
};

export async function fetchLearned(loc: AwLocation, signal?: AbortSignal): Promise<LearnedOverlay | null> {
  const params = new URLSearchParams({ lat: loc.lat.toFixed(2), lon: loc.lon.toFixed(2), tz: loc.tz && loc.tz !== "auto" ? loc.tz : "Europe/London" });
  const r = await fetch(`/learned-forecast?${params}`, { signal });
  if (!r.ok) return null;
  const body = (await r.json()) as LearnedOverlay;
  return Array.isArray(body?.hourly) ? body : null;
}

type Num = number | null;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Returns a new forecast with the learned hours applied, and the days containing them re-aggregated. */
export function applyLearned(raw: ForecastResponse, overlay: LearnedOverlay | null): { forecast: ForecastResponse; meta: LearnedMeta | null } {
  if (!overlay || !overlay.hourly.length || (!overlay.applied.temperature && !overlay.applied.wind_speed && !overlay.applied.rainfall)) return { forecast: raw, meta: null };
  const times = (raw.hourly.time ?? []) as string[];
  const index = new Map<string, number>();
  times.forEach((t, i) => { if (!index.has(t)) index.set(t, i); });
  const copy = (key: string) => (Array.isArray(raw.hourly[key]) ? [...(raw.hourly[key] as Num[])] : null);
  const temp = copy("temperature_2m");
  const apparent = copy("apparent_temperature");
  const wind = copy("wind_speed_10m");
  const gust = copy("wind_gusts_10m");
  const rain = copy("precipitation");
  const touchedDays = new Set<string>();
  let hours = 0;
  for (const h of overlay.hourly) {
    const i = index.get(h.time);
    if (i == null) continue;
    let changed = false;
    if (overlay.applied.temperature && isNum(h.temperature_c) && temp) {
      // Feels-like moves with the air temperature so the two stay consistent.
      if (apparent && isNum(apparent[i]) && isNum(temp[i])) apparent[i] = Math.round(((apparent[i] as number) + h.temperature_c - (temp[i] as number)) * 10) / 10;
      temp[i] = h.temperature_c;
      changed = true;
    }
    if (overlay.applied.wind_speed && isNum(h.wind_speed_kmh) && wind) {
      wind[i] = h.wind_speed_kmh;
      if (gust && isNum(gust[i]) && (gust[i] as number) < h.wind_speed_kmh) gust[i] = h.wind_speed_kmh;
      changed = true;
    }
    if (overlay.applied.rainfall && isNum(h.precipitation_mm) && rain) {
      rain[i] = h.precipitation_mm;
      changed = true;
    }
    if (changed) { hours++; touchedDays.add(h.time.slice(0, 10)); }
  }
  if (!hours) return { forecast: raw, meta: null };

  const hourly = { ...raw.hourly, ...(temp ? { temperature_2m: temp } : {}), ...(apparent ? { apparent_temperature: apparent } : {}), ...(wind ? { wind_speed_10m: wind } : {}), ...(gust ? { wind_gusts_10m: gust } : {}), ...(rain ? { precipitation: rain } : {}) };
  const dTime = (raw.daily.time ?? []) as string[];
  const dcopy = (key: string) => (Array.isArray(raw.daily[key]) ? [...(raw.daily[key] as Num[])] : null);
  const tMax = dcopy("temperature_2m_max"); const tMin = dcopy("temperature_2m_min");
  const pSum = dcopy("precipitation_sum"); const wMax = dcopy("wind_speed_10m_max");
  dTime.forEach((day, k) => {
    if (!touchedDays.has(day)) return;
    const idx = times.map((t, i) => (t.startsWith(day) ? i : -1)).filter((i) => i >= 0);
    const values = (arr: Num[] | null) => (arr ? idx.map((i) => arr[i]).filter(isNum) : []);
    const t = values(temp); const w = values(wind); const p = values(rain);
    if (tMax && t.length) tMax[k] = Math.round(Math.max(...t) * 10) / 10;
    if (tMin && t.length) tMin[k] = Math.round(Math.min(...t) * 10) / 10;
    if (wMax && w.length) wMax[k] = Math.round(Math.max(...w) * 10) / 10;
    if (pSum && p.length) pSum[k] = Math.round(p.reduce((a, b) => a + b, 0) * 10) / 10;
  });
  const daily = { ...raw.daily, ...(tMax ? { temperature_2m_max: tMax } : {}), ...(tMin ? { temperature_2m_min: tMin } : {}), ...(pSum ? { precipitation_sum: pSum } : {}), ...(wMax ? { wind_speed_10m_max: wMax } : {}) };
  return {
    forecast: { ...raw, hourly, daily },
    meta: {
      source: overlay.learning_source, station: overlay.reference?.name ?? null, distanceKm: overlay.reference?.distance_km ?? null,
      temperature: overlay.applied.temperature, wind: overlay.applied.wind_speed, rain: overlay.applied.rainfall, hours,
    },
  };
}
