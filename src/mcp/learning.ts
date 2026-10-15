/**
 * Per-location model learning: weight forecast models by their recent error against real observations
 * and remove the blend's recent bias. Pure functions over daily error sums, shared by the backtest and
 * (later) the live forecast so both use exactly the same maths.
 */

export type ModelId = string;

/** Error sums for one model on one day (forecast minus observed, over that day's matched hours or the day total). */
export type DayErrors = { n: number; sumAbs: number; sumSq: number; sum: number };

export type Fit = {
  /** Models ranked by mean absolute error over the training window, best first. */
  ranking: ModelId[];
  mae: Record<ModelId, number>;
  bias: Record<ModelId, number>;
  /** Inverse mean-squared-error weights, summing to 1. */
  weights: Record<ModelId, number>;
  /** Mean error of the weighted blend over the window (Σ w·bias, since the blend error is Σ w·e). */
  blendBias: number;
  trainingDays: number;
};

export const STRATEGIES = ["current", "current_bias", "mean", "best_recent", "weighted", "weighted_bias"] as const;
export type Strategy = (typeof STRATEGIES)[number];

export const STRATEGY_LABELS: Record<Strategy, string> = {
  current: "AceWeather today (Open-Meteo best_match)",
  current_bias: "AceWeather today minus its own recent bias",
  mean: "Equal-weight mean of the four models",
  best_recent: "Whichever model had the lowest recent error",
  weighted: "Models weighted by recent accuracy (inverse MSE)",
  weighted_bias: "Weighted by recent accuracy, minus the blend's recent bias",
};

/** Combines per-day error sums over a training window into a fit. Returns null with too little data. */
export function fit(days: Array<Record<ModelId, DayErrors | undefined>>, models: ModelId[], minDays: number): Fit | null {
  const totals = Object.fromEntries(models.map((m) => [m, { n: 0, sumAbs: 0, sumSq: 0, sum: 0, days: 0 }]));
  for (const day of days) {
    for (const m of models) {
      const e = day[m];
      if (!e || e.n === 0) continue;
      const t = totals[m];
      t.n += e.n; t.sumAbs += e.sumAbs; t.sumSq += e.sumSq; t.sum += e.sum; t.days++;
    }
  }
  const usable = models.filter((m) => totals[m].days >= minDays);
  if (usable.length < 2) return null;
  const mae = Object.fromEntries(usable.map((m) => [m, totals[m].sumAbs / totals[m].n]));
  const bias = Object.fromEntries(usable.map((m) => [m, totals[m].sum / totals[m].n]));
  const inv = Object.fromEntries(usable.map((m) => [m, 1 / Math.max(1e-6, totals[m].sumSq / totals[m].n)]));
  const invTotal = Object.values(inv).reduce((a, b) => a + b, 0);
  const weights = Object.fromEntries(usable.map((m) => [m, inv[m] / invTotal]));
  return {
    ranking: [...usable].sort((a, b) => mae[a] - mae[b]),
    mae, bias, weights,
    blendBias: usable.reduce((s, m) => s + weights[m] * bias[m], 0),
    trainingDays: Math.min(...usable.map((m) => totals[m].days)),
  };
}

/**
 * Forecast for one hour or day under a strategy. Missing models are dropped and the remaining weights
 * renormalised; `current` is the forecast AceWeather shows today. Returns null when nothing is available.
 * `floorZero` keeps blended rainfall non-negative (bias correction is never applied to rainfall).
 */
export function apply(strategy: Strategy, f: Fit | null, forecasts: Record<ModelId, number | null | undefined>, current: number | null | undefined, models: ModelId[], floorZero = false, currentBias: number | null = null): number | null {
  if (strategy === "current_bias") {
    if (typeof current !== "number") return null;
    return floorZero || currentBias == null ? current : current - currentBias;
  }
  if (strategy === "current" || !f) return typeof current === "number" ? current : null;
  const present = models.filter((m) => typeof forecasts[m] === "number");
  if (!present.length) return null;
  if (strategy === "mean") return present.reduce((s, m) => s + (forecasts[m] as number), 0) / present.length;
  if (strategy === "best_recent") {
    const pick = f.ranking.find((m) => typeof forecasts[m] === "number");
    return pick ? (forecasts[pick] as number) : null;
  }
  const weighted = present.filter((m) => f.weights[m] != null);
  if (!weighted.length) return null;
  const total = weighted.reduce((s, m) => s + f.weights[m], 0);
  const blend = weighted.reduce((s, m) => s + (f.weights[m] / total) * (forecasts[m] as number), 0);
  if (strategy === "weighted" || floorZero) return floorZero ? Math.max(0, blend) : blend;
  // With a model missing, the blend is reweighted, so its bias must be too (when per-model biases are known).
  const missing = Object.keys(f.weights).some((m) => !weighted.includes(m));
  const reweighted = missing && weighted.every((m) => typeof f.bias[m] === "number");
  return blend - (reweighted ? weighted.reduce((s, m) => s + (f.weights[m] / total) * f.bias[m], 0) : f.blendBias);
}

export function addError(target: DayErrors | undefined, error: number): DayErrors {
  const t = target ?? { n: 0, sumAbs: 0, sumSq: 0, sum: 0 };
  t.n++; t.sumAbs += Math.abs(error); t.sumSq += error * error; t.sum += error;
  return t;
}

/** Mean error of one forecast over a training window, or null with fewer than `minDays` days. */
export function meanBias(days: Array<DayErrors | undefined>, minDays: number): number | null {
  let n = 0; let sum = 0; let count = 0;
  for (const d of days) if (d && d.n) { n += d.n; sum += d.sum; count++; }
  return count >= minDays ? sum / n : null;
}

/**
 * Blend of two fits, `frac` of the way from `a` to `b`: weights interpolated over both model sets (a model
 * missing from one fit counts as weight 0 there) and renormalised; blend bias interpolated. Used to move
 * smoothly between lead days instead of switching at each 24-hour boundary.
 */
export function interpolateFits(a: Fit | null, b: Fit | null, frac: number): Fit | null {
  if (!a || frac <= 0) return a ?? b;
  if (!b || frac >= 1) return b ?? a;
  const models = [...new Set([...Object.keys(a.weights), ...Object.keys(b.weights)])];
  const raw = Object.fromEntries(models.map((m) => [m, (1 - frac) * (a.weights[m] ?? 0) + frac * (b.weights[m] ?? 0)]));
  const total = Object.values(raw).reduce((x, y) => x + y, 0) || 1;
  const weights = Object.fromEntries(models.map((m) => [m, raw[m] / total]));
  return {
    ranking: [...models].sort((x, y) => weights[y] - weights[x]),
    mae: {}, weights,
    bias: Object.fromEntries(models.filter((m) => m in a.bias || m in b.bias).map((m) => [m, a.bias[m] == null ? b.bias[m] : b.bias[m] == null ? a.bias[m] : (1 - frac) * a.bias[m] + frac * b.bias[m]])),
    blendBias: (1 - frac) * a.blendBias + frac * b.blendBias,
    trainingDays: Math.min(a.trainingDays, b.trainingDays),
  };
}
