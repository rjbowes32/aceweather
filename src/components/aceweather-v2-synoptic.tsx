/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-unused-vars */
// @ts-nocheck
'use client';

import { useEffect, useState } from "react";

/* AceWeather v2 — data layer + Open-Meteo fetch
   Bishopton, Stockton-on-Tees · 54.5435° N · 1.4373° W · ~30 m elev
   Sample data shaped to mirror Open-Meteo's response. */

const AW_LOCATION = {
  name: "Bishopton",
  region: "Stockton-on-Tees",
  country: "United Kingdom",
  lat: 54.5435,
  lon: -1.4373,
  elev: 30,
  tz: "Europe/London",
};

// Generate 48 hours starting "now" (15:00 BST on Wed 14 May 2026 in this prototype)
const _h = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

// Hourly arrays — 48 hours starting from hour -3 (so the meteogram shows context)
const AW_FALLBACK = {
  generated_at: "2026-05-14T15:00+01:00",
  current: {
    time: "15:00",
    temperature_2m: 13.8,
    apparent_temperature: 12.1,
    relative_humidity_2m: 71,
    dew_point_2m: 8.6,
    pressure_msl: 1011.2,
    cloud_cover: 64,
    wind_speed_10m: 14.2,
    wind_gusts_10m: 24.6,
    wind_direction_10m: 248,
    precipitation: 0.0,
    visibility_km: 22.4,
    uv_index: 4.2,
    weather_code: 3, // overcast
    is_day: 1,
  },
  hourly: {
    // 48 hourly samples spanning "yesterday 12:00" → "tomorrow 12:00"
    time: _h(48, (i) => {
      const base = new Date("2026-05-13T12:00+01:00").getTime();
      return new Date(base + i * 3600 * 1000).toISOString().slice(0, 16);
    }),
    temperature_2m: [
      // y'day (12-23) — peak 14.2 mid-afternoon then cooling
      14.0, 14.2, 14.1, 13.6, 12.8, 11.8, 10.9, 10.2, 9.6, 9.1, 8.6, 8.2,
      // today (0-23) — low 6.8 at 04:00, peak 14.4 at 15:00
      7.6, 7.2, 6.9, 6.8, 6.9, 7.3, 8.1, 9.2, 10.5, 11.8, 12.9, 13.6,
      14.0, 14.2, 14.4, 14.3, 14.0, 13.4, 12.6, 11.7, 10.8, 9.9, 9.2, 8.6,
      // tomorrow (0-11) — rain event, cooler
      8.1, 7.7, 7.4, 7.2, 7.1, 7.3, 7.8, 8.6, 9.4, 10.2, 10.8, 11.2,
    ],
    precipitation: [
      0, 0, 0, 0.2, 0.4, 0.1, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.3,
      0.4, 0.2, 0.1, 0, 0, 0.2, 0.6, 0.8, 0.5, 0.3, 0.2, 0.1,
      // tomorrow morning — proper rain
      0.4, 0.9, 1.6, 2.4, 3.1, 2.8, 1.9, 1.2, 0.6, 0.3, 0.2, 0.1,
    ],
    precipitation_probability: [
      10, 12, 18, 35, 42, 28, 14, 8, 6, 5, 6, 8,
      10, 12, 15, 18, 22, 24, 22, 18, 15, 24, 36, 48,
      52, 44, 32, 22, 26, 38, 56, 68, 58, 48, 38, 30,
      48, 64, 78, 86, 88, 86, 80, 72, 60, 50, 40, 32,
    ],
    wind_speed_10m: [
      11, 12, 13, 14, 14, 13, 11, 9, 8, 7, 8, 9,
      10, 11, 12, 12, 11, 10, 9, 10, 12, 14, 15, 14,
      14, 14, 15, 16, 16, 15, 14, 13, 12, 11, 10, 10,
      11, 13, 16, 19, 22, 24, 25, 24, 22, 19, 17, 15,
    ],
    wind_gusts_10m: [
      18, 19, 22, 23, 23, 21, 18, 15, 13, 12, 13, 15,
      17, 19, 20, 21, 19, 17, 15, 17, 20, 24, 26, 25,
      24, 24, 26, 28, 28, 26, 24, 22, 20, 18, 17, 17,
      19, 22, 28, 33, 38, 42, 44, 42, 38, 33, 29, 26,
    ],
    wind_direction_10m: [
      240, 244, 246, 248, 250, 252, 254, 256, 258, 256, 254, 250,
      248, 246, 248, 250, 252, 254, 256, 258, 260, 262, 264, 264,
      262, 258, 256, 254, 254, 256, 258, 260, 258, 254, 250, 248,
      244, 240, 236, 232, 228, 226, 224, 222, 222, 224, 228, 232,
    ],
    cloud_cover: [
      80, 78, 72, 88, 92, 84, 60, 40, 28, 20, 18, 22,
      35, 48, 55, 62, 58, 50, 42, 50, 58, 66, 72, 74,
      78, 80, 78, 70, 62, 68, 80, 88, 82, 74, 66, 58,
      68, 82, 92, 96, 100, 100, 98, 92, 80, 68, 56, 48,
    ],
    relative_humidity_2m: [
      72, 70, 68, 74, 78, 80, 82, 84, 86, 88, 88, 86,
      82, 84, 88, 90, 90, 86, 80, 74, 68, 64, 62, 64,
      66, 68, 70, 74, 78, 82, 86, 88, 86, 82, 80, 78,
      82, 86, 90, 92, 94, 94, 92, 88, 82, 76, 72, 68,
    ],
    pressure_msl: [
      1014, 1014, 1013, 1013, 1013, 1013, 1013, 1014, 1014, 1014, 1013, 1013,
      1012, 1012, 1012, 1012, 1012, 1012, 1011, 1011, 1011, 1011, 1011, 1011,
      1011, 1011, 1011, 1010, 1010, 1010, 1009, 1009, 1008, 1008, 1007, 1007,
      1006, 1005, 1004, 1003, 1002, 1001, 1001, 1001, 1002, 1003, 1004, 1005,
    ],
    soil_temperature_0cm: [
      14.6, 15.1, 15.3, 14.2, 12.8, 11.6, 10.4, 9.6, 9.0, 8.6, 8.2, 8.0,
      7.8, 7.4, 7.0, 6.8, 6.8, 7.0, 7.8, 9.4, 11.0, 12.6, 13.8, 14.6,
      15.0, 15.2, 15.2, 15.0, 14.6, 13.6, 12.4, 11.4, 10.6, 10.0, 9.4, 9.0,
      8.6, 8.2, 7.8, 7.4, 7.2, 7.4, 7.8, 8.4, 9.2, 10.0, 10.8, 11.4,
    ],
    soil_temperature_6cm: _h(48, (i) => 10.4 + Math.sin((i - 4) / 24 * Math.PI * 2) * 1.4),
    soil_temperature_18cm: _h(48, () => 9.8),
    soil_temperature_54cm: _h(48, () => 8.9),
    soil_moisture_0_to_1cm: _h(48, (i) => 0.28 + (i > 35 ? (i - 35) * 0.012 : 0)),
    soil_moisture_1_to_3cm: _h(48, (i) => 0.30 + (i > 35 ? (i - 35) * 0.010 : 0)),
    soil_moisture_3_to_9cm: _h(48, () => 0.31),
    soil_moisture_9_to_27cm: _h(48, () => 0.29),
    soil_moisture_27_to_81cm: _h(48, () => 0.27),
  },
  daily: {
    // 21 days: 7 past + today + 13 forecast
    time: _h(21, (i) => {
      const base = new Date("2026-05-07T00:00+01:00").getTime();
      return new Date(base + i * 86400 * 1000).toISOString().slice(0, 10);
    }),
    weekday: [
      "WED","THU","FRI","SAT","SUN","MON","TUE",     // past 7
      "WED","THU","FRI","SAT","SUN","MON","TUE",     // forecast 7
      "WED","THU","FRI","SAT","SUN","MON","TUE",     // forecast 8-14
    ],
    date: [
      "07","08","09","10","11","12","13",
      "14","15","16","17","18","19","20",
      "21","22","23","24","25","26","27",
    ],
    temperature_2m_max: [
      // past 7
      11.4, 12.8, 14.1, 15.2, 13.8, 12.4, 13.1,
      // today + 13
      14.4, 11.6, 10.8, 12.2, 14.6, 16.1, 17.2,
      16.4, 15.2, 14.6, 14.0, 13.6, 14.2, 15.4,
    ],
    temperature_2m_min: [
      4.2, 5.6, 6.8, 7.2, 6.4, 5.2, 5.8,
      6.8, 6.4, 5.8, 6.2, 7.4, 8.6, 9.2,
      9.8, 8.4, 7.6, 6.8, 6.2, 6.8, 7.4,
    ],
    precipitation_sum: [
      0.6, 0.0, 2.4, 4.8, 0.4, 1.2, 0.0,
      1.4, 9.8, 6.4, 1.8, 0.4, 0.0, 0.0,
      0.2, 1.4, 3.2, 4.6, 2.8, 0.6, 0.0,
    ],
    precipitation_probability_max: [
      45, 12, 68, 84, 36, 52, 18,
      48, 88, 74, 52, 28, 14, 8,
      18, 42, 64, 78, 58, 32, 14,
    ],
    wind_speed_10m_max: [
      18, 22, 24, 28, 19, 21, 16,
      16, 25, 28, 22, 18, 14, 12,
      14, 18, 22, 24, 22, 16, 12,
    ],
    wind_direction_10m_dominant: [
      220, 240, 250, 260, 270, 240, 230,
      250, 230, 220, 240, 260, 280, 290,
      280, 260, 240, 220, 230, 250, 270,
    ],
    weather_code: [
      61, 3, 63, 65, 51, 61, 2,
      3, 65, 63, 61, 3, 2, 1,
      2, 51, 63, 65, 61, 2, 1,
    ],
    sunrise: ["05:18","05:16","05:14","05:13","05:11","05:09","05:08",
              "05:06","05:05","05:04","05:02","05:01","05:00","04:59",
              "04:58","04:57","04:56","04:56","04:55","04:54","04:54"],
    sunset:  ["20:39","20:41","20:43","20:44","20:46","20:48","20:50",
              "20:51","20:53","20:54","20:56","20:57","20:59","21:00",
              "21:02","21:03","21:04","21:06","21:07","21:08","21:10"],
    uv_index_max: [4,5,3,2,4,3,5, 5,2,3,4,5,6,7, 7,5,3,2,4,6,7],
    shortwave_radiation_sum: [22,28,16,12,24,18,30, 28,12,18,24,30,34,38, 38,30,16,12,22,32,38],
  },
  climate: {
    month_label: "May",
    monthly_mean_30y: 10.6,
    monthly_mean_year: 11.4,        // anomaly +0.8
    monthly_rain_30y: 50.4,
    monthly_rain_year: 28.6,        // running mtd
    monthly_rain_pct: 57,
    // last 5 years' May mean
    history: [
      { y: 2021, mean: 9.6 },
      { y: 2022, mean: 11.2 },
      { y: 2023, mean: 10.8 },
      { y: 2024, mean: 11.9 },
      { y: 2025, mean: 12.4 },
      { y: 2026, mean: 11.4 },
    ],
  },
};

