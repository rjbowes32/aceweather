/* Pure formatting + WMO weather-code helpers. No JSX, fully typed. */

export type Num = number | null | undefined;

export const fmt0 = (v: Num): string => (v == null || Number.isNaN(v) ? "—" : Math.round(v).toString());
export const fmt1 = (v: Num): string => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(1));

export function round(v: Num, dp = 0): number {
  if (v == null || Number.isNaN(v)) return 0;
  const f = 10 ** dp;
  return Math.round(Number(v) * f) / f;
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
export function dirToCompass(deg: Num): string {
  if (deg == null || Number.isNaN(deg)) return "—";
  return COMPASS[Math.round(((((deg % 360) + 360) % 360) / 22.5)) % 16];
}

export type ConditionKey = "clear" | "cloud" | "fog" | "rain" | "snow" | "storm";
export type Condition = { key: ConditionKey; label: string };

export function weatherCondition(code: Num, isDay: number = 1): Condition {
  const c = code == null ? 3 : Number(code);
  if (c === 0) return { key: "clear", label: isDay ? "Clear" : "Clear night" };
  if (c === 1) return { key: "clear", label: "Mainly clear" };
  if (c === 2) return { key: "cloud", label: "Partly cloudy" };
  if (c === 3) return { key: "cloud", label: "Overcast" };
  if (c === 45 || c === 48) return { key: "fog", label: "Fog" };
  if (c >= 51 && c <= 57) return { key: "rain", label: "Drizzle" };
  if (c >= 61 && c <= 67) return { key: "rain", label: "Rain" };
  if (c >= 71 && c <= 77) return { key: "snow", label: "Snow" };
  if (c >= 80 && c <= 82) return { key: "rain", label: "Rain showers" };
  if (c === 85 || c === 86) return { key: "snow", label: "Snow showers" };
  if (c >= 95) return { key: "storm", label: "Thunderstorm" };
  return { key: "cloud", label: "Cloudy" };
}

export function conditionSummary(key: ConditionKey, dir: string): string {
  const wind = dir === "—" ? "light winds" : `${dir} airflow`;
  switch (key) {
    case "clear": return `Clear skies, ${wind}`;
    case "cloud": return `Cloud cover, ${wind}`;
    case "fog": return `Fog reducing visibility, ${wind}`;
    case "rain": return `Rain in the area, ${wind}`;
    case "snow": return `Wintry precipitation, ${wind}`;
    case "storm": return `Thundery, ${wind}`;
    default: return `Conditions, ${wind}`;
  }
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Parse a "YYYY-MM-DD" (or ...THH:mm) string as a calendar date without TZ shifts. */
export function parseDateKey(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

export function weekdayShort(dateStr: string): string {
  const { y, m, d } = parseDateKey(dateStr);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** 0=Sun..6=Sat — used to position the first cell in a calendar grid (Mon-first). */
export function weekdayIndexMonFirst(dateStr: string): number {
  const { y, m, d } = parseDateKey(dateStr);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function dayOfMonth(dateStr: string): number {
  return parseDateKey(dateStr).d;
}

export function monthLabel(dateStr: string): string {
  return MONTHS[parseDateKey(dateStr).m - 1];
}

export function timeLabel(value: string | null | undefined): string {
  if (typeof value !== "string") return "—";
  return value.includes("T") ? value.slice(11, 16) : value.slice(0, 5);
}
