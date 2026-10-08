import assert from "node:assert/strict";
import test from "node:test";
import { localNow, shiftYears } from "../../src/mcp/dates.ts";
import { resolvePeriod } from "../../src/mcp/periods.ts";
import { convertWind, secondsToHours } from "../../src/mcp/units.ts";

const window = (req, today) => resolvePeriod(req, today).window;
const span = (req, today) => {
  const w = window(req, today);
  return [w.start, w.end, w.days];
};

test("rolling periods end yesterday and match the Python /api/report windows", () => {
  assert.deepEqual(span({ period: "last_7d" }, "2026-10-08"), ["2026-10-01", "2026-10-07", 7]);
  assert.deepEqual(span({ period: "last_21d" }, "2026-10-08"), ["2026-09-17", "2026-10-07", 21]);
  assert.deepEqual(span({}, "2026-10-08"), ["2026-10-01", "2026-10-07", 7]);
});

test("calendar periods", () => {
  assert.deepEqual(span({ period: "yesterday" }, "2026-03-01"), ["2026-02-28", "2026-02-28", 1]);
  assert.deepEqual(span({ period: "last_week" }, "2026-10-08"), ["2026-09-28", "2026-10-04", 7]);
  assert.deepEqual(span({ period: "last_month" }, "2026-01-15"), ["2025-12-01", "2025-12-31", 31]);
  assert.deepEqual(span({ period: "month_to_date" }, "2026-10-08"), ["2026-10-01", "2026-10-07", 7]);
  assert.deepEqual(span({ period: "year_to_date" }, "2026-10-08"), ["2026-01-01", "2026-10-07", 280]);
});

test("season to date uses meteorological seasons, including winter across the new year", () => {
  assert.equal(window({ period: "season_to_date" }, "2026-10-08").start, "2026-09-01");
  assert.equal(window({ period: "season_to_date" }, "2026-02-10").start, "2025-12-01");
  assert.equal(window({ period: "season_to_date" }, "2026-12-20").start, "2026-12-01");
  assert.equal(window({ period: "season_to_date" }, "2026-05-31").start, "2026-03-01");
});

test("agricultural and calendar years", () => {
  assert.deepEqual(span({ period: "agricultural_year" }, "2026-10-08"), ["2026-09-01", "2026-10-07", 37]);
  assert.deepEqual(span({ period: "agricultural_year" }, "2026-08-08").slice(0, 2), ["2025-09-01", "2026-08-07"]);
  assert.deepEqual(span({ period: "agricultural_year", year: 2024 }, "2026-10-08"), ["2024-09-01", "2025-08-31", 365]);
  assert.deepEqual(span({ period: "agricultural_year", year: 2024, agricultural_year_start_month: 1 }, "2026-10-08").slice(0, 2), ["2024-01-01", "2024-12-31"]);
  assert.deepEqual(span({ period: "calendar_year", year: 2024 }, "2026-10-08"), ["2024-01-01", "2024-12-31", 366]);
  const current = resolvePeriod({ period: "calendar_year" }, "2026-10-08");
  assert.equal(current.window.end, "2026-10-07");
  assert.match(current.warnings[0], /ends yesterday/);
});

test("years_ago gives the equivalent period in earlier years, handling 29 February", () => {
  assert.deepEqual(span({ period: "month_to_date", years_ago: 1 }, "2026-10-08"), ["2025-10-01", "2025-10-07", 7]);
  assert.equal(shiftYears("2024-02-29", 1), "2023-02-28");
  assert.deepEqual(span({ period: "custom", start_date: "2024-02-01", end_date: "2024-02-29", years_ago: 2 }, "2026-10-08").slice(0, 2), ["2022-02-01", "2022-02-28"]);
  assert.match(window({ period: "last_30d", years_ago: 10 }, "2026-10-08").label, /10 years earlier/);
});

test("hour-based periods are flagged for the hourly path", () => {
  assert.deepEqual(window({ period: "last_48h" }, "2026-10-08"), { kind: "hourly", period: "last_48h", label: "Last 48 hours", hours: 48 });
  assert.equal(window({ period: "today" }, "2026-10-08").hours, null);
  assert.throws(() => resolvePeriod({ period: "today", years_ago: 1 }, "2026-10-08"), /years_ago is not supported/);
});

test("rejects empty, reversed, oversized and pre-1940 windows", () => {
  assert.throws(() => resolvePeriod({ period: "month_to_date" }, "2026-10-01"), /no completed days/);
  assert.throws(() => resolvePeriod({ period: "this_week" }, "2026-10-05"), /no completed days/);
  assert.throws(() => resolvePeriod({ period: "custom", start_date: "2026-05-02", end_date: "2026-05-01" }, "2026-10-08"), /on or before/);
  assert.throws(() => resolvePeriod({ period: "custom", start_date: "2026-02-30", end_date: "2026-03-01" }, "2026-10-08"), /valid YYYY-MM-DD/);
  assert.throws(() => resolvePeriod({ period: "custom", start_date: "2020-01-01", end_date: "2025-01-01" }, "2026-10-08"), /at most 730 days/);
  assert.throws(() => resolvePeriod({ period: "custom", start_date: "1939-12-25", end_date: "1940-01-05" }, "2026-10-08"), /starts 1940-01-01/);
  assert.throws(() => resolvePeriod({ period: "custom" }, "2026-10-08"), /needs start_date and end_date/);
});

test("custom ranges that run into today are clamped to yesterday with a warning", () => {
  const result = resolvePeriod({ start_date: "2026-10-01", end_date: "2026-10-20" }, "2026-10-08");
  assert.equal(result.window.end, "2026-10-07");
  assert.equal(result.warnings.length, 1);
});

test("local calendar day follows the location's timezone, not the server clock", () => {
  const instant = new Date("2026-10-08T23:30:00Z");
  assert.deepEqual(localNow("Europe/London", instant), { day: "2026-10-09", hour: "2026-10-09T00:00" });
  assert.deepEqual(localNow("UTC", instant), { day: "2026-10-08", hour: "2026-10-08T23:00" });
  assert.equal(localNow("Pacific/Auckland", instant).day, "2026-10-09");
  assert.equal(localNow("America/Los_Angeles", instant).day, "2026-10-08");
  assert.equal(window({ period: "yesterday" }, localNow("Europe/London", instant).day).start, "2026-10-08");
  assert.equal(localNow("Europe/London", new Date("2026-03-29T00:30:00Z")).hour, "2026-03-29T00:00");
  assert.equal(localNow("Europe/London", new Date("2026-03-29T01:30:00Z")).hour, "2026-03-29T02:00");
});

test("wind and sunshine unit conversions", () => {
  assert.equal(convertWind(36, "kmh"), 36);
  assert.equal(convertWind(36, "ms"), 10);
  assert.equal(convertWind(100, "mph"), 62.1);
  assert.equal(convertWind(100, "kn"), 54);
  assert.equal(convertWind(null, "mph"), null);
  assert.equal(secondsToHours(18000), 5);
});
