import assert from "node:assert/strict";
import test from "node:test";
import { callTool, installFetch } from "./fixtures.mjs";
import { trueRain, trueTemperature, trueWindKmh } from "./observation-fixtures.mjs";
import { handleMcpRequest } from "../../src/mcp/http.ts";

const call = (name, args) => callTool(handleMcpRequest, name, args);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ms = (time) => Date.parse(`${time}:00Z`);
const meanAbs = (xs) => xs.reduce((a, b) => a + Math.abs(b), 0) / xs.length;

test("the learned forecast removes model errors learned at the nearest station", async () => {
  installFetch();
  const { data, error } = await call("get_learned_forecast", { place: "Pocklington", detail: "full" });
  assert.equal(error, null, JSON.stringify(error));
  assert.equal(data.classification, "forecast");
  const d = data.data;
  assert.deepEqual(d.learned_applied, { temperature: true, wind_speed: true, rainfall: true, bias_correction: true });
  assert.deepEqual([d.reference.id, d.reference.network, d.reference.name], ["UKM00003382", "ghcnh", "Leconfield"], "the Met Office record of the same site is preferred to the airport METAR");
  assert.equal(d.training.length, 7);
  const lead1 = d.training[0].temperature;
  assert.ok(lead1.training_days >= 20);
  assert.ok(Math.abs(Object.values(lead1.weights).reduce((a, b) => a + b, 0) - 1) < 0.01);
  assert.ok(lead1.weights.ukmo_seamless > lead1.weights.gfs_seamless, "the more accurate model gets more weight");

  const rows = d.hourly;
  assert.ok(rows.length >= 24 * 6);
  const learnedErr = rows.map((r) => r.temperature_c - trueTemperature(ms(r.time)));
  const standardErr = rows.map((r) => r.standard_temperature_c - trueTemperature(ms(r.time)));
  assert.ok(meanAbs(learnedErr) < 0.35, `learned temperature error ${meanAbs(learnedErr)}`);
  assert.ok(Math.abs(learnedErr.reduce((a, b) => a + b, 0) / learnedErr.length) < 0.3, "bias is removed");
  assert.ok(standardErr.every((e) => Math.abs(e - 0.1) < 0.06), "the standard forecast is passed through for comparison");
  const windErr = rows.map((r) => r.wind_speed - trueWindKmh(ms(r.time)));
  assert.ok(meanAbs(windErr) < 1.5, `learned wind error ${meanAbs(windErr)}`);

  const rainy = rows.filter((r) => trueRain(ms(r.time)) > 0);
  assert.ok(rainy.length > 0);
  for (const r of rainy) {
    const factor = r.lead_day >= 3 ? (1 + 1.3 + 0.7 + 0 + 1.1) / 5 : (1 + 1.3 + 0.7 + 0) / 4;
    assert.ok(Math.abs(r.precipitation_mm - r.standard_precipitation_mm * factor) < 0.06, "rainfall is the equal-weight model mean, with AIFS from day 3");
  }
  assert.equal(d.training[0].temperature.weights.ecmwf_aifs025_single, undefined, "no AI model at day 1");
  assert.ok(d.training[2].temperature.weights.ecmwf_aifs025_single > 0, "AI model joins at day 3");

  assert.ok(d.daily.length >= 7);
  const full = d.daily.filter((r) => !r.partial);
  assert.ok(full.every((r) => r.hours >= 23 && r.temp_max_c >= r.temp_min_c));
  assert.ok(full.every((r) => r.standard.temp_max_c != null));
  assert.match(data.summary, /learned from Leconfield \([\d.]+ km\) with bias correction/);
  assert.deepEqual(data.sources.map((s) => s.classification), ["forecast", "forecast", "observation"]);
  assert.match(data.sources[2].name, /GHCNh/);
});

test("a distant station contributes weights but not its bias", async () => {
  installFetch();
  const { data, error } = await call("get_learned_forecast", { latitude: 54.3, longitude: -0.9, days: 2 });
  assert.equal(error, null, JSON.stringify(error));
  assert.equal(data.data.reference.id, "UKM00003382", "a nearer station with too little data is skipped");
  assert.ok(data.data.reference.distance_km > 40);
  assert.equal(data.data.learned_applied.temperature, true);
  assert.equal(data.data.learned_applied.bias_correction, false);
  assert.equal(data.data.training[0].temperature.bias, null);
  assert.ok(data.warnings.some((w) => /weights are applied but not its bias correction/.test(w)));
});

test("without station history the standard forecast is used for temperature and wind", async () => {
  installFetch({ overrides: [[(url) => ["mesonet.agron.iastate.edu", "cosmos-api.ceh.ac.uk", "www.ncei.noaa.gov"].includes(url.host), () => json({ reason: "down" }, 500)]] });
  const { data, error } = await call("get_learned_forecast", { place: "Pocklington", days: 2, detail: "full" });
  assert.equal(error, null, JSON.stringify(error));
  assert.deepEqual(data.data.learned_applied, { temperature: false, wind_speed: false, rainfall: true, bias_correction: false });
  assert.ok(data.data.hourly.every((r) => r.temperature_c === r.standard_temperature_c));
  assert.ok(data.warnings.some((w) => /No reference station/.test(w)));
  const paris = await call("get_learned_forecast", { latitude: 48.85, longitude: 2.35, days: 1 });
  assert.equal(paris.error, null);
  assert.equal(paris.data.data.learned_applied.temperature, false);
  assert.ok(paris.data.warnings.some((w) => /outside the UK/.test(w)));
});

