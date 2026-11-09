import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  HERE_NAME,
  MAX_SAVED,
  addSaved,
  classifyQuery,
  forecastNotice,
  moveSaved,
  parseSaved,
  placeKey,
  rankPlaces,
  regionFromGeocode,
  removeSaved,
  renameSaved,
} from "../src/lib/aceweather/places.ts";
import { searchLocations } from "../src/lib/aceweather/open-meteo.ts";

const place = (name, region, lat, lon, extra = {}) => ({
  name, region, country: "United Kingdom", countryCode: "GB", lat, lon, elev: null, tz: "Europe/London", ...extra,
});

test("classifies full postcodes, outward codes and place names", () => {
  assert.deepEqual(classifyQuery("YO42 1NS"), { kind: "full-postcode", compact: "YO421NS" });
  assert.deepEqual(classifyQuery("yo421ns"), { kind: "full-postcode", compact: "YO421NS" });
  assert.deepEqual(classifyQuery("SW1A 1AA"), { kind: "full-postcode", compact: "SW1A1AA" });
  assert.deepEqual(classifyQuery("M1 1AE"), { kind: "full-postcode", compact: "M11AE" });
  assert.deepEqual(classifyQuery("YO42"), { kind: "outcode", compact: "YO42" });
  assert.deepEqual(classifyQuery("SW1A"), { kind: "outcode", compact: "SW1A" });
  assert.equal(classifyQuery("Boston").kind, "place");
  assert.equal(classifyQuery("Driffield").kind, "place");
  assert.equal(classifyQuery("a"), null);
});

test("British places rank ahead of the rest and keep their own order", () => {
  const rows = rankPlaces([
    { name: "Boston", country: "United States", countryCode: "US" },
    { name: "Boston", country: "United Kingdom", countryCode: "GB" },
    { name: "Boston", country: "United States", countryCode: "US" },
  ]);
  assert.equal(rows[0].countryCode, "GB");
  assert.equal(rows[1].countryCode, "US");
  assert.equal(rows.length, 3);
});

test("county comes from the district, not the country", () => {
  assert.equal(regionFromGeocode({ country_code: "GB", country: "United Kingdom", admin1: "England", admin2: "East Yorkshire" }), "East Yorkshire");
  assert.equal(regionFromGeocode({ country_code: "GB", country: "United Kingdom", admin1: "England", admin2: "Gloucestershire" }), "Gloucestershire");
  assert.equal(regionFromGeocode({ country_code: "US", country: "United States", admin1: "Massachusetts" }), "Massachusetts");
});

test("rename, delete and reorder keep identity and an empty list stays empty", () => {
  assert.deepEqual(parseSaved([]), []);
  assert.deepEqual(parseSaved(null), []);
  const first = place("North field", "East Yorkshire", 53.93, -0.78);
  const second = place("Home", "North Yorkshire", 53.96, -1.08);
  let list = addSaved([], first).places;
  list = addSaved(list, second).places;
  assert.deepEqual(list.map((item) => item.name), ["Home", "North field"]);
  const homeId = placeKey(list[0]);
  const fieldId = placeKey(list[1]);
  list = renameSaved(list, fieldId, "Marsh");
  assert.equal(list.find((item) => placeKey(item) === fieldId).name, "Marsh");
  list = moveSaved(list, fieldId, homeId);
  assert.equal(list[0].name, "Marsh");
  list = removeSaved(list, homeId);
  assert.deepEqual(list.map((item) => item.name), ["Marsh"]);
});

test("a full list refuses a new place instead of dropping one", () => {
  let list = [];
  for (let i = 0; i < MAX_SAVED; i += 1) list = addSaved(list, place(`Field ${i}`, "East Yorkshire", 54, -1 + i / 100)).places;
  assert.equal(list.length, MAX_SAVED);
  const blocked = addSaved(list, place("One more", "East Yorkshire", 51, 0));
  assert.equal(blocked.atLimit, true);
  assert.equal(blocked.places.length, MAX_SAVED);
  assert.equal(blocked.places.some((item) => item.name === "One more"), false);
  assert.equal(blocked.places.some((item) => item.name === "Field 0"), true);
});

test("overview is loading or offline only while the forecast is missing", () => {
  assert.equal(forecastNotice("loading", false), "loading");
  assert.equal(forecastNotice("refreshing", false), "loading");
  assert.equal(forecastNotice("error", false), "offline");
  assert.equal(forecastNotice("error", true), null);
  assert.equal(forecastNotice("live", true), null);
});

