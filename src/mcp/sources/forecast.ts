import { fetchForecast } from "../../lib/aceweather/open-meteo.ts";
import { cached, seed } from "../cache.ts";
import type { ResolvedLocation } from "../locations.ts";
import { callUpstream } from "../upstream.ts";

export const FORECAST_SOURCE = {
  name: "Open-Meteo Forecast API",
  model: "best_match (seamless blend of national and global models)",
  url: "https://open-meteo.com/en/docs",
};

export type ForecastData = { raw: any; retrieved_at: string };

const TTL = 15 * 60_000;
const key = (l: ResolvedLocation, tz: string) => `forecast:${l.latitude.toFixed(4)},${l.longitude.toFixed(4)},${tz}`;

function load(location: ResolvedLocation, tz: string): Promise<ForecastData> {
  return cached(key(location, tz), TTL, () => callUpstream("Open-Meteo forecast", async (signal) => ({
    raw: await fetchForecast(
      { name: location.name, region: "", country: "", lat: location.latitude, lon: location.longitude, elev: null, tz },
      signal,
    ),
    retrieved_at: new Date().toISOString(),
  })));
}

/** The same forecast request the dashboard makes: current, 7 past days and 14 forecast days. */
export const getForecast = (location: ResolvedLocation) => load(location, location.timezone);

/** Replaces an "auto" timezone with the location's real one so local calendar dates are correct. */
export async function withTimezone(location: ResolvedLocation): Promise<ResolvedLocation> {
  if (location.timezone !== "auto") return location;
  const forecast = load(location, "auto");
  const { raw } = await forecast;
  const resolved = { ...location, timezone: String(raw.timezone || "UTC"), elevation_m: location.elevation_m ?? raw.elevation ?? null };
  seed(key(resolved, resolved.timezone), TTL, forecast);
  return resolved;
}

/** Index of the hour containing the model's "current" time. */
export function currentHourIndex(times: string[], current: string): number {
  let index = 0;
  for (let i = 0; i < times.length && times[i] <= current; i++) index = i;
  return index;
}
