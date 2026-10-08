import assert from "node:assert/strict";
import test from "node:test";
import { callTool, installFetch } from "./fixtures.mjs";
import { handleMcpRequest } from "../../src/mcp/http.ts";
import { localNow } from "../../src/mcp/dates.ts";

const call = (name, args) => callTool(handleMcpRequest, name, args);
const isArchive = (url) => url.host === "archive-api.open-meteo.com";

test("ambiguous place names are flagged with alternatives, never silently swapped", async () => {
  installFetch();
  const { data } = await call("get_current_weather", { place: "Alford" });
  assert.equal(data.location.name, "Alford, Scotland, United Kingdom");
  assert.equal(data.location.resolution.ambiguous, true);
  assert.equal(data.location.resolution.candidates.length, 3);
  assert.match(data.warnings[0], /2 other place\(s\) share the name/);
});

test("postcodes, regions, coordinates and saved locations resolve explicitly", async () => {
  installFetch();
  const postcode = await call("get_current_weather", { place: "YO42 2AB" });
  assert.equal(postcode.data.location.resolution.method, "geocoded");
  assert.ok(postcode.data.warnings.some((w) => /resolved to Pocklington/.test(w)));
  const region = await call("get_current_weather", { place: "East Anglia" });
  assert.ok(region.data.warnings.some((w) => /represented by a single point/.test(w)));
  const coords = await call("get_current_weather", { place: "53.93, -0.78" });
  assert.deepEqual([coords.data.location.resolution.method, coords.data.location.latitude], ["coordinates", 53.93]);
  assert.equal(coords.data.location.timezone, "Europe/London");
  const saved = await call("get_current_weather", { saved_location: "cropdynamics/sleaford" });
  assert.equal(saved.data.location.resolution.method, "saved_location");
  assert.equal(saved.data.location.latitude, 52.99826);
  const unknown = await call("get_current_weather", { place: "Nowhereville" });
  assert.equal(unknown.error.error.code, "not_found");
  const badSaved = await call("get_current_weather", { saved_location: "cropdynamics/darlington" });
  assert.equal(badSaved.error.error.code, "not_found");
});

test("search_locations returns candidates plus matching saved locations", async () => {
  installFetch();
  const { data } = await call("search_locations", { query: "Alford", limit: 2 });
  assert.equal(data.data.candidates.length, 2);
  assert.deepEqual(data.data.saved_locations.map((s) => s.id), ["cropdynamics/alford-east-lindsey"]);
  const coords = await call("search_locations", { query: "54.5,-1.4" });
  assert.equal(coords.data.data.candidates[0].source, "coordinates");
});

test("every result labels observations, model values, forecasts and calculations", async () => {
  installFetch();
  const expectations = [
    ["get_current_weather", { place: "Pocklington" }, "model_current"],
    ["get_weather_history", { place: "Pocklington", period: "last_7d" }, "reanalysis"],
    ["get_weather_history", { place: "Pocklington", period: "last_24h" }, "model_recent"],
    ["get_weather_digest", { place: "Pocklington", period: "today" }, "model_recent"],
    ["get_hourly_forecast", { place: "Pocklington", hours: 6 }, "forecast"],
    ["get_daily_forecast", { place: "Pocklington" }, "forecast"],
    ["get_extended_forecast", { place: "Pocklington" }, "forecast"],
    ["compare_forecast_models", { place: "Pocklington" }, "forecast"],
    ["get_forecast_confidence", { place: "Pocklington" }, "calculated"],
    ["get_location_weather", { place: "Pocklington" }, "mixed"],
    ["search_locations", { query: "Pocklington" }, "reference"],
  ];
  for (const [name, args, classification] of expectations) {
    const { data, error } = await call(name, args);
    assert.equal(error, null, `${name}: ${JSON.stringify(error)}`);
    assert.equal(data.classification, classification, name);
    assert.ok(data.sources.length, name);
    assert.ok(data.sources.every((s) => s.retrieved_at), name);
  }
  const overview = await call("get_location_weather", { place: "Pocklington" });
  assert.deepEqual(overview.data.sources.map((s) => s.classification), ["forecast", "reanalysis"]);
  assert.ok(overview.data.warnings.some((w) => /not measured by a station/.test(w)));
});

