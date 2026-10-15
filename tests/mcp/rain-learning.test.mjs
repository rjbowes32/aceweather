import assert from "node:assert/strict";
import test from "node:test";
import { citizenRainOk, citizenTemperatureOk } from "../../src/mcp/citizen-qc.ts";
import { chooseRainReference, chooseReference, emptyState, exportFits } from "../../src/mcp/learning-store.ts";
import { forecastDayTotals, learnedRain, rainErrorDays, rainFitAsOf, rainLeadsEnabled, scoreRainDay, updateRainDays } from "../../src/mcp/rain-learning.ts";

const HOUR = 3600_000;
const MODELS = ["a", "b"];
const modelsFor = () => MODELS;
const FACTOR = { a: 1.5, b: 1.3, best_match: 1.6 };
const truthDay = (day) => 2 + 3 * (Number(day.slice(8, 10)) % 4);

/** Hourly archived rain for `days` days: each model forecasts its factor times the truth, spread evenly over the day. */
function forecasts(startDay, days, factor = FACTOR) {
  const start = Date.parse(`${startDay}T00:00:00Z`);
  const time = Array.from({ length: days * 24 }, (_, i) => new Date(start + (i + 1) * HOUR).toISOString().slice(0, 16));
  return { time, series: (variable, lead, model) => time.map((t) => (factor[model] * truthDay(new Date(Date.parse(`${t}:00Z`) - 1).toISOString().slice(0, 10))) / 24) };
}
const observedDays = (startDay, days, f = truthDay) => new Map(Array.from({ length: days }, (_, i) => {
  const day = new Date(Date.parse(`${startDay}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
  return [day, f(day)];
}));
const gauge = (id, latitude, network = "ea_rain") => ({ meta: { id, name: id, network, latitude, longitude: -1, elevation_m: null }, days: {} });
function learnRain(st, obs = observedDays("2026-07-01", 45), f = forecasts("2026-07-01", 45)) {
  updateRainDays(st, obs, rainErrorDays(f, obs, [1, 3], modelsFor));
  return st;
}

test("forecast day totals use the hour ending at each timestamp and need all 24 hours", () => {
  const time = Array.from({ length: 30 }, (_, i) => new Date(Date.parse("2026-08-01T01:00:00Z") + i * HOUR).toISOString().slice(0, 16));
  const totals = forecastDayTotals(time, time.map(() => 0.5));
  assert.deepEqual([...totals], [["2026-08-01", 12]], "01:00 to 24:00 is 1 August; the partial 2 August is dropped");
});

test("a gauge's daily errors are stored per lead and model, and the pooled scale removes the models' over-forecast", () => {
  const st = learnRain(gauge("G1", 54));
  const rec = st.days["2026-07-10"];
  assert.equal(rec.ro, truthDay("2026-07-10"));
  assert.ok(Math.abs(rec.r["1"].a - 0.5 * rec.ro) < 1e-3 && Math.abs(rec.r["3"].best_match - 0.6 * rec.ro) < 1e-3);
  const neighbour = learnRain(gauge("G2", 54.1));
  const fit = rainFitAsOf([st, neighbour], 1, "2026-08-10", 60, MODELS, 20);
  assert.equal(fit.gauges, 2);
  assert.ok(Math.abs(fit.scale - 1 / 1.4) < 1e-3, "observed over the mean of 1.5 and 1.3 times the truth");
  assert.equal(rainFitAsOf([st], 1, "2026-07-15", 60, MODELS, 20), null, "too few days before the cutoff");
  assert.ok(Math.abs(learnedRain(fit, [3, 2.6]) - 2) < 0.01);
  assert.equal(learnedRain(fit, [3, null]), null, "one model is not a blend");
});

test("scoring uses only days before the issue date and compares with the standard forecast and the plain mean", () => {
  const st = learnRain(gauge("G1", 54));
  const s = scoreRainDay(st, [st], "2026-08-12", [1, 3], modelsFor, 60, 20);
  const o = truthDay("2026-08-12");
  assert.equal(s["1"][0], 1);
  assert.ok(s["1"][1] < 0.01, "the scaled mean matches the gauge");
  assert.ok(Math.abs(s["1"][2] - 0.6 * o) < 1e-3 && Math.abs(s["1"][3] - 0.4 * o) < 1e-3);
  assert.deepEqual(scoreRainDay(st, [st], "2026-07-22", [3], modelsFor, 60, 20), {}, "a 3-day forecast for 22 July had 18 days of history");
});

test("learned rainfall is switched on only for leads where it clearly beat the mean on enough gauge-days", () => {
  const leads = rainLeadsEnabled({
    1: { days: 1500, learned_mae: 1.30, mean_mae: 1.40 },
    2: { days: 1500, learned_mae: 1.39, mean_mae: 1.40 },
    3: { days: 400, learned_mae: 1.0, mean_mae: 1.40 },
  });
  assert.deepEqual([...leads], [1]);
  assert.equal(rainLeadsEnabled(undefined).size, 0);
});

test("the fits file pools nearby gauges, skips a blocked citizen gauge and scores official gauges only", () => {
  const state = emptyState();
  const near = learnRain(gauge("G1", 54));
  const neighbour = learnRain(gauge("G2", 54.1));
  const far = learnRain(gauge("G3", 55));
  const blocked = learnRain(gauge("netatmo:x", 54.05, "netatmo"), observedDays("2026-07-01", 45, () => 0));
  for (const st of [near, neighbour, far, blocked]) {
    st.days["2026-08-13"].score = { 1: { r: [1, 0.1, 1.2, 0.8] } };
    state.stations[st.meta.id] = st;
  }
  assert.equal(citizenRainOk(blocked, "2026-08-15", 60), false);
  const fits = exportFits(state, "2026-08-15", [1, 3], modelsFor, 60, 20, 3, "2026-08-15T06:00:00Z");
  const byId = Object.fromEntries(fits.stations.map((s) => [s.meta.id, s]));
  assert.equal(byId.G1.leads["1"].r.gauges, 2, "the blocked citizen gauge is not pooled");
  assert.equal(byId.G3.leads["1"].r.gauges, 1);
  assert.equal(byId["netatmo:x"], undefined);
  assert.deepEqual(fits.recent_scores.rainfall["1"], { days: 3, learned_mae: 0.1, standard_mae: 1.2, mean_mae: 0.8, stations: 3 });
  assert.equal(chooseRainReference(fits, { latitude: 54.02, longitude: -1 }, 25).station.meta.id, "G1");
  assert.equal(chooseRainReference(fits, { latitude: 52, longitude: -1 }, 25), null);
});

test("a citizen thermometer is used only where it looks like an official one, and only where no official station is close", () => {
  const scored = (mae) => {
    const st = { meta: { id: "netatmo:t", name: "Citizen", network: "netatmo", latitude: 54, longitude: -1, elevation_m: 100 }, days: {} };
    for (let d = 1; d <= 12; d++) st.days[`2026-08-${String(d).padStart(2, "0")}`] = { score: { 1: { t: [24, 24 * mae, 30] } } };
    return st;
  };
  assert.equal(citizenTemperatureOk(scored(0.9), 0.4, 0.8, "2026-08-15"), true);
  assert.equal(citizenTemperatureOk(scored(1.2), 0.4, 0.8, "2026-08-15"), false, "error 1.5 times the official median");
  assert.equal(citizenTemperatureOk(scored(0.9), 3.1, 0.8, "2026-08-15"), false, "a 3 °C bias points at the siting");

  const lf = { t: { weights: { a: 0.5, b: 0.5 }, bias: 0.3, days: 40 } };
  const fits = { stations: [
    { meta: { id: "metoffice", name: "Official", network: "metoffice", latitude: 54.5, longitude: -1, elevation_m: 100 }, leads: { 1: lf } },
    { meta: { id: "netatmo:t", name: "Citizen", network: "netatmo", latitude: 54.02, longitude: -1, elevation_m: 120 }, leads: { 1: lf } },
  ] };
  const search = { radiusKm: 80, maxHeightDiffM: 250, minDays: 20, citizen: { radiusKm: 15, maxHeightDiffM: 100, officialKm: 40, officialHeightM: 150 } };
  assert.equal(chooseReference(fits, { latitude: 54, longitude: -1, elevation_m: 100 }, search).station.meta.id, "netatmo:t", "the official station is 56 km away");
  assert.equal(chooseReference(fits, { latitude: 54.3, longitude: -1, elevation_m: 100 }, search).station.meta.id, "metoffice", "22 km from the official station");
  assert.equal(chooseReference(fits, { latitude: 54, longitude: -1, elevation_m: 100 }, { ...search, citizen: undefined }).station.meta.id, "metoffice");
});
