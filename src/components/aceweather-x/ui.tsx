"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { Condition, ConditionKey } from "@/lib/aceweather/format";
import { ChevronIcon } from "./icons";

type CssVars = CSSProperties & Record<`--awx-${string}`, string | number>;
type Tone = string;

type CardProps = {
  section: string;
  kicker: ReactNode;
  meta?: ReactNode;
  tick?: Tone;
  note?: ReactNode;
  detail?: ReactNode;
  children: ReactNode;
};

/** The mandatory card pattern: kicker + meta header, body, footer disclosure, detail. */
export function Card({ section, kicker, meta, tick = "rain", note, detail, children }: CardProps) {
  const [open, setOpen] = useState(false);
  return (
    <article className={"awx-card" + (open ? " is-open" : "")} data-section={section}>
      <div className="awx-card-head">
        <div className="awx-title">
          <div className="awx-kicker">{kicker}</div>
          {meta ? <span className="awx-meta">{meta}</span> : null}
        </div>
        <span className={"awx-tick awx-tick-" + tick} />
      </div>
      {children}
      {(detail || note) ? (
        <div className="awx-card-foot">
          {detail ? (
            <button className="awx-disclosure" type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? "Hide" : "Details"} <ChevronIcon />
            </button>
          ) : <span />}
          {note ? <span className="awx-note">{note}</span> : <span />}
        </div>
      ) : null}
      {detail ? <div className="awx-detail">{detail}</div> : null}
    </article>
  );
}

export function Tags({ items }: { items: Array<{ tone: Tone; label: ReactNode }> }) {
  if (!items?.length) return null;
  return (
    <div className="awx-tags">
      {items.map((t, i) => <span key={i} className={"awx-tag awx-t-" + t.tone}>{t.label}</span>)}
    </div>
  );
}

export function Meter({ value, tone = "go", label }: { value: number; tone?: Tone; label?: string }) {
  const boundedValue = Math.max(0, Math.min(100, value));
  return (
    <div className="awx-meter-wrap" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={boundedValue} aria-label={label}>
      <div className={"awx-meter awx-m-" + tone} aria-hidden="true"><i style={{ "--awx-v": boundedValue + "%" } as CssVars} /></div>
      {label ? <span className="awx-meter-val">{label}</span> : null}
    </div>
  );
}

type BarDatum = { h: number; label: string; value?: number | string; unit?: string; dry?: boolean; now?: boolean };

export function Bars({ bars, label = "Chart values" }: { bars: BarDatum[]; label?: string }) {
  return (
    <div className="awx-bars" role="list" aria-label={label} style={{ gridTemplateColumns: `repeat(${bars.length}, 1fr)` }}>
      {bars.map((b, i) => (
        <i key={i} role="listitem" aria-label={b.value == null ? b.label : `${b.label}: ${b.value}${b.unit ? ` ${b.unit}` : ""}`} className={"awx-bar" + (b.dry ? " is-dry" : "") + (b.now ? " is-now" : "")}
          style={{ height: b.h + "%" }} data-label={b.label} />
      ))}
    </div>
  );
}

type LineTrendData = {
  viewW: number;
  viewH: number;
  nowX: number;
  tempPath: string;
  areaPath: string;
  rainPath: string;
  pressPath: string;
};

export function LineTrend({ trend }: { trend: LineTrendData }) {
  const { viewW, viewH, nowX, tempPath, areaPath, rainPath, pressPath } = trend;
  return (
    <svg className="awx-line" viewBox={`0 0 ${viewW} ${viewH}`} role="img" aria-label="24-hour trend of temperature, rain and pressure">
      <path className="awx-grid" d={`M28 30H540M28 90H540M28 150H540`} />
      <line className="awx-now-line" x1={nowX} x2={nowX} y1="20" y2="156" />
      <path className="awx-area" d={areaPath} />
      <path className="awx-press" d={pressPath} />
      <path className="awx-rain" d={rainPath} />
      <path className="awx-temp" d={tempPath} />
      <text x={nowX + 4} y="30">now</text>
    </svg>
  );
}

