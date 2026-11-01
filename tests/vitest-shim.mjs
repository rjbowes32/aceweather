// Tiny vitest-style expect over node:test, so ported AceAg tests run unchanged.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
export { describe, it };
class Any { constructor(t) { this.t = t; } }
const match = (actual, exp, path) => {
  if (exp instanceof Any) return assert.ok(exp.t === String ? typeof actual === "string" : exp.t === Number ? typeof actual === "number" : actual instanceof exp.t, `${path} is not ${exp.t.name}`);
  if (exp && typeof exp === "object") { assert.ok(actual && typeof actual === "object", `${path} is not an object`); for (const k of Object.keys(exp)) match(actual[k], exp[k], `${path}.${k}`); return; }
  assert.deepStrictEqual(actual, exp, path);
};
const make = (actual, neg = false) => {
  const ok = (cond, msg) => assert.ok(neg ? !cond : cond, (neg ? "not " : "") + msg);
  const api = {
    toBe: (e) => ok(Object.is(actual, e), `${JSON.stringify(actual)} toBe ${JSON.stringify(e)}`),
    toEqual: (e) => neg ? assert.notDeepStrictEqual(actual, e) : assert.deepStrictEqual(actual, e),
    toBeNull: () => ok(actual === null, `${JSON.stringify(actual)} toBeNull`),
    toBeGreaterThan: (e) => ok(actual > e, `${actual} > ${e}`),
    toBeLessThan: (e) => ok(actual < e, `${actual} < ${e}`),
    toContain: (e) => ok(actual?.includes?.(e), `${JSON.stringify(actual)} contains ${JSON.stringify(e)}`),
    toHaveLength: (e) => ok(actual?.length === e, `length ${actual?.length} is ${e}`),
    toMatchObject: (e) => match(actual, e, "value"),
  };
  if (!neg) api.not = make(actual, true);
  return api;
};
export const expect = Object.assign((a) => make(a), { any: (t) => new Any(t) });
