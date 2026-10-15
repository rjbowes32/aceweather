/**
 * Quality control for citizen (Netatmo) stations. Their siting is unknown: a thermometer in the sun or on a
 * wall, or a blocked rain gauge, would teach the forecast the sensor's error instead of the models'. A
 * citizen station's fits are exported only while its record looks like an official station's.
 */
import type { StationState } from "./learning-store.ts";

export const CITIZEN_QC = {
  /** Temperature: the lead-1 blend bias at the station stays within this many °C... */
  maxBiasC: 2.5,
  /** ...and its own out-of-sample learned error is at most this multiple of the official stations' median, */
  maxMaeRatio: 1.3,
  /** over at least this many scored days in the last 30. */
  minScoredDays: 10,
  /** Rainfall: observed over forecast (model mean, day 1) within this range over the window, */
  rainRatio: [0.5, 2] as const,
  minRainDays: 20,
  minForecastMm: 20,
  /** and on days the models agree on at least 5 mm, no more than a quarter of totals are zero (a blocked gauge). */
  wetDayMm: 5,
  maxDryOnWetShare: 0.25,
};

const DAY = 86_400_000;
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Mean absolute error of the learned forecast over the scored days in the last `days`, from the daily scores. */
export function recentMae(st: StationState, key: "t" | "w", lead: number, today: string, days = 30): { mae: number; days: number } | null {
  let hours = 0; let sum = 0; let n = 0;
  for (const [day, rec] of Object.entries(st.days)) {
    const s = rec.score?.[lead]?.[key];
    if (!s || dayMs(today) - dayMs(day) > days * DAY) continue;
    hours += s[0]; sum += s[1]; n++;
  }
  return hours ? { mae: sum / hours, days: n } : null;
}

export function citizenTemperatureOk(st: StationState, lead1Bias: number | null, officialMae: number | null, today: string): boolean {
  if (lead1Bias == null || Math.abs(lead1Bias) > CITIZEN_QC.maxBiasC || officialMae == null) return false;
  const own = recentMae(st, "t", 1, today);
  return own != null && own.days >= CITIZEN_QC.minScoredDays && own.mae <= officialMae * CITIZEN_QC.maxMaeRatio;
}

export function citizenRainOk(st: StationState, today: string, windowDays: number): boolean {
  let observed = 0; let forecast = 0; let days = 0; let wet = 0; let dryOnWet = 0;
  for (const [day, rec] of Object.entries(st.days)) {
    const errors = rec.r?.["1"];
    if (rec.ro == null || !errors || dayMs(today) - dayMs(day) > windowDays * DAY) continue;
    const e = Object.entries(errors).filter(([m, v]) => m !== "best_match" && finite(v)).map(([, v]) => v);
    if (e.length < 2) continue;
    const f = rec.ro + e.reduce((a, b) => a + b, 0) / e.length;
    observed += rec.ro; forecast += f; days++;
    if (f >= CITIZEN_QC.wetDayMm) { wet++; if (rec.ro === 0) dryOnWet++; }
  }
  if (days < CITIZEN_QC.minRainDays || forecast < CITIZEN_QC.minForecastMm) return false;
  const ratio = observed / forecast;
  return ratio >= CITIZEN_QC.rainRatio[0] && ratio <= CITIZEN_QC.rainRatio[1] && (wet === 0 || dryOnWet / wet <= CITIZEN_QC.maxDryOnWetShare);
}
