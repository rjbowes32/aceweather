/**
 * Rolling learning state for the daily job: per station, per UTC day, per lead and model, the error sums
 * of each model's archived forecast against what the station measured. Fits are rebuilt from the last
 * WINDOW days of that record, so nothing needs raw observation history beyond a few days.
 */
import { distanceKm } from "./geo.ts";
import { addError, apply, fit, type DayErrors, type Fit } from "./learning.ts";

export const STORE_VERSION = 1;
export type Variable = "temperature_2m" | "wind_speed_10m";
export const VAR_KEY: Record<Variable, "t" | "w"> = { temperature_2m: "t", wind_speed_10m: "w" };

/** [n, sum |error|, sum error², sum error] */
export type E = [number, number, number, number];
export type VarDay = Record<string, Record<string, E>>;
export type Score = [number, number, number]; // [hours, sum |learned error|, sum |standard error|]
export type DayRecord = { t?: VarDay; w?: VarDay; score?: Record<string, { t?: Score; w?: Score }> };

export type StationMeta = {
  id: string; name: string; network: "metoffice" | "metar" | "cosmos_uk";
  latitude: number; longitude: number; elevation_m: number | null; ghcnh_id?: string | null;
};
export type StationState = { meta: StationMeta; days: Record<string, DayRecord>; obs?: Record<string, [number | null, number | null]>; bootstrapped_at?: string };
export type LearningState = { version: number; updated_at: string | null; stations: Record<string, StationState> };

export type Forecasts = { time: string[]; series: (variable: Variable, lead: number, model: string) => Array<number | null> };
export type ModelsFor = (lead: number) => string[];

const toE = (d: DayErrors): E => [d.n, round4(d.sumAbs), round4(d.sumSq), round4(d.sum)];
const fromE = (e: E | undefined): DayErrors | undefined => (e ? { n: e[0], sumAbs: e[1], sumSq: e[2], sum: e[3] } : undefined);
const round4 = (x: number) => Math.round(x * 1e4) / 1e4;
const DAY = 86_400_000;
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

export const emptyState = (): LearningState => ({ version: STORE_VERSION, updated_at: null, stations: {} });

/** Per-day error sums for one variable: day -> lead -> model -> E, over hours with both a forecast and an observation. */
export function errorDays(forecasts: Forecasts, variable: Variable, obs: Map<string, number>, leads: number[], modelsFor: ModelsFor): Map<string, VarDay> {
  const sums = new Map<string, Record<string, Record<string, DayErrors>>>();
  forecasts.time.forEach((t, i) => {
    const o = obs.get(t);
    if (o == null) return;
    const day = t.slice(0, 10);
    const byLead = sums.get(day) ?? {};
    for (const lead of leads) {
      for (const m of modelsFor(lead)) {
        const f = forecasts.series(variable, lead, m)[i];
        if (typeof f !== "number" || !Number.isFinite(f)) continue;
        byLead[lead] ??= {};
        byLead[lead][m] = addError(byLead[lead][m], f - o);
      }
    }
    sums.set(day, byLead);
  });
  return new Map([...sums].map(([day, byLead]) => [day, Object.fromEntries(Object.entries(byLead).map(([lead, models]) => [lead, Object.fromEntries(Object.entries(models).map(([m, e]) => [m, toE(e)]))]))]));
}

/** Writes recomputed days into the station, keeping a day only when it has at least `minHours` matched hours. */
export function updateDays(station: StationState, variable: Variable, days: Map<string, VarDay>, minHours = 12): number {
  let written = 0;
  for (const [day, byLead] of days) {
    const hours = Math.max(0, ...Object.values(byLead).flatMap((models) => Object.values(models).map((e) => e[0])));
    if (hours < minHours) continue;
    (station.days[day] ??= {})[VAR_KEY[variable]] = byLead;
    written++;
  }
  return written;
}

export function prune(station: StationState, today: string, keepDays: number): void {
  for (const day of Object.keys(station.days)) if (dayMs(today) - dayMs(day) > keepDays * DAY) delete station.days[day];
  if (station.obs) for (const hour of Object.keys(station.obs)) if (dayMs(today) - Date.parse(`${hour}:00Z`) > 12 * DAY) delete station.obs[hour];
}

/** Fit for one variable and lead from the days strictly before `beforeDay` within the window. */
export function fitAsOf(station: StationState, variable: Variable, lead: number, beforeDay: string, windowDays: number, models: string[], minDays: number): Fit | null {
  const key = VAR_KEY[variable];
  const days = Object.entries(station.days)
    .filter(([d]) => dayMs(d) < dayMs(beforeDay) && dayMs(beforeDay) - dayMs(d) <= windowDays * DAY)
    .map(([, rec]) => Object.fromEntries(models.map((m) => [m, fromE(rec[key]?.[lead]?.[m])])));
  return fit(days, models, minDays);
}

/**
 * Out-of-sample score for one fully observed day: the learned blend uses only days before the forecast's
 * issue date (day minus lead), exactly like the backtest. Returns lead -> [hours, Σ|learned err|, Σ|standard err|].
 */
