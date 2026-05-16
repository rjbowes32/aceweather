// @ts-nocheck
"use client";

export function RainPanel({ data, compact = false }) {
  const h = data.hourly;
  const nowIdx = 27;
  const next24 = h.precipitation.slice(nowIdx, nowIdx + 24);
  const next24p = h.precipitation_probability.slice(nowIdx, nowIdx + 24);
  const sum24 = next24.reduce((a, b) => a + b, 0);
  const peakP = Math.max(...next24p);

  const past7 = data.daily.precipitation_sum.slice(0, 7);
  const past7sum = past7.reduce((a, b) => a + b, 0);
  const next7 = data.daily.precipitation_sum.slice(7, 14);
  const next7p = data.daily.precipitation_probability_max.slice(7, 14);
  const next7d = data.daily.weekday.slice(7, 14);

  const W = compact ? 360 : 440, H = compact ? 80 : 110;
  const padL = 26, padR = 8, padT = 6, padB = 14;
  const pMax = Math.max(2, Math.max(...next24) * 1.2);
  const xs = (i) => padL + ((W - padL - padR) * i) / 23;
  const colW = (W - padL - padR) / 24;

  return (
    <div className="aw2-rain">
      <div className="aw2-rain-headline">
        <div className="aw2-rain-stat">
          <div className="k">Next 24h</div>
          <div className={"v" + (sum24 < 0.1 ? " dry" : "")}>{sum24.toFixed(1)}<small>mm</small></div>
          <div className="sub">Peak chance · {peakP}%</div>
        </div>
        <div className="aw2-rain-stat">
          <div className="k">Past 7d · Σ</div>
          <div className={"v" + (past7sum < 0.1 ? " dry" : "")}>{past7sum.toFixed(1)}<small>mm</small></div>
          <div className="sub">Norm 11.6mm · +{(past7sum - 11.6).toFixed(1)}</div>
        </div>
      </div>

      <svg className="aw2-rain-chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB}
              fill="none" stroke="var(--rule)" strokeWidth="0.5"/>
        {[0,6,12,18,24].map(hr => (
          <line key={hr} x1={xs(hr)} x2={xs(hr)}
                y1={padT} y2={H - padB}
                stroke="var(--rule-faint)" strokeWidth="0.5"/>
        ))}
        <path d={
          next24p.map((p, i) => `${i ? "L" : "M"} ${xs(i)} ${H - padB - (p / 100) * (H - padT - padB) * 0.9}`).join(" ")
            + ` L ${xs(23)} ${H - padB} L ${xs(0)} ${H - padB} Z`
        } fill="var(--teal)" opacity="0.10"/>
        {next24.map((v, i) => {
          if (v <= 0) return null;
          const x = xs(i) - colW * 0.3;
          const y = H - padB - (v / pMax) * (H - padT - padB) * 0.9;
          return <rect key={i} fill="var(--teal)" x={x} y={y} width={colW * 0.6} height={H - padB - y}/>;
        })}
        <text x={padL - 4} y={padT + 8} textAnchor="end" className="aw2-meteogram"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{pMax.toFixed(1)}</text>
        <text x={padL - 4} y={H - padB} textAnchor="end"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>0</text>
        {[0,6,12,18].map(hr => (
          <text key={hr} x={xs(hr)} y={H - 2}
                style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>
            +{hr}h
          </text>
        ))}
      </svg>

      <div className="aw2-rain-7">
        {next7.map((mm, i) => {
          const max = Math.max(1, ...next7);
          return (
            <div key={i} className="aw2-rain-7-col">
              <div className="d">{next7d[i]}</div>
              <div className="bar">
                <div className="bar-fill" style={{ height: (mm / max * 100) + "%" }}/>
              </div>
              <div className={"mm" + (mm < 0.1 ? " zero" : "")}>{mm < 0.1 ? "·" : mm.toFixed(1)}</div>
              <div className="pct">{next7p[i]}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
