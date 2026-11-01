import assert from "node:assert/strict";
import test from "node:test";
import { pickWeatherIcon as p, grassOffset } from "../src/lib/aceweather/weather-icons.ts";

test("priority: thunder beats snow and rain", () => {
  assert.equal(p({ code: 95, precipMm: 5, tempC: 0 }).key, "storm");
  assert.equal(p({ code: 99 }).key, "storm");
});
test("snow from code or from rain at 1 °C or colder", () => {
  assert.equal(p({ code: 73, precipMm: 0.5 }).key, "snow");
  assert.equal(p({ code: 63, precipMm: 0.5, tempC: 1 }).key, "snow");
  assert.equal(p({ code: 63, precipMm: 0.5, tempC: 1.1 }).key, "rain");
  assert.equal(p({ code: 3, precipMm: 0.05, tempC: -2 }).key, "cloud");
});
test("rain vs drizzle uses RAIN_FAST_MM 0.2 and RAIN_ON_CANOPY_MM 0.1", () => {
  assert.equal(p({ code: 61, precipMm: 0.2 }).key, "rain");
  assert.equal(p({ code: 61, precipMm: 0.15 }).key, "drizzle");
  assert.equal(p({ code: 2, precipMm: 0.1 }).key, "drizzle");
  assert.equal(p({ code: 53 }).key, "drizzle");
  assert.equal(p({ code: 81 }).label, "Rain showers");
});
test("no rain icon under 0.1 mm", () => {
  assert.equal(p({ code: 61, precipMm: 0.09 }).key, "partly");
  assert.equal(p({ code: 51, precipMm: 0, isDay: 0 }).key, "partly");
  assert.equal(p({ code: 71, precipMm: 0 }).key, "partly");
});
test("fog, overcast, partly, clear, night, missing code", () => {
  assert.equal(p({ code: 45 }).key, "fog");
  assert.equal(p({ code: 45, precipMm: 0.3 }).key, "rain");
  assert.equal(p({ code: 3 }).key, "cloud");
  assert.equal(p({ code: 2 }).key, "partly");
  assert.equal(p({ code: 1 }).key, "clear");
  assert.equal(p({ code: 0, isDay: 0 }).key, "night");
  assert.equal(p({}).key, "partly");
  assert.equal(p({ code: null }).key, "partly");
});
test("frost badge from grass minimum", () => {
  assert.equal(p({ code: 0, grassMinC: 0 }).frost, "frost");
  assert.equal(p({ code: 0, grassMinC: 2 }).frost, "risk");
  assert.equal(p({ code: 0, grassMinC: 2.1 }).frost, null);
  assert.equal(p({ code: 0 }).frost, null);
});
test("gust badge at 25 km/h", () => {
  assert.equal(p({ code: 61, precipMm: 1, gustKmh: 25 }).gust, true);
  assert.equal(p({ code: 61, precipMm: 1, gustKmh: 24.9 }).gust, false);
  assert.equal(p({ code: 61, precipMm: 1, gustKmh: 30 }).key, "rain");
});
test("grass offset", () => {
  assert.equal(grassOffset(20, 5), 3.5);
  assert.equal(grassOffset(60, 20), 2);
  assert.equal(grassOffset(90, 5), 1);
});
