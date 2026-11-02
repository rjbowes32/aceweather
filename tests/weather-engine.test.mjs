// Ported from AceAg packages/core/src/weather/weatherAgronomy.test.js (main 41ce0ffd).
import { describe, expect, it } from "./vitest-shim.mjs";

import { buildWeatherAgronomy } from "../src/lib/weather-engine/index.ts";

const BASE_TIME = Date.UTC(2026, 5, 9, 10, 0, 0);

function isoHour(offset) {
  return new Date(BASE_TIME + offset * 60 * 60 * 1000).toISOString().slice(0, 16);
}

function makeHourlyRows(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => ({
    time: isoHour(index),
    temperature: 18,
    precipitation: 0,
    precipProbability: 5,
    windSpeed: 8,
    windGusts: 12,
    cloudCover: 35,
    humidity: 62,
    dewPoint: 10,
    et0: 0.14,
    soilTemp0: 10,
    soilTemp6: 9,
    soilMoisture0to1: 0.24,
    soilMoisture1to3: 0.25,
    soilMoisture3to9: 0.27,
    soilMoisture9to27: 0.3,
    ...overrides,
  }));
}

function makeDailyRows(count, overrides = {}) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(BASE_TIME + index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return {
      time: date,
      tempMin: 10,
      tempMax: 20,
      tempMean: 15,
      rain: 0,
      et0: 3,
      ...overrides,
    };
  });
}

