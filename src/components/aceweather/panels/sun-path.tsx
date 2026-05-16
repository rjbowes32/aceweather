// @ts-nocheck
"use client";

export function SunPath({ data }) {
  const d = data.daily;
  const today = 7;
  const sunrise = d.sunrise[today];
  const sunset = d.sunset[today];
  const uv = d.uv_index_max[today];
  const dli = d.shortwave_radiation_sum[today];
  const toMin = (s) => Number(s.slice(0,2)) * 60 + Number(s.slice(3,5));
  const nowMin = 15 * 60;
  const dayLen = toMin(sunset) - toMin(sunrise);
  const elapsed = Math.max(0, Math.min(1, (nowMin - toMin(sunrise)) / dayLen));
  const W = 240, H = 96;
  const cx = W / 2, cy = H - 10, r = W / 2 - 12;
  const a = Math.PI * (1 - elapsed);
  const sx = cx + Math.cos(a) * r;
  const sy = cy - Math.sin(a) * r;
  const largeArc = 0;
  const startX = cx - r, startY = cy;
  const elapsedArc = `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${sx} ${sy}`;
  const fullArc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  const daylight = `${Math.floor(dayLen/60)}h ${dayLen%60}m`;
  return (
    <div className="aw2-sun">
      <svg className="aw2-sun-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <path className="aw2-sun-arc" d={fullArc}/>
        <path className="aw2-sun-arc-now" d={elapsedArc}/>
        <line className="aw2-sun-horizon" x1={cx - r - 8} x2={cx + r + 8} y1={cy} y2={cy}/>
        <circle className="aw2-sun-dot" cx={sx} cy={sy} r="4"/>
        <text x={cx - r - 6} y={cy - 4} textAnchor="middle"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{sunrise}</text>
        <text x={cx + r + 6} y={cy - 4} textAnchor="middle"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{sunset}</text>
      </svg>
      <div className="aw2-sun-stats">
        <div><span>Daylight</span><b>{daylight}</b></div>
        <div><span>UV max</span><b>{uv}</b></div>
        <div><span>DLI</span><b>{dli}<small style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted)", marginLeft: 2 }}>mol</small></b></div>
      </div>
    </div>
  );
}
