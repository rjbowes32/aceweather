import type { WeatherRow, WeatherInput, WeatherAgronomy, DryingDay } from "./weatherRows.ts";
import { asRecord, toNum, clamp, round, isoDay, hourOf, weekdayShort, dayOfMonth, findCurrentIndex, groupByDay, classifyScore, riskLabel, sumRows, minRows, maxRows } from "./weatherRows.ts";
import { buildSpraying, isSprayable, markDarkHours } from "./sprayWindow.ts";

export type { WeatherAgronomy, WeatherInput, WeatherRow, DryingDay } from "./weatherRows.ts";

export function buildAccess(futureRows: WeatherRow[], dailyRows: WeatherRow[], nowRow: WeatherRow) {
  // Missing moisture is unknown, never a stand-in figure: the score then
  // rests on rain alone and `moist` stays null.
  const surfaceMoisture = toNum(nowRow?.soilMoisture0to1, null);
  const rainNext24 = sumRows(futureRows.slice(0, 24), (row) => row?.precipitation);
  const rainNext7 = sumRows((dailyRows || []).slice(0, 7), (row) => row?.rain);
  const moisturePenalty = surfaceMoisture === null ? 0 : clamp(((surfaceMoisture - 0.18) / 0.27) * 70, 0, 70);
  const rainPenalty = clamp(rainNext24 * 3.5, 0, 18) + clamp(rainNext7 * 1.1, 0, 24);
  const score = Math.round(clamp(100 - moisturePenalty - rainPenalty, 0, 100));
  const classified = classifyScore(score, [40, 65]);
  return {
    score,
    label: classified.label,
    tone: classified.tone,
    moist: surfaceMoisture === null ? null : Math.round(surfaceMoisture * 100),
    rainNext24: round(rainNext24, 1),
    rainNext7: round(rainNext7, 1),
    sub: surfaceMoisture === null ? `Rain 7d ${round(rainNext7, 1)} mm` : `Surface ${Math.round(surfaceMoisture * 100)}% - rain 7d ${round(rainNext7, 1)} mm`,
  };
}

function buildFungal(futureRows: WeatherRow[]) {
  const next24 = futureRows.slice(0, 24);
  const wetHours = next24.filter((row) => toNum(row?.humidity, 0) >= 90 || toNum(row?.precipitation, 0) > 0.1).length;
  const rain24 = sumRows(next24, (row) => row?.precipitation);
  const score = Math.round(clamp(wetHours * 4 + Math.min(rain24, 10) * 2, 0, 100));
  const classified = riskLabel(score);
  return {
    score,
    wetHours,
    label: classified.label,
    tone: classified.tone,
    sub: `${wetHours}h leaf-wetness risk next 24h`,
  };
}

function buildDrying(futureRows: WeatherRow[]) {
  const grouped = groupByDay(futureRows);
  const days = [...grouped.entries()].slice(0, 6).map(([key, rows]) => {
    const et = sumRows(rows, (row) => row?.et0);
    const rain = sumRows(rows, (row) => row?.precipitation);
    let label = "Poor";
    let tone = "risk";
    if (rain < 1 && et >= 3.5) {
      label = "Good";
      tone = "go";
    } else if (rain < 2 && et >= 2) {
      label = "Fair";
      tone = "warn";
    }
    return { key, weekday: weekdayShort(key), et: round(et, 1), rain: round(rain, 1), label, tone };
  });
  return {
    today: days[0] || null,
    best: days.find((day) => day.label === "Good") || null,
    days,
  };
}

