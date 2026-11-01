"use client";

import { clockTime, dayWord, sprayRuns, type SprayHourSummary, type SprayRun } from "@/lib/weather-engine/index.ts";
import { windUnitLabel as WU, formatWind as wSpd, type WindUnit } from "@/lib/aceweather/format";

// A choppy forecast can have many runs; the bar's label lists them all.
const LEGEND_MAX = 6;
const TONE_WORD: Record<string, string> = { go: "Go", warn: "Caution", risk: "Hold" };

function peak(hours: SprayHourSummary[], key: "wind" | "gust" | "rainChance" | "rain" | "temperature", pick: "max" | "min" = "max") {
  const vals = hours.map((h) => h[key]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!vals.length) return null;
  return pick === "max" ? Math.max(...vals) : Math.min(...vals);
}

/** "wind 18 mph", "rain 60%", "inversion": why a run is held or needs care. */
export function runReason(run: SprayRun, windUnit: WindUnit) {
  const h = run.hours;
  switch (run.limit) {
    case "wind": { const w = peak(h, "wind"); return w == null ? "wind" : `wind ${wSpd(w, windUnit)} ${WU(windUnit)}`; }
    case "gusts": { const g = peak(h, "gust"); return g == null ? "gusts" : `gusts ${wSpd(g, windUnit)} ${WU(windUnit)}`; }
    case "rain": {
      // Rain falling shows its amount; a forecast chance shows the percentage.
      if (h.some((x) => x.reason === "Rain likely")) { const p = peak(h, "rainChance"); return p == null ? "rain likely" : `rain ${Math.round(p)}%`; }
      const mm = peak(h, "rain"); return mm == null ? "rain" : `rain ${mm.toFixed(1)} mm`;
    }
    case "temperature": {
      const hot = h.some((x) => x.reason.toLowerCase().includes("hot"));
      const t = peak(h, "temperature", hot ? "max" : "min");
      return t == null ? "temperature" : `${hot ? "hot" : "cold"} ${Math.round(t)} °C`;
    }
    default: return run.limit;
  }
}

function runTime(run: SprayRun, nowEpoch: number, prevDay: string | null) {
  const day = dayWord(run.startEpoch, nowEpoch);
  return { day, text: `${day === prevDay ? "" : `${day} `}${clockTime(run.startEpoch)}–${clockTime(run.endEpoch)}` };
}

export function runLines(runs: SprayRun[], nowEpoch: number, windUnit: WindUnit) {
  let prev: string | null = null;
  return runs.map((run) => {
    const t = runTime(run, nowEpoch, prev);
    prev = t.day;
    const why = run.tone === "go" ? null : runReason(run, windUnit);
    return { tone: run.tone, text: `${TONE_WORD[run.tone] || run.tone} ${t.text}${why ? ` (${why})` : ""}` };
  });
}

/** The next 48 h as one bar (go solid, caution hatched, hold solid grey with
 * dots), the same runs written out underneath, and a label built from them. */
export function SprayHourStrip({ hours, nowEpoch, windUnit }: { hours: SprayHourSummary[]; nowEpoch: number; windUnit: WindUnit }) {
  if (!hours.length) return null;
  const lines = runLines(sprayRuns(hours), nowEpoch, windUnit);
  const endEpoch = (hours[hours.length - 1].epoch ?? nowEpoch) + 3_600_000;
  return (
    <div className="awx-spray-strip">
      <div className="awx-sprayhours" role="img" aria-label={`Spray conditions, next 48 hours: ${lines.map((l) => l.text).join("; ")}`}>
        {hours.map((h, i) => <i key={i} className={"awx-sh-" + h.tone} />)}
      </div>
      <div className="awx-sh-ticks" aria-hidden="true">
        <span>Now</span>
        <span style={{ left: `${(24 / hours.length) * 100}%` }}>+24 h</span>
        <span className="is-end">+48 h</span>
      </div>
      <ul className="awx-sh-legend" aria-hidden="true">
        {lines.slice(0, LEGEND_MAX).map((l, i) => <li key={i} className={"awx-shl-" + l.tone}><i aria-hidden="true" />{l.text}</li>)}
        {lines.length > LEGEND_MAX ? <li className="awx-shl-more">{`+${lines.length - LEGEND_MAX} more changes to ${clockTime(endEpoch)} ${dayWord(endEpoch - 1, nowEpoch)}`}</li> : null}
      </ul>
    </div>
  );
}

/** Placeholder card while the forecast loads. */
export function SprayCardSkeleton() {
  return (
    <article className="awx-card awx-spray-skeleton" aria-busy="true" aria-label="Spraying, loading">
      <div className="awx-skel awx-skel-title" />
      <div className="awx-skel awx-skel-verdict" />
      <div className="awx-skel awx-skel-line" />
      <div className="awx-skel awx-skel-strip" />
      <div className="awx-skel awx-skel-line short" />
      <span className="awx-visually-hidden">Loading spray conditions…</span>
    </article>
  );
}