describe("portable buildWeatherAgronomy", () => {
  it("builds rich field-decision outputs from settled forecast rows", () => {
    const agronomy = buildWeatherAgronomy({
      current: {
        time: isoHour(0),
        temperature_2m: 18,
        relative_humidity_2m: 62,
        precipitation: 0,
        cloud_cover: 35,
        wind_speed_10m: 8,
        wind_gusts_10m: 12,
      },
      allHourlyRows: makeHourlyRows(72),
      dailyRows: makeDailyRows(14),
    });

    expect(agronomy.spraying.verdict).toBe("Go");
    expect(agronomy.spray.tone).toBe("go");
    expect(agronomy.access.label).toBe("Good");
    expect(agronomy.gdd.next14).toBeGreaterThan(100);
    expect(agronomy.frost.tone).toBe("go");
    expect(agronomy.soilWater.workLabel).toBe("Good");
    expect(agronomy.ops.rows).toHaveLength(4);
    expect(agronomy.disclaimer).toContain("heuristic");
  });

  it("flags wet, gusty, high-humidity weather as operational risk", () => {
    const agronomy = buildWeatherAgronomy({
      current: {
        time: isoHour(0),
        temperature_2m: 12,
        relative_humidity_2m: 96,
        precipitation: 0.6,
        cloud_cover: 20,
        wind_speed_10m: 22,
        wind_gusts_10m: 36,
      },
      allHourlyRows: makeHourlyRows(72, {
        temperature: 12,
        precipitation: 0.5,
        precipProbability: 80,
        windSpeed: 22,
        windGusts: 36,
        cloudCover: 20,
        humidity: 96,
        soilMoisture0to1: 0.46,
      }),
      dailyRows: makeDailyRows(10, {
        tempMin: 11,
        tempMax: 15,
        tempMean: 13,
        rain: 7,
      }),
    });

    expect(agronomy.spraying.verdict).toBe("Hold");
    expect(agronomy.spray.tone).toBe("risk");
    expect(agronomy.access.tone).toBe("risk");
    expect(agronomy.blight.tone).toBe("risk");
    expect(agronomy.disease.pressureTone).toBe("risk");
    expect(agronomy.soilWater.workTone).toBe("risk");
  });

  it("returns null when no normalized forecast rows are available", () => {
    expect(buildWeatherAgronomy()).toBeNull();
    expect(buildWeatherAgronomy({ hourlyRows: [], dailyRows: [] })).toBeNull();
  });

  it("accepts the hourlyRows compatibility input when allHourlyRows is absent", () => {
    const agronomy = buildWeatherAgronomy({
      current: { time: isoHour(0), wind_speed_10m: 8, wind_gusts_10m: 12 },
      hourlyRows: makeHourlyRows(48),
      dailyRows: makeDailyRows(7),
    });

    expect(agronomy.summary.fieldAccessLabel).toBe("Good");
    expect(agronomy.spraying.timeline).toHaveLength(48);
  });

  it("treats calm clear night conditions as an inversion hold", () => {
    const nightTime = new Date(Date.UTC(2026, 5, 9, 22, 0, 0)).toISOString().slice(0, 16);
    const rows = makeHourlyRows(24, { windSpeed: 2, windGusts: 3, cloudCover: 10 })
      .map((row, index) => ({
        ...row,
        time: new Date(Date.UTC(2026, 5, 9, 22 + index, 0, 0)).toISOString().slice(0, 16),
      }));
    const agronomy = buildWeatherAgronomy({
      current: {
        time: nightTime,
        temperature_2m: 14,
        relative_humidity_2m: 70,
        precipitation: 0,
        cloud_cover: 10,
        wind_speed_10m: 2,
        wind_gusts_10m: 3,
      },
      allHourlyRows: rows,
      dailyRows: makeDailyRows(7),
    });

    expect(agronomy.spraying.verdict).toBe("Hold");
    expect(agronomy.spraying.verdictReason).toBe("Temperature inversion risk");
    expect(agronomy.spraying.inversion.tone).toBe("risk");
  });

  it("counts a whole day's humid hours for Hutton, including hours already gone", () => {
    // Day starts 00:00; "now" is 15:00. Humid 00:00-07:00 only, so every
    // humid hour of each day is in the past by the afternoon.
    const day = (d) => Array.from({ length: 24 }, (_, h) => ({
      time: `2026-08-0${d}T${String(h).padStart(2, "0")}:00`,
      temperature: 14,
      humidity: h < 8 ? 95 : 70,
    }));
    const agronomy = buildWeatherAgronomy({
      current: { time: "2026-08-01T15:00" },
      allHourlyRows: [...day(1), ...day(2)],
      dailyRows: [{ time: "2026-08-01", tempMin: 11 }, { time: "2026-08-02", tempMin: 11 }],
    });
    expect(agronomy.blight.days[0].rh90).toBe(8);
    expect(agronomy.blight.status).toBe("Hutton period");
  });

  it("never fills in missing soil moisture: workability is unknown, not 30%", () => {
    const agronomy = buildWeatherAgronomy({
      current: { time: isoHour(0) },
      allHourlyRows: makeHourlyRows(48, { soilMoisture0to1: null }),
      dailyRows: makeDailyRows(7),
    });
    expect(agronomy.soilWater.workLabel).toBeNull();
    expect(agronomy.soilWater.surfMoist).toBeNull();
    expect(agronomy.access.moist).toBeNull();
    expect(agronomy.access.sub).not.toContain("%");
  });

  describe("spray rules: average wind decides, gusts caution", () => {
    const now = (over) => buildWeatherAgronomy({
      current: { time: isoHour(0), temperature_2m: 12, relative_humidity_2m: 62, precipitation: 0, cloud_cover: 60, wind_speed_10m: 10, wind_gusts_10m: 18, ...over.current },
      allHourlyRows: makeHourlyRows(48, { temperature: 12, windSpeed: 10, windGusts: 18, cloudCover: 60, ...over.rows }),
      dailyRows: makeDailyRows(7),
    }).spraying;

    it("sprays in humid air: low Delta-T no longer blocks", () => {
      const spraying = now({ current: { relative_humidity_2m: 96 }, rows: { humidity: 96 } });
      expect(spraying.deltaT).toBeLessThan(2);
      expect(spraying.deltaTLabel).toBe("Low");
      expect(spraying.verdict).toBe("Go");
      expect(spraying.timeline[0].tone).toBe("go");
    });

    it("gusts from 29 km/h (18 mph) are a caution, still sprayable", () => {
      const spraying = now({ current: { wind_gusts_10m: 33 }, rows: { windGusts: 33 } });
      expect(spraying.verdict).toBe("Caution");
      expect(spraying.gusty).toBe(true);
      expect(spraying.timeline[0].tone).toBe("warn");
      expect(spraying.nextWindow).toMatchObject({ start: expect.any(String), gusty: true, gustMax: 33 });
    });

    it("says when the window opens: now, or which day", () => {
      // Sprayable to the end of the 48 hours: it ends after the last hour, not at it.
      expect(now({}).nextWindow).toMatchObject({ startsNow: true, today: true, day: "", start: "10:00", end: "10:00", hours: 48 });
      // Too windy until 10:00 tomorrow (24 h on from 10:00 today).
      const rows = makeHourlyRows(48, { temperature: 12, windSpeed: 10, windGusts: 18, cloudCover: 60 })
        .map((row, i) => (i < 24 ? { ...row, windSpeed: 20 } : row));
      const spraying = buildWeatherAgronomy({ current: { time: isoHour(0), wind_speed_10m: 20 }, allHourlyRows: rows, dailyRows: makeDailyRows(7) }).spraying;
      expect(spraying.nextWindow).toMatchObject({ start: "10:00", startsNow: false, today: false, day: "tomorrow" });
    });

    it("holds an hour with no wind reading as unknown, not as an inversion", () => {
      const rows = makeHourlyRows(48, { temperature: 12, windSpeed: null, cloudCover: 10 }).map((row) => ({ ...row, time: row.time.replace(/T\d\d/, "T22") }));
      const spraying = buildWeatherAgronomy({ current: { time: rows[0].time }, allHourlyRows: rows, dailyRows: makeDailyRows(7) }).spraying;
      expect(spraying.verdictReason).toBe("Wind unknown");
    });

    it("night follows the sun: a winter evening holds, a light summer morning sprays", () => {
      // Calm (5 km/h) and clear: an inversion forms once the sun is down.
      const hourAt = (day, hour) => ({ time: `${day}T${hour}:00`, temperature: 12, humidity: 70, windSpeed: 5, windGusts: 9, cloudCover: 10, precipitation: 0, precipProbability: 0 });
      const verdict = (day, hour, sunrise, sunset) => buildWeatherAgronomy({
        current: { time: `${day}T${hour}:00` },
        allHourlyRows: [hourAt(day, hour)],
        dailyRows: [{ time: day, sunrise: `${day}T${sunrise}`, sunset: `${day}T${sunset}` }],
      }).spraying;
      expect(verdict("2026-11-20", "17", "07:40", "16:05").verdictReason).toBe("Temperature inversion risk");
      expect(verdict("2026-06-20", "06", "04:40", "21:40").verdict).toBe("Go");
      expect(verdict("2026-06-20", "22", "04:40", "21:40").verdict).toBe("Hold");
    });

    it("gusts from 40 km/h (25 mph) hold", () => {
      const spraying = now({ current: { wind_gusts_10m: 41 }, rows: { windGusts: 41 } });
      expect(spraying.verdict).toBe("Hold");
      expect(spraying.verdictReason).toBe("Gusts too strong");
      expect(spraying.nextWindow).toBeNull();
    });

    it("average wind over 15 km/h (9 mph) holds whatever the gusts", () => {
      const spraying = now({ current: { wind_speed_10m: 17, wind_gusts_10m: 20 }, rows: { windSpeed: 17, windGusts: 20 } });
      expect(spraying.verdict).toBe("Hold");
      expect(spraying.verdictReason).toBe("Too windy for drift control");
    });

    it("the verdict and the hour bar agree on every hour", () => {
      for (const over of [{ wind_gusts_10m: 21 }, { wind_gusts_10m: 30 }, { wind_speed_10m: 2 }, { relative_humidity_2m: 30 }]) {
        const rows = { windGusts: over.wind_gusts_10m ?? 18, windSpeed: over.wind_speed_10m ?? 10, humidity: over.relative_humidity_2m ?? 62 };
        const spraying = now({ current: over, rows });
        const tone = { Go: "go", Caution: "warn", Hold: "risk" }[spraying.verdict];
        expect(spraying.timeline[0].tone).toBe(tone);
      }
    });
  });

  it("keeps heuristic advice explicitly non-authoritative", () => {
    const agronomy = buildWeatherAgronomy({ hourlyRows: makeHourlyRows(24) });
    expect(agronomy.disclaimer).toContain("not validated crop advice");
    expect(agronomy.disclaimer).toContain("Check local observations");
  });
});
