import assert from "node:assert/strict";
import test from "node:test";
import { findWorkWindows } from "../src/lib/aceweather/work-windows.ts";

const fixture = () => ({ time: ["2026-09-15T22:00", "2026-09-15T23:00", "2026-09-16T00:00", "2026-09-16T01:00", "2026-09-16T02:00"], precipitation: [9, 0, 0.1, 0, 0], wind_gusts_10m: [80, 10, 20, 10, 10] });
const limits = { hours: 2, rain: 0.1, gust: 20 };
test("uses preceding-hour accumulation and supports midnight", () => {
  const result = findWorkWindows(fixture(), "2026-09-15T22:00", limits);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0], { start: "2026-09-15T22:00", end: "2026-09-16T00:00", rain: 0.1, gust: 20 });
});
test("does not count elapsed or incomplete forecast hours", () => {
  const result = findWorkWindows(fixture(), "2026-09-15T22:15", limits);
  assert.equal(result.length, 1);
  assert.equal(result[0].start, "2026-09-15T23:00");
  assert.deepEqual(findWorkWindows(fixture(), "2026-09-16T01:00", limits), []);
});
test("missing rain and gusts cannot become favourable weather", () => {
  for (const value of [null, undefined, NaN, -1]) {
    const data = fixture(); data.precipitation[2] = value; data.wind_gusts_10m[4] = value;
    assert.deepEqual(findWorkWindows(data, data.time[0], limits), []);
  }
});
test("does not bridge missing or repeated local hours", () => {
  const data = fixture(); data.time[2] = data.time[1]; data.time[4] = "2026-09-16T04:00";
  assert.deepEqual(findWorkWindows(data, data.time[0], limits), []);
});
test("rejects short horizons and invalid controls", () => {
  assert.deepEqual(findWorkWindows(fixture(), fixture().time[0], { ...limits, hours: 6 }), []);
  assert.deepEqual(findWorkWindows(fixture(), fixture().time[0], { ...limits, hours: 0 }), []);
  assert.deepEqual(findWorkWindows(fixture(), fixture().time[0], { ...limits, gust: NaN }), []);
});
test("stricter limits exclude wet hours", () => {
  const result = findWorkWindows(fixture(), fixture().time[0], { ...limits, rain: 0 });
  assert.equal(result[0].start, "2026-09-16T00:00");
});
