// @ts-nocheck
"use client";

export function RadarSketch({ data }) {
  const h = data.hourly;
  const nowIdx = 27;
  const cells = [];
  for (let i = -2; i <= 4; i++) {
    const v = h.precipitation[nowIdx + i] || 0;
    if (v < 0.05) continue;
    const azFromBearing = h.wind_direction_10m[nowIdx + i] || 240;
    const distance = (i + 2) / 6;
    const az2 = i < 0 ? azFromBearing : azFromBearing + 180;
    const rad = (az2 - 90) * Math.PI / 180;
    cells.push({
      r: 12 + distance * 80,
      x: 100 + Math.cos(rad) * (12 + distance * 80),
      y: 100 + Math.sin(rad) * (12 + distance * 80),
      size: 6 + v * 8,
      intensity: Math.min(1, v / 3),
      future: i > 0,
    });
  }

  return (
    <>
    <svg className="aw2-radar" viewBox="0 0 200 200" width="100%">
      {[30, 60, 90].map(r => <circle key={r} className="ring" cx="100" cy="100" r={r}/>)}
      <line className="axis" x1="100" y1="6" x2="100" y2="194"/>
      <line className="axis" x1="6" y1="100" x2="194" y2="100"/>
      <text className="label" x="100" y="14" textAnchor="middle">N</text>
      <text className="label" x="14" y="103" textAnchor="middle">W</text>
      <text className="label" x="186" y="103" textAnchor="middle">E</text>
      <text className="label" x="100" y="196" textAnchor="middle">S</text>
      <text className="label" x="102" y="73" textAnchor="start">10km</text>
      <text className="label" x="102" y="43" textAnchor="start">25km</text>
      <text className="label" x="102" y="13" textAnchor="start">50km</text>
      {cells.map((c, i) => (
        <ellipse key={i} className="cell" cx={c.x} cy={c.y} rx={c.size} ry={c.size * 0.7}
                 opacity={0.25 + c.intensity * 0.55}
                 transform={`rotate(${Math.atan2(c.y - 100, c.x - 100) * 180 / Math.PI + 60} ${c.x} ${c.y})`}
                 strokeDasharray={c.future ? "2 1" : ""}
                 stroke={c.future ? "var(--teal)" : "none"} strokeWidth={c.future ? "0.6" : "0"}/>
      ))}
      <circle className="station" cx="100" cy="100" r="3"/>
      <text className="label" x="106" y="103">BISHOPTON</text>
    </svg>
    <div className="aw2-radar-foot">
      <span>−2h ← solid · forecast → dashed +4h</span>
      <span>Approx · model-derived</span>
    </div>
    </>
  );
}
