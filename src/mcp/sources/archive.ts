import { cached } from "../cache.ts";
import { addDays, localNow } from "../dates.ts";
import type { ResolvedLocation } from "../locations.ts";
import { fetchJson } from "../upstream.ts";

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

export const ARCHIVE_SOURCE = {
  name: "Open-Meteo Historical Weather API",
  model: "ERA5 / ERA5-Land reanalysis, with ECMWF IFS analysis for the most recent days",
  url: "https://open-meteo.com/en/docs/historical-weather-api",
  notes: "Gridded reanalysis (about 9-25 km), not a station or farm rain gauge.",
};

export const ARCHIVE_DAILY = [
  "weather_code", "temperature_2m_max", "temperature_2m_min", "temperature_2m_mean",
  "precipitation_sum", "rain_sum", "snowfall_sum", "precipitation_hours",
  "wind_speed_10m_max", "wind_gusts_10m_max", "wind_direction_10m_dominant",
  "shortwave_radiation_sum", "et0_fao_evapotranspiration", "sunshine_duration",
  "relative_humidity_2m_mean", "soil_temperature_0_to_7cm_mean", "soil_moisture_0_to_7cm_mean",
];

export type ArchiveData = { daily: Record<string, any[]>; timezone: string; retrieved_at: string };

export const COMPARISON_DAILY = ["rain_sum", "temperature_2m_max", "temperature_2m_min", "temperature_2m_mean", "soil_temperature_0_to_7cm_mean"];
export const COMPARISON_SOURCE = {
  ...ARCHIVE_SOURCE,
  model: "ERA5 (0.25 degree reanalysis), explicitly selected for every period",
  notes: "Gridded reanalysis, not station measurements. Air temperature at 2 m; soil temperature averaged over the 0–7 cm layer. Recent days can lag by five days or more; no IFS or forecast substitution.",
};

/** The same archive adapter, batching coordinates to keep decade/group comparisons bounded. */
export function getComparisonArchive(locations: ResolvedLocation[], start: string, end: string): Promise<ArchiveData[]> {
  const params = new URLSearchParams({
    latitude: locations.map((l) => l.latitude).join(","),
    longitude: locations.map((l) => l.longitude).join(","),
    timezone: locations[0].timezone,
    start_date: start, end_date: end, models: "era5", daily: COMPARISON_DAILY.join(","),
  });
  const recent = end >= addDays(localNow(locations[0].timezone).day, -10);
  return cached(`comparison:${params}`, recent ? 3600_000 : 24 * 3600_000, async () => {
    const body = await fetchJson("Open-Meteo ERA5 archive", `${ARCHIVE_URL}?${params}`);
    const results = Array.isArray(body) ? body : [body];
    if (results.length !== locations.length) throw new Error("Archive returned an unexpected location count.");
    const retrieved_at = new Date().toISOString();
    return results.map((r) => ({ daily: r?.daily ?? { time: [] }, timezone: String(r?.timezone ?? locations[0].timezone), retrieved_at }));
  });
}

export function getArchiveDaily(location: ResolvedLocation, start: string, end: string): Promise<ArchiveData> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: location.timezone,
    start_date: start,
    end_date: end,
    daily: ARCHIVE_DAILY.join(","),
  });
  const recent = end >= addDays(localNow(location.timezone).day, -7);
  return cached(`archive:${params}`, recent ? 3600_000 : 24 * 3600_000, async () => {
    const body = await fetchJson("Open-Meteo historical archive", `${ARCHIVE_URL}?${params}`);
    return { daily: body?.daily ?? { time: [] }, timezone: String(body?.timezone ?? location.timezone), retrieved_at: new Date().toISOString() };
  });
}
