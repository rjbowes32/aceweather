import assert from "node:assert/strict";
import test from "node:test";
import { archiveFixture, callTool, installFetch } from "./fixtures.mjs";
import { handleMcpRequest } from "../../src/mcp/http.ts";
const json = (body, status = 200) => Response.json(body, { status });
const call = (name, args) => callTool(handleMcpRequest, name, args);

function yearlyFixtures(change = () => {}) {
  return { overrides: [[(u) => u.host === "archive-api.open-meteo.com", (u) => {
    const count = u.searchParams.get("latitude").split(",").length;
    const year = Number(u.searchParams.get("start_date").slice(0, 4));
    const fixtures = Array.from({ length: count }, (_, i) => {
      const f = archiveFixture(u.searchParams);
      const n = f.daily.time.length;
      f.daily.rain_sum = Array(n).fill(year === 2026 ? 2 + i : 1 + i);
      f.daily.temperature_2m_max = Array(n).fill(year === 2026 ? 20 + i : 18 + i);
      f.daily.temperature_2m_min = Array(n).fill(year === 2026 ? 8 + i : 6 + i);
      f.daily.temperature_2m_mean = Array(n).fill(year === 2026 ? 14 + i : 12 + i);
      f.daily.soil_temperature_0_to_7cm_mean = Array(n).fill(year === 2026 ? 15 + i : 13 + i);
      change(f, year, i);
      return f;
    });
    return json(count === 1 ? fixtures[0] : fixtures);
  }]] };
}

test("Crop Notes uses exact report dates, all seven saved locations and ten prior years with ERA5", async () => {
  const calls = installFetch(yearlyFixtures());
  const { result, data } = await call("get_crop_notes_weather", { report_date: "2026-10-09" });
  assert.equal(result.isError, undefined);
  assert.equal(data.period.start, "2026-09-25");
  assert.equal(data.period.end, "2026-10-08");
  assert.deepEqual(data.data.baseline_years, [2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016]);
  assert.equal(data.data.locations.length, 7);
  assert.equal(data.data.newsletter_rows.length, 40);
  assert.deepEqual(data.data.soil_depth_cm, [0, 7]);
  const rain = data.data.locations[0].comparison.rainfall_total_mm;
  assert.deepEqual(rain, { current: 28, baseline_mean: 14, baseline_years_available: 10, anomaly: 14, anomaly_percent: 100, comparable: true });
  assert.equal(data.data.regional.comparison.rainfall_total_mm.current, 70);
  assert.equal(data.data.regional.comparison.rainfall_total_mm.baseline_mean, 56);
  assert.equal(data.data.regional.comparison.air_temp_max_c.current, 26);
  assert.equal(data.data.regional.comparison.air_temp_min_c.current, 8);
  assert.equal(data.data.regional.comparison.air_temp_mean_c.current, 17);
  assert.equal(data.data.regional.comparison.soil_temp_mean_0_7cm_c.anomaly, 2);
  assert.equal(data.completeness.percent, 100);
  const archiveCalls = calls.filter((u) => u.host === "archive-api.open-meteo.com");
  assert.equal(archiveCalls.length, 11);
  assert.ok(archiveCalls.every((u) => u.searchParams.get("models") === "era5" && u.searchParams.get("latitude").split(",").length === 7));
});

test("missing current soil and rain are explicit; partial totals do not become full-period anomalies", async () => {
  installFetch(yearlyFixtures((f, year, i) => {
    if (year === 2026 && i === 0) {
      f.daily.rain_sum[13] = null;
      f.daily.soil_temperature_0_to_7cm_mean[12] = null;
    }
  }));
  const { data } = await call("get_crop_notes_weather", { report_date: "2026-10-09" });
  const first = data.data.locations[0];
  assert.equal(first.current.metrics.rainfall_total_mm.value, 26);
  assert.deepEqual(first.current.metrics.rainfall_total_mm.missing_dates, ["2026-10-08"]);
  assert.deepEqual(first.current.metrics.soil_temp_mean_0_7cm_c.missing_dates, ["2026-10-07"]);
  assert.equal(first.comparison.rainfall_total_mm.anomaly, null);
  assert.equal(first.comparison.soil_temp_mean_0_7cm_c.anomaly, null);
  assert.equal(first.comparison.air_temp_mean_c.anomaly, 2);
  assert.equal(data.data.regional.comparison.rainfall_total_mm.comparable, false);
  assert.ok(data.completeness.percent < 100);
});

