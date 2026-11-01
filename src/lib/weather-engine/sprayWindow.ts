// The spray window: one rule for each hour (go, caution or hold), the verdict
// now, the next window and the inversion outlook.
import type { WeatherRow } from "./weatherRows.ts";
import { toNum, clamp, round, isoDay, dayAfter, hourOf, timeLabel, weekdayShort, longestTrueBlock, maxRows } from "./weatherRows.ts";

function wetBulbC(temperature: unknown, humidity: unknown) {
  const temp = toNum(temperature, null);
  const rhValue = toNum(humidity, null);
  if (temp === null || rhValue === null) return null;
  const rh = clamp(rhValue, 1, 100);
  return (
    temp * Math.atan(0.151977 * Math.sqrt(rh + 8.313659))
    + Math.atan(temp + rh)
    - Math.atan(rh - 1.676331)
    + 0.00391838 * (rh ** 1.5) * Math.atan(0.023101 * rh)
    - 4.686035
  );
}

function deltaT(row: WeatherRow) {
  const wb = wetBulbC(row?.temperature, row?.humidity);
  const temp = toNum(row?.temperature, null);
  return temp === null || wb === null ? null : temp - wb;
}

// Night follows the sun (Rob, 29 Oct 2026): an hour is dark when its middle
// falls before that day's sunrise or after its sunset, so winter evenings
// from about 16:30 count and summer mornings from about 05:00 do not. A row
// with no sun times for its day keeps the old fixed hours (before 08:00,
// from 19:00).
function isDark(row: WeatherRow) {
  if (typeof row?.dark === "boolean") return row.dark;
  const hour = hourOf(row?.time);
  return hour < 8 || hour >= 19;
}

/** Each hour marked dark or not from its day's sunrise and sunset. */
export function markDarkHours(rows: WeatherRow[], dailyRows: WeatherRow[]): WeatherRow[] {
  const sun = new Map(dailyRows.map((day) => [isoDay(day?.time), { rise: String(day?.sunrise || ""), set: String(day?.sunset || "") }]));
  return rows.map((row) => {
    const times = sun.get(isoDay(row?.time));
    if (!times?.rise.includes("T") || !times.set.includes("T")) return row;
    const middle = `${String(row?.time || "").slice(0, 14)}30`;
    return { ...row, dark: middle < times.rise || middle >= times.set };
  });
}

function isNightInversionRow(row: WeatherRow) {
  // Unknown wind is not calm: the spray check holds it as "Wind unknown".
  const wind = toNum(row?.windSpeed, null);
  const cloud = toNum(row?.cloudCover, 50);
  return isDark(row) && wind !== null && wind < 6.5 && cloud < 40;
}

// Spray rules (Rob, 28 Oct 2026). Average wind decides, as UK guidance
// does: the Code of Practice talks about wind at boom height (Force 2 ideal,
// Force 3 with care). Forecast wind is at 10 m, roughly a third above boom
// height, so 2–9 mph here is on the careful side. Gusts are a caution, not a
// block, until they are strong enough to hold. Low Delta-T (humid air) does
// not block: that rule is Australian. Speeds are km/h, as the forecast gives.
const SPRAY = {
  windMin: 3,
  windMax: 15,
  gustCaution: 29,
  gustHold: 40,
  deltaTCaution: 8,
  deltaTMax: 10,
  tempMin: 5,
  tempMax: 28,
  rainMax: 0.1,
  rainChanceMax: 35,
};

/** Rain (mm/h) that wets the canopy: an hour at or above it is held. */
export const RAIN_ON_CANOPY_MM = SPRAY.rainMax;
/** Rain (mm/h) that counts for "rain-fast" (hours until rain). Rob to pick one
 * threshold; until then both are kept and the card says "light rain only"
 * when rain falls between them. Make them equal to unify. */
export const RAIN_FAST_MM = 0.2;

/** How a Delta-T under 2 reads. AceAg shows it green; switch to "warn" for
 * amber. Display only: low Delta-T never blocks or cautions an hour. */
export const LOW_DELTA_T_TONE: "go" | "warn" = "go";

export type DeltaTSegment = "low" | "ideal" | "high" | "too-high" | "unknown";
/** The one Delta-T reading used by the number, the bar and the hour rule. */
export function deltaTBand(value: unknown): { segment: DeltaTSegment; label: string; tone: "go" | "warn" | "risk" | "muted" } {
  const dt = toNum(value, null);
  if (dt === null) return { segment: "unknown", label: "Unknown", tone: "muted" };
  if (dt < 2) return { segment: "low", label: "Low", tone: LOW_DELTA_T_TONE };
  if (dt <= SPRAY.deltaTCaution) return { segment: "ideal", label: "Ideal", tone: "go" };
  if (dt <= SPRAY.deltaTMax) return { segment: "high", label: "Marginal", tone: "warn" };
  return { segment: "too-high", label: "Too high", tone: "risk" };
}

