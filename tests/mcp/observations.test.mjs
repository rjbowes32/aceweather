import assert from "node:assert/strict";
import test from "node:test";
import { callTool, installFetch } from "./fixtures.mjs";
import { handleMcpRequest } from "../../src/mcp/http.ts";

const call = (name, args) => callTool(handleMcpRequest, name, args);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const byId = (stations, id) => stations.find((s) => s.id === id);

test("current weather prefers the nearest fresh official station and keeps the model for comparison", async () => {
  installFetch();
  const { data, error } = await call("get_current_weather", { place: "Pocklington" });
  assert.equal(error, null, JSON.stringify(error));
  assert.equal(data.classification, "mixed");
  assert.equal(data.data.preferred, "observation");
  const station = data.data.observed.station;
  assert.equal(station.id, "0-20000-0-03382");
  assert.equal(station.network, "metoffice_synop");
  assert.equal(station.name, "Leconfield");
  assert.equal(station.values.temperature_c, 14.6);
  assert.equal(station.values.wind_speed, 21.6);
  assert.equal(station.values.wind_gust, 55.4);
  assert.equal(station.values.wind_direction_compass, "W");
  assert.equal(station.values.precipitation_24h_mm, 1.6);
  assert.ok(station.age_minutes <= 90);
  assert.deepEqual(station.quality.flags, []);
  assert.equal(data.data.observed.rain_24h.precipitation_24h_mm, 1.6);
  assert.match(data.data.observed.rain_24h.station, /Rain gauge 038179/);
  assert.equal(data.data.observed.soil.soil_moisture_10cm_pct, 25.7);
  assert.equal(data.data.observed.soil.soil_temperature_10cm_c, 13.6);
  assert.equal(data.data.model.temperature_c, 13.6);
  assert.deepEqual(data.sources.map((s) => s.classification), ["observation", "observation", "observation", "observation", "model_current"]);
  assert.match(data.summary, /^Pocklington, England, United Kingdom: Observed at Leconfield \(Met Office synoptic station, [\d.]+ km\)/);
  assert.match(data.summary, /Rain last 24 h: 1.6 mm/);
  assert.match(data.summary, /Soil moisture 25.7% at 10 cm/);
  assert.match(data.summary, /Model grid point at .*13.6 °C/);
  assert.ok(data.warnings.some((w) => /station [\d.]+ km away/.test(w)));
});