export function scoreDay(station: StationState, variable: Variable, day: string, forecasts: Forecasts, obs: Map<string, number>, leads: number[], modelsFor: ModelsFor, windowDays: number, minDays: number, biasOk: boolean): Record<string, Score> {
  const out: Record<string, Score> = {};
  for (const lead of leads) {
    const models = modelsFor(lead);
    const issue = new Date(dayMs(day) - lead * DAY).toISOString().slice(0, 10);
    const f = fitAsOf(station, variable, lead, issue, windowDays, models, minDays);
    if (!f) continue;
    const s: Score = [0, 0, 0];
    forecasts.time.forEach((t, i) => {
      if (!t.startsWith(day)) return;
      const o = obs.get(t);
      const standard = forecasts.series(variable, lead, "best_match")[i];
      if (o == null || typeof standard !== "number") return;
      const values = Object.fromEntries(models.map((m) => [m, forecasts.series(variable, lead, m)[i]]));
      const learned = apply(biasOk ? "weighted_bias" : "weighted", f, values, standard, models);
      if (learned == null) return;
      s[0]++; s[1] += Math.abs(learned - o); s[2] += Math.abs(standard - o);
    });
    if (s[0] >= 12) out[lead] = [s[0], round4(s[1]), round4(s[2])];
  }
  return out;
}

export type LeadFit = { weights: Record<string, number>; bias: number; days: number };
export type FitsStation = { meta: StationMeta; leads: Record<string, { t?: LeadFit; w?: LeadFit }> };
export type FitsFile = {
  version: number; generated_at: string; window_days: number; ai_from_lead: number;
  stations: FitsStation[];
  /** Last 30 days of out-of-sample scores, pooled across stations: variable -> lead -> {hours, learned_mae, standard_mae, stations}. */
  recent_scores: Record<string, Record<string, { hours: number; learned_mae: number; standard_mae: number; stations: number }>>;
};

export function exportFits(state: LearningState, today: string, leads: number[], modelsFor: ModelsFor, windowDays: number, minDays: number, aiFromLead: number, generatedAt = new Date().toISOString()): FitsFile {
  const stations: FitsStation[] = [];
  const pooled: Record<string, Record<string, { hours: number; learned: number; standard: number; stations: Set<string> }>> = { t: {}, w: {} };
  for (const st of Object.values(state.stations)) {
    const entry: FitsStation = { meta: st.meta, leads: {} };
    for (const lead of leads) {
      for (const variable of ["temperature_2m", "wind_speed_10m"] as Variable[]) {
        const f = fitAsOf(st, variable, lead, today, windowDays, modelsFor(lead), minDays);
        if (!f) continue;
        (entry.leads[lead] ??= {})[VAR_KEY[variable]] = {
          weights: Object.fromEntries(Object.entries(f.weights).map(([m, w]) => [m, round4(w)])), bias: round4(f.blendBias), days: f.trainingDays,
        };
      }
    }
    if (Object.keys(entry.leads).length) stations.push(entry);
    for (const [day, rec] of Object.entries(st.days)) {
      if (dayMs(today) - dayMs(day) > 30 * DAY) continue;
      for (const [lead, s] of Object.entries(rec.score ?? {})) for (const key of ["t", "w"] as const) {
        const v = s[key];
        if (!v) continue;
        const p = (pooled[key][lead] ??= { hours: 0, learned: 0, standard: 0, stations: new Set() });
        p.hours += v[0]; p.learned += v[1]; p.standard += v[2]; p.stations.add(st.meta.id);
      }
    }
  }
  const recent_scores = Object.fromEntries(Object.entries(pooled).map(([key, byLead]) => [key === "t" ? "temperature" : "wind_speed", Object.fromEntries(Object.entries(byLead).map(([lead, p]) => [lead, {
    hours: p.hours, learned_mae: round4(p.learned / p.hours), standard_mae: round4(p.standard / p.hours), stations: p.stations.size,
  }]))]));
  return { version: STORE_VERSION, generated_at: generatedAt, window_days: windowDays, ai_from_lead: aiFromLead, stations, recent_scores };
}

export type ReferenceSearch = { radiusKm: number; maxHeightDiffM: number; minDays: number };

/** Same ranking as the live search: distance plus 10 km per 100 m of height difference, within radius and height limits. */
export function chooseReference(fits: FitsFile, location: { latitude: number; longitude: number; elevation_m: number | null }, search: ReferenceSearch): { station: FitsStation; distance_km: number } | null {
  let best: { station: FitsStation; distance_km: number; score: number } | null = null;
  for (const station of fits.stations) {
    const lead1 = station.leads["1"]?.t;
    if (!lead1 || lead1.days < search.minDays) continue;
    const d = distanceKm(location.latitude, location.longitude, station.meta.latitude, station.meta.longitude);
    if (d > search.radiusKm) continue;
    const dz = station.meta.elevation_m != null && location.elevation_m != null ? Math.abs(station.meta.elevation_m - location.elevation_m) : null;
    if (dz != null && dz > search.maxHeightDiffM) continue;
    const score = d + (dz ?? 0) / 10;
    if (!best || score < best.score) best = { station, distance_km: d, score };
  }
  return best ? { station: best.station, distance_km: best.distance_km } : null;
}

/** A stored lead fit in the shape learning.apply() expects. */
export const asFit = (lf: LeadFit): Fit => ({ ranking: Object.keys(lf.weights), mae: {}, bias: {}, weights: lf.weights, blendBias: lf.bias, trainingDays: lf.days });