type SprayCheck = { tone: "go" | "warn" | "risk"; reason: string; gusty: boolean };

/** One hour judged against the spray rules: go, caution (warn) or hold (risk). */
function sprayCheck(row: WeatherRow): SprayCheck {
  const hold = (reason: string): SprayCheck => ({ tone: "risk", reason, gusty: false });
  const temp = toNum(row?.temperature, null);
  const wind = toNum(row?.windSpeed, null);
  const gust = toNum(row?.windGusts, null);
  const dt = deltaT(row);
  if (toNum(row?.precipitation, 0) >= SPRAY.rainMax) return hold("Rain on the canopy");
  if (toNum(row?.precipProbability, 0) >= SPRAY.rainChanceMax) return hold("Rain likely");
  if (isNightInversionRow(row)) return hold("Temperature inversion risk");
  if (wind === null) return hold("Wind unknown");
  if (wind > SPRAY.windMax) return hold("Too windy for drift control");
  if (wind < SPRAY.windMin) return hold("Too calm; drift and inversion risk");
  if (gust !== null && gust >= SPRAY.gustHold) return hold("Gusts too strong");
  if (temp === null) return hold("Temperature unknown");
  if (temp < SPRAY.tempMin) return hold("Too cold");
  if (temp > SPRAY.tempMax) return hold("Too hot");
  if (dt === null) return hold("Humidity unknown");
  const band = deltaTBand(dt).segment;
  if (band === "too-high") return hold("Delta-T above 10; droplets dry too fast");
  if (gust !== null && gust >= SPRAY.gustCaution) return { tone: "warn", reason: "Gusty", gusty: true };
  if (band === "high") return { tone: "warn", reason: "Delta-T 8–10; droplets may dry quickly", gusty: false };
  return { tone: "go", reason: "Conditions are in the spray band", gusty: false };
}

/** The hour's real instant: the row's epoch when the adapter knew the
 * place's UTC offset, else the clock time read as UTC. */
function rowEpoch(row: WeatherRow): number | null {
  const epoch = toNum(row?.epoch, null);
  if (epoch !== null) return epoch;
  const ms = Date.parse(`${String(row?.time || "")}:00Z`);
  return Number.isFinite(ms) ? ms : null;
}
const addHour = (ms: number | null) => (ms === null ? null : ms + 3_600_000);

export function isSprayable(row: WeatherRow) {
  return sprayCheck(row).tone !== "risk";
}

