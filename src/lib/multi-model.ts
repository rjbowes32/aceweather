/* Open-Meteo multi-model fetch.
   When the `models=` param contains multiple models, the daily/hourly variables
   come back suffixed with the model id, e.g. `temperature_2m_max_ecmwf_ifs025`.
   This helper reshapes that into one block per model. */

export const MODELS = [
  { id: "ecmwf_ifs025", short: "ECMWF" },
  { id: "gfs_seamless", short: "GFS" },
  { id: "icon_seamless", short: "ICON" },
  { id: "ukmo_seamless", short: "UKMO" },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];

export type ModelDaily = {
  time: string[];
  temperature_2m_max: (number | null)[];
  temperature_2m_min: (number | null)[];
  precipitation_sum: (number | null)[];
  wind_speed_10m_max: (number | null)[];
};

export type MultiModelPayload = {
  fetchedAt: number;
  models: { id: ModelId; short: string; daily: ModelDaily }[];
};

const BASE_VARS = ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "wind_speed_10m_max"];

export async function fetchMultiModel(lat: number, lon: number, tz?: string, signal?: AbortSignal): Promise<MultiModelPayload> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: tz || "auto",
    forecast_days: "7",
    daily: BASE_VARS.join(","),
    models: MODELS.map((m) => m.id).join(","),
    wind_speed_unit: "kmh",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal });
  if (!response.ok) throw new Error(`OpenMeteo ${response.status}`);
  const body = await response.json();
  const daily = body.daily ?? {};
  const baseTime: string[] = daily.time ?? [];
  const out: MultiModelPayload = { fetchedAt: Date.now(), models: [] };
  for (const m of MODELS) {
    const block: ModelDaily = {
      time: baseTime,
      temperature_2m_max: daily[`temperature_2m_max_${m.id}`] ?? [],
      temperature_2m_min: daily[`temperature_2m_min_${m.id}`] ?? [],
      precipitation_sum: daily[`precipitation_sum_${m.id}`] ?? [],
      wind_speed_10m_max: daily[`wind_speed_10m_max_${m.id}`] ?? [],
    };
    out.models.push({ id: m.id, short: m.short, daily: block });
  }
  return out;
}

export function spread(values: (number | null | undefined)[]): number | null {
  const clean = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (clean.length < 2) return null;
  return Math.max(...clean) - Math.min(...clean);
}
