import { cached } from "../cache.ts";
import type { Source } from "../envelope.ts";
import { fetchJson } from "../upstream.ts";
import { MODEL_INFO } from "./models.ts";

const URL_BASE = "https://previous-runs-api.open-meteo.com/v1/forecast";
const LABEL = "Open-Meteo Previous Runs API";

export const VERIFY_MODELS = [
  { id: "best_match", name: "AceWeather forecast (Open-Meteo best_match blend)" },
  ...Object.entries(MODEL_INFO).map(([id, info]) => ({ id, name: info.name })),
] as const;

export type VerifyVariable = "temperature_2m" | "wind_speed_10m" | "precipitation";

export const PREVIOUS_RUNS_SOURCE: Omit<Source, "retrieved_at" | "classification"> = {
  name: "Open-Meteo Previous Runs API",
  url: "https://open-meteo.com/en/docs/previous-runs-api",
  notes: "What each model forecast 1-7 days before each hour, archived by Open-Meteo. Requested at the reference station's coordinates and elevation.",
};

export type PreviousRuns = {
  time: string[];
  /** series(variable, lead, model) -> hourly values aligned with time */
  series: (variable: VerifyVariable, lead: number, model: string) => Array<number | null>;
};

export function fetchPreviousRuns(point: { latitude: number; longitude: number; elevation_m: number | null }, pastDays: number, leads: number[], variables: VerifyVariable[], models: string[] = VERIFY_MODELS.map((m) => m.id)): Promise<PreviousRuns> {
  const hourly = variables.flatMap((v) => leads.map((lead) => `${v}_previous_day${lead}`));
  const params = new URLSearchParams({
    latitude: point.latitude.toFixed(4), longitude: point.longitude.toFixed(4),
    hourly: hourly.join(","), models: models.join(","),
    past_days: String(pastDays), forecast_days: "1", timezone: "UTC", wind_speed_unit: "kmh",
  });
  if (point.elevation_m != null) params.set("elevation", String(Math.round(point.elevation_m)));
  const url = `${URL_BASE}?${params}`;
  return cached(`previous-runs:${url}`, 3600_000, async () => {
    const body = await fetchJson(LABEL, url);
    const h = body?.hourly ?? {};
    return {
      time: (h.time ?? []) as string[],
      series: (variable, lead, model) => (h[`${variable}_previous_day${lead}_${model}`] ?? []) as Array<number | null>,
    };
  });
}
