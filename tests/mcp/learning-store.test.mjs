import assert from "node:assert/strict";
import test from "node:test";
import { chooseReference, emptyState, errorDays, exportFits, fitAsOf, prune, scoreDay, updateDays } from "../../src/mcp/learning-store.ts";

const MODELS = ["a", "b"];
const modelsFor = () => MODELS;
const HOUR = 3600_000;
const truth = (ms) => 10 + 5 * Math.sin((2 * Math.PI * ms) / (24 * HOUR));
const BIAS = { a: 0.5, b: 2.0, best_match: 1.0 };

/** Hourly archived forecasts for `days` days ending today: each model is the truth plus its bias, at every lead. */
function forecasts(startDay, days) {
  const start = Date.parse(`${startDay}T00:00:00Z`);
  const time = Array.from({ length: days * 24 }, (_, i) => new Date(start + i * HOUR).toISOString().slice(0, 16));
  return { time, series: (variable, lead, model) => time.map((t) => truth(Date.parse(`${t}:00Z`)) + BIAS[model] + (variable === "wind_speed_10m" ? 3 : 0)) };
}
const observed = (f) => new Map(f.time.map((t) => [t, truth(Date.parse(`${t}:00Z`))]));
const station = () => ({ meta: { id: "S1", name: "Test", network: "metoffice", latitude: 54, longitude: -1, elevation_m: 50 }, days: {} });

test("error days are recorded per day, lead and model, and incomplete days are skipped", () => {
  const f = forecasts("2026-08-01", 3);
  const obs = observed(f);
  for (const t of f.time.filter((t) => t.startsWith("2026-08-03") && Number(t.slice(11, 13)) >= 6)) obs.delete(t);
  const days = errorDays(f, "temperature_2m", obs, [1, 3], modelsFor);
  assert.deepEqual([...days.keys()], ["2026-08-01", "2026-08-02", "2026-08-03"]);
  const e = days.get("2026-08-01")["1"].b;
  assert.equal(e[0], 24);
  assert.ok(Math.abs(e[3] / e[0] - 2) < 1e-6, "mean error is the model bias");
  const st = station();
  assert.equal(updateDays(st, "temperature_2m", days), 2, "a day with 6 matched hours is not stored");
  assert.ok(st.days["2026-08-02"].t["3"].a);
});

test("fits weight the accurate model and recover the blend bias; pruning drops old days", () => {
  const f = forecasts("2026-07-01", 40);
  const st = station();
  updateDays(st, "temperature_2m", errorDays(f, "temperature_2m", observed(f), [1], modelsFor));
  const fit = fitAsOf(st, "temperature_2m", 1, "2026-08-10", 60, MODELS, 20);
  assert.ok(fit.weights.a > fit.weights.b * 10, "MSE 0.25 vs 4 gives a 16:1 weight");
  assert.ok(Math.abs(fit.blendBias - (fit.weights.a * 0.5 + fit.weights.b * 2)) < 1e-6);
  assert.equal(fitAsOf(st, "temperature_2m", 1, "2026-07-10", 60, MODELS, 20), null, "too few days before the cutoff");
  prune(st, "2026-08-15", 30);
  assert.equal(Object.keys(st.days).sort()[0], "2026-07-16");
});

test("scoring uses only days before the issue date and beats a biased standard forecast", () => {
  const f = forecasts("2026-07-01", 45);
  const obs = observed(f);
  const st = station();
  updateDays(st, "temperature_2m", errorDays(f, "temperature_2m", obs, [1, 3], modelsFor));
  const score = scoreDay(st, "temperature_2m", "2026-08-14", f, obs, [1, 3], modelsFor, 60, 20, true);
  assert.equal(score["1"][0], 24);
  assert.ok(score["1"][1] / 24 < 0.01, "bias-corrected blend matches the truth");
  assert.ok(Math.abs(score["1"][2] / 24 - 1) < 1e-6, "standard forecast is off by its 1 °C bias");
  const early = scoreDay(st, "temperature_2m", "2026-07-22", f, obs, [3], modelsFor, 60, 20, true);
  assert.deepEqual(early, {}, "on 22 July a 3-day forecast was issued on the 19th, with only 18 days of history");
});