test("nearby observations merge sources, flag quality problems and sort by distance", async () => {
  installFetch();
  const { data, error } = await call("get_nearby_observations", { place: "Pocklington", radius_km: 80, limit: 25 });
  assert.equal(error, null, JSON.stringify(error));
  assert.equal(data.classification, "observation");
  const stations = data.data.stations;
  assert.deepEqual(stations.map((s) => s.distance_km), [...stations.map((s) => s.distance_km)].sort((a, b) => a - b));
  assert.deepEqual(new Set(stations.map((s) => s.network)), new Set(["metoffice_synop", "metoffice_aws", "metar", "cosmos_uk", "ea_rain_gauge"]));

  const outlier = byId(stations, "0-20000-0-03999");
  assert.ok(outlier.quality.flags.includes("temperature_outlier"), "buddy check against neighbours");
  assert.ok(outlier.quality.flags.includes("differs_from_model"));
  assert.equal(outlier.quality.usable_for_current, false);

  const aws = byId(stations, "0-20000-0-99214");
  assert.equal(aws.name, "Hull, East Park");
  assert.deepEqual(aws.quality.flags, ["stale"]);
  assert.equal(aws.quality.usable_for_current, false);

  const topcliffe = stations.filter((s) => s.name === "Topcliffe");
  assert.equal(topcliffe.length, 1, "co-located WMO and national ids collapse to one station");
  assert.equal(topcliffe[0].id, "0-20000-0-03265", "newest record wins, ties broken by id");
  assert.equal(topcliffe[0].values.wind_gust, 14.4, "hourly gust (PT1H) merged from its own coverage, preferred over the 10-minute gust");

  const metar = byId(stations, "EGXV");
  assert.equal(metar.name, "Leconfield");
  assert.equal(metar.values.temperature_c, 14, "latest METAR per airport");
  assert.equal(metar.values.wind_speed, 18.5);
  assert.equal(metar.values.relative_humidity_pct, 67);
  assert.equal(metar.values.condition, "Mostly clear");
  assert.equal(byId(stations, "EGNJ").values.condition, "-RA");
  assert.equal(byId(stations, "EGNJ").values.visibility_km, 6.4);

  const gauge = byId(stations, "038179");
  assert.equal(gauge.tier, "official_gauge");
  assert.deepEqual(gauge.quality.flags, ["no_air_readings"]);
  assert.equal(gauge.values.precipitation_24h_mm, 1.6);
  assert.equal(gauge.values.precipitation_1h_mm, 0.4, "one tip in the last four readings");
  assert.equal(stations.filter((s) => s.network === "ea_rain_gauge").length, 3, "duplicate gauge locations collapse to one; the nearest three distinct gauges are read");
  assert.ok(byId(stations, "046222").age_minutes >= 9 * 60, "a slow gauge keeps its real age");
  assert.equal(byId(stations, "05973"), undefined, "the duplicate id at the same coordinates is dropped");

  const cosmos = byId(stations, "HOLLN");
  assert.equal(cosmos.tier, "research");
  assert.equal(cosmos.elevation_m, 82);
  assert.ok(cosmos.quality.flags.includes("stale"));
  assert.equal(cosmos.values.soil_moisture_10cm_pct, 25.7);
  assert.equal(cosmos.values.precipitation_24h_mm, 2);

  assert.ok(data.data.tiers.official && data.data.quality_flags.stale);
  assert.equal(data.data.total_within_radius, stations.length);
  const limited = await call("get_nearby_observations", { place: "Pocklington", radius_km: 25, limit: 2 });
  assert.equal(limited.data.data.stations.length, 2);
  assert.ok(limited.data.data.total_within_radius >= 2);
  assert.ok(limited.data.data.stations.every((s) => s.distance_km <= 25));
});

test("wind units convert station values too", async () => {
  installFetch();
  const { data } = await call("get_nearby_observations", { place: "Pocklington", wind_unit: "mph", limit: 25 });
  assert.equal(byId(data.data.stations, "0-20000-0-03382").values.wind_speed, 13.4);
  assert.equal(data.units.wind_speed, "mph");
});

test("a failing observation source is reported and the rest still load", async () => {
  installFetch({ overrides: [[(url) => url.host === "api.meteogate.eu", () => json({ reason: "boom" }, 503)]] });
  const { data } = await call("get_current_weather", { place: "Pocklington" });
  assert.ok(data.warnings.some((w) => /Met Office stations via MeteoGate E-SOH unavailable/.test(w)));
  assert.equal(data.data.preferred, "observation");
  assert.equal(data.data.observed.station.network, "metar", "falls back to the airport");
  assert.equal(data.sources.length, 4);
});

test("without any usable station the current tool says it is modelled", async () => {
  installFetch({ overrides: [[
    (url) => ["api.meteogate.eu", "aviationweather.gov", "cosmos-api.ceh.ac.uk", "environment.data.gov.uk"].includes(url.host),
    () => json({ reason: "down" }, 500),
  ]] });
  const { data, error } = await call("get_current_weather", { place: "Pocklington" });
  assert.equal(error, null);
  assert.equal(data.classification, "model_current");
  assert.equal(data.data.preferred, "model");
  assert.equal(data.data.observed, null);
  assert.match(data.summary, /Modelled, not measured/);
  assert.ok(data.warnings.some((w) => /No usable official station/.test(w)));
  assert.equal(data.warnings.filter((w) => /unavailable/.test(w)).length, 4);
  assert.deepEqual(data.sources.map((s) => s.classification), ["model_current"]);
});

test("observation lookups are cached per location", async () => {
  const calls = installFetch();
  await call("get_current_weather", { place: "Pocklington" });
  const before = calls.filter((u) => u.host === "api.meteogate.eu").length;
  await call("get_current_weather", { place: "Pocklington" });
  await call("get_nearby_observations", { place: "Pocklington", radius_km: 60 });
  assert.equal(calls.filter((u) => u.host === "api.meteogate.eu").length, before);
});
