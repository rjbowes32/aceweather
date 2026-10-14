import assert from "node:assert/strict";
import test from "node:test";
import { callTool, installFetch } from "./fixtures.mjs";
import { handleMcpRequest } from "../../src/mcp/http.ts";
import { dailyTotals } from "../../src/mcp/verification.ts";
import { parseCsv, tidyName } from "../../src/mcp/sources/iem.ts";

const call = (name, args) => callTool(handleMcpRequest, name, args);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const score = (data, model, lead) => data.data.scores.find((s) => s.model === model && s.lead_day === lead);

test("models are scored against the nearest METAR and rain gauge, and the best model is named", async () => {
  installFetch();
  const { data, error } = await call("get_forecast_verification", { place: "Pocklington" });
  assert.equal(error, null, JSON.stringify(error));
  assert.equal(data.classification, "calculated");
  assert.deepEqual(data.data.lead_days, [1, 3, 5]);
  assert.equal(data.data.window.days, 14);

  const { air, rain } = data.data.reference;
  assert.deepEqual([air.id, air.name, air.network], ["EGXV", "Leconfield", "metar"], "nearest open METAR; closed stations are skipped");
  assert.deepEqual([rain.id, rain.network], ["038179", "ea_rain_gauge"]);

  assert.equal(data.data.scores.length, 15, "5 models x 3 lead days");
  const n = new Set(data.data.scores.filter((s) => s.lead_day === 1).map((s) => s.temperature.n));
  assert.equal(n.size, 1, "every model is scored on the same hours");
  assert.ok([...n][0] >= 48);

  assert.equal(data.data.aceweather_equivalent, "ukmo_seamless", "best_match is identical to the Met Office UM in the UK");
  const best = data.data.best.find((b) => b.lead_day === 1);
  assert.equal(best.temperature.model, "ukmo_seamless");
  assert.deepEqual(best.temperature.tie_with, []);
  assert.ok(best.temperature.mae < 0.5);
  assert.equal(best.wind_speed.model, "ukmo_seamless");
  assert.equal(best.rainfall.model, "ukmo_seamless");
  assert.equal(best.rainfall.mae, 0);

  const ecmwf = score(data, "ecmwf_ifs025", 1);
  assert.ok(Math.abs(ecmwf.temperature.bias - 0.65) < 0.3, "bias is forecast minus observed");
  const gfs = score(data, "gfs_seamless", 1);
  assert.ok(gfs.rainfall.misses > 0 && gfs.rainfall.hits === 0, "an always-dry model misses every wet day");
  assert.ok(gfs.rainfall.wet_day_accuracy_pct < score(data, "ukmo_seamless", 1).rainfall.wet_day_accuracy_pct);
  assert.equal(score(data, "ukmo_seamless", 1).rainfall.n_days, 14, "complete UTC days only");

  assert.deepEqual(data.sources.map((s) => s.classification), ["forecast", "observation", "observation"]);
  assert.match(data.summary, /Met Office UM \(AceWeather's current forecast\) best/);
  assert.ok(data.warnings.some((w) => /identical to Met Office UM/.test(w)));
  assert.ok(data.warnings.some((w) => /whole degrees/.test(w)));
});

test("wind units, lead days and window length follow the inputs", async () => {
  installFetch();
  const { data } = await call("get_forecast_verification", { place: "Pocklington", days: 7, lead_days: [2], wind_unit: "mph" });
  assert.deepEqual(data.data.lead_days, [2]);
  assert.equal(data.data.scores.length, 5);
  assert.equal(data.units.wind_speed, "mph");
  const kmh = await call("get_forecast_verification", { place: "Pocklington", days: 7, lead_days: [2] });
  assert.equal(kmh.data.units.wind_speed, "km/h", "a cached mph result is never served for a km/h request");
  const mph = score(data, "gfs_seamless", 2).wind_speed.mae;
  assert.ok(Math.abs(mph - score(kmh.data, "gfs_seamless", 2).wind_speed.mae * 0.621371) < 0.15);
  assert.equal(score(data, "ukmo_seamless", 2).rainfall.n_days, 7);
});

test("rainfall falls back to COSMOS-UK when no gauge is usable", async () => {
  installFetch({ overrides: [[(url) => url.host === "environment.data.gov.uk", () => json({ reason: "down" }, 503)]] });
  const { data, error } = await call("get_forecast_verification", { place: "Pocklington", lead_days: [1] });
  assert.equal(error, null, JSON.stringify(error));
  assert.equal(data.data.reference.rain.network, "cosmos_uk");
  assert.equal(data.data.reference.rain.name, "Hollin Hill");
  assert.equal(data.data.best[0].rainfall.model, "ukmo_seamless");
  assert.ok(data.warnings.some((w) => /No usable Environment Agency gauge/.test(w)));
});

test("outside the UK, or with no reference stations, the tool says so", async () => {
  installFetch();
  const paris = await call("get_forecast_verification", { latitude: 48.85, longitude: 2.35 });
  assert.equal(paris.error.error.code, "invalid_input");
  installFetch({ overrides: [[
    (url) => ["mesonet.agron.iastate.edu", "environment.data.gov.uk", "cosmos-api.ceh.ac.uk"].includes(url.host),
    () => json({ reason: "down" }, 500),
  ]] });
  const none = await call("get_forecast_verification", { place: "Pocklington" });
  assert.equal(none.error.error.code, "not_found");
  installFetch();
  const bad = await call("get_forecast_verification", { place: "Pocklington", lead_days: [9] });
  assert.ok(bad.error);
});

test("verification results are cached", async () => {
  const calls = installFetch();
  await call("get_forecast_verification", { place: "Pocklington" });
  const before = calls.filter((u) => u.host === "previous-runs-api.open-meteo.com").length;
  assert.equal(before, 2, "one archived-forecast request per reference point");
  await call("get_forecast_verification", { place: "Pocklington" });
  assert.equal(calls.filter((u) => u.host === "previous-runs-api.open-meteo.com").length, before);
});

test("daily totals use (D 00:00, D+1 00:00] and drop incomplete days", () => {
  const readings = [];
  for (let t = Date.parse("2026-10-01T00:15:00Z"); t <= Date.parse("2026-10-03T00:00:00Z"); t += 15 * 60_000) readings.push({ time: new Date(t).toISOString(), value: 0.1 });
  readings.push({ time: "2026-10-03T00:15:00Z", value: 5 });
  const totals = dailyTotals(readings, 96);
  assert.deepEqual([...totals], [["2026-10-01", 9.6], ["2026-10-02", 9.6]], "the 00:00 reading belongs to the previous day; a one-reading day is dropped");
});

test("METAR parsing matches the report nearest the hour and converts knots", () => {
  const csv = "station,valid,tmpc,sknt\nEGXV,2026-10-12 09:20,11.00,10.00\nEGXV,2026-10-12 09:50,12.00,12.00\nEGXV,2026-10-12 10:35,13.00,null";
  const { temperature_c, wind_speed_kmh, reports } = parseCsv(csv);
  assert.equal(reports, 3);
  assert.equal(temperature_c.get("2026-10-12T09:00"), 11, "09:20 is within 20 minutes of 09:00");
  assert.equal(temperature_c.get("2026-10-12T10:00"), 12, "09:50 is closer to 10:00 than 09:20 is to 09:00");
  assert.equal(temperature_c.has("2026-10-12T11:00"), false, "10:35 is too far from any hour");
  assert.ok(Math.abs(wind_speed_kmh.get("2026-10-12T10:00") - 22.224) < 0.001, "12 kn = 22.224 km/h");
  assert.equal(tidyName("LECONFIELD (AUT)"), "Leconfield");
  assert.equal(tidyName("Humberside"), "Humberside");
});
