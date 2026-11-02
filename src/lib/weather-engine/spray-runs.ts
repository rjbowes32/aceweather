// The 48 h spray bar as runs of go / caution / hold, each with a short reason,
// for the legend, the aria-label and the "main limit" line.
export type SprayHourSummary = {
  epoch: number | null; tone: string; reason: string;
  wind?: number | null; gust?: number | null; rainChance?: number | null; rain?: number | null; temperature?: number | null;
};
export type SprayRun = { tone: string; startEpoch: number; endEpoch: number; limit: string | null; hours: SprayHourSummary[] };

/** The plain word for why an hour is held or needs care. */
export function limitOf(reason: string) {
  const r = reason.toLowerCase();
  if (r.includes("rain")) return "rain";
  if (r.includes("gust")) return "gusts";
  if (r.includes("windy")) return "wind";
  if (r.includes("calm")) return "calm air";
  if (r.includes("inversion")) return "inversion";
  if (r.includes("cold") || r.includes("hot") || r.includes("temperature")) return "temperature";
  if (r.includes("delta-t")) return "Delta-T";
  if (r.includes("unknown")) return "missing data";
  return null;
}

/** Hours grouped into runs of the same tone and reason. */
export function sprayRuns(hours: SprayHourSummary[]): SprayRun[] {
  const runs: SprayRun[] = [];
  for (const hour of hours) {
    if (hour.epoch === null) continue;
    const limit = hour.tone === "go" ? null : limitOf(hour.reason);
    const last = runs[runs.length - 1];
    if (last && last.tone === hour.tone && last.limit === limit) {
      last.endEpoch = hour.epoch + 3_600_000;
      last.hours.push(hour);
    } else {
      runs.push({ tone: hour.tone, startEpoch: hour.epoch, endEpoch: hour.epoch + 3_600_000, limit, hours: [hour] });
    }
  }
  return runs;
}

/** The reason that holds the most hours, for "Main limit: wind". */
export function mainLimit(hours: SprayHourSummary[]) {
  const counts = new Map<string, number>();
  for (const h of hours) {
    if (h.tone === "go") continue;
    const limit = limitOf(h.reason);
    if (limit) counts.set(limit, (counts.get(limit) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
