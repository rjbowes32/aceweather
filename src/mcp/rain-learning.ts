/**
 * Rainfall learning from rain gauges. Per gauge and UTC day the store keeps the observed total and each
 * model's daily-total error at each lead. A single gauge on a showery day says little, so a gauge's fit
 * pools every eligible gauge within RAIN_POOL_KM. The learned rainfall is the equal-weight model mean (the
 * backtest's best rainfall strategy) times the pooled ratio of observed to forecast rain over the window.
 * The forecast only uses it for lead days where it has beaten the plain mean out of sample (rainLeadsEnabled).
 */
import { distanceKm } from "./geo.ts";
import type { Forecasts, ModelsFor, StationState } from "./learning-store.ts";

export const RAIN_POOL_KM = 25;
export const RAIN_SCALE_MIN = 0.67;
export const RAIN_SCALE_MAX = 1.5;
/** Below this pooled forecast total (mm) the ratio is noise, so the scale stays 1. */
const MIN_FORECAST_MM = 5;
export const STANDARD_MODEL = "best_match";
/** Learned rainfall is used for a lead only after this many scored gauge-days, at least 2% better than the mean. */
export const RAIN_GATE = { minDays: 1000, maxRatio: 0.98 };

/** day -> lead -> model -> forecast minus observed daily total (mm). */
export type RainDay = Record<string, Record<string, number>>;
export type RainFit = { scale: number; days: number; gauges: number };
/** [days, Σ|learned error|, Σ|standard error|, Σ|mean error|] */
export type RainScore = [number, number, number, number];

const DAY = 86_400_000;
const dayMsCache = new Map<string, number>();
/** Scoring calls this millions of times over a few hundred distinct dates, so it is memoised. */
function dayMs(d: string): number {
  let ms = dayMsCache.get(d);
  if (ms === undefined) dayMsCache.set(d, (ms = Date.parse(`${d}T00:00:00Z`)));
  return ms;
}
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Totals over (D 00:00, D+1 00:00] UTC; each hourly value covers the hour ending at its timestamp. Days need all 24 hours. */
export function forecastDayTotals(time: string[], values: Array<number | null>): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  time.forEach((t, i) => {
    const v = values[i];
    if (!finite(v)) return;
    const day = dayOf(Date.parse(`${t}:00Z`) - 1);
    const s = sums.get(day) ?? { total: 0, count: 0 };
    s.total += v; s.count++;
    sums.set(day, s);
  });
  return new Map([...sums].filter(([, s]) => s.count === 24).map(([day, s]) => [day, s.total]));
}

/** Daily-total errors for every observed day, per lead, for the lead's models and the standard forecast. */
export function rainErrorDays(forecasts: Forecasts, obsDays: Map<string, number>, leads: number[], modelsFor: ModelsFor): Map<string, Record<string, Record<string, number>>> {
  const out = new Map<string, Record<string, Record<string, number>>>();
  for (const lead of leads) {
    for (const m of [...modelsFor(lead), STANDARD_MODEL]) {
      for (const [day, total] of forecastDayTotals(forecasts.time, forecasts.series("precipitation", lead, m))) {
        const o = obsDays.get(day);
        if (o == null) continue;
        const byLead = out.get(day) ?? {};
        (byLead[lead] ??= {})[m] = round4(total - o);
        out.set(day, byLead);
      }
    }
  }
  return out;
}

export function updateRainDays(station: StationState, obsDays: Map<string, number>, days: Map<string, Record<string, Record<string, number>>>): number {
  for (const [day, byLead] of days) {
    const rec = (station.days[day] ??= {});
    rec.r = byLead;
    rec.ro = obsDays.get(day);
  }
  return days.size;
}

/** Pooled fit from the stations' days strictly before `beforeDay` within the window; a day counts only with every model. */
export function rainFitAsOf(stations: StationState[], lead: number, beforeDay: string, windowDays: number, models: string[], minDays: number): RainFit | null {
  let observed = 0;
  let forecast = 0;
  const days = new Set<string>();
  const gauges = new Set<string>();
  for (const st of stations) {
    for (const day in st.days) {
      const rec = st.days[day];
      const errors = rec.r?.[lead];
      if (rec.ro == null || !errors) continue;
      const age = dayMs(beforeDay) - dayMs(day);
      if (age <= 0 || age > windowDays * DAY) continue;
      const e = models.map((m) => errors[m]);
      if (!e.every(finite)) continue;
      observed += rec.ro;
      forecast += rec.ro + e.reduce((a, b) => a + b, 0) / e.length;
      days.add(day);
      gauges.add(st.meta.id);
    }
  }
  if (days.size < minDays) return null;
  const scale = forecast < MIN_FORECAST_MM ? 1 : Math.min(RAIN_SCALE_MAX, Math.max(RAIN_SCALE_MIN, observed / forecast));
  return { scale: round4(scale), days: days.size, gauges: gauges.size };
}

/** Equal-weight mean of the models present (at least two), times the fit's scale. */
export function learnedRain(fit: Pick<RainFit, "scale"> | null, values: Array<number | null | undefined>): number | null {
  const v = values.filter(finite);
  if (v.length < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.max(0, fit ? mean * fit.scale : mean);
}

/** Eligible gauges within RAIN_POOL_KM of a station, itself included. */
export function rainPool(station: StationState, eligible: StationState[]): StationState[] {
  const { latitude, longitude } = station.meta;
  return eligible.filter((s) => distanceKm(latitude, longitude, s.meta.latitude, s.meta.longitude) <= RAIN_POOL_KM);
}

/** Out-of-sample score for one observed day: each lead's pooled fit uses only days before that forecast's issue date. */
export function scoreRainDay(station: StationState, pool: StationState[], day: string, leads: number[], modelsFor: ModelsFor, windowDays: number, minDays: number): Record<string, RainScore> {
  const rec = station.days[day];
  const out: Record<string, RainScore> = {};
  if (rec?.ro == null || !rec.r) return out;
  for (const lead of leads) {
    const errors = rec.r[lead];
    const models = modelsFor(lead);
    if (!errors || !finite(errors[STANDARD_MODEL]) || !models.every((m) => finite(errors[m]))) continue;
    const fit = rainFitAsOf(pool, lead, dayOf(dayMs(day) - lead * DAY), windowDays, models, minDays);
    if (!fit) continue;
    const o = rec.ro;
    const mean = learnedRain(null, models.map((m) => o + errors[m]))!;
    const learned = mean * fit.scale;
    out[lead] = [1, round4(Math.abs(learned - o)), round4(Math.abs(errors[STANDARD_MODEL])), round4(Math.abs(mean - o))];
  }
  return out;
}

/** Lead days where the learned rainfall has clearly beaten the plain model mean over the last 30 days. */
export function rainLeadsEnabled(scores: Record<string, { days?: number; learned_mae: number; mean_mae?: number }> | undefined): Set<number> {
  const out = new Set<number>();
  for (const [lead, s] of Object.entries(scores ?? {})) if ((s.days ?? 0) >= RAIN_GATE.minDays && s.mean_mae != null && s.learned_mae <= s.mean_mae * RAIN_GATE.maxRatio) out.add(Number(lead));
  return out;
}
