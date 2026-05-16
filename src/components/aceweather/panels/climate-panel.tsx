// @ts-nocheck
"use client";

import { useState } from "react";

export function ClimatePanel({ data }) {
  const [range, setRange] = useState("month");
  const c = data.climate;

  const W = 360, H = 80;
  const padL = 24, padR = 8, padT = 8, padB = 18;
  const min = Math.min(...c.history.map(x => x.mean), c.monthly_mean_30y) - 1;
  const max = Math.max(...c.history.map(x => x.mean)) + 1;
  const ys = (v) => padT + (H - padT - padB) * (1 - (v - min) / (max - min));
  const normY = ys(c.monthly_mean_30y);
  const normLabel = { x: padL + 8, y: padT + 7, w: 94, h: 14 };
  const plotW = W - padL - padR;
  const barSlot = plotW / c.history.length;
  const barW = barSlot * 0.58;
  const barX = (i) => padL + i * barSlot + (barSlot - barW) / 2;
  const barCenter = (i) => padL + i * barSlot + barSlot / 2;

  return (
    <div className="aw2-climate">
      <div className="aw2-climate-pills" role="tablist">
        {[["month","May"],["7","7D"],["14","14D"],["30","30D"],["90","90D"]].map(([k,l]) => (
          <button key={k} aria-pressed={range === k} onClick={() => setRange(k)}>{l}</button>
        ))}
      </div>

      <svg className="aw2-climate-chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB}
              fill="none" stroke="var(--rule)" strokeWidth="0.5"/>
        <line x1={padL} x2={W - padR} y1={normY} y2={normY}
              stroke="var(--ink)" strokeWidth="0.5" strokeDasharray="3 3"/>
        {c.history.map((y, i) => {
          const v = y.mean;
          const yy = ys(v);
          const color = v > c.monthly_mean_30y ? "var(--rust)" : "var(--teal)";
          return (
            <g key={y.y}>
              <rect x={barX(i)} y={yy} width={barW} height={(H - padB) - yy}
                    fill={color} opacity={i === c.history.length - 1 ? 1 : 0.5}/>
              <text x={barCenter(i)} y={H - 4} textAnchor="middle"
                    style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: i === c.history.length - 1 ? "var(--ink)" : "var(--muted)" }}>
                {String(y.y).slice(2)}
              </text>
            </g>
          );
        })}
        <g>
          <rect x={normLabel.x} y={normLabel.y} width={normLabel.w} height={normLabel.h}
                fill="var(--paper)" stroke="var(--rule)" strokeWidth="0.5"/>
          <text x={normLabel.x + 5} y={normLabel.y + 10} textAnchor="start"
                style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, fill: "var(--ink)" }}>
            30y mean · {c.monthly_mean_30y}°
          </text>
        </g>
        <text x={padL - 4} y={padT + 8} textAnchor="end"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{Math.ceil(max)}°</text>
        <text x={padL - 4} y={H - padB} textAnchor="end"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{Math.floor(min)}°</text>
      </svg>

      <div className="aw2-climate-stats">
        <div className="aw2-climate-stat">
          <div className="k">{c.month_label} mean</div>
          <div className={"v " + (c.monthly_mean_year > c.monthly_mean_30y ? "warm" : "cool")}>
            {c.monthly_mean_year.toFixed(1)}°
          </div>
        </div>
        <div className="aw2-climate-stat">
          <div className="k">Anomaly</div>
          <div className={"v " + (c.monthly_mean_year > c.monthly_mean_30y ? "warm" : "cool")}>
            {(c.monthly_mean_year - c.monthly_mean_30y >= 0 ? "+" : "") + (c.monthly_mean_year - c.monthly_mean_30y).toFixed(1)}°
          </div>
        </div>
        <div className="aw2-climate-stat">
          <div className="k">Rain MTD</div>
          <div className={"v " + (c.monthly_rain_year < c.monthly_rain_30y ? "cool" : "warm")}>
            {c.monthly_rain_pct}<small style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)", marginLeft: 2 }}>%</small>
          </div>
        </div>
      </div>
    </div>
  );
}
