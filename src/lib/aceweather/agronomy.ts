/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/* Agronomy models computed from the Open-Meteo hourly forecast.
   Spraying (Delta-T, inversion, rain-fast, drying) + disease (Hutton late blight,
   Septoria, leaf-wetness). All heuristic decision support, not validated advice. */

import { weekdayShort, dayOfMonth } from "./format";

/** Stull (2011) wet-bulb approximation from temperature (°C) and RH (%). */
function wetBulb(T, RH) {
  if (T == null || RH == null) return null;
  const rh = Math.max(1, Math.min(100, RH));
  return (
    T * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(T + rh) - Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) - 4.686035
  );
}

const hourNum = (t) => Number(String(t).slice(11, 13));
const isNightHour = (hr) => hr < 8 || hr >= 19;

export function buildAgronomy(h, d, ni, di, cur) {
  const time = h.time || [];
  const N = time.length;
  const T = h.temperature_2m, RH = h.relative_humidity_2m, P = h.precipitation;
  const W = h.wind_speed_10m, G = h.wind_gusts_10m, CL = h.cloud_cover, ET = h.et0_fao_evapotranspiration || [];
  const deltaTAt = (i) => { const wb = wetBulb(T[i], RH[i]); return wb == null ? null : T[i] - wb; };
  const todayKey = (time[ni] || "").slice(0, 10);

  // group hour indices by date
  const byDate = new Map();
  for (let i = 0; i < N; i++) {
    const k = time[i].slice(0, 10);
    let a = byDate.get(k); if (!a) { a = []; byDate.set(k, a); } a.push(i);
  }
  const dates = [...byDate.keys()].sort();

  // ---------- SPRAYING ----------
  const sprayOk = (i) => {
    const dt = deltaTAt(i);
    const inv = isNightHour(hourNum(time[i])) && W[i] < 6.5 && (CL[i] ?? 50) < 40;
    return (P[i] || 0) < 0.1 && W[i] >= 3 && W[i] <= 15 && (G[i] ?? 0) < 20 && dt != null && dt >= 2 && dt <= 10 && !inv;
  };
  let ws = -1;
  for (let i = ni; i < Math.min(N, ni + 48); i++) { if (sprayOk(i)) { ws = i; break; } }
  let wlen = 0;
  if (ws >= 0) { for (let i = ws; i < Math.min(N, ni + 48) && sprayOk(i); i++) wlen++; }
  const nextWindow = ws >= 0
    ? { start: time[ws].slice(11, 16), end: time[Math.min(N - 1, ws + wlen)].slice(11, 16), hours: wlen, today: time[ws].slice(0, 10) === todayKey }
    : null;

  const dtNow = deltaTAt(ni);
  const wN = cur.wind_speed_10m ?? W[ni], gN = cur.wind_gusts_10m ?? G[ni], pN = cur.precipitation ?? P[ni];
  const invNow = isNightHour(hourNum(time[ni])) && wN < 6.5 && (CL[ni] ?? 50) < 40;
  let verdict = "Caution", vt = "warn", reason = "Borderline conditions";
  if ((pN || 0) >= 0.1) { verdict = "Hold"; vt = "risk"; reason = "Rain on the canopy"; }
  else if (invNow) { verdict = "Hold"; vt = "risk"; reason = "Temperature inversion risk"; }
  else if (wN > 15 || gN >= 22) { verdict = "Hold"; vt = "risk"; reason = "Too windy / gusty for drift"; }
  else if (dtNow != null && dtNow > 10) { verdict = "Caution"; vt = "warn"; reason = "High Delta-T — fast evaporation"; }
  else if (wN < 3) { verdict = "Caution"; vt = "warn"; reason = "Too calm — drift / inversion prone"; }
  else if (dtNow != null && dtNow >= 2 && dtNow <= 8 && wN >= 3 && wN <= 15 && gN < 20) { verdict = "Go"; vt = "go"; reason = "Conditions in the spray band"; }

  let rainFast = null;
  for (let i = ni; i < Math.min(N, ni + 48); i++) { if ((P[i] || 0) > 0.2) { rainFast = i - ni; break; } }

  let invStart = -1;
  for (let i = ni; i < Math.min(N, ni + 20); i++) {
    if (isNightHour(hourNum(time[i])) && W[i] < 7 && (CL[i] ?? 50) < 50) { invStart = i; break; }
  }
  let invLen = 0;
  if (invStart >= 0) { for (let i = invStart; i < Math.min(N, ni + 26) && isNightHour(hourNum(time[i])) && W[i] < 7 && (CL[i] ?? 50) < 50; i++) invLen++; }
  const inversion = invStart >= 0
    ? { risk: W[invStart] < 5 ? "High" : "Likely", window: time[invStart].slice(11, 16) + "–" + time[Math.min(N - 1, invStart + invLen)].slice(11, 16) }
    : { risk: "Low", window: null };

  const dt2 = dtNow == null ? null : Math.round(dtNow * 10) / 10;
  const dtLabel = dt2 == null ? "—" : dt2 < 2 ? "Too low" : dt2 <= 8 ? "Ideal" : dt2 <= 10 ? "Marginal" : "Too high";
  const dtTone = dt2 == null ? "muted" : dt2 < 2 ? "warn" : dt2 <= 8 ? "go" : dt2 <= 10 ? "warn" : "risk";
  const spraying = { deltaT: dt2, deltaTLabel: dtLabel, deltaTTone: dtTone, verdict, verdictTone: vt, verdictReason: reason, windNow: Math.round(wN ?? 0), gustNow: Math.round(gN ?? 0), nextWindow, rainFast, inversion };

  // ---------- DRYING ----------
  const dryDays = dates.filter((k) => k >= todayKey).slice(0, 6).map((k) => {
    const idx = byDate.get(k);
    const et = idx.reduce((s, i) => s + (ET[i] || 0), 0);
    const rain = idx.reduce((s, i) => s + (P[i] || 0), 0);
    let label = "Poor", tone = "risk";
    if (rain < 1 && et >= 3.5) { label = "Good"; tone = "go"; }
    else if (rain < 2 && et >= 2) { label = "Fair"; tone = "warn"; }
    return { k, weekday: weekdayShort(k), et: +et.toFixed(1), rain: +rain.toFixed(1), label, tone };
  });
  const drying = { today: dryDays[0] || null, best: dryDays.find((d) => d.label === "Good") || null, days: dryDays };

  // ---------- LATE BLIGHT (Hutton Criteria) ----------
  const blightDays = dates.map((k) => {
    const idx = byDate.get(k);
    const temps = idx.map((i) => T[i]).filter((v) => v != null);
    const minT = temps.length ? Math.min(...temps) : null;
    const rh90 = idx.reduce((c, i) => c + ((RH[i] ?? 0) >= 90 ? 1 : 0), 0);
    const isHutton = minT != null && minT >= 10 && rh90 >= 6;
    return { k, dayNum: dayOfMonth(k), weekday: weekdayShort(k), minT: minT == null ? null : +minT.toFixed(1), rh90, label: rh90 + "h", isHutton, period: false };
  });
  for (let i = 1; i < blightDays.length; i++) {
    if (blightDays[i].isHutton && blightDays[i - 1].isHutton) { blightDays[i].period = true; blightDays[i - 1].period = true; }
  }
  blightDays.forEach((d) => { d.tone = d.period ? "risk" : d.isHutton ? "warn" : (d.minT >= 10 && d.rh90 >= 4) ? "warn" : "go"; });
  const ti = Math.max(0, blightDays.findIndex((d) => d.k === todayKey));
  const today = blightDays[ti] || {};
  let status = "Low", btone = "go";
  if (today.period) { status = "Hutton period"; btone = "risk"; }
  else if (today.isHutton) { status = "High risk"; btone = "risk"; }
  else if (today.minT >= 10 && today.rh90 >= 4) { status = "Borderline"; btone = "warn"; }
  const periodDay = blightDays.slice(ti).find((d) => d.period);
  const blight = {
    status, tone: btone,
    nextPeriod: periodDay ? `${periodDay.weekday} ${periodDay.dayNum}` : null,
    days: blightDays.slice(ti, ti + 10),
  };

  // ---------- DISEASE PRESSURE (leaf wetness + Septoria) ----------
  let lwd24 = 0, warm = 0;
  for (let i = ni; i < Math.min(N, ni + 24); i++) {
    if ((RH[i] ?? 0) >= 90 || (P[i] || 0) > 0.1) lwd24++;
    if (T[i] >= 10 && T[i] <= 25) warm++;
  }
  const pressure = Math.round(Math.min(100, lwd24 * 3.5 + (warm / 24) * 30));
  let rain5 = 0, wetDays = 0;
  dates.filter((k) => k >= todayKey).slice(0, 5).forEach((k) => {
    const r = byDate.get(k).reduce((s, i) => s + (P[i] || 0), 0);
    rain5 += r; if (r >= 2) wetDays++;
  });
  const septoriaLabel = wetDays >= 2 ? "High" : wetDays >= 1 ? "Moderate" : "Low";
  const septoriaTone = wetDays >= 2 ? "risk" : wetDays >= 1 ? "warn" : "go";
  const disease = {
    pressure, pressureLabel: pressure >= 65 ? "High" : pressure >= 40 ? "Elevated" : "Low",
    pressureTone: pressure >= 65 ? "risk" : pressure >= 40 ? "warn" : "go",
    lwd24,
    septoriaLabel, septoriaTone, septoriaDriver: `${rain5.toFixed(1)} mm over ${wetDays} wet day${wetDays === 1 ? "" : "s"} next 5d`,
  };

  // ---------- SOIL WATER BALANCE (SMD) ----------
  const SM0 = h.soil_moisture_0_to_1cm || [];
  let smd = 0; const smdSeries = [];
  dates.forEach((k) => {
    const idx = byDate.get(k);
    const dayET = idx.reduce((s, i) => s + (ET[i] || 0), 0);
    const dayRain = idx.reduce((s, i) => s + (P[i] || 0), 0);
    smd = Math.max(0, smd + dayET - dayRain);
    smdSeries.push({ k, smd });
  });
  const todaySmd = smdSeries.find((x) => x.k === todayKey) || smdSeries[smdSeries.length - 1] || { smd: 0 };
  const todaySMD = Math.round(todaySmd.smd);
  const future = smdSeries.filter((x) => x.k > todayKey).slice(0, 7);
  const smd7 = future.length ? Math.round(future[future.length - 1].smd) : todaySMD;
  const surfM = SM0[ni] ?? 0.3;
  const soilWater = {
    smd: todaySMD, smd7,
    trend: smd7 > todaySMD + 2 ? "drying" : smd7 < todaySMD - 2 ? "wetting" : "steady",
    irrigation: todaySMD > 40 ? `Consider ~${Math.min(todaySMD, 25)} mm` : "Not needed",
    irrigTone: todaySMD > 40 ? "warn" : "go",
    workLabel: surfM < 0.30 ? "Good" : surfM <= 0.40 ? "Marginal" : "Poor",
    surfMoist: Math.round(surfM * 100),
  };

  // ---------- DRILLING THERMOMETER ----------
  const ST6 = h.soil_temperature_6cm || [];
  const soil6 = ST6[ni];
  const soil6Prev = ST6[Math.max(0, ni - 24)];
  const soilTrend = soil6 == null || soil6Prev == null ? "steady" : soil6 > soil6Prev + 0.3 ? "rising" : soil6 < soil6Prev - 0.3 ? "falling" : "steady";
  const CROPS = [["Spring cereals", 5], ["Sugar beet", 6], ["Potatoes", 7], ["Maize", 8]];
  const drilling = {
    soil6: soil6 == null ? null : +soil6.toFixed(1), trend: soilTrend,
    crops: CROPS.map(([crop, th]) => ({ crop, th, ok: soil6 != null && soil6 >= th && !(th >= 8 && soilTrend === "falling") })),
  };

  // ---------- GROWING DEGREE DAYS (base 6 °C) ----------
  const GDD_BASE = 6;
  const tmax = d.temperature_2m_max || [], tmin = d.temperature_2m_min || [], dtime = d.time || [];
  const gddOf = (k) => { const hi = tmax[k], lo = tmin[k]; return (hi == null || lo == null) ? 0 : Math.max(0, (hi + lo) / 2 - GDD_BASE); };
  let acc = 0; const gddStrip = [];
  for (let i = 0; i < 14 && di + i < dtime.length; i++) { const g = gddOf(di + i); acc += g; gddStrip.push({ day: weekdayShort(dtime[di + i]).slice(0, 1), g: +g.toFixed(1) }); }
  let last7 = 0; for (let i = 1; i <= 7; i++) { if (di - i >= 0) last7 += gddOf(di - i); }
  const gdd = { base: GDD_BASE, today: +gddOf(di).toFixed(1), last7: Math.round(last7), next14: Math.round(acc), strip: gddStrip };

  // ---------- FROST OUTLOOK (next nights, grass minimum) ----------
  const frostOutlook = [];
  dates.filter((k) => k >= todayKey).slice(0, 6).forEach((k) => {
    const idx = byDate.get(k).filter((i) => hourNum(time[i]) <= 8);
    const temps = idx.map((i) => T[i]).filter((v) => v != null);
    if (!temps.length) return;
    const airMin = Math.min(...temps);
    const cloudAvg = idx.reduce((s, i) => s + (CL[i] ?? 50), 0) / idx.length;
    const windAvg = idx.reduce((s, i) => s + (W[i] ?? 5), 0) / idx.length;
    const off = cloudAvg < 45 && windAvg < 8 ? 3.5 : cloudAvg < 70 ? 2 : 1;
    const grassMin = +(airMin - off).toFixed(1);
    const tone = grassMin <= 0 ? "risk" : grassMin <= 2 ? "warn" : "go";
    frostOutlook.push({ dayNum: dayOfMonth(k), weekday: weekdayShort(k), airMin: +airMin.toFixed(1), grassMin, tone, label: `${grassMin}°` });
  });

  // ---------- OPERATIONS MATRIX (next 5 days) ----------
  const opsDays = dates.filter((k) => k >= todayKey).slice(0, 5);
  const dryByDate = new Map(dryDays.map((x) => [x.k, x]));
  const opRows = [
    { label: "Spray", fn: (idx) => { let ok = 0; idx.forEach((i) => { if (sprayOk(i)) ok++; }); return ok >= 4 ? "go" : ok >= 1 ? "warn" : "risk"; } },
    { label: "Travel", fn: (idx) => { const sm = idx.reduce((s, i) => s + (SM0[i] ?? 0.3), 0) / idx.length; const r = idx.reduce((s, i) => s + (P[i] || 0), 0); return sm < 0.35 && r < 2 ? "go" : sm < 0.42 && r < 5 ? "warn" : "risk"; } },
    { label: "Spread", fn: (idx) => { const wmax = Math.max(...idx.map((i) => G[i] ?? 0)); const r = idx.reduce((s, i) => s + (P[i] || 0), 0); const tmn = Math.min(...idx.map((i) => T[i] ?? 5)); return wmax < 35 && r < 6 && tmn > 0 ? "go" : wmax < 45 && r < 10 ? "warn" : "risk"; } },
    { label: "Cut / dry", fn: (idx, k) => { const dd = dryByDate.get(k); return dd ? dd.tone : "risk"; } },
  ];
  const ops = {
    days: opsDays.map((k) => ({ weekday: weekdayShort(k) })),
    rows: opRows.map((r) => ({ label: r.label, cells: opsDays.map((k) => r.fn(byDate.get(k), k)) })),
  };

  return { spraying, drying, blight, disease, soilWater, drilling, gdd, frostOutlook, ops };
}
