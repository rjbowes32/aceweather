import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HERE_ACTIVE_KEY,
  HERE_CACHE_KEY,
  HERE_MAX_AGE_MS,
  bootHere,
  clearStoredHere,
  geolocationPlan,
  parseHereCache,
  hereFixWithDistrict,
  readStoredHere,
  roundHereDegrees,
  storeHereFix,
} from "../src/lib/aceweather/here-fix.ts";

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
  assert.match(app, /clearStoredHere/);
  assert.match(app, /roundHereDegrees/);
  assert.equal(app.includes("toFixed(5)"), false);
  assert.equal(app.includes("markHereActive(false)"), false);
});

function memoryStore() {
  const data = new Map();
  return {
    data,
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

test("a Here fix is stored at 3 decimal places, about 110 m", () => {
  const store = memoryStore();
  const now = 1_700_000_000_000;
  storeHereFix({ lat: 54.58642, lon: -1.437149, name: "Here", region: "Darlington", at: now }, store);
  const raw = JSON.parse(store.getItem(HERE_CACHE_KEY));
  assert.equal(raw.lat, 54.586);
  assert.equal(raw.lon, -1.437);
  assert.equal(roundHereDegrees(54.58642), 54.586);
  const read = readStoredHere(now, store);
  assert.equal(read.lat, 54.586);
  assert.equal(read.lon, -1.437);
  assert.equal(read.region, "Darlington");
});

test("turning Here off deletes the stored fix", () => {
  const store = memoryStore();
  storeHereFix({ lat: 54.586, lon: -1.437, name: "Here", region: "", at: Date.now() }, store);
  assert.equal(store.getItem(HERE_ACTIVE_KEY), "1");
  clearStoredHere(store);
  assert.equal(store.getItem(HERE_CACHE_KEY), null);
  assert.equal(store.getItem(HERE_ACTIVE_KEY), "0");
  assert.equal(readStoredHere(Date.now(), store), null);
});

test("a district label keeps the original Here timestamp", () => {
  const stored = { lat: 54.58642, lon: -1.43714, name: "Here", region: "", at: 1_700_000_000_000 };
  const next = hereFixWithDistrict(stored, 54.5864, -1.4371, "Darlington");
  assert.equal(next.at, stored.at);
  assert.equal(next.region, "Darlington");
  assert.equal(next.lat, 54.586);
  assert.equal(hereFixWithDistrict(stored, 51.5, -0.1, "London"), null);
  assert.equal(hereFixWithDistrict(null, stored.lat, stored.lon, "Darlington"), null);
});

test("a Here fix older than three days is dropped", () => {
  const store = memoryStore();
  const now = 1_700_000_000_000;
  storeHereFix({ lat: 54.58642, lon: -1.437, name: "Here", region: "Darlington", at: now - HERE_MAX_AGE_MS }, store);
  assert.equal(readStoredHere(now, store)?.region, "Darlington");
  storeHereFix({ lat: 54.586, lon: -1.437, name: "Here", region: "Darlington", at: now - HERE_MAX_AGE_MS - 1 }, store);
  assert.equal(readStoredHere(now, store), null);
  assert.equal(store.getItem(HERE_CACHE_KEY), null);
  assert.equal(store.getItem(HERE_ACTIVE_KEY), "0");
});
