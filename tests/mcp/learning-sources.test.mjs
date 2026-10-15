import assert from "node:assert/strict";
import test from "node:test";
import { anonId, gapPoints, hourlyTemperature, parseMeasure, parsePublicData, pickStation, rainDayTotals, seal, unseal } from "../../src/mcp/sources/netatmo.ts";
import { parseEaStations, parseSepaList, selectGauges } from "../../src/mcp/sources/rain-gauges.ts";

const t0 = Date.parse("2026-10-14T00:00:00Z") / 1000;

test("Netatmo public data finds the outdoor and rain modules with or without module types", () => {
  const stations = parsePublicData({ body: [
    { _id: "70:ee:50:aa", place: { location: [-1.5, 54.1] }, module_types: { "02:aa": "NAModule1", "05:aa": "NAModule3" }, measures: {} },
    { _id: "70:ee:50:bb", place: { location: [-1.6, 54.2] }, measures: { "02:bb": { type: ["temperature", "humidity"], res: {} }, "05:bb": { rain_60min: 0, rain_24h: 1.2 } } },
    { _id: "70:ee:50:cc", place: {} },
  ] });
  assert.deepEqual(stations.map((s) => [s.device_id, s.temp_module, s.rain_module]), [["70:ee:50:aa", "02:aa", "05:aa"], ["70:ee:50:bb", "02:bb", "05:bb"]]);
});

test("Netatmo measures parse in both response shapes; temperatures snap to the hour and rain days need 22 hours", () => {
  const plain = parseMeasure({ body: { [t0 + 3300]: [11.2], [t0 + 3600 + 1500]: [12], [t0 + 7200 + 60]: [99] } });
  const optimized = parseMeasure({ body: [{ beg_time: t0 + 3300, step_time: 300, value: [[11.2], [11.4]] }] });
  assert.deepEqual(optimized.map((r) => r.value), [11.2, 11.4]);
  const hourly = hourlyTemperature(plain);
  assert.deepEqual([...hourly], [["2026-10-14T01:00", 11.2]], "25 minutes from the hour is too far; 99 °C is impossible");

  const rows = [];
  for (let t = t0 + 300; t <= t0 + 86400; t += 300) rows.push({ ms: t * 1000, value: t === t0 + 6 * 3600 ? 2.5 : 0 });
  assert.deepEqual([...rainDayTotals(rows)], [["2026-10-14", 2.5]], "the 00:00 reading closes the 14th");
  assert.equal(rainDayTotals(rows.filter((r) => r.ms < (t0 + 20 * 3600) * 1000)).size, 0, "20 hours is not a full day");
});

test("the registry seals with the key and station ids are stable but not reversible", () => {
  const registry = { refresh_token: "r", stations: {}, tried: { "54.000,-1.0": "2026-10-14" }, rejected: [] };
  const sealed = seal(registry, "key");
  assert.doesNotMatch(sealed, /refresh/);
  assert.deepEqual(unseal(sealed, "key"), registry);
  assert.throws(() => unseal(sealed, "other key"));
  assert.equal(anonId("70:ee:50:aa", "key"), anonId("70:ee:50:aa", "key"));
  assert.notEqual(anonId("70:ee:50:aa", "key"), anonId("70:ee:50:aa", "other key"));
});

test("gap points avoid official stations and gauges; the pick needs a thermometer and, for a rain gap, a gauge", () => {
  const points = gapPoints([{ latitude: 54.125, longitude: -1.0 }], [{ latitude: 54.125, longitude: -1.0 }]);
  assert.ok(!points.some((p) => p.key === "54.125,-1.0"));
  const rainOnly = { key: "k", latitude: 54, longitude: -1, air: false, rain: true };
  const stations = [
    { device_id: "near", latitude: 54.01, longitude: -1, temp_module: "02", rain_module: null },
    { device_id: "far", latitude: 54.05, longitude: -1, temp_module: "02", rain_module: "05" },
  ];
  assert.equal(pickStation(stations, rainOnly, new Set()).device_id, "far");
  assert.equal(pickStation(stations, { ...rainOnly, air: true }, new Set()).device_id, "near");
  assert.equal(pickStation(stations, { ...rainOnly, air: true }, new Set(["near", "far"])), null);
});

test("gauge lists skip closed gauges, and selection keeps tracked gauges and spaces new ones", () => {
  const ea = parseEaStations({ items: [
    { stationReference: "A", lat: 54, long: -1, status: "http://environment.data.gov.uk/flood-monitoring/def/core/statusActive" },
    { stationReference: "B", lat: 54.01, long: -1, status: "http://environment.data.gov.uk/flood-monitoring/def/core/statusClosed" },
    { stationReference: "C", lat: 54.05, long: -1 },
    { stationReference: "D", lat: 55, long: -1 },
  ] });
  assert.deepEqual(ea.map((g) => g.id), ["ea:A", "ea:C", "ea:D"]);
  const sepa = parseSepaList([["ts_id", "station_name", "station_no", "lat", "lon"], ["9", "Perth", "S1", "56.4", "-3.4"], ["10", "Bad", "S2", "", ""]]);
  assert.deepEqual(sepa.map((g) => [g.id, g.ref]), [["sepa:S1", "9"]]);
  const chosen = selectGauges([...ea, ...sepa], new Set(["ea:C"]), 3, 12).map((g) => g.id);
  assert.equal(chosen[0], "ea:C", "a tracked gauge keeps its place");
  assert.ok(!chosen.includes("ea:A"), "A is 6 km from C");
  assert.deepEqual([...chosen].sort(), ["ea:C", "ea:D", "sepa:S1"]);
});

test("isolated Netatmo rain readings, one in each hour, are not a day of rain", () => {
  const rows = Array.from({ length: 24 }, (_, h) => ({ ms: (t0 + h * 3600 + 1800) * 1000, value: 0.2 }));
  assert.equal(rainDayTotals(rows).size, 0);
});
