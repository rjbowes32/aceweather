/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/* Builds the view-model the cards render, from a live Open-Meteo forecast.
   Critically: nowIndex is derived from current.time vs hourly.time (not hard-coded),
   so past_days:7 data is aligned correctly. */

import {
  weatherCondition, conditionSummary, dirToCompass, weekdayShort,
  weekdayIndexMonFirst, dayOfMonth, timeLabel,
} from "./format";
import { buildAgronomy } from "./agronomy";

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const sum = (xs) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
const minOf = (xs) => Math.min(...xs.map((v) => (v == null ? Infinity : v)));
const maxOf = (xs) => Math.max(...xs.map((v) => (v == null ? -Infinity : v)));

function nowHourIndex(times, currentTime) {
  if (!times?.length) return 0;
  const t = String(currentTime || "");
  const idx = times.findIndex((x) => x > t);
  if (idx === -1) return times.length - 1;
  return Math.max(0, idx - 1);
}

function todayDailyIndex(times, todayKey) {
  if (!times?.length) return 0;
  const exact = times.findIndex((x) => x.slice(0, 10) === todayKey);
  if (exact >= 0) return exact;
  const next = times.findIndex((x) => x.slice(0, 10) >= todayKey);
  return next >= 0 ? next : 0;
}

/** Map a series window to an SVG polyline path inside a band. */
function bandPath(vals, x0, x1, y0, y1, vmin, vmax, close = false) {
  const span = vmax - vmin || 1;
  const n = vals.length;
  const x = (i) => x0 + ((x1 - x0) * i) / (n - 1);
  const y = (v) => y1 - ((y1 - y0) * ((v ?? vmin) - vmin)) / span;
  let d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  if (close) d += `L${x(n - 1).toFixed(1)} ${y1}L${x(0).toFixed(1)} ${y1}Z`;
  return d;
}

