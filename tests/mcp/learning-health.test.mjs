import assert from "node:assert/strict";
import test from "node:test";
import { BLOCKING_CHECKS, checkHealth, healthMarkdown } from "../../src/mcp/learning-health.ts";

const NOW = Date.parse("2026-10-15T06:00:00Z");
const station = (name, tBiases = [0.1, 0.1, 0.2, 0.2, 0.3, 0.3, 0.4]) => ({
  meta: { id: name, name, network: "metoffice", latitude: 54, longitude: -1, elevation_m: 50 },
  leads: Object.fromEntries(tBiases.map((b, i) => [i + 1, { t: { weights: { a: 1 }, bias: b, days: 50 }, w: { weights: { a: 1 }, bias: 2, days: 50 } }])),
});
const fits = (over = {}) => ({
  version: 1, generated_at: "2026-10-15T05:31:00Z", window_days: 60, ai_from_lead: 3,
  stations: Array.from({ length: 100 }, (_, i) => station(`S${i}`)),
  recent_scores: { temperature: { 1: { hours: 20000, learned_mae: 0.72, standard_mae: 0.83, stations: 59 } } },
  ...over,
});
const run = (over = {}) => ({ date: "2026-10-15", processed: 120, updated: 118, skipped: 2, failed: 0, requests: 300, gave_up: 0, errors: [], ...over });
const history = [{ date: "2026-10-14", stations_fitted: 95, recent_scores: {} }];

test("a healthy run passes every check", () => {
  assert.deepEqual(checkHealth(fits(), history, run(), NOW), []);
  assert.match(healthMarkdown([], fits(), run(), null), /All checks passed/);
});

test("stale output, lost coverage, failures and retries are reported", () => {
  assert.equal(checkHealth(null, history, run(), NOW)[0].check, "fits_missing");
  const checks = (p) => p.map((x) => x.check);
  assert.deepEqual(checks(checkHealth(fits({ generated_at: "2026-10-13T05:31:00Z" }), [], run(), NOW)), ["fits_stale"]);
  assert.deepEqual(checks(checkHealth(fits({ stations: fits().stations.slice(0, 50) }), history, run(), NOW)), ["stations_dropped"]);
  const failed = checkHealth(fits(), history, run({ failed: 30, errors: [{ id: "0-20000-0-03382", error: "HTTP 500" }] }), NOW);
  assert.deepEqual(checks(failed), ["job_failures"]);
  assert.match(failed[0].message, /0-20000-0-03382 \(HTTP 500\)/);
  assert.deepEqual(checks(checkHealth(fits(), history, run({ gave_up: 9 }), NOW)), ["upstream_retries"]);
  assert.deepEqual(checks(checkHealth(fits(), history, run({ netatmo: { enabled: true, error: "token refresh failed" } }), NOW)), ["netatmo_unavailable"]);
  assert.deepEqual(checks(checkHealth(fits(), history, run({ netatmo: { enabled: false, error: null } }), NOW)), [], "Netatmo not configured is fine");
});

test("empty or collapsed output is a blocking error, even with no history to compare against", () => {
  const empty = checkHealth(fits({ stations: [] }), [], run({ processed: 0, updated: 0 }), NOW);
  assert.deepEqual(empty.map((p) => p.check), ["nothing_processed"]);
  const collapsed = checkHealth(fits({ stations: fits().stations.slice(0, 40) }), history, run(), NOW);
  assert.deepEqual(collapsed.map((p) => p.check), ["stations_collapsed"]);
  assert.ok([...empty, ...collapsed].every((p) => BLOCKING_CHECKS.includes(p.check)));
  assert.ok(!BLOCKING_CHECKS.includes("stations_dropped"), "a moderate drop is reported but still published");
});

test("rainfall scores (in days, against the model mean) do not trip the learned-worse check", () => {
  const rain = fits({ recent_scores: { rainfall: { 1: { days: 3000, learned_mae: 1.6, standard_mae: 1.5, mean_mae: 1.5, stations: 300 } } } });
  assert.deepEqual(checkHealth(rain, history, run(), NOW), []);
});

test("a learned forecast that stops beating the standard one, and lead-to-lead bias jumps, are warnings", () => {
  const worse = checkHealth(fits({ recent_scores: { wind_speed: { 3: { hours: 9000, learned_mae: 6.2, standard_mae: 5.9, stations: 40 } } } }), history, run(), NOW);
  assert.deepEqual(worse.map((p) => [p.severity, p.check]), [["warning", "learned_worse"]]);
  const few = checkHealth(fits({ recent_scores: { wind_speed: { 3: { hours: 100, learned_mae: 6.2, standard_mae: 5.9, stations: 2 } } } }), history, run(), NOW);
  assert.deepEqual(few, [], "too few scored hours to judge");
  const stepped = fits();
  stepped.stations[0] = station("Jumpy", [0.1, 0.1, 2.5, 2.5, 2.5, 2.5, 2.5]);
  const steps = checkHealth(stepped, history, run(), NOW);
  assert.deepEqual(steps.map((p) => p.check), ["bias_steps"]);
  assert.match(steps[0].message, /Jumpy temperature day 2→3 \(0\.1→2\.5 °C\)/);
  const summit = fits();
  summit.stations[0] = station("Summit");
  for (const [lead, bias] of [[1, -20.3], [2, -27.5], [3, -27], [4, -28], [5, -27.6], [6, -27.9], [7, -28.4]]) summit.stations[0].leads[lead].w.bias = bias;
  assert.deepEqual(checkHealth(summit, history, run(), NOW), [], "a 7 km/h step on a -27 km/h summit bias is within the relative limit");
});