test("search sends a full postcode and an outward code to postcodes.io", async () => {
  const calls = [];
  const original = global.fetch;
  global.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("/postcodes/YO421NS")) {
      return new Response(JSON.stringify({
        result: { postcode: "YO42 1NS", latitude: 53.92, longitude: -0.81, admin_district: "East Riding of Yorkshire" },
      }));
    }
    if (String(url).includes("/outcodes/YO42")) {
      return new Response(JSON.stringify({
        result: { outcode: "YO42", latitude: 53.92, longitude: -0.79, admin_district: ["East Riding of Yorkshire"] },
      }));
    }
    return new Response("no", { status: 404 });
  };
  try {
    const full = await searchLocations("YO42 1NS");
    assert.equal(full[0].name, "YO42 1NS");
    assert.equal(full[0].region, "East Riding of Yorkshire");
    assert.equal(full[0].countryCode, "GB");
    const out = await searchLocations("YO42");
    assert.equal(out[0].name, "YO42");
    assert.equal(out[0].region, "East Riding of Yorkshire");
    assert.ok(calls.some((url) => url.includes("api.postcodes.io/postcodes/YO421NS")));
    assert.ok(calls.some((url) => url.includes("api.postcodes.io/outcodes/YO42")));
  } finally {
    global.fetch = original;
  }
});

test("Boston search puts Lincolnshire before the American towns and keeps the county", async () => {
  const original = global.fetch;
  global.fetch = async (url) => {
    assert.match(String(url), /geocoding-api\.open-meteo\.com/);
    assert.match(String(url), /count=40/);
    return new Response(JSON.stringify({
      results: [
        { name: "Boston", country: "United States", country_code: "US", admin1: "Massachusetts", latitude: 42.3, longitude: -71.06, timezone: "America/New_York" },
        { name: "Boston", country: "United States", country_code: "US", admin1: "New York", latitude: 42.6, longitude: -78.7, timezone: "America/New_York" },
        { name: "Boston", country: "United Kingdom", country_code: "GB", admin1: "England", admin2: "Lincolnshire", latitude: 52.97, longitude: -0.02, timezone: "Europe/London" },
      ],
    }));
  };
  try {
    const rows = await searchLocations("Boston");
    assert.equal(rows[0].region, "Lincolnshire");
    assert.equal(rows[0].countryCode, "GB");
    assert.equal(rows[1].region, "Massachusetts");
    assert.equal(rows[2].region, "New York");
  } finally {
    global.fetch = original;
  }
});

test("two Driffields keep different counties", async () => {
  const original = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    results: [
      { name: "Driffield", country: "United Kingdom", country_code: "GB", admin1: "England", admin2: "East Yorkshire", latitude: 54.0, longitude: -0.44, timezone: "Europe/London" },
      { name: "Driffield", country: "United Kingdom", country_code: "GB", admin1: "England", admin2: "Gloucestershire", latitude: 51.7, longitude: -1.9, timezone: "Europe/London" },
    ],
  }));
  try {
    const rows = await searchLocations("Driffield");
    assert.deepEqual(rows.map((row) => row.region), ["East Yorkshire", "Gloucestershire"]);
  } finally {
    global.fetch = original;
  }
});

test("a failed place search throws and a missing postcode is an empty list", async () => {
  const original = global.fetch;
  global.fetch = async () => { throw new Error("offline"); };
  try {
    await assert.rejects(() => searchLocations("Boston"));
  } finally {
    global.fetch = original;
  }
  global.fetch = async () => new Response(JSON.stringify({ error: "Postcode not found" }), { status: 404 });
  try {
    assert.deepEqual(await searchLocations("YO42 1NS"), []);
  } finally {
    global.fetch = original;
  }
});

test("the header search replaced the sheet, the Load button and the GPS subtitle", () => {
  const app = readFileSync(new URL("../src/components/aceweather-x/app.tsx", import.meta.url), "utf8");
  const menu = readFileSync(new URL("../src/components/aceweather-x/place-menu.tsx", import.meta.url), "utf8");
  assert.equal(app.includes("SEED_SAVED"), false);
  assert.equal(app.includes("Current location"), false);
  assert.equal(app.includes("GPS off"), false);
  assert.equal(app.includes("awx-location-sheet"), false);
  assert.equal(menu.includes(">Load<"), false);
  assert.match(app, /forecastNotice/);
  assert.match(menu, /HERE_NAME/);
  assert.equal(HERE_NAME, "Here");
});
