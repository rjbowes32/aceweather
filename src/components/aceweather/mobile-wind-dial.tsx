// @ts-nocheck
"use client";

import { dirToCompass, fmt0 } from "./helpers";

export function MobileWindDial({ current }) {
  const c = current;
  const a = (c.wind_direction_10m - 90) * Math.PI / 180;
  const x = 44 + Math.cos(a) * 36, y = 44 + Math.sin(a) * 36;
  const a2 = ((c.wind_direction_10m + 180) - 90) * Math.PI / 180;
  const x2 = 44 + Math.cos(a2) * 36, y2 = 44 + Math.sin(a2) * 36;
  return (
    <div className="aw2-m-wind">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r="40" fill="none" stroke="var(--rule)" strokeWidth="0.5"/>
        <circle cx="44" cy="44" r="28" fill="none" stroke="var(--rule)" strokeWidth="0.3"/>
        {Array.from({ length: 16 }).map((_, i) => {
          const an = (i / 16) * Math.PI * 2 - Math.PI / 2;
          const r1 = 40, r2 = i % 4 === 0 ? 34 : 37;
          return <line key={i} x1={44 + Math.cos(an) * r1} y1={44 + Math.sin(an) * r1}
                       x2={44 + Math.cos(an) * r2} y2={44 + Math.sin(an) * r2}
                       stroke="var(--ink)" strokeOpacity={i % 4 === 0 ? 0.5 : 0.25}/>;
        })}
        <text x="44" y="14" textAnchor="middle" style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontWeight: 600 }}>N</text>
        <text x="44" y="80" textAnchor="middle" style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontWeight: 600 }}>S</text>
        <text x="78" y="48" textAnchor="middle" style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontWeight: 600 }}>E</text>
        <text x="10" y="48" textAnchor="middle" style={{ fontFamily: "var(--font-serif)", fontSize: 11, fontWeight: 600 }}>W</text>
        <g>
          <line x1={x} y1={y} x2={x2} y2={y2} stroke="var(--ink)" strokeWidth="1.6"/>
          <polygon points={`${x2-4},${y2-4} ${x2+4},${y2-4} ${x2},${y2+4}`}
                   transform={`rotate(${c.wind_direction_10m + 180} ${x2} ${y2})`}
                   fill="var(--ink)"/>
          <circle cx="44" cy="44" r="2.5" fill="var(--ink)"/>
        </g>
      </svg>
      <div className="stats">
        <div>Speed<b>{fmt0(c.wind_speed_10m)}<small>km/h</small></b></div>
        <div>Gust<b>{fmt0(c.wind_gusts_10m)}<small>km/h</small></b></div>
        <div>Direction<b>{dirToCompass(c.wind_direction_10m)}<small>{c.wind_direction_10m}°</small></b></div>
      </div>
    </div>
  );
}
