/**
 * Rolling learning state for the daily job: per station, per UTC day, per lead and model, the error sums
 * of each model's archived forecast against what the station measured. Fits are rebuilt from the last
 * WINDOW days of that record, so nothing needs raw observation history beyond a few days.
 */
import { citizenRainOk, citizenTemperatureOk, temperatureSpread } from "./citizen-qc.ts";
import { distanceKm } from "./geo.ts";
import { addError, apply, fit, type DayErrors, type Fit } from "./learning.ts";
import { rainFitAsOf, rainPool, type RainDay, type RainFit, type RainScore } from "./rain-learning.ts";

export const STORE_VERSION = 1;
export type Variable = "temperature_2m" | "wind_speed_10m";
export type ForecastVariable = Variable | "precipitation";
export const VAR_KEY: Record<Variable, "t" | "w"> = { temperature_2m: "t", wind_speed_10m: "w" };

/** [n, sum |error|, sum error², sum error] */
export type E = [number, number, number, number];
export type VarDay = Record<string, Record<string, E>>;
export type Score = [number, number, number]; // [hours, sum |learned error|, sum |standard error|]
/** `r` and `ro` are rain gauges' daily-total errors and observed total (rain-learning.ts). */
export type DayRecord = { t?: VarDay; w?: VarDay; r?: RainDay; ro?: number; score?: Record<string, { t?: Score; w?: Score; r?: RainScore }> };

export type StationMeta = {
  id: string; name: string; network: "metoffice" | "metar" | "cosmos_uk" | "ea_rain" | "sepa_rain" | "netatmo";
  latitude: number; longitude: number; elevation_m: number | null; ghcnh_id?: string | null;
};
/** `no_data_at`: the last run a rain gauge had no complete day (it then rests, so another gauge can take its place). */
export type StationState = { meta: StationMeta; days: Record<string, DayRecord>; obs?: Record<string, [number | null, number | null]>; bootstrapped_at?: string; no_data_at?: string };
export type LearningState = { version: number; updated_at: string | null; stations: Record<string, StationState> };

export type Forecasts = { time: string[]; series: (variable: ForecastVariable, lead: number, model: string) => Array<number | null> };
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

/**
 * Writes recomputed days into the station. Each model needs at least `minHours` matched hours on a day, so a
 * model seen for an hour or two cannot count it as a training day and win the weighting on easy hours.
 */
