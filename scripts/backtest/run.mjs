// Replays the year day by day: each day's learned forecast uses only the days before it.
// Usage: node scripts/backtest/run.mjs  (after download.mjs). Writes .cache/backtest/results.json.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { addError, apply, fit, meanBias, STRATEGIES } from "../../src/mcp/learning.ts";
import { blendModels, CACHE, cachedJson, LEADS, MODELS, PERIOD, previousRunsUrl, RESULTS_TAG, rainDays, temperatureObs, windObs } from "./download.mjs";

export const WINDOWS = [30, 60, 90];
export const PRIMARY_WINDOW = 60;
const MIN_TRAIN_DAYS = 20;
const WET_MM = 1;
/** Experimental: the weighted blend minus its recent bias for that 3-hour block of the day (a simple MOS-style diurnal correction). */
const DIURNAL = "weighted_bias_diurnal";
const ROWS = [...STRATEGIES, DIURNAL, ...MODELS];
const DAY = 86_400_000;
const season = (day) => ["DJF", "DJF", "MAM", "MAM", "MAM", "JJA", "JJA", "JJA", "SON", "SON", "SON", "DJF"][Number(day.slice(5, 7)) - 1];
const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);

/** Hourly forecasts from the archive: get(variable, lead, model) -> Map(hourKey -> value). */
async function forecasts(point, variables) {
  const body = await cachedJson(previousRunsUrl(point, variables));
  const h = body.hourly;
  return (variable, lead, model) => {
    const values = h[`${variable}_previous_day${lead}_${model}`] ?? [];
    return new Map(h.time.map((t, i) => [t, values[i]]).filter(([, v]) => typeof v === "number"));
  };
}

function blankRows() { return Object.fromEntries(ROWS.map((r) => [r, { n: 0, sumAbs: 0, sum: 0 }])); }
function add(rows, row, error) { const r = rows[row]; r.n++; r.sumAbs += Math.abs(error); r.sum += error; }

/**
 * Scores every strategy on the same samples. `samples` maps a day to a list of { forecasts, current, observed }.
 * Training uses each model's own errors on the days before the scored day.
 */
function evaluate(samplesByDay, { lead, floorZero = false, wet = false, strictCutoff = true } = {}) {
  const days = [...samplesByDay.keys()].sort();
  const perDay = new Map(days.map((d) => {
    const errors = {};
    const bins = Array.from({ length: 8 }, () => ({}));
    for (const s of samplesByDay.get(d)) {
      for (const m of MODELS) if (typeof s.forecasts[m] === "number") {
        errors[m] = addError(errors[m], s.forecasts[m] - s.observed);
        if (s.bin != null) bins[s.bin][m] = addError(bins[s.bin][m], s.forecasts[m] - s.observed);
      }
      if (typeof s.current === "number") errors.best_match = addError(errors.best_match, s.current - s.observed);
    }
    errors.bins = bins;
    return [d, errors];
  }));
  // A forecast for day D at lead L is issued on day D-L, when observations are known only up to D-L-1.
  const gapDays = strictCutoff ? lead : 0;
  // The models blended at this lead (the live forecast adds AIFS from day 3); raw-model rows still cover every model.
  const blend = blendModels(lead);
  const out = {};
  for (const window of WINDOWS) {
    const total = blankRows();
    const seasons = { DJF: blankRows(), MAM: blankRows(), JJA: blankRows(), SON: blankRows() };
    const wetHits = Object.fromEntries(ROWS.map((r) => [r, 0]));
    const weightSums = Object.fromEntries(MODELS.map((m) => [m, 0]));
    const picks = Object.fromEntries(MODELS.map((m) => [m, 0]));
    let fitted = 0;
    for (const d of days) {
      if (d < PERIOD.evalStart) continue;
      const latest = dayMs(d) - gapDays * DAY;
      const trainDays = days.filter((x) => dayMs(x) < latest && latest - dayMs(x) <= window * DAY);
      const train = trainDays.map((x) => perDay.get(x));
      const minDays = Math.min(MIN_TRAIN_DAYS, Math.floor(window / 2));
      const f = fit(train, blend, minDays);
      const currentBias = meanBias(train.map((e) => e.best_match), minDays);
      // Diurnal blend bias per 3-hour block: Σ w·(model mean error in that block).
      const binBias = f ? Array.from({ length: 8 }, (_, b) => {
        let total = 0; let weight = 0;
        for (const m of blend) {
          if (f.weights[m] == null) continue;
          let n = 0; let sum = 0;
          for (const e of train) { const x = e.bins?.[b]?.[m]; if (x) { n += x.n; sum += x.sum; } }
          if (n) { total += f.weights[m] * (sum / n); weight += f.weights[m]; }
        }
        return weight ? total / weight : f.blendBias;
      }) : null;
      if (f) {
        fitted++;
        for (const m of MODELS) weightSums[m] += f.weights[m] ?? 0;
        picks[f.ranking[0]]++;
      }
      for (const s of samplesByDay.get(d)) {
        if (typeof s.current !== "number" || MODELS.some((m) => typeof s.forecasts[m] !== "number")) continue;
        for (const row of ROWS) {
          const value = MODELS.includes(row) ? s.forecasts[row]
            : row === DIURNAL ? (floorZero || !f || s.bin == null ? apply("weighted_bias", f, s.forecasts, s.current, blend, floorZero) : apply("weighted", f, s.forecasts, s.current, blend) - binBias[s.bin])
            : apply(row, f, s.forecasts, s.current, blend, floorZero, currentBias);
          if (value == null) continue;
          add(total, row, value - s.observed);
          add(seasons[season(d)], row, value - s.observed);
          if (wet && (value >= WET_MM) === (s.observed >= WET_MM)) wetHits[row]++;
        }
      }
    }
    const summarise = (rows) => ({ n: rows.current.n, mae: Object.fromEntries(ROWS.map((r) => [r, rows[r].n ? rows[r].sumAbs / rows[r].n : null])), bias: Object.fromEntries(ROWS.map((r) => [r, rows[r].n ? rows[r].sum / rows[r].n : null])) });
    out[window] = {
      ...summarise(total),
      seasons: Object.fromEntries(Object.entries(seasons).map(([k, v]) => [k, summarise(v)])),
      ...(wet ? { wet_day_accuracy: Object.fromEntries(ROWS.map((r) => [r, total[r].n ? wetHits[r] / total[r].n : null])) } : {}),
      mean_weights: Object.fromEntries(MODELS.map((m) => [m, fitted ? weightSums[m] / fitted : null])),
      best_recent_picks: picks,
    };
  }
  return out;
}