export function buildModel(raw) {
  const cur = raw.current || {};
  const h = raw.hourly || { time: [] };
  const d = raw.daily || { time: [] };
  const obs = String(cur.time || h.time?.[0] || "");
  const todayKey = obs.slice(0, 10);
  const ni = nowHourIndex(h.time, obs);
  const di = todayDailyIndex(d.time, todayKey);

  // ---------- NOW ----------
  const isDay = cur.is_day == null ? 1 : Number(cur.is_day);
  const condition = weatherCondition(cur.weather_code, isDay);
  const compass = dirToCompass(cur.wind_direction_10m);
  const now = {
    temp: cur.temperature_2m, feels: cur.apparent_temperature,
    hi: d.temperature_2m_max?.[di], lo: d.temperature_2m_min?.[di],
    rh: cur.relative_humidity_2m, dew: cur.dew_point_2m, pressure: cur.pressure_msl,
    wind: cur.wind_speed_10m, gust: cur.wind_gusts_10m, compass, windDir: cur.wind_direction_10m,
    cloud: cur.cloud_cover, vis: cur.visibility != null ? Number(cur.visibility) / 1000 : null,
    uv: cur.uv_index, precip: cur.precipitation, precipProb: h.precipitation_probability?.[ni], isDay, condition,
    summary: conditionSummary(condition.key, compass), obsTime: timeLabel(obs),
  };

  // ---------- 24h TREND (line chart) ----------
  const tw0 = Math.max(0, ni - 12);
  const tw1 = Math.min(h.time.length, ni + 25);
  const tT = h.temperature_2m.slice(tw0, tw1);
  const tR = h.precipitation.slice(tw0, tw1);
  const tP = h.pressure_msl.slice(tw0, tw1);
  const W = 560, H = 180, x0 = 28, x1 = 540, yT0 = 26, yT1 = 150;
  const tMin = Math.floor(minOf(tT) - 1), tMax = Math.ceil(maxOf(tT) + 1);
  const pMin = Math.floor(minOf(tP) - 1), pMax = Math.ceil(maxOf(tP) + 1);
  const rMax = Math.max(1, maxOf(tR));
  const nowX = x0 + ((x1 - x0) * (ni - tw0)) / (tT.length - 1);
  const trend = {
    viewW: W, viewH: H, nowX: +nowX.toFixed(1),
    tempPath: bandPath(tT, x0, x1, yT0, yT1, tMin, tMax),
    areaPath: bandPath(tT, x0, x1, yT0, yT1, tMin, tMax, true),
    rainPath: bandPath(tR, x0, x1, yT0 + 20, yT1, 0, rMax),
    pressPath: bandPath(tP, x0, x1, yT0, yT1, pMin, pMax),
    tMax, tMin,
  };

  // ---------- RAINFALL ----------
  const next24 = h.precipitation.slice(ni, ni + 24);
  const next24p = (h.precipitation_probability || []).slice(ni, ni + 24);
  const sum24 = sum(next24);
  const peakProb = next24p.length ? Math.max(...next24p.map((v) => v || 0)) : 0;
  const dailyP = d.precipitation_sum || [];
  const past7 = sum(dailyP.slice(Math.max(0, di - 7), di));
  const next7 = sum(dailyP.slice(di, di + 7));
  const next14 = sum(dailyP.slice(di, di + 14));

  const buckets12 = [];
  for (let i = 0; i < 12; i++) {
    const v = (next24[i * 2] || 0) + (next24[i * 2 + 1] || 0);
    buckets12.push(v);
  }
  const bMax = Math.max(1, ...buckets12);
  const mkBars = (vals, labels, maxV) => vals.map((v, i) => ({
    h: clamp((v / (maxV || 1)) * 100, 1, 100), label: labels[i], dry: (v || 0) < 0.1, now: i === 0,
  }));
  const rainHourLabels = Array.from({ length: 12 }, (_, i) => timeLabel(h.time[ni + i * 2] || ""));
  const dLabels = (start, n) => Array.from({ length: n }, (_, i) => weekdayShort(d.time[start + i] || "").slice(0, 1));
  const dNums = (start, n) => Array.from({ length: n }, (_, i) => String(dayOfMonth(d.time[start + i] || "1")));
  const rain = {
    sum24: +sum24.toFixed(1), peakProb, past7: +past7.toFixed(1), next7: +next7.toFixed(1),
    ranges: {
      "24h": { cap: "Next 24h · 2-hour totals", total: +sum24.toFixed(1),
        bars: mkBars(buckets12, rainHourLabels, bMax) },
      "7d": { cap: "Next 7 days · daily", total: +next7.toFixed(1),
        bars: mkBars(dailyP.slice(di, di + 7), dLabels(di, 7), Math.max(1, ...dailyP.slice(di, di + 7))) },
      "14d": { cap: "Next 14 days · daily", total: +next14.toFixed(1),
        bars: mkBars(dailyP.slice(di, di + 14), dNums(di, 14), Math.max(1, ...dailyP.slice(di, di + 14))) },
    },
  };

  // ---------- 14-DAY CALENDAR (+ per-day hourly) ----------
  const hoursByDate = new Map();
  for (let j = 0; j < h.time.length; j++) {
    const key = h.time[j].slice(0, 10);
    let arr = hoursByDate.get(key);
    if (!arr) { arr = []; hoursByDate.set(key, arr); }
    arr.push(j);
  }
  const calMax = Math.max(1, ...dailyP.slice(di, di + 14));
  const calendar = [];
  for (let i = 0; i < 14 && di + i < d.time.length; i++) {
    const k = di + i;
    const dk = d.time[k];
    const idxs = hoursByDate.get(dk) || [];
    const hTemp = idxs.map((j) => h.temperature_2m[j]);
    const hRain = idxs.map((j) => h.precipitation[j] ?? 0);
    const hWind = idxs.map((j) => h.wind_speed_10m[j]);
    calendar.push({
      dateKey: dk, dayNum: dayOfMonth(dk), weekday: weekdayShort(dk),
      hi: d.temperature_2m_max?.[k], lo: d.temperature_2m_min?.[k],
      rain: dailyP[k], prob: d.precipitation_probability_max?.[k],
      rainPct: clamp(((dailyP[k] || 0) / calMax) * 100, 0, 100),
      condition: weatherCondition(d.weather_code?.[k], 1), isToday: i === 0,
      hours: {
        labels: idxs.map((j) => h.time[j].slice(11, 13)),
        temp: hTemp, rain: hRain, wind: hWind,
        tMax: idxs.length ? Math.round(maxOf(hTemp)) : null,
        tMin: idxs.length ? Math.round(minOf(hTemp)) : null,
        rainSum: +sum(hRain).toFixed(1), windMax: idxs.length ? Math.round(maxOf(hWind)) : null,
      },
    });
  }
  const calendarOffset = calendar.length ? weekdayIndexMonFirst(calendar[0].dateKey) : 0;

  // ---------- AGRONOMY (heuristic) ----------
  const wind = h.wind_speed_10m, gust = h.wind_gusts_10m, rhh = h.relative_humidity_2m, prc = h.precipitation;
  let open = 0, longest = 0, run = 0, gustFails = 0, rainFails = 0;
  for (let i = ni; i < ni + 24 && i < h.time.length; i++) {
    const dry = (prc[i] || 0) < 0.1, calm = wind[i] >= 3 && wind[i] <= 16 && gust[i] < 22;
    if (dry && calm) { open++; run++; longest = Math.max(longest, run); }
    else { run = 0; if (!dry) rainFails++; else gustFails++; }
  }
  const sprayScore = Math.round(clamp((open / 24) * 100));
  const spray = {
    score: sprayScore, open, longest,
    label: sprayScore >= 60 ? "Go" : sprayScore >= 35 ? "Watch" : "Limited",
    tone: sprayScore >= 60 ? "go" : sprayScore >= 35 ? "warn" : "risk",
    sub: rainFails > gustFails ? `~${longest}h block — rain is the limiter` : `~${longest}h block — wind is the limiter`,
  };

  const surfM = h.soil_moisture_0_to_1cm?.[ni] ?? 0.3;
  const accessScore = Math.round(clamp(100 - ((surfM - 0.18) / (0.45 - 0.18)) * 80 - clamp(past7 * 1.5, 0, 20)));
  const access = {
    score: accessScore, moist: Math.round(surfM * 100),
    label: accessScore >= 60 ? "Good" : accessScore >= 35 ? "Caution" : "Poor",
    tone: accessScore >= 60 ? "go" : accessScore >= 35 ? "warn" : "risk",
    sub: `Surface ${Math.round(surfM * 100)}% · 7-day rain ${past7.toFixed(1)} mm`,
  };

  let wetHours = 0;
  for (let i = ni; i < ni + 24 && i < h.time.length; i++) if ((rhh[i] || 0) >= 90 || (prc[i] || 0) > 0.1) wetHours++;
  const fungalScore = Math.round(clamp(wetHours * 4 + Math.min(sum24, 10) * 2));
  const fungal = {
    score: fungalScore, wetHours,
    label: fungalScore >= 65 ? "High" : fungalScore >= 40 ? "Elevated" : "Low",
    tone: fungalScore >= 65 ? "risk" : fungalScore >= 40 ? "warn" : "go",
    sub: `${wetHours}h leaf-wetness risk next 24h`,
  };

  const nightT = h.temperature_2m.slice(ni, ni + 16);
  const airMin = minOf(nightT);
  const clearCalm = (now.cloud ?? 50) < 45 && (now.wind ?? 10) < 8;
  const grassOffset = clearCalm ? 3.5 : (now.cloud ?? 50) < 70 ? 2 : 1;
  const grassMin = airMin - grassOffset;
  const frost = {
    airMin: +airMin.toFixed(1), grassMin: +grassMin.toFixed(1),
    label: grassMin <= 0 ? "Frost likely" : grassMin <= 2 ? "Grass-frost risk" : "No frost",
    tone: grassMin <= 0 ? "risk" : grassMin <= 2 ? "warn" : "go",
  };

  // ---------- SOIL PROFILE ----------
  const soil = [
    { depth: "0 cm", sub: "Surface", temp: h.soil_temperature_0cm?.[ni], moist: h.soil_moisture_0_to_1cm?.[ni] },
    { depth: "6 cm", sub: "Topsoil", temp: h.soil_temperature_6cm?.[ni], moist: h.soil_moisture_1_to_3cm?.[ni] },
    { depth: "18 cm", sub: "Root zone", temp: h.soil_temperature_18cm?.[ni], moist: h.soil_moisture_3_to_9cm?.[ni] },
    { depth: "54 cm", sub: "Sub-soil", temp: h.soil_temperature_54cm?.[ni], moist: h.soil_moisture_27_to_81cm?.[ni] },
  ].map((s) => ({ ...s, moistPct: Math.round((s.moist ?? 0) * 100) }));

  // ---------- ALERTS (signal tags) ----------
  const alerts = [];
  if (now.gust >= 25) alerts.push({ tone: "warn", label: "Gust watch" });
  if (sum24 >= 1) alerts.push({ tone: "rain", label: `Rain ${sum24.toFixed(1)} mm next 24h` });
  if (frost.tone !== "go") alerts.push({ tone: frost.tone === "risk" ? "risk" : "cool", label: frost.label });
  if (now.uv >= 6) alerts.push({ tone: "sun", label: `UV ${Math.round(now.uv)}` });
  if (!alerts.length) alerts.push({ tone: "go", label: "Settled conditions" });

  // ---------- HOURLY OUTLOOK (rest of today, into tomorrow AM if late) ----------
  const AP = h.apparent_temperature || [];
  const mkHour = (i) => ({
    label: h.time[i].slice(11, 16), dateKey: h.time[i].slice(0, 10), weekday: weekdayShort(h.time[i]),
    temp: h.temperature_2m[i], feels: AP[i], wind: h.wind_speed_10m[i], gust: h.wind_gusts_10m[i],
    precip: h.precipitation[i] ?? 0, prob: h.precipitation_probability?.[i] ?? 0,
  });
  const todayHours = [];
  let j = ni;
  for (; j < h.time.length && h.time[j].slice(0, 10) === todayKey; j++) todayHours.push(mkHour(j));
  if (todayHours.length < 10) {
    for (; j < h.time.length; j++) {
      if (Number(h.time[j].slice(11, 13)) > 11) break; // stop after tomorrow 11:00
      todayHours.push(mkHour(j));
    }
  }

  // ---------- SUN & DAYLIGHT ----------
  const toMin = (s) => { const t = timeLabel(s); const [hh, mm] = String(t).split(":").map(Number); return Number.isFinite(hh) ? hh * 60 + mm : null; };
  const srMin = toMin(d.sunrise?.[di]), ssMin = toMin(d.sunset?.[di]), nowMin = toMin(obs);
  const dayLenMin = srMin != null && ssMin != null ? Math.max(0, ssMin - srMin) : null;
  const fmtDur = (m) => (m == null ? "—" : `${Math.floor(m / 60)}h ${m % 60}m`);
  const sun = {
    sunrise: timeLabel(d.sunrise?.[di]), sunset: timeLabel(d.sunset?.[di]),
    dayLength: fmtDur(dayLenMin),
    daylightLeft: now.isDay && ssMin != null && nowMin != null ? fmtDur(Math.max(0, ssMin - nowMin)) : (now.isDay ? "—" : "Night"),
    elapsed: dayLenMin && nowMin != null ? Math.max(0, Math.min(1, (nowMin - srMin) / dayLenMin)) : 0,
    uvMax: d.uv_index_max?.[di], uvNow: now.uv, isDay: now.isDay,
  };

  // ---------- NEXT RAIN ----------
  let nextRain = null;
  for (let i = ni; i < Math.min(h.time.length, ni + 24); i++) {
    if ((h.precipitation[i] || 0) >= 0.3) {
      let mm = 0, k = i;
      while (k < h.time.length && (h.precipitation[k] || 0) > 0) { mm += h.precipitation[k]; k++; }
      nextRain = { inHours: i - ni, atLabel: h.time[i].slice(11, 16), atKey: h.time[i].slice(0, 13), mm: +mm.toFixed(1), prob: h.precipitation_probability?.[i] ?? null };
      break;
    }
  }

  const agro = buildAgronomy(h, d, ni, di, cur);
  return { obs, todayKey, now, trend, rain, calendar, calendarOffset, todayHours, sun, nextRain, agronomy: { spray, access, fungal, frost, ...agro }, soil, alerts };
}

export type AwModel = ReturnType<typeof buildModel>;