export function buildSpraying(futureRows: WeatherRow[], current: WeatherRow, nowRow: WeatherRow) {
  const next48 = futureRows.slice(0, 48);
  const windNow = toNum(current?.wind_speed_10m, toNum(nowRow?.windSpeed, null));
  const gustNow = toNum(current?.wind_gusts_10m, toNum(nowRow?.windGusts, null));
  const rainNow = toNum(current?.precipitation, toNum(nowRow?.precipitation, 0));
  const nowDeltaT = deltaT({
    temperature: current?.temperature_2m ?? nowRow?.temperature,
    humidity: current?.relative_humidity_2m ?? nowRow?.humidity,
  });
  const dtRounded = round(nowDeltaT, 1);

  // The verdict is the same rule as the hour bar, applied to conditions now.
  const nowCheck = sprayCheck({
    ...nowRow,
    temperature: current?.temperature_2m ?? nowRow?.temperature,
    humidity: current?.relative_humidity_2m ?? nowRow?.humidity,
    windSpeed: windNow,
    windGusts: gustNow,
    precipitation: rainNow,
  });
  // One source for the current hour: the verdict (conditions now) also sets
  // the first hour of the bar and of the window, so "Hold" now never sits
  // next to a window that starts now.
  const checkAt = (index: number) => (index === 0 ? nowCheck : sprayCheck(next48[index]));
  const sprayFlags = next48.map((_, index) => checkAt(index).tone !== "risk");
  const openHoursNext24 = sprayFlags.slice(0, 24).filter(Boolean).length;
  const longestBlockHours = longestTrueBlock(sprayFlags.slice(0, 24));

  const firstWindowIndex = sprayFlags.findIndex(Boolean);
  let nextWindow = null;
  if (firstWindowIndex >= 0) {
    let length = 0;
    for (let i = firstWindowIndex; i < sprayFlags.length && sprayFlags[i]; i += 1) length += 1;
    // The window ends when the first held hour starts, or an hour after the
    // last hour forecast when it runs to the end.
    const endIndex = firstWindowIndex + length;
    const endLabel = endIndex < next48.length
      ? timeLabel(next48[endIndex]?.time)
      : `${String((hourOf(next48[endIndex - 1]?.time) + 1) % 24).padStart(2, "0")}:00`;
    const windowRows = next48.slice(firstWindowIndex, firstWindowIndex + length);
    const startDay = isoDay(next48[firstWindowIndex]?.time);
    const nowDay = isoDay(nowRow?.time || current?.time);
    nextWindow = {
      // Strongest gust inside the window, for the "gusts up to" caution.
      gustMax: maxRows(windowRows, (row) => row?.windGusts),
      gusty: windowRows.some((_, offset) => checkAt(firstWindowIndex + offset).gusty),
      startEpoch: rowEpoch(next48[firstWindowIndex]),
      endEpoch: endIndex < next48.length ? rowEpoch(next48[endIndex]) : addHour(rowEpoch(next48[endIndex - 1])),
      start: timeLabel(next48[firstWindowIndex]?.time),
      end: endLabel,
      hours: length,
      startsNow: firstWindowIndex === 0,
      today: startDay === nowDay,
      // "", "tomorrow" or the weekday: "Next window tomorrow 05:00–11:00".
      day: startDay === nowDay ? "" : startDay === dayAfter(nowDay) ? "tomorrow" : weekdayShort(next48[firstWindowIndex]?.time),
    };
  }

  const verdict = nowCheck.tone === "go" ? "Go" : nowCheck.tone === "warn" ? "Caution" : "Hold";
  const verdictTone = nowCheck.tone;
  const verdictReason = nowCheck.reason;

  let rainFast = null;
  for (let i = 0; i < next48.length; i += 1) {
    if (toNum(next48[i]?.precipitation, 0) > RAIN_FAST_MM) {
      rainFast = i;
      break;
    }
  }

  let inversionStart = -1;
  for (let i = 0; i < Math.min(next48.length, 20); i += 1) {
    if (isNightInversionRow(next48[i])) {
      inversionStart = i;
      break;
    }
  }
  let inversionLength = 0;
  if (inversionStart >= 0) {
    for (let i = inversionStart; i < Math.min(next48.length, inversionStart + 26) && isNightInversionRow(next48[i]); i += 1) {
      inversionLength += 1;
    }
  }
  const inversion = inversionStart >= 0
    ? {
        risk: toNum(next48[inversionStart]?.windSpeed, 0) < 5 ? "High" : "Likely",
        tone: toNum(next48[inversionStart]?.windSpeed, 0) < 5 ? "risk" : "warn",
        window: `${timeLabel(next48[inversionStart]?.time)}-${timeLabel(next48[Math.min(next48.length - 1, inversionStart + inversionLength)]?.time)}`,
      }
    : { risk: "Low", tone: "go", window: null };

  const { label: deltaTLabel, tone: deltaTTone, segment: deltaTSegment } = deltaTBand(dtRounded);
  // Rain that holds spraying but is too light to count as rain-fast.
  const lightRainOnly = rainFast === null && next48.some((row) => toNum(row?.precipitation, 0) >= RAIN_ON_CANOPY_MM);
  const sprayScore = Math.round((openHoursNext24 / 24) * 100);
  const sprayLabel = sprayScore >= 60 ? "Go" : sprayScore >= 35 ? "Watch" : "Limited";
  const sprayTone = sprayScore >= 60 ? "go" : sprayScore >= 35 ? "warn" : "risk";

  return {
    spray: {
      score: sprayScore,
      open: openHoursNext24,
      longest: longestBlockHours,
      label: sprayLabel,
      tone: sprayTone,
      sub: longestBlockHours > 0 ? `${longestBlockHours}h block available` : "No clear block in the next 24h",
    },
    spraying: {
      deltaT: dtRounded,
      deltaTLabel,
      deltaTTone,
      deltaTSegment,
      lightRainOnly,
      // The hour "now" falls in, for today/tomorrow wording.
      nowEpoch: rowEpoch(nowRow) ?? rowEpoch(next48[0]),
      verdict,
      verdictTone,
      verdictReason,
      gusty: nowCheck.gusty,
      windNow: round(windNow, 0),
      gustNow: round(gustNow, 0),
      nextWindow,
      rainFast,
      inversion,
      openHoursNext24,
      longestBlockHours,
      timeline: next48.map((row, index) => {
        const check = checkAt(index);
        return {
          time: row?.time, epoch: rowEpoch(row), label: timeLabel(row?.time), tone: check.tone, reason: check.reason,
          gust: index === 0 ? gustNow : toNum(row?.windGusts, null), wind: index === 0 ? windNow : toNum(row?.windSpeed, null), rainChance: toNum(row?.precipProbability, null),
          rain: toNum(row?.precipitation, null), temperature: toNum(row?.temperature, null),
        };
      }),
    },
  };
}
