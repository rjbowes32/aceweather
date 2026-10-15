import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { unseal } from "../../src/mcp/sources/netatmo.ts";

const run = promisify(execFile);
const KEY = "test-state-key";

test("the daily job learns rainfall from public gauges and tracks anonymised citizen stations", { timeout: 120_000 }, async () => {
  const out = mkdtempSync(join(tmpdir(), "aceweather-learning-"));
  const env = {
    ...process.env, NETATMO_CLIENT_ID: "id", NETATMO_CLIENT_SECRET: "secret", NETATMO_REFRESH_TOKEN: "refresh-1", NETATMO_STATE_KEY: KEY,
    NETATMO_MOCK_STATE: join(out, "netatmo-mock-token"),
  };
  const job = () => run(process.execPath, ["--import", "./tests/mcp/learning-job-fetch.mjs", "scripts/learning/daily.mjs", "--out", out, "--max-netatmo", "3"], { env });
  const first = await job();
  assert.match(first.stdout, /rain gauges, 3 citizen/);
  const read = (name) => JSON.parse(readFileSync(join(out, name), "utf8"));

  const state = read("state.json");
  const gauges = Object.values(state.stations).filter((s) => ["ea_rain", "sepa_rain"].includes(s.meta.network));
  const ids = gauges.map((g) => g.meta.id);
  for (const id of ["ea:038179", "ea:046222", "sepa:S1", "sepa:S2"]) assert.ok(ids.includes(id), id);
  assert.equal(ids.filter((id) => ["ea:059793", "ea:05973"].includes(id)).length, 1, "two co-located EA gauges count once");
  const ea = state.stations["ea:038179"];
  const days = Object.values(ea.days).filter((d) => d.ro != null);
  assert.ok(days.length >= 25, `backfilled ${days.length} days from the four-week EA history`);

  const fits = read("fits.json");
  const fit = fits.stations.find((s) => s.meta.id === "ea:038179").leads["1"].r;
  assert.ok(Math.abs(fit.scale - 1 / 0.75) < 0.01, `scale ${fit.scale}: the four models forecast 0.75 of the gauge rain on average`);
  const rain = fits.recent_scores.rainfall["1"];
  assert.ok(rain.days > 0 && rain.learned_mae < rain.mean_mae, JSON.stringify(rain));

  const runInfo = read("run.json");
  assert.equal(runInfo.failed, 0, JSON.stringify(runInfo.errors));
  assert.equal(runInfo.netatmo.tracked, 3);
  assert.ok(runInfo.open_meteo_units > 0);
  const citizens = Object.values(state.stations).filter((s) => s.meta.network === "netatmo");
  assert.equal(citizens.length, 3);
  for (const c of citizens) {
    assert.match(c.meta.id, /^netatmo:[0-9a-f]{12}$/);
    assert.equal(c.meta.latitude, Math.round(c.meta.latitude * 100) / 100);
  }
  const published = readFileSync(join(out, "state.json"), "utf8") + readFileSync(join(out, "fits.json"), "utf8");
  assert.doesNotMatch(published, /70:ee:50/, "device ids never reach the public files");
  const registry = unseal(readFileSync(join(out, "netatmo.enc"), "utf8"), KEY);
  assert.equal(registry.refresh_token, "refresh-2", "the rotated refresh token is kept, sealed");
  assert.equal(Object.keys(registry.stations).length, 3);

  await job();
  assert.equal(unseal(readFileSync(join(out, "netatmo.enc"), "utf8"), KEY).refresh_token, "refresh-3", "the next run uses the stored token, not the stale secret");
  assert.equal(read("run.json").netatmo.error, null);
});