test("history reports totals, extremes, spells and units", async () => {
  installFetch();
  const { data } = await call("get_weather_history", { place: "Pocklington", period: "last_14d", wind_unit: "mph", detail: "full" });
  assert.equal(data.data.granularity, "day");
  assert.equal(data.data.rows.length, 14);
  assert.equal(data.data.summary.precipitation_total_mm, 14);
  assert.equal(data.data.summary.rain_days, 7);
  assert.equal(data.data.summary.air_frost_days, 4);
  assert.equal(data.data.summary.longest_dry_spell_days, 1);
  assert.equal(data.data.summary.wind_gust_max.value, 32.9);
  assert.equal(data.units.wind_speed, "mph");
  assert.equal(data.data.rows[0].sunshine_h, 5);
  assert.equal(data.completeness.percent, 100);
  assert.equal(data.period.end, new Date(Date.parse(`${localNow("Europe/London").day}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
});

test("long periods are aggregated by month", async () => {
  installFetch();
  const { data } = await call("get_weather_history", { place: "Pocklington", period: "calendar_year", year: 2024 });
  assert.equal(data.data.granularity, "month");
  assert.equal(data.data.rows.length, 12);
  assert.equal(data.data.rows[1].days_with_data, 29);
  assert.ok(data.warnings.some((w) => /aggregated by month/.test(w)));
});

test("missing archive days are reported and never counted as zero rain", async () => {
  const today = localNow("Europe/London").day;
  const back = (n) => new Date(Date.parse(`${today}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  installFetch({ missing: new Set([back(1), back(2)]) });
  const { data } = await call("get_weather_history", { place: "Pocklington", period: "last_7d" });
  assert.equal(data.completeness.expected, 7);
  assert.equal(data.completeness.missing, 2);
  assert.deepEqual(data.completeness.missing_dates, [back(2), back(1)]);
  assert.equal(data.data.rows.at(-1).precipitation_mm, null);
  assert.ok(data.warnings.some((w) => /2 of 7 days have no archive data/.test(w)));
  assert.match(data.summary, /71\.4% complete/);
});

test("upstream failures become clear, safe tool errors", async () => {
  const timeout = () => Promise.reject(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
  installFetch({ overrides: [[(url) => url.host === "api.open-meteo.com", timeout]] });
  const slow = await call("get_daily_forecast", { place: "Pocklington" });
  assert.equal(slow.error.error.code, "upstream_timeout");

  const limited = () => new Response(JSON.stringify({ error: true, reason: "Daily API request limit exceeded." }), { status: 429 });
  installFetch({ overrides: [[isArchive, limited]] });
  const quota = await call("get_weather_history", { place: "Pocklington" });
  assert.equal(quota.error.error.code, "upstream_rate_limited");
  assert.doesNotMatch(quota.error.error.message, /Daily API request limit|archive-api/);

  installFetch({ overrides: [[(url) => url.pathname === "/api/search", () => Promise.reject(new TypeError("fetch failed"))]] });
  const down = await call("search_locations", { query: "Pocklington" });
  assert.equal(down.error.error.code, "upstream_unavailable");
});

test("the overview survives an archive outage and says so", async () => {
  installFetch({ overrides: [[isArchive, () => new Response("{}", { status: 502 })]] });
  const { data } = await call("get_location_weather", { place: "Pocklington" });
  assert.equal(data.data.last_7_days, null);
  assert.ok(data.warnings.some((w) => /Last 7 days unavailable/.test(w)));
});

test("Crop Dynamics group: all saved locations, rankings and forecast totals", async () => {
  installFetch();
  const { data } = await call("get_regional_weather", { group: "cropdynamics", period: "last_14d", forecast_days: 3 });
  assert.equal(data.data.locations.length, 7);
  assert.equal(data.data.regional.locations_ok, 7);
  assert.equal(data.data.rankings.precipitation_desc.length, 7);
  assert.equal(data.data.locations[0].forecast.days, 3);
  assert.equal(data.period.days, 14);
  assert.equal(data.classification, "mixed");
  assert.equal(data.completeness.expected, 98);
});

test("regional requests cap locations, limit concurrency and report partial failures", async () => {
  installFetch();
  const many = Array.from({ length: 13 }, (_, i) => ({ latitude: 52 + i / 10, longitude: -1, timezone: "Europe/London" }));
  const tooMany = await call("get_regional_weather", { locations: many });
  assert.equal(tooMany.result.isError, true);
  assert.match(tooMany.result.content[0].text, /locations/);

  let inFlight = 0;
  let peak = 0;
  const slowArchive = async (url) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    if (url.searchParams.get("latitude") === "52.5") return new Response("{}", { status: 503 });
    const { archiveFixture } = await import("./fixtures.mjs");
    return Response.json(archiveFixture(url.searchParams));
  };
  installFetch({ overrides: [[isArchive, slowArchive]] });
  const { data } = await call("get_regional_weather", { locations: many.slice(0, 12) });
  assert.ok(peak <= 4, `peak concurrency ${peak}`);
  assert.equal(data.data.regional.locations_ok, 11);
  assert.equal(data.data.regional.locations_failed, 1);
  assert.equal(data.data.locations[5].error.code, "upstream_unavailable");
  assert.ok(data.warnings.some((w) => /1 location\(s\) failed/.test(w)));

  const both = await call("get_regional_weather", { group: "cropdynamics", locations: many.slice(0, 2) });
  assert.equal(both.error.error.code, "invalid_input");
});

test("model comparison and confidence expose run times, spreads and the method", async () => {
  installFetch();
  const models = await call("compare_forecast_models", { place: "Pocklington", days: 7 });
  assert.equal(models.data.data.models.length, 4);
  assert.equal(models.data.data.models[0].run.initialised_at, "2026-10-08T06:00:00.000Z");
  assert.equal(models.data.sources[0].issued_at, "2026-10-08T06:00:00.000Z");
  assert.equal(models.data.data.spread[5].temp_max_c.spread, 6);
  const confidence = await call("get_forecast_confidence", { place: "Pocklington", days: 7 });
  const days = confidence.data.data.days;
  assert.equal(days[1].overall, "high");
  assert.equal(days[1].precipitation.models_wet, 4);
  assert.equal(days[5].temperature.confidence, "low");
  assert.equal(days[5].precipitation.confidence, "low");
  assert.equal(days[0].lead_time_days, 0);
  assert.match(confidence.data.data.method, /not an ensemble probability/);
});

test("forecast rows start at the current hour and respect limits", async () => {
  installFetch();
  const hourly = await call("get_hourly_forecast", { place: "Pocklington", hours: 5, wind_unit: "ms" });
  assert.equal(hourly.data.data.rows.length, 5);
  assert.equal(hourly.data.data.rows[0].time, localNow("Europe/London").hour);
  assert.equal(hourly.data.data.rows[0].wind_speed, 5);
  const extended = await call("get_extended_forecast", { place: "Pocklington" });
  assert.deepEqual(extended.data.data.rows.map((r) => r.lead_time_days), [7, 8, 9, 10, 11, 12, 13]);
  assert.ok(extended.data.warnings.some((w) => /beyond 14 days/.test(w)));
});

test("repeat calls are served from cache", async () => {
  const calls = installFetch();
  await call("get_daily_forecast", { place: "Pocklington" });
  const first = calls.length;
  await call("get_hourly_forecast", { place: "Pocklington" });
  assert.equal(calls.length, first);
});