// Open-Meteo live fetch — wired but optional. Returns the same shape as AW_FALLBACK.
async function awFetchLive(lat = AW_LOCATION.lat, lon = AW_LOCATION.lon, signal) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    timezone: "Europe/London",
    past_days: 7,
    forecast_days: 14,
    current: [
      "temperature_2m","apparent_temperature","relative_humidity_2m","dew_point_2m",
      "pressure_msl","cloud_cover","wind_speed_10m","wind_gusts_10m","wind_direction_10m",
      "precipitation","visibility","uv_index","weather_code","is_day",
    ].join(","),
    hourly: [
      "temperature_2m","precipitation","precipitation_probability","wind_speed_10m",
      "wind_gusts_10m","wind_direction_10m","cloud_cover","relative_humidity_2m",
      "pressure_msl","soil_temperature_0cm","soil_temperature_6cm",
      "soil_temperature_18cm","soil_temperature_54cm",
      "soil_moisture_0_to_1cm","soil_moisture_1_to_3cm","soil_moisture_3_to_9cm",
      "soil_moisture_9_to_27cm","soil_moisture_27_to_81cm",
    ].join(","),
    daily: [
      "temperature_2m_max","temperature_2m_min","precipitation_sum","precipitation_probability_max",
      "wind_speed_10m_max","wind_direction_10m_dominant","weather_code",
      "sunrise","sunset","uv_index_max","shortwave_radiation_sum",
    ].join(","),
    wind_speed_unit: "kmh",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error("OpenMeteo " + r.status);
  return r.json();
}

// helpers
const dirToCompass = (deg) => {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
};
const fmt1 = (v) => (v == null || isNaN(v) ? "—" : (+v).toFixed(1));
const fmt0 = (v) => (v == null || isNaN(v) ? "—" : Math.round(+v).toString());


/* AceWeather v2 — shared panels & meteogram
   All visual components live here. Desktop and mobile both consume these. */

// ───────────────────────────── METEOGRAM ─────────────────────────────
// A 6-track horizontal time-series chart spanning 36 hours (12h past + 24h fcst).
// Tracks (top→bottom): TEMP · PRECIP · WIND · CLOUD+RH · PRESSURE
// Time axis labels at the very bottom only.

