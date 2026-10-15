/**
 * Health checks for the daily learning job. Pure: takes the job's outputs and returns problems, which the
 * workflow turns into a GitHub issue labelled `learning-health` (and closes again when everything passes).
 */
import type { FitsFile } from "./learning-store.ts";

export type RunStats = {
  date: string; processed: number; updated: number; skipped: number; failed: number; requests: number; gave_up: number; errors: Array<{ id: string; error: string }>;
  netatmo?: { enabled: boolean; error: string | null };
};
export type ScoresEntry = { date: string; stations_fitted: number; recent_scores: FitsFile["recent_scores"] };
export type Problem = { severity: "error" | "warning"; check: string; message: string };

export const HEALTH_LIMITS = {
  maxFitsAgeHours: 26,
  minStationShare: 0.8,
  maxFailureShare: 0.1,
  maxGaveUp: 5,
  learnedWorseRatio: 1.02,
  minScoredHours: 500,
  maxBiasStepC: 1.5,
  maxBiasStepKmh: 4,
  /** Plus this share of the larger bias, so summit stations with big but steady errors are not flagged. */
  biasStepShare: 0.2,
};

export function checkHealth(fits: FitsFile | null, history: ScoresEntry[], run: RunStats | null, now = Date.now()): Problem[] {
  const problems: Problem[] = [];
  if (!fits) return [{ severity: "error", check: "fits_missing", message: "fits.json was not produced." }];
  const ageHours = (now - Date.parse(fits.generated_at)) / 3600_000;
  if (!(ageHours <= HEALTH_LIMITS.maxFitsAgeHours)) problems.push({ severity: "error", check: "fits_stale", message: `fits.json is ${Math.round(ageHours)} hours old.` });

  const previous = history.filter((h) => h.date < fits.generated_at.slice(0, 10)).slice(-7);
  const best = Math.max(0, ...previous.map((h) => h.stations_fitted));
  if (best > 0 && fits.stations.length < best * HEALTH_LIMITS.minStationShare) {
    problems.push({ severity: "error", check: "stations_dropped", message: `${fits.stations.length} stations have fits, down from ${best} in the last week.` });
  }

  if (run) {
    if (run.processed > 0 && run.failed / run.processed > HEALTH_LIMITS.maxFailureShare) {
      problems.push({ severity: "error", check: "job_failures", message: `${run.failed} of ${run.processed} stations failed: ${run.errors.slice(0, 3).map((e) => `${e.id} (${e.error})`).join("; ")}.` });
    }
    if (run.gave_up > HEALTH_LIMITS.maxGaveUp) problems.push({ severity: "warning", check: "upstream_retries", message: `${run.gave_up} requests failed after retries out of ${run.requests}.` });
    if (run.netatmo?.enabled && run.netatmo.error) problems.push({ severity: "warning", check: "netatmo_unavailable", message: `Citizen stations were not updated: ${run.netatmo.error}.` });
  }

  // Rainfall (scored in days) has its own gate: the forecast uses it only while it beats the model mean.
  for (const [variable, byLead] of Object.entries(fits.recent_scores ?? {})) {
    for (const [lead, s] of Object.entries(byLead)) {
      if ((s.hours ?? 0) >= HEALTH_LIMITS.minScoredHours &&s.learned_mae > s.standard_mae * HEALTH_LIMITS.learnedWorseRatio) {
        problems.push({ severity: "warning", check: "learned_worse", message: `Over the last 30 days the learned ${variable} forecast at day ${lead} was worse than the standard one (${s.learned_mae} vs ${s.standard_mae}, ${s.stations} stations).` });
      }
    }
  }

  // Large changes in bias between neighbouring lead days point at a bad fit (and would show as a slope in the forecast).
  const steps: string[] = [];
  for (const st of fits.stations) {
    for (const [key, limit, unit] of [["t", HEALTH_LIMITS.maxBiasStepC, "°C"], ["w", HEALTH_LIMITS.maxBiasStepKmh, "km/h"]] as const) {
      for (let lead = 1; lead < 6; lead++) {
        const a = st.leads[lead]?.[key]?.bias;
        const b = st.leads[lead + 1]?.[key]?.bias;
        if (a != null && b != null && Math.abs(b - a) > limit + HEALTH_LIMITS.biasStepShare * Math.max(Math.abs(a), Math.abs(b))) steps.push(`${st.meta.name} ${key === "t" ? "temperature" : "wind"} day ${lead}→${lead + 1} (${a.toFixed(1)}→${b.toFixed(1)} ${unit})`);
      }
    }
  }
  if (steps.length) problems.push({ severity: "warning", check: "bias_steps", message: `Large bias change between neighbouring lead days at ${steps.length} point(s): ${steps.slice(0, 5).join("; ")}.` });
  return problems;
}

export function healthMarkdown(problems: Problem[], fits: FitsFile | null, run: RunStats | null, runUrl: string | null): string {
  const lines = [
    `Learning job health check on ${new Date().toISOString().slice(0, 10)}${runUrl ? ` ([run](${runUrl}))` : ""}.`,
    "",
    ...(problems.length ? problems.map((p) => `- **${p.severity}** \`${p.check}\`: ${p.message}`) : ["All checks passed."]),
    "",
    `Stations fitted: ${fits?.stations.length ?? 0}. Stations processed: ${run?.processed ?? "?"} (updated ${run?.updated ?? "?"}, skipped ${run?.skipped ?? "?"}, failed ${run?.failed ?? "?"}).`,
    "",
    "See docs/mcp/BUG-LOG.md for how bugs are recorded and docs/mcp/LEARNING-DAILY.md for the job.",
  ];
  return lines.join("\n");
}