function buildBlight(futureRows: WeatherRow[], dailyRows: WeatherRow[]) {
  const grouped = groupByDay(futureRows);
  const days = (dailyRows || []).slice(0, 10).map((day) => {
    const key = isoDay(day?.time);
    const rows = grouped.get(key) || [];
    const minT = toNum(day?.tempMin, minRows(rows, (row) => row?.temperature));
    const rh90 = rows.filter((row) => toNum(row?.humidity, 0) >= 90).length;
    const isHutton = minT !== null && minT >= 10 && rh90 >= 6;
    return {
      key,
      dayNum: dayOfMonth(key),
      weekday: weekdayShort(key),
      minT: round(minT, 1),
      rh90,
      label: `${rh90}h`,
      isHutton,
      period: false,
      tone: "go",
    };
  });

  for (let i = 1; i < days.length; i += 1) {
    if (days[i].isHutton && days[i - 1].isHutton) {
      days[i].period = true;
      days[i - 1].period = true;
    }
  }

  for (const day of days) {
    day.tone = day.period ? "risk" : day.isHutton ? "warn" : (day.minT ?? -Infinity) >= 10 && day.rh90 >= 4 ? "warn" : "go";
  }

  const today = days[0] || {};
  let status = "Low";
  let tone = "go";
  if (today.period) {
    status = "Hutton period";
    tone = "risk";
  } else if (today.isHutton) {
    status = "High risk";
    tone = "risk";
  } else if ((today.minT ?? -Infinity) >= 10 && today.rh90 >= 4) {
    status = "Borderline";
    tone = "warn";
  }

  const periodDay = days.find((day) => day.period);
  return {
    status,
    tone,
    nextPeriod: periodDay ? `${periodDay.weekday} ${periodDay.dayNum}` : null,
    days,
  };
}

function buildDisease(futureRows: WeatherRow[], dailyRows: WeatherRow[]) {
  const next24 = futureRows.slice(0, 24);
  const lwd24 = next24.filter((row) => toNum(row?.humidity, 0) >= 90 || toNum(row?.precipitation, 0) > 0.1).length;
  const warmHours = next24.filter((row) => {
    const temp = toNum(row?.temperature, null);
    return temp !== null && temp >= 10 && temp <= 25;
  }).length;
  const pressure = Math.round(clamp(lwd24 * 3.5 + (warmHours / 24) * 30, 0, 100));
  const pressureClass = riskLabel(pressure);

  const next5 = (dailyRows || []).slice(0, 5);
  const rain5 = sumRows(next5, (row) => row?.rain);
  const wetDays = next5.filter((row) => toNum(row?.rain, 0) >= 2).length;
  const septoriaLabel = wetDays >= 2 ? "High" : wetDays >= 1 ? "Moderate" : "Low";
  const septoriaTone = wetDays >= 2 ? "risk" : wetDays >= 1 ? "warn" : "go";

  return {
    pressure,
    pressureLabel: pressureClass.label,
    pressureTone: pressureClass.tone,
    lwd24,
    septoriaLabel,
    septoriaTone,
    septoriaDriver: `${round(rain5, 1)} mm over ${wetDays} wet day${wetDays === 1 ? "" : "s"} next 5d`,
  };
}

function buildSoilWater(futureRows: WeatherRow[], dailyRows: WeatherRow[], nowRow: WeatherRow) {
  let smd = 0;
  const smdSeries = (dailyRows || []).map((day) => {
    const et = toNum(day?.et0, 0);
    const rain = toNum(day?.rain, 0);
    smd = Math.max(0, smd + et - rain);
    return { key: isoDay(day?.time), smd: round(smd, 1), et: round(et, 1), rain: round(rain, 1) };
  });

  const todaySMD = round(smdSeries[0]?.smd ?? 0, 0) as number;
  const sevenDay = smdSeries[Math.min(7, smdSeries.length) - 1] || smdSeries[smdSeries.length - 1] || { smd: 0 };
  const smd7 = round(sevenDay.smd, 0) as number;
  const surfaceMoisture = toNum(nowRow?.soilMoisture0to1, null);
  const known = surfaceMoisture !== null;
  return {
    smd: todaySMD,
    smd7,
    trend: smd7 > todaySMD + 2 ? "drying" : smd7 < todaySMD - 2 ? "wetting" : "steady",
    irrigation: todaySMD > 40 ? `Consider ${Math.min(todaySMD, 25)} mm` : "Not needed",
    irrigTone: todaySMD > 40 ? "warn" : "go",
    workLabel: !known ? null : surfaceMoisture < 0.3 ? "Good" : surfaceMoisture <= 0.4 ? "Marginal" : "Poor",
    workTone: !known ? "muted" : surfaceMoisture < 0.3 ? "go" : surfaceMoisture <= 0.4 ? "warn" : "risk",
    surfMoist: known ? Math.round(surfaceMoisture * 100) : null,
    daily: smdSeries,
  };
}

