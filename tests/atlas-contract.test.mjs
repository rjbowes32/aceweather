import assert from "node:assert/strict";
import test from "node:test";

import { classifyAtlasTrust, isAtlasPayload } from "../src/app/atlas/types.ts";

function fixture() {
  return {
    schema_version: "atlas.v1",
    name: "UK Crop Weather Atlas",
    edition: 2026,
    updated: "2026-08-28",
    status: "provisional",
    generated_at: "2026-08-30T07:00:00+00:00",
    freshness: {
      snapshot: { state: "provisional", as_of: "2026-08-28" },
      recent_rain: { state: "current", as_of: "2026-08-29" },
    },
    headline: {
      england_july_rain_mm: 6.5,
      england_july_rain_context: "driest July on record",
      england_august_rain_pct_lta: 34,
      england_august_rain_to_date: "25 August 2026",
      reservoir_storage_pct: 59.8,
      reservoir_context: "below average",
      wheat_yield_t_ha: 6.8,
      wheat_vs_10y_pct: -13.9,
    },
    drought: {
      meteorological: { status: "exceptional" },
      agricultural: { status: "regional" },
      hydrological: { status: "serious" },
      measured_yield_impact: { status: "mixed" },
      england_area_pct: 71,
      river_flows_below_normal_or_lower_pct: 93,
      groundwater_exceptionally_low_sites: 2,
      groundwater_context: "Two sites exceptionally low.",
      abstraction_restrictions: 1412,
    },
    crops: [{ crop: "wheat", yield_t_ha: 6.8, ten_year_avg_t_ha: 7.9, anomaly_pct: -13.9, harvested_pct: 94 }],
    wheat_genetics: { benchmark: "treated controls", "2026_t_ha": 9.83, five_year_mean_t_ha: 11.05, anomaly_pct: -11 },
    forage: [{ location: "Somerset", grass_growth_kg_dm_ha_day: 5 }],
    recent_rain: {
      available: true,
      date_range: { start: "2026-08-01", end: "2026-08-29", days: 29 },
      locations: [{ location: "Sleaford", rain_mm: 66.2 }],
    },
    caveats: { "2026_yields": "Provisional.", oilseed_rape: "Use care." },
    sources: { aceweather: "https://www.aceweather.app/" },
    source_details: [{ key: "aceweather", label: "AceWeather", url: "https://www.aceweather.app/", licence: "AceWeather", observed_at: null }],
  };
}

test("accepts a valid atlas.v1 payload", () => {
  assert.equal(isAtlasPayload(fixture()), true);
});

test("rejects an unsupported schema", () => {
  const value = fixture();
  value.schema_version = "atlas.v2";
  assert.equal(isAtlasPayload(value), false);
});

test("rejects a missing nested drought field", () => {
  const value = fixture();
  delete value.drought.hydrological;
  assert.equal(isAtlasPayload(value), false);
});

test("accepts an explicitly unavailable rain layer", () => {
  const value = fixture();
  value.freshness.recent_rain = { state: "unavailable", as_of: null };
  value.recent_rain = { available: false, message: "Unavailable" };
  assert.equal(isAtlasPayload(value), true);
});

test("rejects available rain without usable locations", () => {
  const value = fixture();
  value.recent_rain.locations = [];
  assert.equal(isAtlasPayload(value), false);
});

test("marks an explicitly cached response as cached", () => {
  assert.equal(classifyAtlasTrust({ cacheSource: "cache", cacheAgeMs: 0, generatedAgeMs: 0, repeatedSnapshot: false }), "cached");
});

test("marks a repeated snapshot as cached when legacy workers omit cache headers", () => {
  assert.equal(classifyAtlasTrust({ cacheSource: null, cacheAgeMs: 0, generatedAgeMs: 0, repeatedSnapshot: true }), "cached");
});

test("marks a recent network response as fresh", () => {
  assert.equal(classifyAtlasTrust({ cacheSource: "network", cacheAgeMs: 1000, generatedAgeMs: 1000, repeatedSnapshot: false }), "fresh");
});