function hourlySamples(get, variable, lead, obs) {
  const byModel = Object.fromEntries(MODELS.map((m) => [m, get(variable, lead, m)]));
  const current = get(variable, lead, "best_match");
  const samples = new Map();
  for (const [hour, observed] of obs) {
    const day = hour.slice(0, 10);
    if (day < PERIOD.trainStart || day > PERIOD.end) continue;
    const forecastsAtHour = Object.fromEntries(MODELS.map((m) => [m, byModel[m].get(hour)]));
    if (MODELS.every((m) => forecastsAtHour[m] == null)) continue;
    if (!samples.has(day)) samples.set(day, []);
    samples.get(day).push({ forecasts: forecastsAtHour, current: current.get(hour), observed, bin: Math.floor(Number(hour.slice(11, 13)) / 3) });
  }
  return samples;
}

function dailyRainSamples(get, lead, observedDays) {
  const totals = (model) => {
    const sums = new Map();
    for (const [hour, v] of get("precipitation", lead, model)) {
      const day = new Date(Date.parse(`${hour}:00Z`) - 1).toISOString().slice(0, 10);
      const s = sums.get(day) ?? { total: 0, count: 0 };
      s.total += v; s.count++;
      sums.set(day, s);
    }
    return new Map([...sums].filter(([, s]) => s.count === 24).map(([d, s]) => [d, s.total]));
  };
  const byModel = Object.fromEntries(MODELS.map((m) => [m, totals(m)]));
  const current = totals("best_match");
  const samples = new Map();
  for (const [day, observed] of observedDays) {
    if (day < PERIOD.trainStart || day > PERIOD.end) continue;
    samples.set(day, [{ forecasts: Object.fromEntries(MODELS.map((m) => [m, byModel[m].get(day)])), current: current.get(day), observed }]);
  }
  return samples;
}

async function main() {
  const sites = JSON.parse(readFileSync(join(CACHE, `sites-resolved${RESULTS_TAG}.json`), "utf8"));
  const results = [];
  for (const site of sites) {
    const entry = { name: site.name, nation: site.nation ?? "England", area: site.area, latitude: site.latitude, longitude: site.longitude, elevation_m: site.elevation_m, references: {}, scores: {} };
    const t = site.temperature_ref;
    if (t) {
      const get = await forecasts(t, t.id === site.wind_ref?.id ? ["temperature_2m", "wind_speed_10m"] : ["temperature_2m"]);
      const obs = await temperatureObs(t);
      entry.references.temperature = { id: t.id, name: t.name, network: t.network, distance_km: t.distance_km, elevation_m: t.elevation_m, hours: obs.size };
      entry.scores.temperature = Object.fromEntries(LEADS.map((l) => [l, evaluate(hourlySamples(get, "temperature_2m", l, obs), { lead: l })]));
      entry.leak_check = Object.fromEntries(LEADS.map((l) => [l, evaluate(hourlySamples(get, "temperature_2m", l, obs), { lead: l, strictCutoff: false })[PRIMARY_WINDOW].mae.weighted_bias]));
    }
    const w = site.wind_ref;
    if (w) {
      const get = await forecasts(w, w.id === t?.id ? ["temperature_2m", "wind_speed_10m"] : ["wind_speed_10m"]);
      const obs = await windObs(w);
      entry.references.wind = { id: w.id, name: w.name, network: w.network, distance_km: w.distance_km, elevation_m: w.elevation_m, hours: obs.size };
      entry.scores.wind = Object.fromEntries(LEADS.map((l) => [l, evaluate(hourlySamples(get, "wind_speed_10m", l, obs), { lead: l })]));
    }
    const r = site.rain_ref;
    if (r) {
      const get = await forecasts(r, ["precipitation"]);
      const days = await rainDays(r);
      entry.references.rain = { id: r.id, name: r.name, network: r.network, distance_km: r.distance_km, days: days.size };
      entry.scores.rain = Object.fromEntries(LEADS.map((l) => [l, evaluate(dailyRainSamples(get, l, days), { lead: l, floorZero: true, wet: true })]));
    }
    results.push(entry);
    const t1 = entry.scores.temperature?.[1]?.[PRIMARY_WINDOW];
    console.log(`${site.name.padEnd(19)} T1 current ${t1?.mae.current?.toFixed(2)} learned ${t1?.mae.weighted_bias?.toFixed(2)} | refs ${Object.values(entry.references).map((r) => r.name).join(", ")}`);
  }
  writeFileSync(join(CACHE, `results${RESULTS_TAG}.json`), JSON.stringify({ period: PERIOD, leads: LEADS, windows: WINDOWS, primary_window: PRIMARY_WINDOW, models: MODELS, generated_at: new Date().toISOString(), sites: results }, null, 1));
  console.log(`wrote results${RESULTS_TAG}.json`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(error); process.exit(1); });