function buildDrilling(sourceRows: WeatherRow[], nowIndex: number) {
  const nowRow = sourceRows[nowIndex] || sourceRows[0] || {};
  const previousRow = sourceRows[Math.max(0, nowIndex - 24)] || nowRow;
  const soil6 = toNum(nowRow?.soilTemp6, null);
  const soil6Prev = toNum(previousRow?.soilTemp6, soil6);
  const trend = soil6 === null || soil6Prev === null ? "steady" : soil6 > soil6Prev + 0.3 ? "rising" : soil6 < soil6Prev - 0.3 ? "falling" : "steady";
  const crops = ([
    ["Spring cereals", 5],
    ["Sugar beet", 6],
    ["Potatoes", 7],
    ["Maize", 8],
  ] as [string, number][]).map(([crop, threshold]) => ({
    crop,
    threshold,
    ok: soil6 !== null && soil6 >= threshold && !(threshold >= 8 && trend === "falling"),
  }));
  return {
    soil6: round(soil6, 1),
    trend,
    crops,
  };
}

function buildGdd(dailyRows: WeatherRow[]) {
  const base = 6;
  const source = (Array.isArray(dailyRows) ? dailyRows : []) as WeatherRow[];
  const gddOf = (day: WeatherRow) => {
    const high = toNum(day?.tempMax, null);
    const low = toNum(day?.tempMin, null);
    const mean = toNum(day?.tempMean, high !== null && low !== null ? (high + low) / 2 : null);
    return mean === null ? 0 : Math.max(0, mean - base);
  };
  let acc = 0;
  const strip = source.slice(0, 14).map((day) => {
    const g = gddOf(day);
    acc += g;
    return { day: weekdayShort(day?.time).slice(0, 1), g: round(g, 1) };
  });
  return {
    base,
    today: round(gddOf(source[0]), 1),
    last7: null,
    next14: round(acc, 0),
    // Actual horizon accumulated — callers only fetch 7 forecast days by
    // default, so a fixed "14d" label would overstate the window.
    days: strip.length,
    strip,
  };
}

function buildFrost(futureRows: WeatherRow[], dailyRows: WeatherRow[], current: WeatherRow) {
  const cloud = toNum(current?.cloud_cover, toNum(futureRows[0]?.cloudCover, 50));
  const wind = toNum(current?.wind_speed_10m, toNum(futureRows[0]?.windSpeed, 10));
  const nightRows = futureRows.slice(0, 16);
  const airMin = minRows(nightRows, (row) => row?.temperature);
  const offset = cloud < 45 && wind < 8 ? 3.5 : cloud < 70 ? 2 : 1;
  const grassMin = airMin === null ? null : airMin - offset;
  const tone = grassMin === null ? "muted" : grassMin <= 0 ? "risk" : grassMin <= 2 ? "warn" : "go";
  const label = grassMin === null ? "Unknown" : grassMin <= 0 ? "Frost likely" : grassMin <= 2 ? "Grass-frost risk" : "No frost";

  const grouped = groupByDay(futureRows);
  const outlook = (dailyRows || []).slice(0, 6).map((day) => {
    const key = isoDay(day?.time);
    const rows = (grouped.get(key) || []).filter((row) => hourOf(row?.time) <= 8);
    const dayAirMin = minRows(rows, (row) => row?.temperature) ?? toNum(day?.tempMin, null);
    const cloudAvg = rows.length ? sumRows(rows, (row) => row?.cloudCover) / rows.length : cloud;
    const windAvg = rows.length ? sumRows(rows, (row) => row?.windSpeed) / rows.length : wind;
    const dayOffset = cloudAvg < 45 && windAvg < 8 ? 3.5 : cloudAvg < 70 ? 2 : 1;
    const dayGrass = dayAirMin === null ? null : dayAirMin - dayOffset;
    return {
      dayNum: dayOfMonth(key),
      weekday: weekdayShort(key),
      airMin: round(dayAirMin, 1),
      grassMin: round(dayGrass, 1),
      tone: dayGrass === null ? "muted" : dayGrass <= 0 ? "risk" : dayGrass <= 2 ? "warn" : "go",
      label: dayGrass === null ? "-" : `${round(dayGrass, 1)}C`,
    };
  });

  return {
    frost: {
      airMin: round(airMin, 1),
      grassMin: round(grassMin, 1),
      label,
      tone,
    },
    frostOutlook: outlook,
  };
}

