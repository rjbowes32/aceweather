// @ts-nocheck
"use client";

export function MobileRainChart({ next24, next24p }) {
  const W = 370, H = 100, padL = 28, padR = 8, padT = 8, padB = 18;
  const pMax = Math.max(2, Math.max(...next24) * 1.2);
  const xs = (i) => padL + ((W - padL - padR) * i) / 23;
  const colW = (W - padL - padR) / 24;
  return (
    <svg className="aw2-m-rain-chart" viewBox={`0 0 ${W} ${H}`} width="100%" height={H}>
      <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB}
            fill="none" stroke="var(--rule)" strokeWidth="0.5"/>
      {[0,6,12,18].map(hr => (
        <line key={hr} x1={xs(hr)} x2={xs(hr)} y1={padT} y2={H - padB}
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
      <text x={padL - 4} y={padT + 8} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{pMax.toFixed(1)}mm</text>
      <text x={padL - 4} y={H - padB} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>0</text>
      {[0,6,12,18].map(hr => (
        <text key={hr} x={xs(hr)} y={H - 3}
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>
          +{hr}h
        </text>
      ))}
    </svg>
  );
}