test("incomplete baseline years are excluded and counted separately for each metric", async () => {
  installFetch(yearlyFixtures((f, year) => { if (year === 2020) f.daily.rain_sum[0] = null; }));
  const { data } = await call("get_historical_comparison", { saved_location: "cropdynamics/pocklington", report_date: "2026-10-09" });
  const comparison = data.data.locations[0].comparison;
  assert.equal(comparison.rainfall_total_mm.baseline_years_available, 9);
  assert.equal(comparison.rainfall_total_mm.baseline_mean, 14);
  assert.equal(comparison.rainfall_total_mm.anomaly, null);
  assert.equal(comparison.air_temp_mean_c.baseline_years_available, 10);
});

test("zero-rain baseline has a finite absolute anomaly and null percentage", async () => {
  installFetch(yearlyFixtures((f, year) => { if (year !== 2026) f.daily.rain_sum.fill(0); }));
  const { data } = await call("get_crop_notes_weather", { report_date: "2026-10-09" });
  const rain = data.data.locations[0].comparison.rainfall_total_mm;
  assert.equal(rain.anomaly, 28);
  assert.equal(rain.anomaly_percent, null);
});

test("failed periods remain in the report and all-upstream failure is a tool error", async () => {
  installFetch({ overrides: [[(u) => u.host === "archive-api.open-meteo.com" && u.searchParams.get("start_date").startsWith("2020"), () => json({ reason: "unavailable" }, 503)]] });
  const { data } = await call("get_crop_notes_weather", { report_date: "2026-10-09" });
  assert.equal(data.data.locations[0].baseline.find((p) => p.year === 2020).error.code, "upstream_unavailable");
  assert.equal(data.data.locations[0].comparison.rainfall_total_mm.baseline_years_available, 9);
  assert.equal(data.data.regional.comparison.rainfall_total_mm.anomaly, null);
  installFetch({ overrides: [[(u) => u.host === "archive-api.open-meteo.com", () => json({}, 503)]] });
  assert.equal((await call("get_crop_notes_weather", { report_date: "2026-10-09" })).result.isError, true);
});

test("invalid dates, future dates, oversized windows, mixed selectors and too-early baselines fail before archive requests", async () => {
  const cases = [
    { report_date: "2026-02-30" }, { report_date: "2099-10-09" }, { history_days: 32 },
    { start_date: "2026-09-25" }, { start_date: "2026-10-08", end_date: "2026-09-25" },
    { report_date: "2026-10-09", start_date: "2026-09-25", end_date: "2026-10-08" },
    { start_date: "1945-09-25", end_date: "1945-10-08" },
    { group: "cropdynamics", place: "Pocklington" },
  ];
  for (const args of cases) {
    const calls = installFetch();
    const { result } = await call("get_historical_comparison", { saved_location: "cropdynamics/pocklington", ...args });
    assert.equal(result.isError, true, JSON.stringify(args));
    assert.equal(calls.some((u) => u.host === "archive-api.open-meteo.com"), false);
  }
});


test("unequal leap-year window lengths are disclosed and excluded from anomalies", async () => {
  installFetch();
  const { data } = await call("get_historical_comparison", { saved_location: "cropdynamics/pocklington", start_date: "2024-02-28", end_date: "2024-03-01", baseline_years: 1 });
  assert.equal(data.data.locations[0].current.metrics.rainfall_total_mm.expected_days, 3);
  assert.equal(data.data.locations[0].baseline[0].metrics.rainfall_total_mm.expected_days, 2);
  assert.equal(data.data.locations[0].comparison.rainfall_total_mm.anomaly, null);
  assert.equal(data.data.locations[0].comparison.rainfall_total_mm.baseline_years_available, 0);
  assert.match(data.warnings.join(" "), /period lengths differ/);
});

test("repeated comparisons reuse archive requests, and upstream concurrency stays bounded", async () => {
  let active = 0;
  let peak = 0;
  const fixtures = yearlyFixtures();
  const handler = fixtures.overrides[0][1];
  fixtures.overrides[0][1] = async (u) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return handler(u);
  };
  const calls = installFetch(fixtures);
  await call("get_crop_notes_weather", { report_date: "2026-10-09" });
  assert.ok(peak <= 4);
  const count = calls.length;
  await call("get_crop_notes_weather", { report_date: "2026-10-09" });
  assert.equal(calls.length, count);
});