function buildOps(futureRows: WeatherRow[], dailyRows: WeatherRow[], dryingDays: DryingDay[]) {
  const grouped = groupByDay(futureRows);
  const dryByDate = new Map((dryingDays || []).map((day) => [day.key, day]));
  const days = (dailyRows || []).slice(0, 5).map((day) => ({ key: isoDay(day?.time), weekday: weekdayShort(day?.time) }));
  const rows: { label: string; fn: (hours: WeatherRow[], key?: string) => string }[] = [
    {
      label: "Spray",
      fn: (hours) => {
        const ok = hours.filter(isSprayable).length;
        return ok >= 4 ? "go" : ok >= 1 ? "warn" : "risk";
      },
    },
    {
      label: "Travel",
      fn: (hours) => {
        // Unknown moisture is left out, never filled in; with none known, rain decides.
        const known = hours.map((row) => toNum(row?.soilMoisture0to1, null)).filter((value): value is number => value !== null);
        const avgMoisture = known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : 0;
        const rain = sumRows(hours, (row) => row?.precipitation);
        return avgMoisture < 0.35 && rain < 2 ? "go" : avgMoisture < 0.42 && rain < 5 ? "warn" : "risk";
      },
    },
    {
      label: "Spread",
      fn: (hours) => {
        const maxGust = maxRows(hours, (row) => row?.windGusts) ?? 0;
        const rain = sumRows(hours, (row) => row?.precipitation);
        const minTemp = minRows(hours, (row) => row?.temperature) ?? 5;
        return maxGust < 35 && rain < 6 && minTemp > 0 ? "go" : maxGust < 45 && rain < 10 ? "warn" : "risk";
      },
    },
    {
      label: "Cut/dry",
      fn: (_hours, key) => dryByDate.get(key ?? "")?.tone || "risk",
    },
  ];

  return {
    days: days.map((day) => ({ weekday: day.weekday })),
    rows: rows.map((row) => ({
      label: row.label,
      cells: days.map((day) => row.fn(grouped.get(day.key) || [], day.key)),
    })),
  };
}

export function buildWeatherAgronomy({ current, hourlyRows, allHourlyRows, dailyRows }: WeatherInput = {}): WeatherAgronomy | null {
  const hourly = Array.isArray(allHourlyRows) && allHourlyRows.length ? allHourlyRows : hourlyRows;
  const sourceRows = Array.isArray(hourly) ? hourly : [];
  const daily = Array.isArray(dailyRows) ? dailyRows : [];
  if (!sourceRows.length && !daily.length) return null;

  const currentRow = asRecord(current);
  const typedDailyRows = daily.map(asRecord) as WeatherRow[];
  const typedSourceRows = markDarkHours(sourceRows.map(asRecord) as WeatherRow[], typedDailyRows);

  const nowIndex = findCurrentIndex(typedSourceRows, currentRow);
  const futureRows = typedSourceRows.slice(nowIndex);
  const nowRow = futureRows[0] || typedSourceRows[0] || {};

  const spraying = buildSpraying(futureRows, currentRow, nowRow);
  const access = buildAccess(futureRows, typedDailyRows, nowRow);
  const fungal = buildFungal(futureRows);
  const drying = buildDrying(futureRows);
  // Hutton counts a whole calendar day's humid hours, so today includes the
  // hours already gone, not just those still to come.
  const blight = buildBlight(typedSourceRows, typedDailyRows);
  const disease = buildDisease(futureRows, typedDailyRows);
  const soilWater = buildSoilWater(futureRows, typedDailyRows, nowRow);
  const drilling = buildDrilling(typedSourceRows, nowIndex);
  const gdd = buildGdd(typedDailyRows);
  const frost = buildFrost(futureRows, typedDailyRows, currentRow);
  const ops = buildOps(futureRows, typedDailyRows, drying.days);

  return {
    ...spraying,
    access,
    fungal,
    drying,
    blight,
    disease,
    soilWater,
    drilling,
    gdd,
    frost: frost.frost,
    frostOutlook: frost.frostOutlook,
    ops,
    summary: {
      soilTemperature0cm: round(nowRow?.soilTemp0, 1),
      soilTemperature6cm: round(nowRow?.soilTemp6, 1),
      soilMoistureSurface: round(toNum(nowRow?.soilMoisture0to1, null), 3),
      rainNext24: access.rainNext24,
      rainNext7: access.rainNext7,
      windNow: spraying.spraying.windNow,
      gustNow: spraying.spraying.gustNow,
      fieldAccessScore: access.score,
      fieldAccessLabel: access.label,
    },
    disclaimer: "Weather-derived agronomy is heuristic planning support, not validated crop advice. Check local observations and product labels before acting.",
  };
}

export default buildWeatherAgronomy;
