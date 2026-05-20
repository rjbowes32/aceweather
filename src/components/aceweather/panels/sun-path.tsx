// @ts-nocheck
"use client";

export function SunPath({ data }) {
  const d = data.daily;
  const today = 7;
  const sunrise = d.sunrise[today];
  const sunset = d.sunset[today];
  const uv = d.uv_index_max[today];
  const dli = d.shortwave_radiation_sum[today];
  const toMin = (value) => {
    if (typeof value !== "string") return null;

    const time = value.includes("T") ? value.split("T").pop() : value;
    const match = /^(\d{1,2}):(\d{2})/.exec(time || "");
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;

    return hours * 60 + minutes;
  };
  const nowMin = 15 * 60;
  const sunriseMin = toMin(sunrise);
  const sunsetMin = toMin(sunset);
  const dayLen = sunriseMin === null || sunsetMin === null ? null : sunsetMin - sunriseMin;
  const hasSunPath = Number.isFinite(dayLen) && dayLen > 0;
  const elapsed = hasSunPath ? Math.max(0, Math.min(1, (nowMin - sunriseMin) / dayLen)) : 0;
  const W = 240, H = 96;
  const cx = W / 2, cy = H - 10, r = W / 2 - 12;
  const a = Math.PI * (1 - elapsed);
  const sx = cx + Math.cos(a) * r;
  const sy = cy - Math.sin(a) * r;
  const largeArc = 0;
  const startX = cx - r, startY = cy;
  const elapsedArc = `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${sx} ${sy}`;
  const fullArc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  const daylight = hasSunPath ? `${Math.floor(dayLen / 60)}h ${dayLen % 60}m` : "Unavailable";
  return (
    <div className="aw2-sun">
      <svg className="aw2-sun-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <path className="aw2-sun-arc" d={fullArc}/>
        {hasSunPath ? <path className="aw2-sun-arc-now" d={elapsedArc}/> : null}
        <line className="aw2-sun-horizon" x1={cx - r - 8} x2={cx + r + 8} y1={cy} y2={cy}/>
        {hasSunPath ? <circle className="aw2-sun-dot" cx={sx} cy={sy} r="4"/> : null}
        <text x={cx - r - 6} y={cy - 4} textAnchor="middle"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{sunrise || "--:--"}</text>
        <text x={cx + r + 6} y={cy - 4} textAnchor="middle"
              style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{sunset || "--:--"}</text>
      </svg>
      <div className="aw2-sun-stats">
        <div><span>Daylight</span><b>{daylight}</b></div>
        <div><span>UV max</span><b>{uv}</b></div>
        <div><span>DLI</span><b>{dli}<small style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted)", marginLeft: 2 }}>mol</small></b></div>
      </div>
    </div>
  );
}
