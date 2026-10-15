import assert from "node:assert/strict";
import test from "node:test";
import { addError, apply, fit, meanBias } from "../../src/mcp/learning.ts";

const day = (errors) => Object.fromEntries(Object.entries(errors).map(([m, list]) => [m, list.reduce((acc, e) => addError(acc, e), undefined)]));

test("fit ranks models by error and weights them by inverse mean squared error", () => {
  const days = Array.from({ length: 30 }, () => day({ a: [0.5, -0.5], b: [1, -1], c: [2, 2] }));
  const f = fit(days, ["a", "b", "c"], 20);
  assert.deepEqual(f.ranking, ["a", "b", "c"]);
  assert.ok(Math.abs(f.weights.a + f.weights.b + f.weights.c - 1) < 1e-9);
  assert.ok(Math.abs(f.weights.a / f.weights.b - 4) < 1e-9, "MSE 0.25 vs 1 gives a 4:1 weight ratio");
  assert.equal(f.bias.c, 2);
  assert.ok(Math.abs(f.blendBias - f.weights.c * 2) < 1e-9, "blend bias is the weighted sum of model biases");
  assert.equal(f.trainingDays, 30);
});

test("fit needs enough days for at least two models", () => {
  assert.equal(fit(Array.from({ length: 5 }, () => day({ a: [1], b: [1] })), ["a", "b"], 20), null);
  const onlyOne = [...Array.from({ length: 25 }, () => day({ a: [1] })), ...Array.from({ length: 5 }, () => day({ b: [1] }))];
  assert.equal(fit(onlyOne, ["a", "b"], 20), null);
});

test("apply implements each strategy, renormalises around missing models and falls back without a fit", () => {
  const f = fit(Array.from({ length: 30 }, () => day({ a: [1, 1], b: [-1, -3] })), ["a", "b"], 20);
  const fc = { a: 10, b: 12 };
  assert.equal(apply("current", f, fc, 11, ["a", "b"]), 11);
  assert.equal(apply("mean", f, fc, 11, ["a", "b"]), 11);
  assert.equal(apply("best_recent", f, fc, 11, ["a", "b"]), 10, "a has the lower MAE");
  const w = apply("weighted", f, fc, 11, ["a", "b"]);
  assert.ok(w > 10 && w < 11, "weighted toward the more accurate model");
  assert.ok(Math.abs(apply("weighted_bias", f, fc, 11, ["a", "b"]) - (w - f.blendBias)) < 1e-9);
  assert.equal(apply("weighted", f, { a: null, b: 12 }, 11, ["a", "b"]), 12, "a missing model is dropped and weights renormalised");
  assert.equal(apply("best_recent", f, { a: null, b: 12 }, 11, ["a", "b"]), 12, "falls to the next-ranked model");
  assert.equal(apply("weighted_bias", null, fc, 11, ["a", "b"]), 11, "no fit means today's forecast");
  assert.equal(apply("weighted_bias", f, { a: 0, b: 0 }, 0, ["a", "b"], true), 0, "rainfall is floored at zero and never bias-shifted");
});

test("current_bias removes today's forecast's own recent bias, never for rainfall", () => {
  const days = Array.from({ length: 25 }, () => addError(addError(undefined, 1.5), 0.5));
  const bias = meanBias(days, 20);
  assert.equal(bias, 1);
  assert.equal(meanBias(days.slice(0, 5), 20), null);
  assert.equal(apply("current_bias", null, {}, 12, ["a"], false, bias), 11);
  assert.equal(apply("current_bias", null, {}, 3, ["a"], true, bias), 3);
  assert.equal(apply("current_bias", null, {}, 12, ["a"], false, null), 12);
});

test("interpolated fits move smoothly between lead days and renormalise across different model sets", async () => {
  const { interpolateFits } = await import("../../src/mcp/learning.ts");
  const a = { ranking: [], mae: {}, bias: {}, weights: { x: 0.5, y: 0.5 }, blendBias: 1, trainingDays: 40 };
  const b = { ranking: [], mae: {}, bias: {}, weights: { x: 0.25, y: 0.25, z: 0.5 }, blendBias: 3, trainingDays: 30 };
  const mid = interpolateFits(a, b, 0.5);
  assert.deepEqual(mid.weights, { x: 0.375, y: 0.375, z: 0.25 });
  assert.equal(mid.blendBias, 2);
  assert.equal(mid.trainingDays, 30);
  assert.equal(interpolateFits(a, b, 0), a);
  assert.equal(interpolateFits(a, b, 1), b);
  assert.equal(interpolateFits(null, b, 0.4), b);
  assert.equal(interpolateFits(a, null, 0.4), a);
});

test("with a model missing, the bias removed is the reweighted blend's, not the full blend's", () => {
  // Models a and b forecast 2 °C too warm and too cold; equal weights, so the full blend has no bias.
  const f = { ranking: ["a", "b"], mae: {}, bias: { a: 2, b: -2 }, weights: { a: 0.5, b: 0.5 }, blendBias: 0, trainingDays: 30 };
  assert.equal(apply("weighted_bias", f, { a: 12, b: 8 }, null, ["a", "b"]), 10);
  assert.equal(apply("weighted_bias", f, { a: 12, b: null }, null, ["a", "b"]), 10, "a alone is 12, minus its own 2 °C bias");
  const noModelBias = { ...f, bias: {} };
  assert.equal(apply("weighted_bias", noModelBias, { a: 12, b: null }, null, ["a", "b"]), 12, "without per-model biases the blend bias is the best available");
});