export function HourlyChart({ temp, rain, wind, labels }: { temp: number[]; rain: number[]; wind: number[]; labels: string[] }) {
  const n = temp.length;
  if (!n) return null;
  const W = 600, H = 132, x0 = 10, x1 = 590, yTop = 14, yBase = 96;
  const xs = (i: number) => x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
  const tmin = Math.min(...temp), tmax = Math.max(...temp);
  const ts = (v: number) => yBase - (yBase - yTop) * ((v - tmin) / ((tmax - tmin) || 1));
  const wmax = Math.max(1, ...wind);
  const ws = (v: number) => yBase - (yBase - yTop) * 0.66 * (v / wmax);
  const rmax = Math.max(0.4, ...rain);
  const colW = ((x1 - x0) / n) * 0.58;
  const tPath = temp.map((v, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ts(v).toFixed(1)}`).join("");
  const wPath = wind.map((v, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ws(v).toFixed(1)}`).join("");
  return (
    <svg className="awx-line awx-hourly-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Hourly temperature, rain and wind">
      <path className="awx-grid" d={`M${x0} ${yBase}H${x1}`} />
      {rain.map((v, i) => {
        if (!(v > 0)) return null;
        const hgt = (v / rmax) * (yBase - yTop) * 0.8;
        return <rect key={i} x={xs(i) - colW / 2} y={yBase - hgt} width={colW} height={hgt} rx="1" fill="var(--awx-accent)" opacity="0.7" />;
      })}
      <path d={wPath} fill="none" stroke="var(--awx-cool)" strokeWidth="1.6" opacity="0.75" />
      <path className="awx-temp" d={tPath} />
      {labels.map((l, i) => (["00", "06", "12", "18", "23"].includes(l) ? <text key={i} x={xs(i)} y={H - 6} textAnchor="middle">{l}:00</text> : null))}
    </svg>
  );
}

export function Sky({ condition, isDay, label }: { condition: Condition; isDay: number | boolean; label?: ReactNode }) {
  const cls = "awx-sky" + (condition.key === "cloud" || condition.key === "fog" ? " is-cloud" : "") + (isDay ? "" : " is-night");
  return (
    <div className={cls} aria-hidden="true">
      <div className="awx-orb" />
      <div className="awx-horizon" />
      {label ? <span className="awx-sky-label">{label}</span> : null}
    </div>
  );
}

type SoilDatum = { depth: string; sub: string; temp?: number | null; moistPct: number };

export function SoilRows({ soil }: { soil: SoilDatum[] }) {
  return (
    <div className="awx-rows">
      {soil.map((s, i) => (
        <div key={i} className="awx-soil-row">
          <div className="awx-depth">{s.depth}<small>{s.sub}</small></div>
          <div className="awx-soil-meter" role="meter" aria-label={`${s.depth} soil moisture`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, s.moistPct)}><i aria-hidden="true" style={{ "--awx-v": Math.min(100, s.moistPct) + "%" } as CssVars} /></div>
          <div className="awx-soil-fig">{s.temp == null ? "—" : s.temp.toFixed(1)}°<small> {s.moistPct}%</small></div>
        </div>
      ))}
    </div>
  );
}

export function Verdict({ label, tone, reason }: { label: ReactNode; tone: Tone; reason: ReactNode }) {
  return (
    <div className={"awx-verdict awx-vd-" + tone}>
      <span className="awx-vd-badge">{label}</span>
      <span className="awx-vd-reason">{reason}</span>
    </div>
  );
}

