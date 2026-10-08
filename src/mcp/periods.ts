import { LIMITS } from "./config.ts";
import { addDays, daysInclusive, isIsoDate, monthEnd, shiftYears, toMs } from "./dates.ts";
import { invalid } from "./errors.ts";

export const HOURLY_PERIODS = ["today", "last_24h", "last_48h", "last_72h"] as const;
export const DAILY_PERIODS = [
  "yesterday", "last_7d", "last_14d", "last_21d", "last_30d", "last_90d", "last_365d",
  "this_week", "last_week", "last_month", "month_to_date", "season_to_date",
  "year_to_date", "calendar_year", "agricultural_year", "custom",
] as const;
export const PERIODS = [...HOURLY_PERIODS, ...DAILY_PERIODS] as const;
export type Period = (typeof PERIODS)[number];

export type PeriodRequest = {
  period?: Period;
  start_date?: string;
  end_date?: string;
  year?: number;
  years_ago?: number;
  agricultural_year_start_month?: number;
};

export type DailyWindow = { kind: "daily"; period: Period; label: string; start: string; end: string; days: number; years_ago: number };
export type HourlyWindow = { kind: "hourly"; period: Period; label: string; hours: number | null };
export type ResolvedPeriod = { window: DailyWindow | HourlyWindow; warnings: string[] };

const ROLLING: Partial<Record<Period, number>> = { last_7d: 7, last_14d: 14, last_21d: 21, last_30d: 30, last_90d: 90, last_365d: 365 };
const HOURS: Partial<Record<Period, number | null>> = { today: null, last_24h: 24, last_48h: 48, last_72h: 72 };
const LABELS: Record<Period, string> = {
  today: "Today so far", last_24h: "Last 24 hours", last_48h: "Last 48 hours", last_72h: "Last 72 hours",
  yesterday: "Yesterday", last_7d: "Last 7 days", last_14d: "Last 14 days", last_21d: "Last 21 days",
  last_30d: "Last 30 days", last_90d: "Last 90 days", last_365d: "Last 365 days",
  this_week: "This week to date (Mon-yesterday)", last_week: "Previous week (Mon-Sun)", last_month: "Previous calendar month",
  month_to_date: "Month to date", season_to_date: "Meteorological season to date", year_to_date: "Year to date",
  calendar_year: "Calendar year", agricultural_year: "Agricultural year", custom: "Custom range",
};

function monday(iso: string): string {
  const weekday = (new Date(toMs(iso)).getUTCDay() + 6) % 7;
  return addDays(iso, -weekday);
}

function seasonStart(today: string): string {
  const [y, m] = today.split("-").map(Number);
  if (m <= 2) return `${y - 1}-12-01`;
  const startMonth = m === 12 ? 12 : m - ((m - 3) % 3);
  return `${y}-${String(startMonth).padStart(2, "0")}-01`;
}

function baseRange(req: PeriodRequest, period: Period, today: string): [string, string] {
  const yesterday = addDays(today, -1);
  const [y, m] = today.split("-").map(Number);
  const rolling = ROLLING[period];
  if (rolling) return [addDays(today, -rolling), yesterday];
  switch (period) {
    case "yesterday": return [yesterday, yesterday];
    case "this_week": return [monday(today), yesterday];
    case "last_week": return [addDays(monday(today), -7), addDays(monday(today), -1)];
    case "last_month": {
      const end = addDays(`${today.slice(0, 7)}-01`, -1);
      return [`${end.slice(0, 7)}-01`, end];
    }
    case "month_to_date": return [`${today.slice(0, 7)}-01`, yesterday];
    case "season_to_date": return [seasonStart(today), yesterday];
    case "year_to_date": return [`${y}-01-01`, yesterday];
    case "calendar_year": {
      const year = req.year ?? y;
      return [`${year}-01-01`, `${year}-12-31`];
    }
    case "agricultural_year": {
      const startMonth = req.agricultural_year_start_month ?? 9;
      const year = req.year ?? (m >= startMonth ? y : y - 1);
      const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
      return [start, startMonth === 1 ? `${year}-12-31` : monthEnd(year + 1, startMonth - 1)];
    }
    default: {
      if (!req.start_date || !req.end_date) throw invalid("period=custom needs start_date and end_date (YYYY-MM-DD).");
      if (!isIsoDate(req.start_date) || !isIsoDate(req.end_date)) throw invalid("start_date and end_date must be valid YYYY-MM-DD dates.");
      if (req.start_date > req.end_date) throw invalid("start_date must be on or before end_date.");
      return [req.start_date, req.end_date];
    }
  }
}

/** Resolves a named period against the location's local calendar date. History always ends yesterday. */
export function resolvePeriod(req: PeriodRequest, today: string): ResolvedPeriod {
  const period: Period = req.period ?? (req.start_date || req.end_date ? "custom" : "last_7d");
  const yearsAgo = req.years_ago ?? 0;
  const warnings: string[] = [];
  if (period in HOURS) {
    if (yearsAgo) throw invalid(`years_ago is not supported with ${period}; use a daily period such as yesterday or last_7d.`);
    return { window: { kind: "hourly", period, label: LABELS[period], hours: HOURS[period] ?? null }, warnings };
  }
  const yesterday = addDays(today, -1);
  let [start, end] = baseRange(req, period, today);
  if (yearsAgo) {
    start = shiftYears(start, yearsAgo);
    end = shiftYears(end, yearsAgo);
  }
  if (start > yesterday) throw invalid(`${LABELS[period]} has no completed days yet (it starts ${start}). Use period=today or a forecast tool.`);
  if (end > yesterday) {
    end = yesterday;
    warnings.push(`History ends yesterday (${yesterday}); later dates need a forecast tool.`);
  }
  if (start < LIMITS.earliestDate) throw invalid(`Historical data starts ${LIMITS.earliestDate}.`);
  const days = daysInclusive(start, end);
  if (days > LIMITS.maxHistoryDays) throw invalid(`A single request can cover at most ${LIMITS.maxHistoryDays} days; this one covers ${days}.`);
  const suffix = yearsAgo ? `, ${yearsAgo} year${yearsAgo === 1 ? "" : "s"} earlier` : "";
  return { window: { kind: "daily", period, label: `${LABELS[period]}${suffix} (${start} to ${end})`, start, end, days, years_ago: yearsAgo }, warnings };
}
