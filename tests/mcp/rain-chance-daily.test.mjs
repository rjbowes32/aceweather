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
      if (date === partialDay && t.slice(11, 13) < "06") return null;
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
