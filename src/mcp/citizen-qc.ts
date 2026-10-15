/**
 * Quality control for citizen (Netatmo) stations. Their siting is unknown: a thermometer in the sun or on a
 * wall, or a blocked rain gauge, would teach the forecast the sensor's error instead of the models'. A
 * citizen station's fits are exported only while its record looks like an official station's.
 */
import type { StationState } from "./learning-store.ts";

export const CITIZEN_QC = {
  /** Temperature: the lead-1 blend bias at the station stays within this many °C... */
  maxBiasC: 2.5,
  /** ...and its day-to-day scatter around the models is at most this multiple of the official stations' median, */
  maxSpreadRatio: 1.3,
  /** judged as soon as there are this many days, the same as a fit needs. */
  minDays: 20,
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

/**
 * Day-1 temperature error scatter (°C): the standard deviation of the best model's hourly error once its mean is
 * removed, over the window. Sun on the sensor or a heated wall shows as scatter that a bias step cannot remove.
 */
export function temperatureSpread(st: StationState, today: string, windowDays: number): number | null {
  const totals: Record<string, { n: number; sum: number; sumSq: number; days: number }> = {};
  for (const [day, rec] of Object.entries(st.days)) {
    const byModel = rec.t?.["1"];
    const age = dayMs(today) - dayMs(day);
    if (!byModel || age <= 0 || age > windowDays * DAY) continue;
    for (const [m, [n, , sumSq, sum]] of Object.entries(byModel)) {
      const t = (totals[m] ??= { n: 0, sum: 0, sumSq: 0, days: 0 });
      t.n += n; t.sum += sum; t.sumSq += sumSq; t.days++;
    }
  }
  const spreads = Object.values(totals).filter((t) => t.days >= CITIZEN_QC.minDays).map((t) => Math.sqrt(Math.max(0, t.sumSq / t.n - (t.sum / t.n) ** 2)));
  return spreads.length ? Math.min(...spreads) : null;
}

export function citizenTemperatureOk(st: StationState, lead1Bias: number | null, officialSpread: number | null, today: string, windowDays: number): boolean {
  if (lead1Bias == null || Math.abs(lead1Bias) > CITIZEN_QC.maxBiasC || officialSpread == null) return false;
  const own = temperatureSpread(st, today, windowDays);
  return own != null && own <= officialSpread * CITIZEN_QC.maxSpreadRatio;
}

/** Judged on the days before `today` only, so a historical score can ask what was known at the time. */
export function citizenRainOk(st: StationState, today: string, windowDays: number): boolean {
  let observed = 0; let forecast = 0; let days = 0; let wet = 0; let dryOnWet = 0;
  for (const [day, rec] of Object.entries(st.days)) {
    const errors = rec.r?.["1"];
    const age = dayMs(today) - dayMs(day);
    if (rec.ro == null || !errors || age <= 0 || age > windowDays * DAY) continue;
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
