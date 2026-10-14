import assert from "node:assert/strict";
import test from "node:test";
import { installFetch } from "./fixtures.mjs";
import { applyLearned } from "../../src/lib/aceweather/learned.ts";
import { GET } from "../../src/app/learned-forecast/route.ts";

const hours = (day, n = 24) => Array.from({ length: n }, (_, h) => `${day}T${String(h).padStart(2, "0")}:00`);
function forecast() {
  const time = [...hours("2026-10-14"), ...hours("2026-10-15"), ...hours("2026-10-16")];
  return {
    current: { temperature_2m: 12 },
    hourly: {
      time, temperature_2m: time.map(() => 10), apparent_temperature: time.map(() => 8), wind_speed_10m: time.map(() => 20),
      wind_gusts_10m: time.map(() => 25), precipitation: time.map(() => 0.5), relative_humidity_2m: time.map(() => 80),
    },
    daily: {
      time: ["2026-10-14", "2026-10-15", "2026-10-16"], temperature_2m_max: [10, 10, 10], temperature_2m_min: [10, 10, 10],
      precipitation_sum: [12, 12, 12], wind_speed_10m_max: [20, 20, 20], weather_code: [3, 3, 3],
    },
  };
}
const overlay = (applied, hourly) => ({ learning_source: "daily", fits_generated_at: "2026-10-14T05:30:00Z", applied, reference: { name: "Keswick", network: "metoffice", distance_km: 2.1 }, timezone: "Europe/London", hourly });

test("learned hours replace temperature, wind and rain, and their days are re-aggregated", () => {
  const raw = forecast();
  const learnedHours = hours("2026-10-15").map((time, h) => ({ time, temperature_c: 9 + h / 4, wind_speed_kmh: h === 12 ? 30 : 15, precipitation_mm: h === 6 ? 4 : 0 }));
  const { forecast: out, meta } = applyLearned(raw, overlay({ temperature: true, wind_speed: true, rainfall: true, bias_correction: true }, [...learnedHours, { time: "2026-11-01T00:00", temperature_c: 1, wind_speed_kmh: 1, precipitation_mm: 1 }]));
  assert.equal(meta.hours, 24, "hours outside the forecast are ignored");
  assert.deepEqual([meta.station, meta.distanceKm, meta.source], ["Keswick", 2.1, "daily"]);
  const i = out.hourly.time.indexOf("2026-10-15T12:00");
  assert.equal(out.hourly.temperature_2m[i], 12);
  assert.equal(out.hourly.apparent_temperature[i], 10, "feels-like moves by the same +2 °C");
  assert.equal(out.hourly.wind_gusts_10m[i], 30, "gust raised to at least the learned wind");
  assert.equal(out.hourly.relative_humidity_2m[i], 80, "other variables are untouched");
  assert.deepEqual(out.daily.temperature_2m_max, [10, 14.8, 10]);
  assert.deepEqual(out.daily.temperature_2m_min, [10, 9, 10]);
  assert.deepEqual(out.daily.precipitation_sum, [12, 4, 12]);
  assert.deepEqual(out.daily.wind_speed_10m_max, [20, 30, 20]);
  assert.equal(raw.hourly.temperature_2m[i], 10, "the original forecast is not mutated");
  assert.equal(out.current, raw.current, "current conditions are unchanged");
});

test("only the variables the server applied are overlaid; nothing applied means no change", () => {
  const raw = forecast();
  const h = hours("2026-10-15", 3).map((time) => ({ time, temperature_c: 5, wind_speed_kmh: 5, precipitation_mm: 9 }));
  const rainOnly = applyLearned(raw, overlay({ temperature: false, wind_speed: false, rainfall: true, bias_correction: false }, h));
  const i = raw.hourly.time.indexOf("2026-10-15T01:00");
  assert.equal(rainOnly.forecast.hourly.temperature_2m[i], 10);
  assert.equal(rainOnly.forecast.hourly.precipitation[i], 9);
  assert.equal(rainOnly.meta.temperature, false);
  const none = applyLearned(raw, overlay({ temperature: false, wind_speed: false, rainfall: false, bias_correction: false }, h));
  assert.equal(none.forecast, raw);
  assert.equal(none.meta, null);
  assert.equal(applyLearned(raw, null).forecast, raw);
});

test("the endpoint returns local-time learned hours and rejects bad input", async () => {
  installFetch();
  const ok = await GET(new Request("http://localhost/learned-forecast?lat=53.93&lon=-0.78&tz=Europe/London"));
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("cache-control"), /s-maxage=900/);
  const body = await ok.json();
  assert.equal(body.learning_source, "on_demand");
  assert.equal(body.applied.temperature, true);
  assert.ok(body.reference.name);
  assert.ok(body.hourly.length >= 24 * 6);
  assert.match(body.hourly[0].time, /^\d{4}-\d{2}-\d{2}T\d{2}:00$/);
  const bad = await GET(new Request("http://localhost/learned-forecast?lat=abc"));
  assert.equal(bad.status, 400);
});
