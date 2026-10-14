import assert from "node:assert/strict";
import test from "node:test";
import { formatNextRain, formatRain } from "../../src/lib/aceweather/format.ts";

test("rainfall reads the same everywhere: 0.1 mm steps, no trailing .0, missing is unavailable", () => {
  assert.equal(formatRain(0), "0");
  assert.equal(formatRain(0.04), "0");
  assert.equal(formatRain(0.1), "0.1");
  assert.equal(formatRain(1.14), "1.1");
  assert.equal(formatRain(2), "2");
  assert.equal(formatRain(2.04), "2");
  assert.equal(formatRain(null), "—");
  assert.equal(formatRain(undefined), "—");
  assert.equal(formatRain(-0.01), "0");
});

test("the next-rain headline carries no chance figure", () => {
  const { headline, detail } = formatNextRain(null, 0);
  assert.doesNotMatch(headline + detail, /%/);
});