export function updateDays(station: StationState, variable: Variable, days: Map<string, VarDay>, minHours = 12): number {
  let written = 0;
  for (const [day, byLead] of days) {
    const kept: VarDay = {};
    for (const [lead, models] of Object.entries(byLead)) {
      const covered = Object.entries(models).filter(([, e]) => e[0] >= minHours);
      if (covered.length) kept[lead] = Object.fromEntries(covered);
    }
    if (!Object.keys(kept).length) continue;
    (station.days[day] ??= {})[VAR_KEY[variable]] = kept;
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

/** `model_bias` lets the forecast reweight the bias when a model is missing from a live run. */
export type LeadFit = { weights: Record<string, number>; bias: number; days: number; model_bias?: Record<string, number> };
export type FitsStation = { meta: StationMeta; leads: Record<string, { t?: LeadFit; w?: LeadFit; r?: RainFit }> };
/** `hours` for temperature and wind; `days` and `mean_mae` (the equal-weight model mean) for rainfall. */
export type RecentScore = { hours?: number; days?: number; learned_mae: number; standard_mae: number; mean_mae?: number; stations: number };
export type FitsFile = {
  version: number; generated_at: string; window_days: number; ai_from_lead: number;
  stations: FitsStation[];
  /** Last 30 days of out-of-sample scores at official stations, pooled: variable -> lead -> score. */
  recent_scores: Record<string, Record<string, RecentScore>>;
};

const isCitizen = (st: { meta: StationMeta }) => st.meta.network === "netatmo";
/** A station with no data for this long is not exported, however fresh the file: its fits describe the past. */
export const STALE_DAYS = 7;
const hasRain = (st: StationState) => Object.values(st.days).some((rec) => rec.ro != null);

/**
 * Per station: temperature and wind fits (citizen stations only when they pass quality control) and a rainfall
 * fit pooled over the eligible gauges around it. Recent scores pool official stations only.
 */
export function exportFits(state: LearningState, today: string, leads: number[], modelsFor: ModelsFor, windowDays: number, minDays: number, aiFromLead: number, generatedAt = new Date().toISOString()): FitsFile {
  const stations: FitsStation[] = [];
  const all = Object.values(state.stations);
  const officialSpread = median(all.filter((st) => !isCitizen(st)).map((st) => temperatureSpread(st, today, windowDays)).filter((s): s is number => s != null));
  const rainList = all.filter((st) => hasRain(st) && (!isCitizen(st) || citizenRainOk(st, today, windowDays)));
  const rainEligible = new Set(rainList);
  const pooled: Record<string, Record<string, { n: number; learned: number; standard: number; mean: number; stations: Set<string> }>> = { t: {}, w: {}, r: {} };
  for (const st of all) {
    const entry: FitsStation = { meta: st.meta, leads: {} };
    for (const lead of leads) {
      for (const variable of ["temperature_2m", "wind_speed_10m"] as Variable[]) {
        const f = fitAsOf(st, variable, lead, today, windowDays, modelsFor(lead), minDays);
        if (!f) continue;
        (entry.leads[lead] ??= {})[VAR_KEY[variable]] = {
          weights: Object.fromEntries(Object.entries(f.weights).map(([m, w]) => [m, round4(w)])), bias: round4(f.blendBias), days: f.trainingDays,
          model_bias: Object.fromEntries(Object.entries(f.bias).map(([m, b]) => [m, round4(b)])),
        };
      }
    }
    if (isCitizen(st) && !citizenTemperatureOk(st, entry.leads["1"]?.t?.bias ?? null, officialSpread, today, windowDays)) for (const lf of Object.values(entry.leads)) { delete lf.t; delete lf.w; }
    if (rainEligible.has(st)) {
      const pool = rainPool(st, rainList);
      for (const lead of leads) {
        const rf = rainFitAsOf(pool, lead, today, windowDays, modelsFor(lead), minDays);
        if (rf) (entry.leads[lead] ??= {}).r = rf;
      }
    }
    for (const [lead, lf] of Object.entries(entry.leads)) if (!Object.keys(lf).length) delete entry.leads[lead];
    const latest = Object.keys(st.days).reduce((a, d) => (d > a ? d : a), "");
    if (latest && dayMs(today) - dayMs(latest) <= STALE_DAYS * DAY && Object.keys(entry.leads).length) stations.push(entry);
    if (isCitizen(st)) continue;
    for (const [day, rec] of Object.entries(st.days)) {
      if (dayMs(today) - dayMs(day) > 30 * DAY) continue;
      for (const [lead, s] of Object.entries(rec.score ?? {})) for (const key of ["t", "w", "r"] as const) {
        const v = s[key];
        if (!v) continue;
        const p = (pooled[key][lead] ??= { n: 0, learned: 0, standard: 0, mean: 0, stations: new Set() });
        p.n += v[0]; p.learned += v[1]; p.standard += v[2]; p.mean += key === "r" ? (v as RainScore)[3] : 0; p.stations.add(st.meta.id);
      }
    }
  }
  const names = { t: "temperature", w: "wind_speed", r: "rainfall" } as const;
  const recent_scores = Object.fromEntries(Object.entries(pooled).map(([key, byLead]) => [names[key as keyof typeof names], Object.fromEntries(Object.entries(byLead).map(([lead, p]) => [lead, {
    ...(key === "r" ? { days: p.n } : { hours: p.n }),
    learned_mae: round4(p.learned / p.n), standard_mae: round4(p.standard / p.n),
    ...(key === "r" ? { mean_mae: round4(p.mean / p.n) } : {}),
    stations: p.stations.size,
  }]))]));
  return { version: STORE_VERSION, generated_at: generatedAt, window_days: windowDays, ai_from_lead: aiFromLead, stations, recent_scores };
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

export type ReferenceSearch = {
  radiusKm: number; maxHeightDiffM: number; minDays: number;
  /** A citizen station is chosen only where no official station is within `officialKm` and `officialHeightM` (where bias correction would be off). */
  citizen?: { radiusKm: number; maxHeightDiffM: number; officialKm: number; officialHeightM: number };
};
type Location = { latitude: number; longitude: number; elevation_m: number | null };

/**
 * Same ranking as the live search: distance plus 10 km per 100 m of height difference, within radius and height
 * limits, among stations with a fit for `key` (temperature or wind, chosen separately).
 */
export function chooseReference(fits: FitsFile, location: Location, search: ReferenceSearch, key: "t" | "w" = "t"): { station: FitsStation; distance_km: number } | null {
  const pick = (citizen: boolean, radiusKm: number, maxHeightDiffM: number) => {
    let best: { station: FitsStation; distance_km: number; dz: number | null; score: number } | null = null;
    for (const station of fits.stations) {
      const lead1 = station.leads["1"]?.[key];
      if (!lead1 || lead1.days < search.minDays || isCitizen(station) !== citizen) continue;
      const d = distanceKm(location.latitude, location.longitude, station.meta.latitude, station.meta.longitude);
      if (d > radiusKm) continue;
      const dz = station.meta.elevation_m != null && location.elevation_m != null ? Math.abs(station.meta.elevation_m - location.elevation_m) : null;
      if (dz != null && dz > maxHeightDiffM) continue;
      const score = d + (dz ?? 0) / 10;
      if (!best || score < best.score) best = { station, distance_km: d, dz, score };
    }
    return best;
  };
  const official = pick(false, search.radiusKm, search.maxHeightDiffM);
  const c = search.citizen;
  const officialClose = official && official.distance_km <= (c?.officialKm ?? 0) && (official.dz ?? 0) <= (c?.officialHeightM ?? 0);
  const best = c && !officialClose ? pick(true, c.radiusKm, c.maxHeightDiffM) ?? official : official;
  return best ? { station: best.station, distance_km: best.distance_km } : null;
}

/** The nearest station with a rainfall fit within `radiusKm`. */
export function chooseRainReference(fits: FitsFile, location: Location, radiusKm: number): { station: FitsStation; distance_km: number } | null {
  let best: { station: FitsStation; distance_km: number } | null = null;
  for (const station of fits.stations) {
    if (!station.leads["1"]?.r) continue;
    const d = distanceKm(location.latitude, location.longitude, station.meta.latitude, station.meta.longitude);
    if (d <= radiusKm && (!best || d < best.distance_km)) best = { station, distance_km: d };
  }
  return best;
}

/** A stored lead fit in the shape learning.apply() expects. */
export const asFit = (lf: LeadFit): Fit => ({ ranking: Object.keys(lf.weights), mae: {}, bias: lf.model_bias ?? {}, weights: lf.weights, blendBias: lf.bias, trainingDays: lf.days });
