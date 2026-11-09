import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bootHere, geolocationPlan, parseHereCache } from "../src/lib/aceweather/here-fix.ts";

const cache = { lat: 54.58642, lon: -1.43714, name: "Here", region: "Darlington", at: 1_700_000_000_000 };

function geo() {
  const calls = { getCurrentPosition: 0, watchPosition: 0 };
  return {
    calls,
    getCurrentPosition() { calls.getCurrentPosition += 1; },
    watchPosition() { calls.watchPosition += 1; return 1; },
  };
}

test("opening the app does not ask for location when permission is unknown or still a prompt", () => {
  for (const permission of ["unknown", "prompt", "denied"]) {
    const probe = geo();
    const result = bootHere({ hereActive: true, cache, permission, geo: probe });
    assert.equal(probe.calls.getCurrentPosition, 0, permission);
    assert.equal(probe.calls.watchPosition, 0, permission);
    assert.equal(result.requested, 0);
    assert.equal(result.watched, 0);
    assert.equal(result.shown?.region, "Darlington");
  }
});

test("a granted permission may refresh once on launch, still without a watch", () => {
  const probe = geo();
  const result = bootHere({ hereActive: true, cache, permission: "granted", geo: probe });
  assert.equal(probe.calls.getCurrentPosition, 1);
  assert.equal(probe.calls.watchPosition, 0);
  assert.equal(result.requested, 1);
});

test("launch with a saved town does not request a fix", () => {
  const probe = geo();
  const result = bootHere({ hereActive: false, cache, permission: "granted", geo: probe });
  assert.equal(result.requested, 0);
  assert.equal(result.shown, null);
  assert.equal(probe.calls.watchPosition, 0);
});

test("Here is a tap, and refresh only asks again while Here is showing", () => {
  assert.equal(geolocationPlan({ type: "tap-here" }), "request");
  assert.equal(geolocationPlan({ type: "refresh", hereActive: true }), "request");
  assert.equal(geolocationPlan({ type: "refresh", hereActive: false }), "none");
  assert.equal(geolocationPlan({ type: "load", hereActive: true, permission: "unknown" }), "none");
});

test("a broken cache is ignored", () => {
  assert.equal(parseHereCache(null), null);
  assert.equal(parseHereCache({ lat: "nope" }), null);
  assert.equal(parseHereCache(cache)?.region, "Darlington");
});

test("the app no longer watches position or starts GPS on load", () => {
  const app = readFileSync(new URL("../src/components/aceweather-x/app.tsx", import.meta.url), "utf8");
  const hint = readFileSync(new URL("../src/components/aceweather-x/setup-hint.tsx", import.meta.url), "utf8");
  assert.equal(app.includes("watchPosition"), false);
  assert.equal(hint.includes("getCurrentPosition"), false);
  assert.equal(hint.includes("watchPosition"), false);
  assert.equal(app.split("getCurrentPosition").length - 1, 1);
  assert.match(app, /geolocationPlan/);
  assert.match(app, /readStoredHere/);
  assert.match(app, /storeHereFix/);
});