function Meteogram({ data, width = 880, height = 380, hoursPast = 12, hoursFuture = 24 }) {
  const start = 12 - hoursPast;             // index 0 is hour 0 of yesterday; "now" is index 27 (15:00 today)
  const nowIdx = 12 + 15;                   // hour-index 27 = 15:00 today
  const fromIdx = nowIdx - hoursPast;
  const toIdx = nowIdx + hoursFuture;
  const h = data.hourly;
  const slice = (arr) => arr.slice(fromIdx, toIdx + 1);
  const times = slice(h.time);
  const temps = slice(h.temperature_2m);
  const precs = slice(h.precipitation);
  const winds = slice(h.wind_speed_10m);
  const gusts = slice(h.wind_gusts_10m);
  const wdirs = slice(h.wind_direction_10m);
  const clouds = slice(h.cloud_cover);
  const rhums = slice(h.relative_humidity_2m);
  const press = slice(h.pressure_msl);

  const n = times.length;
  // layout
  const padL = 78, padR = 56, padTop = 6, padBottom = 22;
  const tracksH = height - padTop - padBottom;
  const tracks = [
    { id: "temp", label: "Temp",      unit: "°C",  weight: 1.4 },
    { id: "prec", label: "Precip",    unit: "mm",  weight: 0.85 },
    { id: "wind", label: "Wind",      unit: "km/h",weight: 0.95 },
    { id: "cloud",label: "Cloud · RH",unit: "%",   weight: 0.9 },
    { id: "press",label: "Pressure",  unit: "hPa", weight: 0.85 },
  ];
  const wSum = tracks.reduce((a, t) => a + t.weight, 0);
  let acc = padTop;
  const trackBounds = tracks.map((t) => {
    const h = (tracksH / wSum) * t.weight;
    const b = { y: acc, h, ...t };
    acc += h;
    return b;
  });

  const xOf = (i) => padL + ((width - padL - padR) * i) / (n - 1);
  const xNow = xOf(hoursPast);
  const hourOf = (t) => Number(t.slice(11, 13));

  // === TEMP track ===
  const tBand = trackBounds[0];
  const tMin = Math.floor(Math.min(...temps) - 1);
  const tMax = Math.ceil(Math.max(...temps) + 1);
  const tY = (v) => tBand.y + 6 + (tBand.h - 12) * (1 - (v - tMin) / (tMax - tMin));
  const tempPath = temps.map((v, i) => `${i ? "L" : "M"} ${xOf(i)} ${tY(v)}`).join(" ");
  const tempArea = `${tempPath} L ${xOf(n - 1)} ${tBand.y + tBand.h - 6} L ${xOf(0)} ${tBand.y + tBand.h - 6} Z`;
  const tNow = temps[hoursPast];
  const tHi = Math.max(...temps), tLo = Math.min(...temps);

  // === PRECIP track ===
  const pBand = trackBounds[1];
  const pMax = Math.max(2, Math.ceil(Math.max(...precs) * 1.2));
  const pY = (v) => pBand.y + pBand.h - 4 - ((pBand.h - 8) * v) / pMax;
  const colW = (width - padL - padR) / (n - 1);
  const pSum24 = precs.slice(hoursPast).reduce((a, v) => a + v, 0);

  // === WIND track ===
  const wBand = trackBounds[2];
  const wMaxV = Math.max(...gusts) * 1.1;
  const wY = (v) => wBand.y + wBand.h - 4 - ((wBand.h - 12) * v) / wMaxV;
  const wNow = winds[hoursPast], wDirNow = wdirs[hoursPast], gNow = gusts[hoursPast];

  // === CLOUD + RH track ===
  const cBand = trackBounds[3];
  const cY = (pct) => cBand.y + cBand.h - 4 - ((cBand.h - 8) * pct) / 100;
  const cloudPath = clouds.map((v, i) => `${i ? "L" : "M"} ${xOf(i)} ${cY(v)}`).join(" ");
  const cloudArea = `${cloudPath} L ${xOf(n - 1)} ${cBand.y + cBand.h - 4} L ${xOf(0)} ${cBand.y + cBand.h - 4} Z`;
  const rhPath = rhums.map((v, i) => `${i ? "L" : "M"} ${xOf(i)} ${cY(v)}`).join(" ");

  // === PRESSURE track ===
  const prBand = trackBounds[4];
  const prMin = Math.floor(Math.min(...press) - 1);
  const prMax = Math.ceil(Math.max(...press) + 1);
  const prY = (v) => prBand.y + prBand.h - 6 - ((prBand.h - 12) * (v - prMin)) / (prMax - prMin);
  const pressPath = press.map((v, i) => `${i ? "L" : "M"} ${xOf(i)} ${prY(v)}`).join(" ");

  // === time gridlines every 3h ===
  const grids = [];
  for (let i = 0; i < n; i++) {
    const hr = hourOf(times[i]);
    if (hr % 3 === 0) {
      const x = xOf(i);
      const major = hr % 6 === 0;
      grids.push({ x, hr, major });
    }
  }

  return (
    <svg className="aw2-meteogram" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      {/* outer frame */}
      <rect x={padL} y={padTop} width={width - padL - padR} height={tracksH}
            fill="none" stroke="var(--rule)" strokeWidth="0.5"/>

      {/* time gridlines spanning all tracks */}
      {grids.map((g, i) => (
        <line key={i} className={`gridline ${g.major ? "major" : ""}`}
              x1={g.x} x2={g.x} y1={padTop} y2={padTop + tracksH}/>
      ))}

      {/* horizontal rules between tracks */}
      {trackBounds.slice(1).map((t, i) => (
        <line key={i} className="track-rule"
              x1={padL} x2={width - padR} y1={t.y} y2={t.y}/>
      ))}

      {/* per-track labels (left) + current values (right) */}
      {trackBounds.map((t, i) => (
        <g key={t.id}>
          <text className="tracklabel" x={padL - 8} y={t.y + 14} textAnchor="end">{t.label}</text>
          <text className="trackunit" x={padL - 8} y={t.y + 26} textAnchor="end">{t.unit}</text>
        </g>
      ))}

      {/* TEMP track contents */}
      <path className="temp-area" d={tempArea}/>
      <path className="temp-line" d={tempPath}/>
      {/* hi/lo markers */}
      {temps.map((v, i) => {
        if (v === tHi || v === tLo) {
          return (
            <g key={i}>
              <circle cx={xOf(i)} cy={tY(v)} r="2" fill="var(--rust)"/>
              <text className="ticklabel" x={xOf(i)} y={tY(v) + (v === tHi ? -6 : 12)} textAnchor="middle"
                    style={{ fill: "var(--ink)", fontSize: 10 }}>
                {v.toFixed(0)}°
              </text>
            </g>
          );
        }
        return null;
      })}

      {/* PRECIP bars */}
      {precs.map((v, i) => {
        if (v <= 0) return null;
        const x = xOf(i) - colW * 0.35;
        const y = pY(v);
        return <rect key={i} className="precip-bar" x={x} y={y} width={colW * 0.7} height={pBand.y + pBand.h - 4 - y}/>;
      })}
      {/* precip max ref */}
      <text className="ticklabel" x={width - padR + 4} y={pBand.y + 10}>{pMax} mm</text>
      <text className="ticklabel" x={width - padR + 4} y={pBand.y + pBand.h - 6}>0</text>

      {/* WIND bars + direction arrows every 3 hours */}
      {winds.map((v, i) => {
        const x = xOf(i) - colW * 0.30;
        const y = wY(v);
        const gx = xOf(i) - colW * 0.30;
        const gy = wY(gusts[i]);
        return (
          <g key={i}>
            <rect className="wind-bar" x={x} y={y} width={colW * 0.60} height={wBand.y + wBand.h - 4 - y}/>
            {/* gust line */}
            <line x1={gx - 1} x2={gx + colW * 0.60 + 1} y1={gy} y2={gy}
                  stroke="var(--rust)" strokeWidth="0.8"/>
          </g>
        );
      })}
      {/* direction arrows every 3h */}
      {winds.map((v, i) => {
        const hr = hourOf(times[i]);
        if (hr % 3 !== 0) return null;
        const x = xOf(i);
        const y = wBand.y + 10;
        const d = wdirs[i];
        // arrow points TO direction wind is going (i.e. +180 from "from")
        const rot = d + 180;
        return (
          <g key={`a${i}`} transform={`translate(${x} ${y}) rotate(${rot})`}>
            <line x1="0" y1="-4" x2="0" y2="4" stroke="var(--ink-3)" strokeWidth="0.8"/>
            <polygon points="0,-5 -2,-1 2,-1" fill="var(--ink-3)"/>
          </g>
        );
      })}
      <text className="ticklabel" x={width - padR + 4} y={wBand.y + 10}>{Math.round(wMaxV)}</text>
      <text className="ticklabel" x={width - padR + 4} y={wBand.y + wBand.h - 6}>0</text>

      {/* CLOUD area + RH line */}
      <path className="cloud-area" d={cloudArea}/>
      <path className="rh-line" d={rhPath}/>
      <text className="ticklabel" x={width - padR + 4} y={cBand.y + 10}>100</text>
      <text className="ticklabel" x={width - padR + 4} y={cBand.y + cBand.h - 6}>0</text>

      {/* PRESSURE line */}
      <path className="press-line" d={pressPath}/>
      <text className="ticklabel" x={width - padR + 4} y={prBand.y + 10}>{prMax}</text>
      <text className="ticklabel" x={width - padR + 4} y={prBand.y + prBand.h - 6}>{prMin}</text>

      {/* NOW line (vertical, spans entire chart) */}
      <line className="nowline" x1={xNow} x2={xNow} y1={padTop} y2={padTop + tracksH}/>
      <text className="ticklabel" x={xNow + 4} y={padTop + 10} style={{ fill: "var(--rust)" }}>NOW</text>

      {/* per-track current readouts (right gutter) */}
      <text className="trackvalue" x={width - padR + 4} y={tBand.y + 26} fill="var(--rust)">{fmt1(tNow)}°</text>
      <text className="trackvalue" x={width - padR + 4} y={pBand.y + 26} fill="var(--teal)">{precs[hoursPast] > 0 ? fmt1(precs[hoursPast]) : "0.0"}</text>
      <text className="trackvalue" x={width - padR + 4} y={wBand.y + 26}>{fmt0(wNow)}</text>
      <text className="trackvalue" x={width - padR + 4} y={cBand.y + 26}>{fmt0(clouds[hoursPast])}</text>
      <text className="trackvalue" x={width - padR + 4} y={prBand.y + 26}>{fmt0(press[hoursPast])}</text>

      {/* time axis labels */}
      {grids.filter(g => g.major).map((g, i) => (
        <g key={`tx${i}`}>
          <line className="track-rule" x1={g.x} x2={g.x} y1={padTop + tracksH} y2={padTop + tracksH + 3}/>
          <text className="axis-text" x={g.x} y={padTop + tracksH + 14} textAnchor="middle">
            {String(g.hr).padStart(2, "0")}
          </text>
        </g>
      ))}
      {/* day labels at midnight crossings */}
      {times.map((t, i) => {
        if (hourOf(t) !== 0) return null;
        const x = xOf(i);
        const day = new Date(t + ":00").toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
        return (
          <text key={`d${i}`} className="axis-text" x={x + 4} y={padTop + 10}
                style={{ fill: "var(--ink-3)", letterSpacing: "0.14em" }}>
            {day}
          </text>
        );
      })}
    </svg>
  );
}

