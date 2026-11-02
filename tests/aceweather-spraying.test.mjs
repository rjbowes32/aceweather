// AceWeather's agronomy now takes its spray answer from the shared engine:
// the verdict and the hour bar follow one rule (AceAg rules, Rob 28-29 Oct 2026).
import assert from "node:assert/strict";
import test from "node:test";
import { buildAgronomy } from "../src/lib/aceweather/agronomy.ts";
import { overlayUkmoPayload } from "../src/lib/weather-engine/index.ts";

export function scenario(hour, over = {}) {
  const N = 72;
  const day = (i) => `2026-11-0${2 + Math.floor((hour + i) / 24)}`;
  const time = Array.from({ length: N }, (_, i) => `${day(i)}T${String((hour + i) % 24).padStart(2, "0")}:00`);
  const fill = (v) => Array(N).fill(v);
  const h = {
    time, temperature_2m: fill(over.t ?? 12), relative_humidity_2m: fill(over.rh ?? 75), precipitation: fill(over.p ?? 0),
    precipitation_probability: fill(over.pp ?? 10), wind_speed_10m: fill(over.w ?? 10), wind_gusts_10m: fill(over.g ?? 16),
    cloud_cover: fill(over.cl ?? 60), et0_fao_evapotranspiration: fill(0.05), soil_moisture_0_to_1cm: fill(0.3), soil_temperature_6cm: fill(8),
  };
  const d = { time: ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"], sunrise: ["2026-11-02T06:58", "2026-11-03T07:00", "2026-11-04T07:02", "2026-11-05T07:04"], sunset: ["2026-11-02T16:30", "2026-11-03T16:28", "2026-11-04T16:26", "2026-11-05T16:24"], temperature_2m_max: fill(14), temperature_2m_min: fill(6), precipitation_sum: fill(0) };
  const cur = { temperature_2m: h.temperature_2m[0], relative_humidity_2m: h.relative_humidity_2m[0], wind_speed_10m: h.wind_speed_10m[0], wind_gusts_10m: h.wind_gusts_10m[0], precipitation: 0 };
  return [h, d, 0, 0, cur];
}

const spray = (...a) => buildAgronomy(...scenario(...a)).spraying;

test("breezy day: gusts of 25 km/h are sprayable (old rule held from 22)", () => {
  const s = spray(11, { g: 25 });
  assert.equal(s.verdict, "Go");
  assert.equal(s.timeline[0].tone, "go");
});

test("gusts from 29 km/h are a caution, from 40 a hold, in verdict and bar alike", () => {
  assert.deepEqual([spray(11, { g: 32 }).verdict, spray(11, { g: 32 }).timeline[0].tone], ["Caution", "warn"]);
  assert.deepEqual([spray(11, { g: 42 }).verdict, spray(11, { g: 42 }).timeline[0].tone], ["Hold", "risk"]);
});

test("cold showery morning holds: 3 °C and a 50% rain chance", () => {
  assert.equal(spray(9, { t: 3 }).verdictReason, "Too cold");
  assert.equal(spray(9, { pp: 50 }).verdictReason, "Rain likely");
});

test("low Delta-T does not block and reads green", () => {
  const s = spray(11, { rh: 97 });
  assert.equal(s.verdict, "Go");
  assert.equal(s.deltaTTone, "go");
});

test("night follows sunset: 17:00 on a clear calm November evening is an inversion hold", () => {
  assert.equal(spray(17, { w: 5, cl: 10 }).verdictReason, "Temperature inversion risk");
});

test("missing wind holds as unknown", () => {
  const [h, d, ni, di, cur] = scenario(11);
  h.wind_speed_10m = h.wind_speed_10m.map(() => null);
  delete cur.wind_speed_10m;
  assert.equal(buildAgronomy(h, d, ni, di, cur).spraying.verdictReason, "Wind unknown");
});

test("UKMO overlay replaces atmospheric fields only and ignores a mismatched payload", () => {
  const base = { hourly: { time: ["a", "b"], wind_speed_10m: [5, 6], precipitation_probability: [10, 20] }, current: { wind_speed_10m: 5 } };
  const ukmo = { hourly: { time: ["a", "b"], wind_speed_10m: [9, null], precipitation_probability: [99, 99] }, current: { wind_speed_10m: 9 } };
  const merged = overlayUkmoPayload(base, ukmo);
  assert.deepEqual(merged.hourly.wind_speed_10m, [9, 6]);
  assert.deepEqual(merged.hourly.precipitation_probability, [10, 20]);
  assert.equal(merged.current.wind_speed_10m, 9);
  assert.equal(overlayUkmoPayload(base, { hourly: { time: ["x"] } }), base);
  assert.equal(overlayUkmoPayload(base, null), base);
});

import { deltaTBand, LOW_DELTA_T_TONE, RAIN_FAST_MM, RAIN_ON_CANOPY_MM, rangeText, sprayRuns, mainLimit, ENGINE_TIME_ZONE } from "../src/lib/weather-engine/index.ts";

test("Delta-T has four segments and one reading; low stays green and never cautions an hour", () => {
  assert.deepEqual([0.4, 5, 9, 11, null].map((v) => deltaTBand(v).segment), ["low", "ideal", "high", "too-high", "unknown"]);
  assert.equal(LOW_DELTA_T_TONE, "go");
  assert.equal(deltaTBand(0.4).tone, "go");
  const s = spray(11, { rh: 99 });
  assert.equal(s.deltaTSegment, "low");
  assert.ok(s.timeline.slice(0, 5).every((h) => h.tone === "go"));
});

test("rain thresholds are named, and light rain is not reported as dry", () => {
  assert.equal(RAIN_ON_CANOPY_MM, 0.1);
  assert.equal(RAIN_FAST_MM, 0.2);
  const s = spray(11, { p: 0.15 });
  assert.equal(s.timeline[1].reason, "Rain on the canopy");
  assert.equal(s.rainFast, null);
  assert.equal(s.lightRainOnly, true);
  assert.equal(spray(11).lightRainOnly, false);
});

test("spray window reads in UK time with day words and no zone label", () => {
  assert.equal(ENGINE_TIME_ZONE, "Europe/London");
  const now = Date.UTC(2026, 10, 2, 10, 0);
  assert.equal(rangeText(Date.UTC(2026, 10, 2, 17), Date.UTC(2026, 10, 3, 3), now), "today 17:00 – tomorrow 03:00");
  assert.equal(rangeText(Date.UTC(2026, 10, 2, 11), Date.UTC(2026, 10, 2, 14), now), "today 11:00–14:00");
  // Summer: 09:00 UTC is 10:00 in London.
  assert.equal(rangeText(Date.UTC(2026, 6, 1, 9), Date.UTC(2026, 6, 1, 12), Date.UTC(2026, 6, 1, 8)), "today 10:00–13:00");
});

test("hours with the place's UTC offset carry their real instant", () => {
  const [h, d, ni, di, cur] = scenario(11);
  const s = buildAgronomy(h, d, ni, di, cur, 0).spraying;
  assert.equal(s.timeline[0].epoch, Date.UTC(2026, 10, 2, 11));
  assert.equal(s.nextWindow.startEpoch, Date.UTC(2026, 10, 2, 11));
});

test("runs group the 48 h bar with a reason each; the main limit is the commonest", () => {
  const s = spray(11, { w: 20 });
  const runs = sprayRuns(s.timeline);
  assert.equal(s.nextWindow, null);
  assert.ok(runs.every((r) => r.tone !== "go"));
  assert.equal(runs[0].limit, "wind");
  assert.equal(mainLimit(s.timeline), "wind");
});

test("UKMO overlay only takes finite numbers", () => {
  const base = { hourly: { time: ["a", "b"], wind_speed_10m: [5, 6] }, current: { wind_speed_10m: 5 } };
  const ukmo = { hourly: { time: ["a", "b"], wind_speed_10m: ["9", Number.NaN] }, current: { wind_speed_10m: "x" } };
  const merged = overlayUkmoPayload(base, ukmo);
  assert.deepEqual(merged.hourly.wind_speed_10m, [5, 6]);
  assert.equal(merged.current.wind_speed_10m, 5);
});

test("one source for the current hour: Hold now means the bar's first hour is Hold and the window starts later", () => {
  const [h, d, ni, di, cur] = scenario(11, {}); // forecast hours are fine to spray
  cur.wind_speed_10m = 22; // but conditions now are too windy
  const s = buildAgronomy(h, d, ni, di, cur, 0).spraying;
  assert.equal(s.verdict, "Hold");
  assert.equal(s.timeline[0].tone, "risk");
  assert.equal(s.timeline[0].reason, s.verdictReason);
  assert.equal(s.timeline[0].wind, 22);
  assert.equal(s.nextWindow.startsNow, false);
  assert.equal(s.nextWindow.start, "12:00");
  assert.equal(sprayRuns(s.timeline)[0].tone, "risk");
});

test("range day rules: same day without spaces, cross-day with both days, 00:00 ends its start day", () => {
  const now = Date.UTC(2026, 10, 2, 10, 0);
  assert.equal(rangeText(Date.UTC(2026, 10, 2, 15), Date.UTC(2026, 10, 3, 3), now), "today 15:00 – tomorrow 03:00");
  assert.equal(rangeText(Date.UTC(2026, 10, 2, 21), Date.UTC(2026, 10, 3, 0), now), "today 21:00–00:00");
  assert.equal(rangeText(Date.UTC(2026, 10, 3, 5), Date.UTC(2026, 10, 3, 9), now, false), "05:00–09:00");
});