export function DeltaTBand({ value, label, tone }: { value?: number | null; label: string; tone: Tone }) {
  const v = value == null ? null : Math.max(0, Math.min(12, value));
  const pct = (x: number) => (x / 12) * 100;
  return (
    <div className="awx-deltat">
      <div className="awx-deltat-head"><span>Delta-T</span><b className={"awx-v-" + tone}>{value ?? "—"}<small> °C · {label}</small></b></div>
      <div className="awx-deltat-track" role="meter" aria-label={`Delta-T ${value ?? "unknown"} degrees Celsius, ${label}`} aria-valuemin={0} aria-valuemax={12} aria-valuenow={v ?? undefined}>
        <div className="awx-deltat-band" style={{ left: pct(2) + "%", width: pct(6) + "%" }} />
        {v != null ? <div className="awx-deltat-marker" style={{ left: pct(v) + "%" }} /> : null}
      </div>
    </div>
  );
}

type RiskDay = { tone: Tone; dayNum: string | number; label: string };

export function RiskStrip({ days }: { days: RiskDay[] }) {
  return (
    <div className="awx-riskstrip" role="list">
      {days.map((d, i) => (
        <div key={i} className={"awx-risk-cell awx-rc-" + d.tone} role="listitem" aria-label={`${d.dayNum}: ${d.label}`}>
          <span className="awx-rc-d">{d.dayNum}</span>
          <span className="awx-rc-dot" />
          <span className="awx-rc-h">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

type OpsDay = { weekday: string };
type OpsRow = { label: string; cells: string[] };

export function OpsMatrix({ days, rows }: { days: OpsDay[]; rows: OpsRow[] }) {
  const toneLabel = (tone: string) => tone === "go" ? "Go" : tone === "warn" ? "Caution" : tone === "risk" ? "Avoid" : tone;
  return (
    <div className="awx-ops" role="grid" aria-label="Field operation suitability" style={{ gridTemplateColumns: `74px repeat(${days.length}, 1fr)` }}>
      <div className="awx-ops-row" role="row">
        <div className="awx-ops-h" role="columnheader" />
        {days.map((day) => <div key={day.weekday} className="awx-ops-h" role="columnheader">{day.weekday}</div>)}
      </div>
      {rows.map((row) => (
        <div className="awx-ops-row" role="row" key={row.label}>
          <div className="awx-ops-label" role="rowheader">{row.label}</div>
          {row.cells.map((tone, columnIndex) => (
            <div key={`${row.label}-${days[columnIndex]?.weekday}`} className="awx-ops-cell" role="gridcell" aria-label={`${row.label}, ${days[columnIndex]?.weekday}: ${toneLabel(tone)}`}>
              <span aria-hidden="true" className={"awx-ops-dot awx-od-" + tone} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function SunArc({ elapsed, sunrise, sunset, isDay }: { elapsed: number; sunrise: string; sunset: string; isDay: number | boolean }) {
  const W = 280, H = 112, cx = W / 2, cy = H - 16, r = W / 2 - 26;
  const e = Math.max(0, Math.min(1, elapsed));
  const a = Math.PI * (1 - e);
  const sx = cx + Math.cos(a) * r, sy = cy - Math.sin(a) * r;
  const full = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const done = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${sx.toFixed(1)} ${sy.toFixed(1)}`;
  return (
    <svg className="awx-sunarc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sun path">
      <path className="awx-sunarc-track" d={full} />
      {isDay ? <path className="awx-sunarc-done" d={done} /> : null}
      <line className="awx-sunarc-horizon" x1={cx - r - 10} x2={cx + r + 10} y1={cy} y2={cy} />
      {isDay ? <circle className="awx-sunarc-dot" cx={sx} cy={sy} r="6" /> : null}
      <text className="awx-sunarc-t" x={cx - r} y={cy + 16} textAnchor="middle">{sunrise}</text>
      <text className="awx-sunarc-t" x={cx + r} y={cy + 16} textAnchor="middle">{sunset}</text>
    </svg>
  );
}

export { ConditionIcon } from "./icons";
export type { ConditionKey };
