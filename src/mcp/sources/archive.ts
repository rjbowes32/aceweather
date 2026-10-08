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
