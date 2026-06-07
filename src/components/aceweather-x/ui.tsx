/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { useState } from "react";
import { ChevronIcon } from "./icons";

/** The mandatory card pattern: kicker + meta header, body, footer disclosure, detail. */
export function Card({ section, kicker, meta, tick = "rain", note, detail, children, currentView }) {
  const [open, setOpen] = useState(false);
  const hidden = currentView && currentView !== "all" && currentView !== section;
  return (
    <article className={"awx-card" + (open ? " is-open" : "") + (hidden ? " is-hidden" : "")} data-section={section}>
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

export function Tags({ items }) {
  if (!items?.length) return null;
  return (
    <div className="awx-tags">
      {items.map((t, i) => <span key={i} className={"awx-tag awx-t-" + t.tone}>{t.label}</span>)}
    </div>
  );
}

export function Meter({ value, tone = "go", label }) {
  return (
    <div className="awx-meter-wrap">
      <div className={"awx-meter awx-m-" + tone}><i style={{ "--awx-v": Math.max(0, Math.min(100, value)) + "%" }} /></div>
      {label ? <span className="awx-meter-val">{label}</span> : null}
    </div>
  );
}

export function Bars({ bars }) {
  return (
    <div className="awx-bars" style={{ gridTemplateColumns: `repeat(${bars.length}, 1fr)` }}>
      {bars.map((b, i) => (
        <i key={i} className={"awx-bar" + (b.dry ? " is-dry" : "") + (b.now ? " is-now" : "")}
          style={{ height: b.h + "%" }} data-label={b.label} />
      ))}
    </div>
  );
}

export function LineTrend({ trend }) {
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

export function HourlyChart({ temp, rain, wind, labels }) {
  const n = temp.length;
  if (!n) return null;
  const W = 600, H = 132, x0 = 10, x1 = 590, yTop = 14, yBase = 96;
  const xs = (i) => x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
  const tmin = Math.min(...temp), tmax = Math.max(...temp);
  const ts = (v) => yBase - (yBase - yTop) * ((v - tmin) / ((tmax - tmin) || 1));
  const wmax = Math.max(1, ...wind);
  const ws = (v) => yBase - (yBase - yTop) * 0.66 * (v / wmax);
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

export function Sky({ condition, isDay, label }) {
  const cls = "awx-sky" + (condition.key === "cloud" || condition.key === "fog" ? " is-cloud" : "") + (isDay ? "" : " is-night");
  return (
    <div className={cls} aria-hidden="true">
      <div className="awx-orb" />
      <div className="awx-horizon" />
      {label ? <span className="awx-sky-label">{label}</span> : null}
    </div>
  );
}

export function SoilRows({ soil }) {
  return (
    <div className="awx-rows">
      {soil.map((s, i) => (
        <div key={i} className="awx-soil-row">
          <div className="awx-depth">{s.depth}<small>{s.sub}</small></div>
          <div className="awx-soil-meter"><i style={{ "--awx-v": Math.min(100, s.moistPct) + "%" }} /></div>
          <div className="awx-soil-fig">{s.temp == null ? "—" : s.temp.toFixed(1)}°<small> {s.moistPct}%</small></div>
        </div>
      ))}
    </div>
  );
}

export function Verdict({ label, tone, reason }) {
  return (
    <div className={"awx-verdict awx-vd-" + tone}>
      <span className="awx-vd-badge">{label}</span>
      <span className="awx-vd-reason">{reason}</span>
    </div>
  );
}

export function DeltaTBand({ value, label, tone }) {
  const v = value == null ? null : Math.max(0, Math.min(12, value));
  const pct = (x) => (x / 12) * 100;
  return (
    <div className="awx-deltat">
      <div className="awx-deltat-head"><span>Delta-T</span><b className={"awx-v-" + tone}>{value ?? "—"}<small> °C · {label}</small></b></div>
      <div className="awx-deltat-track">
        <div className="awx-deltat-band" style={{ left: pct(2) + "%", width: pct(6) + "%" }} />
        {v != null ? <div className="awx-deltat-marker" style={{ left: pct(v) + "%" }} /> : null}
      </div>
      <div className="awx-deltat-cap">Ideal spraying band 2–8 °C</div>
    </div>
  );
}

export function RiskStrip({ days }) {
  return (
    <div className="awx-riskstrip">
      {days.map((d, i) => (
        <div key={i} className={"awx-risk-cell awx-rc-" + d.tone}>
          <span className="awx-rc-d">{d.dayNum}</span>
          <span className="awx-rc-dot" />
          <span className="awx-rc-h">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function OpsMatrix({ days, rows }) {
  const cells = [<div key="corner" className="awx-ops-h" />];
  days.forEach((d, i) => cells.push(<div key={"h" + i} className="awx-ops-h">{d.weekday}</div>));
  rows.forEach((r, ri) => {
    cells.push(<div key={"l" + ri} className="awx-ops-label">{r.label}</div>);
    r.cells.forEach((t, ci) => cells.push(<div key={ri + "-" + ci} className="awx-ops-cell"><span className={"awx-ops-dot awx-od-" + t} /></div>));
  });
  return <div className="awx-ops" style={{ gridTemplateColumns: `74px repeat(${days.length}, 1fr)` }}>{cells}</div>;
}

export function SunArc({ elapsed, sunrise, sunset, isDay }) {
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