// ───────────────────────────── RAIN PANEL ─────────────────────────────
function RainPanel({ data, compact = false }) {
  const h = data.hourly;
  const nowIdx = 27;                                       // 15:00 today
  const next24 = h.precipitation.slice(nowIdx, nowIdx + 24);
  const next24p = h.precipitation_probability.slice(nowIdx, nowIdx + 24);
  const sum24 = next24.reduce((a, b) => a + b, 0);
  const peakP = Math.max(...next24p);

  // past 7 days (days 0..6 of daily array)
  const past7 = data.daily.precipitation_sum.slice(0, 7);
  const past7sum = past7.reduce((a, b) => a + b, 0);
  // next 7 days (days 7..13)
  const next7 = data.daily.precipitation_sum.slice(7, 14);
  const next7p = data.daily.precipitation_probability_max.slice(7, 14);
  const next7d = data.daily.weekday.slice(7, 14);
  const next7sum = next7.reduce((a, b) => a + b, 0);

  const W = compact ? 360 : 440, H = compact ? 80 : 110;
  const padL = 26, padR = 8, padT = 6, padB = 14;
  const pMax = Math.max(2, Math.max(...next24) * 1.2);
  const xs = (i) => padL + ((W - padL - padR) * i) / 23;
  const colW = (W - padL - padR) / 24;

  return (
    <div className="aw2-rain">
      <div className="aw2-rain-headline">
        <div className="aw2-rain-stat">
          <div className="k">Next 24h</div>
          <div className={"v" + (sum24 < 0.1 ? " dry" : "")}>{sum24.toFixed(1)}<small>mm</small></div>
          <div className="sub">Peak chance · {peakP}%</div>
        </div>
        <div className="aw2-rain-stat">
          <div className="k">Past 7d · Σ</div>
          <div className={"v" + (past7sum < 0.1 ? " dry" : "")}>{past7sum.toFixed(1)}<small>mm</small></div>
          <div className="sub">Norm 11.6mm · +{(past7sum - 11.6).toFixed(1)}</div>
        </div>
      </div>

      <svg className="aw2-rain-chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB}
              fill="none" stroke="var(--rule)" strokeWidth="0.5"/>
        {/* gridlines every 6h */}
        {[0,6,12,18,24].map(hr => (
          <line key={hr} x1={xs(hr)} x2={xs(hr)}
                y1={padT} y2={H - padB}
                stroke="var(--rule-faint)" strokeWidth="0.5"/>
        ))}
        {/* % probability area (light) */}
        <path d={
          next24p.map((p, i) => `${i ? "L" : "M"} ${xs(i)} ${H - padB - (p / 100) * (H - padT - padB) * 0.9}`).join(" ")
            + ` L ${xs(23)} ${H - padB} L ${xs(0)} ${H - padB} Z`
        } fill="var(--teal)" opacity="0.10"/>
        {/* mm bars */}
        {next24.map((v, i) => {
          if (v <= 0) return null;
          const x = xs(i) - colW * 0.3;
          const y = H - padB - (v / pMax) * (H - padT - padB) * 0.9;
          return <rect key={i} fill="var(--teal)" x={x} y={y} width={colW * 0.6} height={H - padB - y}/>;
        })}
        {/* axis */}
        <text x={padL - 4} y={padT + 8} textAnchor="end" className="aw2-meteogram"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{pMax.toFixed(1)}</text>
        <text x={padL - 4} y={H - padB} textAnchor="end"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>0</text>
        {[0,6,12,18].map(hr => (
          <text key={hr} x={xs(hr)} y={H - 2}
                style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>
            +{hr}h
          </text>
        ))}
      </svg>

      <div className="aw2-rain-7">
        {next7.map((mm, i) => {
          const max = Math.max(1, ...next7);
          return (
            <div key={i} className="aw2-rain-7-col">
              <div className="d">{next7d[i]}</div>
              <div className="bar">
                <div className="bar-fill" style={{ height: (mm / max * 100) + "%" }}/>
              </div>
              <div className={"mm" + (mm < 0.1 ? " zero" : "")}>{mm < 0.1 ? "·" : mm.toFixed(1)}</div>
              <div className="pct">{next7p[i]}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────── FROST PANEL ─────────────────────────────
// Overnight grass min vs air min, with 0° freezing reference
function FrostPanel({ data }) {
  const h = data.hourly;
  // tonight = hour-idx 24..35 of slice (00:00-12:00 tomorrow) → from start of array indices 36..47
  const tonightStart = 36;
  const tonightLen = 12;
  const airTemp = h.temperature_2m.slice(tonightStart, tonightStart + tonightLen);
  // synthesize grass temp = air - 2.5° on clear nights, less under cloud
  const cloud = h.cloud_cover.slice(tonightStart, tonightStart + tonightLen);
  const grass = airTemp.map((t, i) => t - (2.8 - (cloud[i] / 100) * 1.6));
  const minAir = Math.min(...airTemp);
  const minGrass = Math.min(...grass);

  // chart
  const W = 440, H = 110;
  const padL = 28, padR = 8, padT = 8, padB = 18;
  const all = [...airTemp, ...grass, 0];
  const tMin = Math.floor(Math.min(...all) - 1);
  const tMax = Math.ceil(Math.max(...all) + 1);
  const xs = (i) => padL + ((W - padL - padR) * i) / (tonightLen - 1);
  const ys = (v) => padT + (H - padT - padB) * (1 - (v - tMin) / (tMax - tMin));
  const airPath = airTemp.map((v, i) => `${i ? "L" : "M"} ${xs(i)} ${ys(v)}`).join(" ");
  const grassPath = grass.map((v, i) => `${i ? "L" : "M"} ${xs(i)} ${ys(v)}`).join(" ");
  const zeroY = ys(0);

  const risk = minGrass <= 0 ? "warn" : minGrass <= 2 ? "cold" : "";

  return (
    <div className="aw2-frost">
      <div className="aw2-frost-bar">
        <div className="k">Air min</div>
        <div className={"v" + (minAir <= 2 ? " cold" : "")}>{fmt1(minAir)}°</div>
      </div>
      <div className="aw2-frost-bar">
        <div className="k">Grass min</div>
        <div className={"v " + risk}>{fmt1(minGrass)}°</div>
      </div>

      <svg className="aw2-frost-chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB}
              fill="none" stroke="var(--rule)" strokeWidth="0.5"/>
        {/* zero line */}
        {zeroY >= padT && zeroY <= H - padB && (
          <>
            <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY}
                  stroke="var(--ink)" strokeWidth="0.5" strokeDasharray="3 3"/>
            <text x={W - padR - 2} y={zeroY - 3} textAnchor="end"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ink)" }}>0°C · FROST</text>
          </>
        )}
        <path d={airPath} fill="none" stroke="var(--ink)" strokeWidth="1.4"/>
        <path d={grassPath} fill="none" stroke="var(--frost)" strokeWidth="1.4" strokeDasharray="3 2"/>
        {/* axis */}
        <text x={padL - 4} y={padT + 8} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{tMax}°</text>
        <text x={padL - 4} y={H - padB} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{tMin}°</text>
        {[0,3,6,9,11].map(i => (
          <text key={i} x={xs(i)} y={H - 4} textAnchor="middle"
                style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>
            {String((i) % 24).padStart(2, "0")}
          </text>
        ))}
      </svg>

      <div className="aw2-frost-legend">
        <span><i className="air"></i>Air 1.5m</span>
        <span><i className="grass"></i>Grass</span>
        <span><i className="zero"></i>Freeze line</span>
      </div>
    </div>
  );
}

// ───────────────────────────── 14-DAY FORTNIGHT ─────────────────────────────
function FortnightStrip({ data }) {
  const d = data.daily;
  // skip past 7, show today + 13
  const days = 14;
  const off = 7;
  const hi = d.temperature_2m_max.slice(off, off + days);
  const lo = d.temperature_2m_min.slice(off, off + days);
  const wd = d.weekday.slice(off, off + days);
  const dt = d.date.slice(off, off + days);
  const rain = d.precipitation_sum.slice(off, off + days);
  const pct = d.precipitation_probability_max.slice(off, off + days);
  const ws = d.wind_speed_10m_max.slice(off, off + days);
  const wdir = d.wind_direction_10m_dominant.slice(off, off + days);

  const min = Math.min(...lo);
  const max = Math.max(...hi);

  return (
    <div className="aw2-fortnight">
      {wd.map((w, i) => {
        const isToday = i === 0;
        const segL = ((lo[i] - min) / (max - min)) * 100;
        const segR = ((hi[i] - min) / (max - min)) * 100;
        return (
          <div key={i} className="aw2-day">
            <div className={"h" + (isToday ? " today" : "")}>
              <span>{w}</span><b>{dt[i]}</b>
            </div>
            <div className="temps">
              <span>{Math.round(hi[i])}°</span>
              <span className="sep">/</span>
              <span className="lo">{Math.round(lo[i])}°</span>
            </div>
            <div className="rangebar">
              <div className="seg" style={{ left: segL + "%", width: (segR - segL) + "%" }}/>
            </div>
            <div className={"rain" + (rain[i] < 0.1 ? " dry" : "")}>
              <span>{rain[i] < 0.1 ? "·" : rain[i].toFixed(1) + "mm"}</span>
              <span className="pct">{pct[i]}%</span>
            </div>
            <div className="wind">
              <span className="arr" style={{ display: "inline-block", transform: `rotate(${wdir[i] + 180}deg)` }}>↑</span>
              <span>{Math.round(ws[i])} km/h</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────── SOIL PROFILE ─────────────────────────────
function SoilProfile({ data }) {
  const h = data.hourly;
  const nowIdx = 27;
  const profile = [
    { depth: "0 cm", sub: "Surface", t: h.soil_temperature_0cm[nowIdx],  m: h.soil_moisture_0_to_1cm[nowIdx] },
    { depth: "6 cm", sub: "Topsoil", t: h.soil_temperature_6cm[nowIdx],  m: h.soil_moisture_1_to_3cm[nowIdx] },
    { depth: "18 cm",sub: "Root zone", t: h.soil_temperature_18cm[nowIdx], m: h.soil_moisture_3_to_9cm[nowIdx] },
    { depth: "54 cm",sub: "Sub-soil",  t: h.soil_temperature_54cm[nowIdx], m: h.soil_moisture_27_to_81cm[nowIdx] },
  ];
  return (
    <div className="aw2-soil">
      {profile.map((p, i) => {
        const moistPct = Math.round(p.m * 100);
        return (
          <div key={i} className="aw2-soil-row">
            <div className="depth">{p.depth}<small>{p.sub}</small></div>
            <div className="meter">
              <div className="meter-fill" style={{ width: moistPct + "%" }}/>
              {/* field capacity ref */}
              <div className="meter-marker" style={{ left: "32%" }}/>
              <div className="meter-marker" style={{ left: "45%" }}/>
            </div>
            <div className="temp">{fmt1(p.t)}<small>°C</small></div>
            <div className="moist">{moistPct}<small>%</small></div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────────────── SUN PATH ─────────────────────────────
function SunPath({ data }) {
  const d = data.daily;
  const today = 7;
  const sunrise = d.sunrise[today];
  const sunset = d.sunset[today];
  const uv = d.uv_index_max[today];
  const dli = d.shortwave_radiation_sum[today];
  // current time = 15:00. Compute % of daylight elapsed.
  const toMin = (s) => Number(s.slice(0,2)) * 60 + Number(s.slice(3,5));
  const nowMin = 15 * 60;
  const dayLen = toMin(sunset) - toMin(sunrise);
  const elapsed = Math.max(0, Math.min(1, (nowMin - toMin(sunrise)) / dayLen));
  // SVG arc
  const W = 240, H = 96;
  const cx = W / 2, cy = H - 10, r = W / 2 - 12;
  const a = Math.PI * (1 - elapsed); // 180° (sunrise) → 0° (sunset)
  const sx = cx + Math.cos(a) * r;
  const sy = cy - Math.sin(a) * r;
  // built path for elapsed arc
  const largeArc = 0;
  const startX = cx - r, startY = cy;
  const elapsedArc = `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${sx} ${sy}`;
  const fullArc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  const daylight = `${Math.floor(dayLen/60)}h ${dayLen%60}m`;
  return (
    <div className="aw2-sun">
      <svg className="aw2-sun-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <path className="aw2-sun-arc" d={fullArc}/>
        <path className="aw2-sun-arc-now" d={elapsedArc}/>
        <line className="aw2-sun-horizon" x1={cx - r - 8} x2={cx + r + 8} y1={cy} y2={cy}/>
        <circle className="aw2-sun-dot" cx={sx} cy={sy} r="4"/>
        <text x={cx - r - 6} y={cy + 12} textAnchor="middle"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{sunrise}</text>
        <text x={cx + r + 6} y={cy + 12} textAnchor="middle"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{sunset}</text>
      </svg>
      <div className="aw2-sun-stats">
        <div><span>Daylight</span><b>{daylight}</b></div>
        <div><span>UV max</span><b>{uv}</b></div>
        <div><span>DLI</span><b>{dli}<small style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted)", marginLeft: 2 }}>mol</small></b></div>
      </div>
    </div>
  );
}

// ───────────────────────────── PRECIP RADAR (stylized) ─────────────────────────────
function RadarSketch({ data }) {
  const h = data.hourly;
  const nowIdx = 27;
  // build "precip cells" radially around station based on next 6 hours of precip
  // azimuth derived from wind direction at each hour (cells incoming FROM that bearing)
  const cells = [];
  for (let i = -2; i <= 4; i++) {
    const v = h.precipitation[nowIdx + i] || 0;
    if (v < 0.05) continue;
    const azFromBearing = h.wind_direction_10m[nowIdx + i] || 240;
    // azimuth 0 = N (up). incoming from azFromBearing.
    const distance = (i + 2) / 6; // 0..1
    const az = (azFromBearing + 180) % 360; // outgoing direction (cells AHEAD of station for past, BEHIND for future)
    // use az from system: past = upstream (where rain came from), future = downstream (where rain is going)
    const az2 = i < 0 ? azFromBearing : azFromBearing + 180;
    const rad = (az2 - 90) * Math.PI / 180;
    cells.push({
      r: 12 + distance * 80,
      x: 100 + Math.cos(rad) * (12 + distance * 80),
      y: 100 + Math.sin(rad) * (12 + distance * 80),
      size: 6 + v * 8,
      intensity: Math.min(1, v / 3),
      future: i > 0,
    });
  }

  return (
    <>
    <svg className="aw2-radar" viewBox="0 0 200 200" width="100%">
      {/* rings */}
      {[30, 60, 90].map(r => <circle key={r} className="ring" cx="100" cy="100" r={r}/>)}
      {/* cardinal axes */}
      <line className="axis" x1="100" y1="6" x2="100" y2="194"/>
      <line className="axis" x1="6" y1="100" x2="194" y2="100"/>
      {/* N label */}
      <text className="label" x="100" y="14" textAnchor="middle">N</text>
      <text className="label" x="14" y="103" textAnchor="middle">W</text>
      <text className="label" x="186" y="103" textAnchor="middle">E</text>
      <text className="label" x="100" y="196" textAnchor="middle">S</text>
      {/* range labels */}
      <text className="label" x="102" y="73" textAnchor="start">10km</text>
      <text className="label" x="102" y="43" textAnchor="start">25km</text>
      <text className="label" x="102" y="13" textAnchor="start">50km</text>
      {/* precip cells */}
      {cells.map((c, i) => (
        <ellipse key={i} className="cell" cx={c.x} cy={c.y} rx={c.size} ry={c.size * 0.7}
                 opacity={0.25 + c.intensity * 0.55}
                 transform={`rotate(${Math.atan2(c.y - 100, c.x - 100) * 180 / Math.PI + 60} ${c.x} ${c.y})`}
                 strokeDasharray={c.future ? "2 1" : ""}
                 stroke={c.future ? "var(--teal)" : "none"} strokeWidth={c.future ? "0.6" : "0"}/>
      ))}
      {/* station */}
      <circle className="station" cx="100" cy="100" r="3"/>
      <text className="label" x="106" y="103">BISHOPTON</text>
    </svg>
    <div className="aw2-radar-foot">
      <span>−2h ← solid · forecast → dashed +4h</span>
      <span>Approx · model-derived</span>
    </div>
    </>
  );
}

// ───────────────────────────── CLIMATE / HISTORICAL ─────────────────────────────
function ClimatePanel({ data }) {
  const [range, setRange] = useState("month");
  const c = data.climate;

  // year history bars
  const W = 360, H = 80;
  const padL = 24, padR = 8, padT = 8, padB = 18;
  const min = Math.min(...c.history.map(x => x.mean), c.monthly_mean_30y) - 1;
  const max = Math.max(...c.history.map(x => x.mean)) + 1;
  const ys = (v) => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
  const xs = (i) => padL + ((W - padL - padR) * i) / (c.history.length - 1);
  const normY = ys(c.monthly_mean_30y);

  return (
    <div className="aw2-climate">
      <div className="aw2-climate-pills" role="tablist">
        {[["month","May"],["7","7D"],["14","14D"],["30","30D"],["90","90D"]].map(([k,l]) => (
          <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>
        ))}
      </div>

      <svg className="aw2-climate-chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB}
              fill="none" stroke="var(--rule)" strokeWidth="0.5"/>
        {/* 30y norm reference */}
        <line x1={padL} x2={W - padR} y1={normY} y2={normY}
              stroke="var(--ink)" strokeWidth="0.5" strokeDasharray="3 3"/>
        <text x={W - padR - 4} y={normY - 3} textAnchor="end"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ink)" }}>
          30y · {c.monthly_mean_30y}°
        </text>
        {/* year bars */}
        {c.history.map((y, i) => {
          const v = y.mean;
          const yy = ys(v);
          const colW = (W - padL - padR) / c.history.length;
          const x = xs(i) - colW * 0.35;
          const color = v > c.monthly_mean_30y ? "var(--rust)" : "var(--teal)";
          return (
            <g key={y.y}>
              <rect x={x} y={yy} width={colW * 0.7} height={(H - padB) - yy}
                    fill={color} opacity={i === c.history.length - 1 ? 1 : 0.5}/>
              <text x={xs(i)} y={H - 4} textAnchor="middle"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: i === c.history.length - 1 ? "var(--ink)" : "var(--muted)" }}>
                {String(y.y).slice(2)}
              </text>
            </g>
          );
        })}
        <text x={padL - 4} y={padT + 8} textAnchor="end"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{Math.ceil(max)}°</text>
        <text x={padL - 4} y={H - padB} textAnchor="end"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{Math.floor(min)}°</text>
      </svg>

      <div className="aw2-climate-stats">
        <div className="aw2-climate-stat">
          <div className="k">{c.month_label} mean</div>
          <div className={"v " + (c.monthly_mean_year > c.monthly_mean_30y ? "warm" : "cool")}>
            {c.monthly_mean_year.toFixed(1)}°
          </div>
        </div>
        <div className="aw2-climate-stat">
          <div className="k">Anomaly</div>
          <div className={"v " + (c.monthly_mean_year > c.monthly_mean_30y ? "warm" : "cool")}>
            {(c.monthly_mean_year - c.monthly_mean_30y >= 0 ? "+" : "") + (c.monthly_mean_year - c.monthly_mean_30y).toFixed(1)}°
          </div>
        </div>
        <div className="aw2-climate-stat">
          <div className="k">Rain MTD</div>
          <div className={"v " + (c.monthly_rain_year < c.monthly_rain_30y ? "cool" : "warm")}>
            {c.monthly_rain_pct}<small style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)", marginLeft: 2 }}>%</small>
          </div>
        </div>
      </div>
    </div>
  );
}


/* AceWeather v2 — DESKTOP "mission control"
   1440 × 900 fixed-aspect dashboard. Every instrument visible without scroll. */

const Desktop = () => {
  const [data, setData] = useState(AW_FALLBACK);
  const [live, setLive] = useState(null); // null | "loading" | "live" | "offline"

  // Try a live fetch once at mount, fall back silently if it fails.
  useEffect(() => {
    if (!window.AW_TRY_LIVE) return;
    const ctrl = new AbortController();
    Promise.resolve().then(() => setLive("loading"));
    awFetchLive(AW_LOCATION.lat, AW_LOCATION.lon, ctrl.signal)
      .then((json) => {
        // light merge — keep fallback's `weekday`, `date`, `climate` we synthesized
        const merged = mergeOpenMeteo(AW_FALLBACK, json);
        setData(merged);
        setLive("live");
      })
      .catch(() => setLive("offline"));
    return () => ctrl.abort();
  }, []);

  const c = data.current;
  const tHi = Math.max(...data.hourly.temperature_2m.slice(24, 48));
  const tLo = Math.min(...data.hourly.temperature_2m.slice(24, 48));

  const now = new Date();
  const obsTime = c.time || now.toTimeString().slice(0, 5);
  const dateLong = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="aw2 aw2-desktop" data-screen-label="01 Desktop · Mission Control">
      <header className="aw2-masthead">
        <div className="aw2-mast-brand">
          <span className="mark">AceWeather</span>
          <span className="sub">Mk III · Synoptic</span>
        </div>
        <div className="aw2-mast-meta">
          <div>STN <b>BSH-054</b></div>
          <div>LAT <b>54.5435° N</b></div>
          <div>LON <b>1.4373° W</b></div>
          <div>ELEV <b>30 m</b></div>
          <div>OBS <b>{obsTime} BST</b></div>
        </div>
        <div className="aw2-mast-search">
          <span style={{ color: "var(--muted)" }}>⌕</span>
          <input placeholder="Search location" defaultValue="Bishopton, Stockton-on-Tees" />
        </div>
      </header>

      <section className="aw2-hero">
        <div className="aw2-hero-temp">
          <span className="num">{fmt0(c.temperature_2m)}</span>
          <span className="deg">°C</span>
          <div className="meta">
            <span>Feels <b className="feels">{fmt0(c.apparent_temperature)}°</b></span>
            <span>Hi <b>{Math.round(tHi)}°</b> · Lo <b>{Math.round(tLo)}°</b></span>
            <span>{dateLong}</span>
          </div>
        </div>
        <div className="aw2-hero-stats">
          <Stat k="Wind"     v={fmt0(c.wind_speed_10m)}  u="km/h"  sub={`${dirToCompass(c.wind_direction_10m)} · ${c.wind_direction_10m}°`}/>
          <Stat k="Gust"     v={fmt0(c.wind_gusts_10m)}  u="km/h"  sub="10-min max"/>
          <Stat k="Humidity" v={fmt0(c.relative_humidity_2m)} u="%"sub={`Dew ${fmt1(c.dew_point_2m)}°`}/>
          <Stat k="Pressure" v={fmt0(c.pressure_msl)}    u="hPa"   sub="MSL · steady"/>
          <Stat k="Cloud"    v={fmt0(c.cloud_cover)}     u="%"     sub="Overcast"/>
          <Stat k="Vis"      v={fmt1(c.visibility_km)}   u="km"    sub="Good"/>
          <Stat k="UV"       v={fmt1(c.uv_index)}        u=""      sub="Moderate"/>
        </div>
      </section>

      <div className="aw2-mid">
        <div className="aw2-mid-left aw2-panel">
          <div className="aw2-panel-head">
            <span className="num">02</span>
            <span className="title">Meteogram · −12h → +24h</span>
            <span className="right">TEMP · PRECIP · WIND · CLOUD/RH · PRESSURE</span>
          </div>
          <Meteogram data={data} width={900} height={320}/>
        </div>
        <div className="aw2-mid-right">
          <div className="aw2-panel" style={{ borderBottom: "1px solid var(--rule)" }}>
            <div className="aw2-panel-head">
              <span className="num">03</span>
              <span className="title">Rainfall</span>
              <span className="right">FORECAST · PAST 7D · NEXT 7D</span>
            </div>
            <RainPanel data={data}/>
          </div>
          <div className="aw2-panel">
            <div className="aw2-panel-head">
              <span className="num">04</span>
              <span className="title">Frost overnight · Bishopton</span>
              <span className="right">AIR · GRASS · 0° REFERENCE</span>
            </div>
            <FrostPanel data={data}/>
          </div>
        </div>
      </div>

      <div className="aw2-panel">
        <div className="aw2-panel-head">
          <span className="num">05</span>
          <span className="title">14-day outlook</span>
          <span className="right">HI · LO · MM · CHANCE · WIND</span>
        </div>
        <FortnightStrip data={data}/>
      </div>

      <div className="aw2-row">
        <div className="aw2-panel tight">
          <div className="aw2-panel-head">
            <span className="num">06</span>
            <span className="title">Soil profile</span>
            <span className="right">T · MOISTURE</span>
          </div>
          <SoilProfile data={data}/>
        </div>
        <div className="aw2-panel tight">
          <div className="aw2-panel-head">
            <span className="num">07</span>
            <span className="title">Sun · DLI</span>
            <span className="right">{data.daily.sunrise[7]} → {data.daily.sunset[7]}</span>
          </div>
          <SunPath data={data}/>
        </div>
        <div className="aw2-panel tight">
          <div className="aw2-panel-head">
            <span className="num">08</span>
            <span className="title">Precip · radar (≈)</span>
            <span className="right">50 KM RANGE</span>
          </div>
          <RadarSketch data={data}/>
        </div>
        <div className="aw2-panel tight">
          <div className="aw2-panel-head">
            <span className="num">09</span>
            <span className="title">Climate · {data.climate.month_label}</span>
            <span className="right">vs 30-Y NORM</span>
          </div>
          <ClimatePanel data={data}/>
        </div>
      </div>

      <footer className="aw2-foot">
        <span className="sources">SOURCE · <b>Open-Meteo</b> · ECMWF · UKMO · ERA5 · CMIP6</span>
        <span>Updated {obsTime} · Bishopton, Stockton-on-Tees</span>
        <span className={"live " + (live === "offline" ? "offline" : "")}>
          {live === "live" ? "LIVE" : live === "loading" ? "FETCHING" : live === "offline" ? "MOCK DATA" : "MOCK DATA"}
        </span>
      </footer>
    </div>
  );
};

const Stat = ({ k, v, u, sub }) => (
  <div className="aw2-hero-stat">
    <div className="k">{k}</div>
    <div className="v">{v}{u ? <small>{u}</small> : null}</div>
    <div className="sub">{sub}</div>
  </div>
);

// merge Open-Meteo response into the fallback shape
function mergeOpenMeteo(fallback, om) {
  const out = { ...fallback };
  if (om.current) {
    out.current = {
      ...fallback.current,
      ...om.current,
      visibility_km: (om.current.visibility ?? 22000) / 1000,
      time: om.current.time?.slice(11, 16) ?? fallback.current.time,
    };
  }
  if (om.hourly) {
    out.hourly = { ...fallback.hourly };
    Object.keys(om.hourly).forEach((k) => { if (om.hourly[k]) out.hourly[k] = om.hourly[k]; });
  }
  if (om.daily) {
    out.daily = { ...fallback.daily };
    Object.keys(om.daily).forEach((k) => { if (om.daily[k]) out.daily[k] = om.daily[k]; });
    // re-derive weekday + date from time strings
    out.daily.weekday = (om.daily.time || []).map(t =>
      new Date(t).toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()
    );
    out.daily.date = (om.daily.time || []).map(t => t.slice(8, 10));
  }
  return out;
}


/* AceWeather v2 — MOBILE PWA
   402 × 874. Curated for farmers in the field. Rain-first. */

const Mobile = () => {
  const [data] = useState(AW_FALLBACK);
  const c = data.current;
  const tHi = Math.max(...data.hourly.temperature_2m.slice(24, 48));
  const tLo = Math.min(...data.hourly.temperature_2m.slice(24, 48));
  const obsTime = c.time || "15:00";

  // Next 24h rain
  const nowIdx = 27;
  const next24 = data.hourly.precipitation.slice(nowIdx, nowIdx + 24);
  const next24p = data.hourly.precipitation_probability.slice(nowIdx, nowIdx + 24);
  const sum24 = next24.reduce((a, b) => a + b, 0);
  const peakP = Math.max(...next24p);

  // 7-day forecast list
  const d = data.daily;
  const days7 = Array.from({ length: 7 }, (_, i) => ({
    d: d.weekday[7 + i], dt: d.date[7 + i],
    hi: d.temperature_2m_max[7 + i], lo: d.temperature_2m_min[7 + i],
    rain: d.precipitation_sum[7 + i], pct: d.precipitation_probability_max[7 + i],
    wind: d.wind_speed_10m_max[7 + i], wdir: d.wind_direction_10m_dominant[7 + i],
  }));
  const minLo = Math.min(...days7.map(x => x.lo));
  const maxHi = Math.max(...days7.map(x => x.hi));

  // Soil
  const h = data.hourly;
  const soil = [
    { d: "0",  s: "Surface",  t: h.soil_temperature_0cm[nowIdx],  m: h.soil_moisture_0_to_1cm[nowIdx] },
    { d: "6",  s: "Topsoil",  t: h.soil_temperature_6cm[nowIdx],  m: h.soil_moisture_1_to_3cm[nowIdx] },
    { d: "18", s: "Root zone",t: h.soil_temperature_18cm[nowIdx], m: h.soil_moisture_3_to_9cm[nowIdx] },
    { d: "54", s: "Sub-soil", t: h.soil_temperature_54cm[nowIdx], m: h.soil_moisture_27_to_81cm[nowIdx] },
  ];

  // 24h rain mini-chart
  const W = 370, H = 100, padL = 28, padR = 8, padT = 8, padB = 18;
  const pMax = Math.max(2, Math.max(...next24) * 1.2);
  const xs = (i) => padL + ((W - padL - padR) * i) / 23;
  const colW = (W - padL - padR) / 24;

  return (
    <div className="aw2 aw2-mobile" data-screen-label="02 Mobile PWA">
      <header className="aw2-m-head">
        <div className="row">
          <div className="mark">AceWeather</div>
          <div className="sub">{obsTime} BST</div>
        </div>
        <div className="row">
          <div className="loc">Bishopton</div>
          <div className="obs">Stockton-on-Tees · 30 m</div>
        </div>
      </header>

      <section className="aw2-m-now">
        <div className="aw2-m-now-temp">
          <div className="num">{fmt0(c.temperature_2m)}</div>
          <div className="deg">°C</div>
        </div>
        <div className="aw2-m-now-hilo">
          <div className="hi">High <b>{Math.round(tHi)}°</b></div>
          <div className="lo">Low <b>{Math.round(tLo)}°</b></div>
          <div>Feels {fmt0(c.apparent_temperature)}°</div>
        </div>
        <div className="aw2-m-now-chips">
          <div className="aw2-m-now-chip">
            <div className="k">Wind</div>
            <div className="v">{fmt0(c.wind_speed_10m)}<small>km/h</small></div>
          </div>
          <div className="aw2-m-now-chip">
            <div className="k">Dir</div>
            <div className="v">{dirToCompass(c.wind_direction_10m)}</div>
          </div>
          <div className="aw2-m-now-chip">
            <div className="k">RH</div>
            <div className="v">{fmt0(c.relative_humidity_2m)}<small>%</small></div>
          </div>
          <div className="aw2-m-now-chip">
            <div className="k">Cloud</div>
            <div className="v">{fmt0(c.cloud_cover)}<small>%</small></div>
          </div>
        </div>
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>Rainfall · next 24h</b><span>+0 → +24h</span></div>
        <div className="aw2-m-rain">
          <div className="aw2-m-rain-cell">
            <div className="k">Total</div>
            <div className={"v" + (sum24 < 0.1 ? " dry" : "")}>{sum24.toFixed(1)}<small>mm</small></div>
            <div className="sub">Across 24h</div>
          </div>
          <div className="aw2-m-rain-cell">
            <div className="k">Peak chance</div>
            <div className={"v" + (peakP < 20 ? " dry" : "")}>{peakP}<small>%</small></div>
            <div className="sub">Highest hour</div>
          </div>
          <svg className="aw2-m-rain-chart" viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
            <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB}
                  fill="none" stroke="var(--rule)" strokeWidth="0.5"/>
            {[0,6,12,18].map(hr => (
              <line key={hr} x1={xs(hr)} x2={xs(hr)} y1={padT} y2={H - padB}
                    stroke="var(--rule-faint)" strokeWidth="0.5"/>
            ))}
            {/* probability area */}
            <path d={
              next24p.map((p, i) => `${i ? "L" : "M"} ${xs(i)} ${H - padB - (p / 100) * (H - padT - padB) * 0.9}`).join(" ")
              + ` L ${xs(23)} ${H - padB} L ${xs(0)} ${H - padB} Z`
            } fill="var(--teal)" opacity="0.10"/>
            {/* mm bars */}
            {next24.map((v, i) => {
              if (v <= 0) return null;
              const x = xs(i) - colW * 0.3;
              const y = H - padB - (v / pMax) * (H - padT - padB) * 0.9;
              return <rect key={i} fill="var(--teal)" x={x} y={y} width={colW * 0.6} height={H - padB - y}/>;
            })}
            <text x={padL - 4} y={padT + 8} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{pMax.toFixed(1)}mm</text>
            <text x={padL - 4} y={H - padB} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>0</text>
            {[0,6,12,18].map(hr => (
              <text key={hr} x={xs(hr)} y={H - 3}
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>
                +{hr}h
              </text>
            ))}
          </svg>
        </div>
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>7-day outlook</b><span>HI · LO · MM</span></div>
        <div className="aw2-m-7">
          {days7.map((day, i) => {
            const segL = ((day.lo - minLo) / (maxHi - minLo)) * 100;
            const segR = ((day.hi - minLo) / (maxHi - minLo)) * 100;
            return (
              <div key={i} className="aw2-m-7-row">
                <div className="d">{i === 0 ? "TODAY" : day.d}<b>{day.dt}</b></div>
                <div className="bar">
                  <div className="seg" style={{ left: segL + "%", width: (segR - segL) + "%" }}/>
                </div>
                <div className={"rain" + (day.rain < 0.1 ? " dry" : "")}>
                  <span>{day.rain < 0.1 ? "·" : day.rain.toFixed(1) + "mm"}</span>
                  <span className="pct">{day.pct}%</span>
                </div>
                <div className="temps">
                  <span>{Math.round(day.hi)}°</span>
                  <span className="sep"> / </span>
                  <span className="lo">{Math.round(day.lo)}°</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>Soil · multi-depth</b><span>NOW</span></div>
        <div className="aw2-m-soil">
          {soil.map((s, i) => {
            const moistPct = Math.round(s.m * 100);
            return (
              <div key={i} className="aw2-m-soil-row">
                <div className="d">{s.s}<b>{s.d} cm</b></div>
                <div className="meter">
                  <div className="meter-fill" style={{ width: moistPct + "%" }}/>
                </div>
                <div className="moist">{moistPct}<small>%</small></div>
                <div className="temp">{fmt1(s.t)}<small>°C</small></div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>Wind today</b><span>10 m AGL</span></div>
        <div className="aw2-m-wind">
          <svg width="88" height="88" viewBox="0 0 88 88">
            <circle cx="44" cy="44" r="40" fill="none" stroke="var(--rule)" strokeWidth="0.5"/>
            <circle cx="44" cy="44" r="28" fill="none" stroke="var(--rule)" strokeWidth="0.3"/>
            {/* 16 cardinal ticks */}
            {Array.from({ length: 16 }).map((_, i) => {
              const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
              const r1 = 40, r2 = i % 4 === 0 ? 34 : 37;
              return <line key={i} x1={44 + Math.cos(a) * r1} y1={44 + Math.sin(a) * r1}
                           x2={44 + Math.cos(a) * r2} y2={44 + Math.sin(a) * r2}
                           stroke="var(--ink)" strokeOpacity={i % 4 === 0 ? 0.5 : 0.25}/>;
            })}
            <text x="44" y="14" textAnchor="middle" style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontWeight: 600 }}>N</text>
            <text x="44" y="80" textAnchor="middle" style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontWeight: 600 }}>S</text>
            <text x="78" y="48" textAnchor="middle" style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontWeight: 600 }}>E</text>
            <text x="10" y="48" textAnchor="middle" style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontWeight: 600 }}>W</text>
            {/* needle: wind from c.wind_direction_10m */}
            {(() => {
              const a = (c.wind_direction_10m - 90) * Math.PI / 180;
              const x = 44 + Math.cos(a) * 36, y = 44 + Math.sin(a) * 36;
              const a2 = ((c.wind_direction_10m + 180) - 90) * Math.PI / 180;
              const x2 = 44 + Math.cos(a2) * 36, y2 = 44 + Math.sin(a2) * 36;
              return (
                <g>
                  <line x1={x} y1={y} x2={x2} y2={y2} stroke="var(--ink)" strokeWidth="1.6"/>
                  <polygon points={`${x2-4},${y2-4} ${x2+4},${y2-4} ${x2},${y2+4}`}
                           transform={`rotate(${c.wind_direction_10m + 180} ${x2} ${y2})`}
                           fill="var(--ink)"/>
                  <circle cx="44" cy="44" r="2.5" fill="var(--ink)"/>
                </g>
              );
            })()}
          </svg>
          <div className="stats">
            <div>Speed<b>{fmt0(c.wind_speed_10m)}<small>km/h</small></b></div>
            <div>Gust<b>{fmt0(c.wind_gusts_10m)}<small>km/h</small></b></div>
            <div>Direction<b>{dirToCompass(c.wind_direction_10m)}<small>{c.wind_direction_10m}°</small></b></div>
          </div>
        </div>
      </section>

      <footer className="aw2-m-foot">
        Open-Meteo · ECMWF · UKMO · Updated {obsTime}
      </footer>
    </div>
  );
};



export function AceWeatherV2Synoptic() {
  return (
    <main className="aw2-shell">
      <section className="aw2-shell-desktop" aria-label="AceWeather desktop mission control">
        <Desktop />
      </section>
      <section className="aw2-shell-mobile" aria-label="AceWeather mobile PWA">
        <Mobile />
      </section>
    </main>
  );
}
