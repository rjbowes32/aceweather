// Shared helpers for reading hourly and daily weather rows.
export type WeatherRow = Record<string, unknown>;
export type WeatherInput = { current?: unknown; hourlyRows?: unknown; allHourlyRows?: unknown; dailyRows?: unknown };
export type WeatherAgronomy = Record<string, unknown>;
export type DryingDay = { key: string; tone: string };

export function asRecord(value: unknown): WeatherRow {
  return value && typeof value === "object" ? (value as WeatherRow) : {};
}

// Deterministic weather-to-agronomy planning heuristics. This module accepts
// normalized forecast data only; fetching, caching and presentation stay outside core.
export function toNum(value: unknown, fallback: number): number;
export function toNum(value: unknown, fallback: null): number | null;
export function toNum(value: unknown, fallback: number | null): number | null;
export function toNum(value: unknown, fallback: number | null = null): number | null {
  // A gap (null/blank) is missing, not zero: Number(null) and Number("") are 0.
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function clamp(value: unknown, min = 0, max = 100) {
  return Math.max(min, Math.min(max, toNum(value, 0)));
}

export function round(value: unknown, digits = 0): number | null {
  const num = toNum(value, null);
  if (num === null) return null;
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
}

export function isoDay(value: unknown) {
  return String(value || "").split("T")[0] || "";
}

export function dayAfter(iso: string) {
  const date = new Date(`${iso}T12:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function hourOf(value: unknown) {
  return Number(String(value || "").slice(11, 13));
}

export function timeLabel(value: unknown) {
  const text = String(value || "");
  return text.includes("T") ? text.slice(11, 16) : text.slice(0, 5);
}

export function weekdayShort(value: unknown) {
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { weekday: "short" });
}

export function dayOfMonth(value: unknown) {
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "2-digit" });
}

export function findCurrentIndex(rows: WeatherRow[], current: unknown) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const currentRecord = asRecord(current);
  if (!sourceRows.length) return 0;
  const currentTime = new Date((currentRecord.time || "") as string | number | Date).getTime();
  if (!Number.isFinite(currentTime)) return 0;
  const exact = sourceRows.findIndex((row) => row?.time && new Date(row.time as string | number | Date).getTime() >= currentTime - 30 * 60 * 1000);
  return exact >= 0 ? exact : 0;
}

export function groupByDay(rows: WeatherRow[]): Map<string, WeatherRow[]> {
  const grouped = new Map();
  for (const row of rows || []) {
    const key = isoDay(row?.time);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

export function longestTrueBlock(values: unknown[]) {
  let longest = 0;
  let current = 0;
  for (const value of values) {
    current = value ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

export function classifyScore(score: number, thresholds: number[] = [35, 65]) {
  if (score >= thresholds[1]) return { label: "Good", tone: "go" };
  if (score >= thresholds[0]) return { label: "Caution", tone: "warn" };
  return { label: "Poor", tone: "risk" };
}

export function riskLabel(score: number, thresholds: number[] = [40, 65]) {
  if (score >= thresholds[1]) return { label: "High", tone: "risk" };
  if (score >= thresholds[0]) return { label: "Elevated", tone: "warn" };
  return { label: "Low", tone: "go" };
}

export function sumRows(rows: WeatherRow[], mapper: (row: WeatherRow) => unknown) {
  return (rows || []).reduce((sum, row) => sum + toNum(mapper(row), 0), 0);
}

export function minRows(rows: WeatherRow[], mapper: (row: WeatherRow) => unknown) {
  const values = (rows || []).map(mapper).map((value) => toNum(value, null)).filter((value) => value !== null);
  return values.length ? Math.min(...values) : null;
}

export function maxRows(rows: WeatherRow[], mapper: (row: WeatherRow) => unknown) {
  const values = (rows || []).map(mapper).map((value) => toNum(value, null)).filter((value) => value !== null);
  return values.length ? Math.max(...values) : null;
}