test("the fits file carries per-lead weights, pooled recent scores, and a nearest-representative station", () => {
  const f = forecasts("2026-07-01", 45);
  const obs = observed(f);
  const state = emptyState();
  const near = station();
  const high = { meta: { ...station().meta, id: "S2", latitude: 54.01, elevation_m: 500 }, days: {} };
  for (const st of [near, high]) {
    updateDays(st, "temperature_2m", errorDays(f, "temperature_2m", obs, [1, 2], modelsFor));
    updateDays(st, "wind_speed_10m", errorDays(f, "wind_speed_10m", obs, [1, 2], modelsFor));
    st.days["2026-08-13"].score = { 1: { t: [24, 2.4, 24] } };
    state.stations[st.meta.id] = st;
  }
  const fits = exportFits(state, "2026-08-15", [1, 2], modelsFor, 60, 20, 3, "2026-08-15T06:00:00Z");
  assert.equal(fits.stations.length, 2);
  const lead1 = fits.stations[0].leads["1"];
  assert.ok(lead1.t.weights.a > 0.9 && lead1.w.bias > 2);
  assert.equal(fits.recent_scores.temperature["1"].stations, 2);
  assert.equal(fits.recent_scores.temperature["1"].learned_mae, 0.1);
  const pick = chooseReference(fits, { latitude: 54.02, longitude: -1, elevation_m: 60 }, { radiusKm: 80, maxHeightDiffM: 250, minDays: 20 });
  assert.equal(pick.station.meta.id, "S1", "the 500 m station is excluded by the height limit");
  assert.equal(chooseReference(fits, { latitude: 51, longitude: -1, elevation_m: 60 }, { radiusKm: 80, maxHeightDiffM: 250, minDays: 20 }), null);
});

test("a model seen for only an hour a day cannot count it as a training day", () => {
  const st = station();
  const days = new Map([["2026-08-01", { 1: { a: [1, 0, 0, 0], b: [24, 24, 24, 24] } }]]);
  updateDays(st, "temperature_2m", days);
  assert.deepEqual(Object.keys(st.days["2026-08-01"].t["1"]), ["b"]);
  updateDays(st, "temperature_2m", new Map([["2026-08-02", { 1: { a: [1, 0, 0, 0] } }]]));
  assert.equal(st.days["2026-08-02"], undefined, "a day with no well-covered model is not stored");
});

test("fits carry per-model biases, stale stations are not exported, and wind can come from another station", () => {
  const f = forecasts("2026-07-01", 45);
  const obs = observed(f);
  const state = emptyState();
  const fresh = station();
  const silent = { meta: { ...station().meta, id: "S2" }, days: {} };
  for (const st of [fresh, silent]) { updateDays(st, "temperature_2m", errorDays(f, "temperature_2m", obs, [1], modelsFor)); state.stations[st.meta.id] = st; }
  for (const day of Object.keys(silent.days)) if (day > "2026-08-01") delete silent.days[day];
  const fits = exportFits(state, "2026-08-15", [1], modelsFor, 60, 20, 3, "2026-08-15T06:00:00Z");
  assert.deepEqual(fits.stations.map((s) => s.meta.id), ["S1"], "S2 has had no data for 14 days");
  assert.ok(Math.abs(fits.stations[0].leads["1"].t.model_bias.b - 2) < 1e-3);

  const lf = { weights: { a: 1 }, bias: 0, days: 40 };
  const wind = { stations: [
    { meta: { ...station().meta, id: "thermometer", latitude: 54.01 }, leads: { 1: { t: lf } } },
    { meta: { ...station().meta, id: "anemometer", latitude: 54.2 }, leads: { 1: { t: lf, w: lf } } },
  ] };
  const at = { latitude: 54, longitude: -1, elevation_m: 50 };
  const search = { radiusKm: 80, maxHeightDiffM: 250, minDays: 20 };
  assert.equal(chooseReference(wind, at, search).station.meta.id, "thermometer");
  assert.equal(chooseReference(wind, at, search, "w").station.meta.id, "anemometer");
});
