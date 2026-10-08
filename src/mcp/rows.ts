import { z } from "zod";
import { weatherCondition } from "../lib/aceweather/format.ts";
import { daysInclusive, addDays } from "./dates.ts";
import type { Completeness } from "./envelope.ts";
import { convertWind, round, secondsToHours, type WindUnit } from "./units.ts";

export type Detail = "compact" | "full";
export type Series = Record<string, any[] | undefined>;

export const RAIN_DAY_MM = 0.2;
export const WET_DAY_MM = 1;
export const DEFINITIONS = {
  rain_day: `precipitation >= ${RAIN_DAY_MM} mm`,
  wet_day: `precipitation >= ${WET_DAY_MM} mm`,
  dry_spell: `consecutive days with precipitation < ${RAIN_DAY_MM} mm (a missing day ends the spell)`,
  wet_spell: `consecutive days with precipitation >= ${WET_DAY_MM} mm (a missing day ends the spell)`,
  air_frost_day: "minimum air temperature below 0 °C",
};

export const value = (s: Series, key: string, i: number): number | null => {
  const v = s[key]?.[i];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
const conditionAt = (s: Series, i: number) => {
  const code = value(s, "weather_code", i);
  return code == null ? null : weatherCondition(code).label;
};

const n = z.number().nullable().optional();
const text = z.string().nullable().optional();
const dated = z.object({ value: z.number(), date: z.string() }).nullable();

export const historyRowSchema = z.object({
  date: z.string(), precipitation_mm: n, temp_max_c: n, temp_min_c: n, wind_gust_max: n,
  temp_mean_c: n, rain_mm: n, snowfall_cm: n, precipitation_hours: n, wind_speed_max: n,
  wind_direction_dominant_deg: n, relative_humidity_mean_pct: n, et0_mm: n, sunshine_h: n,
  shortwave_radiation_mj_m2: n, soil_temp_0_7cm_c: n, soil_moisture_0_7cm: n, condition: text,
});

export const monthRowSchema = z.object({
  month: z.string(), precipitation_mm: n, rain_days: z.number(), temp_max_c: n, temp_min_c: n, temp_mean_c: n, days_with_data: z.number(),
});

export const historySummarySchema = z.object({
  precipitation_total_mm: n, rain_days: z.number(), wet_days: z.number(), wettest_day: dated,
  temp_max: dated, temp_min: dated, temp_mean_c: n, air_frost_days: z.number(), wind_gust_max: dated,
  relative_humidity_mean_pct: n, et0_total_mm: n, sunshine_total_h: n, shortwave_radiation_total_mj_m2: n,
  soil_temp_mean_0_7cm_c: n, soil_moisture_latest_0_7cm: dated, longest_dry_spell_days: z.number(), longest_wet_spell_days: z.number(),
});

export const hourlyRowSchema = z.object({
  time: z.string(), temperature_c: n, precipitation_mm: n, precipitation_probability_pct: n, wind_speed: n, wind_gust: n,
  wind_direction_deg: n, apparent_temperature_c: n, relative_humidity_pct: n, cloud_cover_pct: n, pressure_hpa: n,
  et0_mm: n, soil_temp_0cm_c: n, soil_temp_6cm_c: n, soil_moisture_0_1cm: n,
});

export const dailyForecastRowSchema = z.object({
  date: z.string(), temp_max_c: n, temp_min_c: n, precipitation_mm: n, precipitation_probability_pct: n,
  wind_speed_max: n, wind_gust_max: n, condition: text, wind_direction_dominant_deg: n, uv_index_max: n,
  sunrise: text, sunset: text, lead_time_days: z.number().optional(),
});

export function historyRow(d: Series, i: number, wind: WindUnit, detail: Detail) {
  const row: Record<string, unknown> = {
    date: d.time?.[i],
    precipitation_mm: round(value(d, "precipitation_sum", i)),
    temp_max_c: round(value(d, "temperature_2m_max", i)),
    temp_min_c: round(value(d, "temperature_2m_min", i)),
    wind_gust_max: convertWind(value(d, "wind_gusts_10m_max", i), wind),
  };
  if (detail === "full") {
    Object.assign(row, {
      temp_mean_c: round(value(d, "temperature_2m_mean", i)),
      rain_mm: round(value(d, "rain_sum", i)),
      snowfall_cm: round(value(d, "snowfall_sum", i)),
      precipitation_hours: round(value(d, "precipitation_hours", i)),
      wind_speed_max: convertWind(value(d, "wind_speed_10m_max", i), wind),
      wind_direction_dominant_deg: round(value(d, "wind_direction_10m_dominant", i), 0),
      relative_humidity_mean_pct: round(value(d, "relative_humidity_2m_mean", i), 0),
      et0_mm: round(value(d, "et0_fao_evapotranspiration", i)),
      sunshine_h: secondsToHours(value(d, "sunshine_duration", i)),
      shortwave_radiation_mj_m2: round(value(d, "shortwave_radiation_sum", i)),
      soil_temp_0_7cm_c: round(value(d, "soil_temperature_0_to_7cm_mean", i)),
      soil_moisture_0_7cm: round(value(d, "soil_moisture_0_to_7cm_mean", i), 3),
      condition: conditionAt(d, i),
    });
  }
  return row;
}

function extreme(d: Series, key: string, pick: "max" | "min") {
  let best: { value: number; date: string } | null = null;
  (d.time ?? []).forEach((date, i) => {
    const v = value(d, key, i);
    if (v != null && (!best || (pick === "max" ? v > best.value : v < best.value))) best = { value: v, date };
  });
  return best as { value: number; date: string } | null;
}

function stats(d: Series, key: string) {
  const values = (d.time ?? []).map((_, i) => value(d, key, i)).filter((v): v is number => v != null);
  const total = values.reduce((a, b) => a + b, 0);
  return { total: values.length ? total : null, mean: values.length ? total / values.length : null, values };
}

function longestRun(flags: Array<boolean | null>): number {
  let best = 0;
  let run = 0;
  for (const flag of flags) {
    run = flag ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

export function historySummary(d: Series, wind: WindUnit) {
  const precip = (d.time ?? []).map((_, i) => value(d, "precipitation_sum", i));
  const gust = extreme(d, "wind_gusts_10m_max", "max");
  const soil = [...(d.time ?? [])].map((date, i) => ({ date, value: value(d, "soil_moisture_0_to_7cm_mean", i) }))
    .filter((x): x is { date: string; value: number } => x.value != null).pop() ?? null;
  const roundDated = (x: { value: number; date: string } | null, dp = 1) => (x ? { value: round(x.value, dp) as number, date: x.date } : null);
  return {
    precipitation_total_mm: round(stats(d, "precipitation_sum").total),
    rain_days: precip.filter((v) => v != null && v >= RAIN_DAY_MM).length,
    wet_days: precip.filter((v) => v != null && v >= WET_DAY_MM).length,
    wettest_day: roundDated(extreme(d, "precipitation_sum", "max")),
    temp_max: roundDated(extreme(d, "temperature_2m_max", "max")),
    temp_min: roundDated(extreme(d, "temperature_2m_min", "min")),
    temp_mean_c: round(stats(d, "temperature_2m_mean").mean),
    air_frost_days: stats(d, "temperature_2m_min").values.filter((v) => v < 0).length,
    wind_gust_max: gust ? { value: convertWind(gust.value, wind) as number, date: gust.date } : null,
    relative_humidity_mean_pct: round(stats(d, "relative_humidity_2m_mean").mean, 0),
    et0_total_mm: round(stats(d, "et0_fao_evapotranspiration").total),
    sunshine_total_h: secondsToHours(stats(d, "sunshine_duration").total),
    shortwave_radiation_total_mj_m2: round(stats(d, "shortwave_radiation_sum").total),
    soil_temp_mean_0_7cm_c: round(stats(d, "soil_temperature_0_to_7cm_mean").mean),
    soil_moisture_latest_0_7cm: roundDated(soil, 3),
    longest_dry_spell_days: longestRun(precip.map((v) => (v == null ? null : v < RAIN_DAY_MM))),
    longest_wet_spell_days: longestRun(precip.map((v) => (v == null ? null : v >= WET_DAY_MM))),
  };
}

export function monthlyRows(d: Series) {
  const months = new Map<string, number[]>();
  (d.time ?? []).forEach((date: string, i) => months.set(date.slice(0, 7), [...(months.get(date.slice(0, 7)) ?? []), i]));
  return [...months].map(([month, idx]) => {
    const pick = (key: string) => idx.map((i) => value(d, key, i)).filter((v): v is number => v != null);
    const precip = pick("precipitation_sum");
    const means = pick("temperature_2m_mean");
    return {
      month,
      precipitation_mm: precip.length ? round(precip.reduce((a, b) => a + b, 0)) : null,
      rain_days: precip.filter((v) => v >= RAIN_DAY_MM).length,
      temp_max_c: pick("temperature_2m_max").length ? round(Math.max(...pick("temperature_2m_max"))) : null,
      temp_min_c: pick("temperature_2m_min").length ? round(Math.min(...pick("temperature_2m_min"))) : null,
      temp_mean_c: means.length ? round(means.reduce((a, b) => a + b, 0) / means.length) : null,
      days_with_data: precip.length,
    };
  });
}

/** A day counts as available when rain, max and min temperature are all present. */
export function dailyCompleteness(d: Series, start: string, end: string): Completeness {
  const expected = daysInclusive(start, end);
  const present = new Set<string>();
  (d.time ?? []).forEach((date: string, i) => {
    if (["precipitation_sum", "temperature_2m_max", "temperature_2m_min"].every((key) => value(d, key, i) != null)) present.add(date);
  });
  const missing = Array.from({ length: expected }, (_, k) => addDays(start, k)).filter((date) => !present.has(date));
  return {
    expected,
    available: expected - missing.length,
    missing: missing.length,
    percent: round(((expected - missing.length) / expected) * 100, 1) as number,
    ...(missing.length ? { missing_dates: missing.slice(0, 10) } : {}),
    ...(missing.length ? { note: "Missing days are excluded from totals, never counted as zero." } : {}),
  };
}

export function hourlyRow(h: Series, i: number, wind: WindUnit, detail: Detail) {
  const row: Record<string, unknown> = {
    time: h.time?.[i],
    temperature_c: round(value(h, "temperature_2m", i)),
    precipitation_mm: round(value(h, "precipitation", i)),
    precipitation_probability_pct: value(h, "precipitation_probability", i),
    wind_speed: convertWind(value(h, "wind_speed_10m", i), wind),
    wind_gust: convertWind(value(h, "wind_gusts_10m", i), wind),
    wind_direction_deg: value(h, "wind_direction_10m", i),
  };
  if (detail === "full") {
    Object.assign(row, {
      apparent_temperature_c: round(value(h, "apparent_temperature", i)),
      relative_humidity_pct: value(h, "relative_humidity_2m", i),
      cloud_cover_pct: value(h, "cloud_cover", i),
      pressure_hpa: round(value(h, "pressure_msl", i)),
      et0_mm: round(value(h, "et0_fao_evapotranspiration", i), 2),
      soil_temp_0cm_c: round(value(h, "soil_temperature_0cm", i)),
      soil_temp_6cm_c: round(value(h, "soil_temperature_6cm", i)),
      soil_moisture_0_1cm: round(value(h, "soil_moisture_0_to_1cm", i), 3),
    });
  }
  return row;
}

export function gustsByDate(h: Series): Map<string, number> {
  const gusts = new Map<string, number>();
  (h.time ?? []).forEach((time: string, i) => {
    const gust = value(h, "wind_gusts_10m", i);
    if (gust != null) gusts.set(time.slice(0, 10), Math.max(gust, gusts.get(time.slice(0, 10)) ?? 0));
  });
  return gusts;
}

export function dailyForecastRow(d: Series, i: number, gusts: Map<string, number>, wind: WindUnit, detail: Detail) {
  const date = String(d.time?.[i]);
  const row: Record<string, unknown> = {
    date,
    temp_max_c: round(value(d, "temperature_2m_max", i)),
    temp_min_c: round(value(d, "temperature_2m_min", i)),
    precipitation_mm: round(value(d, "precipitation_sum", i)),
    precipitation_probability_pct: value(d, "precipitation_probability_max", i),
    wind_speed_max: convertWind(value(d, "wind_speed_10m_max", i), wind),
    wind_gust_max: convertWind(gusts.get(date) ?? null, wind),
    condition: conditionAt(d, i),
  };
  if (detail === "full") {
    Object.assign(row, {
      wind_direction_dominant_deg: value(d, "wind_direction_10m_dominant", i),
      uv_index_max: round(value(d, "uv_index_max", i)),
      sunrise: d.sunrise?.[i] ?? null,
      sunset: d.sunset?.[i] ?? null,
    });
  }
  return row;
}