test("learned forecasts are cached and wind units convert", async () => {
  const calls = installFetch();
  await call("get_learned_forecast", { place: "Pocklington", days: 3 });
  const before = calls.length;
  await call("get_learned_forecast", { place: "Pocklington", days: 3 });
  assert.equal(calls.length, before);
  const mph = await call("get_learned_forecast", { place: "Pocklington", days: 3, wind_unit: "mph" });
  const kmh = await call("get_learned_forecast", { place: "Pocklington", days: 3 });
  const a = mph.data.data.daily[1].wind_speed_max;
  const b = kmh.data.data.daily[1].wind_speed_max;
  assert.ok(Math.abs(a - b * 0.621371) < 0.2);
  assert.equal(mph.data.units.wind_speed, "mph");
});

test("GHCNh parsing keeps quality-passed reports nearest the hour and UK stations only", async () => {
  const { parsePsv, parseStationList } = await import("../../src/mcp/sources/ghcnh.ts");
  const psv = [
    "STATION|DATE|temperature|temperature_Quality_Code|wind_speed|wind_speed_Quality_Code",
    "UKM1|2026-10-01T09:00:00|85.0|3|99.0|3",
    "UKM1|2026-10-01T09:00:00|11.4||5.0|",
    "UKM1|2026-10-01T09:50:00|12.1|1|6.0|1",
    "UKM1|2026-10-01T10:10:00|12.5||6.5|",
    "UKM1|2026-10-01T11:30:00|13.0||7.0|",
  ].join("\n");
  const { temperature_c, wind_speed_kmh } = parsePsv(psv);
  assert.equal(temperature_c.get("2026-10-01T09:00"), 11.4, "failed-QC values are ignored");
  assert.equal(temperature_c.get("2026-10-01T10:00"), 12.1, "ties go to the earlier report; both are 10 minutes from the hour");
  assert.equal(temperature_c.has("2026-10-01T11:00"), false);
  assert.ok(Math.abs(wind_speed_kmh.get("2026-10-01T09:00") - 18) < 1e-9, "m/s to km/h");
  const { GHCNH_LIST } = await import("./observation-fixtures.mjs");
  assert.deepEqual(parseStationList(GHCNH_LIST).map((s) => s.id), ["UKM00003382", "UKM00003999", "UKU12-00001"]);
});

test("with a fresh daily fits file the forecast uses it and makes no learning requests; a stale one is ignored", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const four = { ecmwf_ifs025: 0.25, gfs_seamless: 0.25, icon_seamless: 0.25, ukmo_seamless: 0.25 };
  const five = { ...Object.fromEntries(Object.keys(four).map((m) => [m, 0.2])), ecmwf_aifs025_single: 0.2 };
  // Equal weights with the fixture's model errors: blend bias 0.375 (four models) or 0.36 (five) for temperature.
  const leads = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((l) => [l, l < 3
    ? { t: { weights: four, bias: 0.375, days: 50 }, w: { weights: four, bias: 1.75, days: 50 } }
    : { t: { weights: five, bias: 0.36, days: 50 }, w: { weights: five, bias: 1.8, days: 50 } }]));
  const fits = (generatedAt) => JSON.stringify({ version: 1, generated_at: generatedAt, window_days: 60, ai_from_lead: 3, recent_scores: {}, stations: [
    { meta: { id: "0-20000-0-03382", name: "Leconfield", network: "metoffice", latitude: 53.875, longitude: -0.442, elevation_m: 7 }, leads },
    { meta: { id: "metar:EGXX", name: "Too high", network: "metar", latitude: 53.94, longitude: -0.78, elevation_m: 400 }, leads },
  ] });
  const dir = mkdtempSync(join(tmpdir(), "aceweather-fits-"));
  const file = join(dir, "fits.json");
  process.env.ACEWEATHER_LEARNED_FITS_FILE = file;
  try {
    writeFileSync(file, fits(new Date().toISOString()));
    const calls = installFetch();
    const { data, error } = await call("get_learned_forecast", { place: "Pocklington", detail: "full", days: 4 });
    assert.equal(error, null, JSON.stringify(error));
    assert.equal(data.data.learning_source, "daily");
    assert.equal(data.data.reference.id, "0-20000-0-03382", "the nearer station 400 m higher is not representative");
    assert.equal(data.data.learned_applied.bias_correction, true);
    const errors = data.data.hourly.map((r) => r.temperature_c - trueTemperature(ms(r.time)));
    assert.ok(meanAbs(errors) < 0.06, `exact weights and bias reproduce the truth (${meanAbs(errors)})`);
    assert.equal(calls.filter((u) => ["previous-runs-api.open-meteo.com", "mesonet.agron.iastate.edu", "www.ncei.noaa.gov", "cosmos-api.ceh.ac.uk"].includes(u.host)).length, 0, "no station history or archived forecasts are fetched");
    assert.match(data.sources[1].name, /daily learning job/);

    writeFileSync(file, fits(new Date(Date.now() - 5 * 86_400_000).toISOString()));
    installFetch();
    const stale = await call("get_learned_forecast", { place: "Pocklington", days: 2 });
    assert.equal(stale.data.data.learning_source, "on_demand", "a fits file older than three days is not trusted");
  } finally {
    delete process.env.ACEWEATHER_LEARNED_FITS_FILE;
  }
});
