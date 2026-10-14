import assert from "node:assert/strict";
import test from "node:test";
import { brier, brierSkill, features, fitLogistic, logit, predict, reliability, sigmoid } from "../../src/mcp/rain-probability.ts";

test("Brier score, skill and reliability", () => {
  const perfect = [{ p: 1, wet: true }, { p: 0, wet: false }];
  assert.equal(brier(perfect), 0);
  const coin = [{ p: 0.5, wet: true }, { p: 0.5, wet: false }];
  assert.equal(brier(coin), 0.25);
  assert.equal(brierSkill(perfect, coin), 1);
  const rel = reliability([{ p: 0.05, wet: false }, { p: 0.08, wet: true }, { p: 0.95, wet: true }], 10);
  assert.equal(rel[0].n, 2);
  assert.equal(rel[0].observed, 0.5);
  assert.equal(rel[9].n, 1);
});

test("features describe model agreement, amounts and local climatology", () => {
  const f = features([0, 0.5, 2, 6], 1, 0.4);
  assert.equal(f[0], 1);
  assert.equal(f[1], 0.5, "two of four models reach 1 mm");
  assert.ok(Math.abs(f[2] - Math.log1p(2.125)) < 1e-12);
  assert.ok(Math.abs(f[3] - Math.log1p(6)) < 1e-12);
  assert.ok(Math.abs(f[4] - logit(0.4)) < 1e-12);
});

test("logistic regression recovers a known relationship and gives calibrated probabilities", () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const X = []; const y = [];
  for (let i = 0; i < 4000; i++) {
    const share = rand();
    const x = [1, share, 0, 0, 0];
    X.push(x);
    y.push(rand() < sigmoid(-2 + 4 * share) ? 1 : 0);
  }
  const w = fitLogistic(X, y, { ridge: 0 });
  assert.ok(Math.abs(w[0] + 2) < 0.3 && Math.abs(w[1] - 4) < 0.5, `weights ${w.map((v) => v.toFixed(2))}`);
  const samples = X.map((x, i) => ({ p: predict(w, x), wet: y[i] === 1 }));
  for (const bin of reliability(samples, 5).filter((b) => b.n > 200)) assert.ok(Math.abs(bin.forecast - bin.observed) < 0.06, "reliable within 6 points");
});
