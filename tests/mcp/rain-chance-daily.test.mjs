import assert from "node:assert/strict";
import test from "node:test";
import { rainChances } from "../../src/mcp/learned.ts";

// UTC hourly timestamps; each value is the total for the hour ending at that time.
function live(days, rainFor) {
  const start = Date.parse("2026-01-10T01:00:00Z");
  const time = Array.from({ length: days * 24 }, (_, i) => new Date(start + i * 3600_000).toISOString().slice(0, 16));
  return { time, get: (_variable, model) => time.map((t) => rainFor(t.slice(0, 10), model, t)) };
}
const now = Date.parse("2026-01-10T09:00:00Z");

test("daily chance of 1 mm or more: wet days high, dry days low, partial and far days left out", () => {
  const wetDay = "2026-01-11";
  const partialDay = "2026-01-12";
  const chances = rainChances(
    live(10, (date, _m, t) => {
      // Hours ending 01:00-05:00 of the partial day; the value stamped 00:00 closes the wet day before it.
      if (date === partialDay && t.slice(11, 13) >= "01" && t.slice(11, 13) < "06") return null;
      return date === wetDay ? 0.5 : 0;
    }),
    "UTC",
    now,
  );
  assert.ok(chances.get(wetDay) >= 90, `wet day ${chances.get(wetDay)}%`);
  assert.ok(chances.get("2026-01-13") <= 10, `dry day ${chances.get("2026-01-13")}%`);
  assert.equal(chances.has(partialDay), false, "a day missing hours has no chance rather than a low one");
  assert.equal(chances.has("2026-01-18"), false, "beyond day 7 there is no calibration");
  assert.ok(chances.has("2026-01-17"), "day 7 is covered");
  for (const v of chances.values()) assert.ok(Number.isInteger(v) && v >= 0 && v <= 100);
});

test("a chance needs every hour of the local day, including the 25-hour day when the clocks go back", async () => {
  const { localDayHours } = await import("../../src/mcp/learned.ts");
  assert.deepEqual(["2026-03-29", "2026-10-25", "2026-10-26"].map((d) => localDayHours(d, "Europe/London")), [23, 25, 24]);
  const start = Date.parse("2026-10-24T00:00:00Z");
  const time = Array.from({ length: 4 * 24 }, (_, i) => new Date(start + (i + 1) * 3600_000).toISOString().slice(0, 16));
  const wetHour = "2026-10-25T12:00";
  const series = (drop) => ({ time, get: () => time.map((t) => (t === drop ? null : t === wetHour ? 10 : 0)) });
  const now = Date.parse("2026-10-24T09:00:00Z");
  const full = rainChances(series(null), "Europe/London", now);
  assert.ok(full.get("2026-10-25") >= 90, `25-hour day with 10 mm: ${full.get("2026-10-25")}%`);
  const missing = rainChances(series(wetHour), "Europe/London", now);
  assert.equal(missing.has("2026-10-25"), false, "the missing hour may be the wet one, so no chance rather than a dry one");
});
