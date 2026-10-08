import { z } from "zod";
import { LIMITS } from "./config.ts";
import { localNow } from "./dates.ts";
import type { Classification, Completeness, Source } from "./envelope.ts";
import type { ResolvedLocation } from "./locations.ts";
import { resolvePeriod, type PeriodRequest } from "./periods.ts";
import {
  dailyCompleteness, historyRow, historySummary, hourlyRow, monthlyRows, value, type Detail, type Series,
} from "./rows.ts";
import { ARCHIVE_SOURCE, getArchiveDaily } from "./sources/archive.ts";
import { currentHourIndex, FORECAST_SOURCE, getForecast } from "./sources/forecast.ts";
import { convertWind, round, type WindUnit } from "./units.ts";

const timed = z.object({ value: z.number(), time: z.string() }).nullable();
export const hourlySummarySchema = z.object({
  precipitation_total_mm: z.number().nullable(), temp_max: timed, temp_min: timed, wind_gust_max: timed,
  relative_humidity_mean_pct: z.number().nullable(), hours: z.number(),
});

export type HistoryResult = {
  classification: Classification;
  period: { period: string; label: string; timezone: string; start?: string; end?: string; days?: number; hours?: number; years_ago?: number };
  sources: Source[];
  completeness: Completeness;
  warnings: string[];
  granularity: "day" | "month" | "hour";
  summary: Record<string, unknown>;
  rows: Record<string, unknown>[];
};

function hourlyExtreme(h: Series, key: string, idx: number[], pick: "max" | "min") {
  let best: { value: number; time: string } | null = null;
  for (const i of idx) {
    const v = value(h, key, i);
    if (v != null && (!best || (pick === "max" ? v > best.value : v < best.value))) best = { value: v, time: String(h.time?.[i]) };
  }
  return best as { value: number; time: string } | null;
}

async function hourlyHistory(location: ResolvedLocation, period: string, label: string, hours: number | null, wind: WindUnit, detail: Detail): Promise<HistoryResult> {
  const { raw, retrieved_at } = await getForecast(location);
  const h: Series = raw.hourly ?? {};
  const times: string[] = h.time ?? [];
  const now = currentHourIndex(times, String(raw.current?.time ?? localNow(location.timezone).hour));
  const today = String(raw.current?.time ?? "").slice(0, 10);
  const from = hours == null ? Math.max(0, times.findIndex((t) => t.startsWith(today))) : Math.max(0, now - hours + 1);
  const idx = Array.from({ length: now - from + 1 }, (_, k) => from + k);
  const precip = idx.map((i) => value(h, "precipitation", i));
  const known = precip.filter((v): v is number => v != null);
  const rh = idx.map((i) => value(h, "relative_humidity_2m", i)).filter((v): v is number => v != null);
  const gust = hourlyExtreme(h, "wind_gusts_10m", idx, "max");
  const roundTimed = (x: { value: number; time: string } | null) => (x ? { value: round(x.value) as number, time: x.time } : null);
  return {
    classification: "model_recent",
    period: { period, label, timezone: location.timezone, hours: idx.length, start: times[from], end: times[now] },
    sources: [{ ...FORECAST_SOURCE, classification: "model_recent", retrieved_at, notes: "Past hours are the model's own recent hindcast, not station observations." }],
    completeness: { expected: idx.length, available: known.length, missing: idx.length - known.length, percent: idx.length ? round((known.length / idx.length) * 100, 1) as number : 0 },
    warnings: ["Recent hourly values are modelled (forecast-model hindcast), not observations from a weather station."],
    granularity: "hour",
    summary: {
      precipitation_total_mm: known.length ? round(known.reduce((a, b) => a + b, 0)) : null,
      temp_max: roundTimed(hourlyExtreme(h, "temperature_2m", idx, "max")),
      temp_min: roundTimed(hourlyExtreme(h, "temperature_2m", idx, "min")),
      wind_gust_max: gust ? { value: convertWind(gust.value, wind) as number, time: gust.time } : null,
      relative_humidity_mean_pct: rh.length ? round(rh.reduce((a, b) => a + b, 0) / rh.length, 0) : null,
      hours: idx.length,
    },
    rows: idx.map((i) => hourlyRow(h, i, wind, detail)),
  };
}

/** Historical weather for one location: daily reanalysis, or recent model hours for hour-based periods. */
export async function loadHistory(location: ResolvedLocation, request: PeriodRequest, wind: WindUnit, detail: Detail): Promise<HistoryResult> {
  const { window, warnings } = resolvePeriod(request, localNow(location.timezone).day);
  if (window.kind === "hourly") return hourlyHistory(location, window.period, window.label, window.hours, wind, detail);
  const archive = await getArchiveDaily(location, window.start, window.end);
  const d = archive.daily as Series;
  const completeness = dailyCompleteness(d, window.start, window.end);
  const dailyLimit = detail === "full" ? LIMITS.maxDailyRows : 31;
  const granularity = window.days <= dailyLimit ? "day" : "month";
  if (completeness.missing) warnings.push(`${completeness.missing} of ${completeness.expected} days have no archive data yet; totals cover available days only.`);
  if (granularity === "month") warnings.push(`Rows are aggregated by month because the period has ${window.days} days (daily rows up to ${dailyLimit}; use detail=full for up to ${LIMITS.maxDailyRows}).`);
  return {
    classification: "reanalysis",
    period: { period: window.period, label: window.label, timezone: location.timezone, start: window.start, end: window.end, days: window.days, years_ago: window.years_ago },
    sources: [{ ...ARCHIVE_SOURCE, classification: "reanalysis", retrieved_at: archive.retrieved_at }],
    completeness,
    warnings,
    granularity,
    summary: historySummary(d, wind),
    rows: granularity === "day" ? (d.time ?? []).map((_, i) => historyRow(d, i, wind, detail)) : monthlyRows(d),
  };
}
