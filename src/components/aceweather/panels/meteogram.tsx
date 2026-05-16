// @ts-nocheck
"use client";

import { fmt0, fmt1 } from "../helpers";

export function Meteogram({ data, width = 880, height = 380, hoursPast = 12, hoursFuture = 24 }) {
  const nowIdx = 12 + 15;
  const fromIdx = nowIdx - hoursPast;
  const toIdx = nowIdx + hoursFuture;
  const h = data.hourly;
  const slice = (arr) => arr.slice(fromIdx, toIdx + 1);
  const times = slice(h.time);
  const temps = slice(h.temperature_2m);
  const precs = slice(h.precipitation);
  const winds = slice(h.wind_speed_10m);
  const gusts = slice(h.wind_gusts_10m);
  const wdirs = slice(h.wind_direction_10m);
  const clouds = slice(h.cloud_cover);
  const rhums = slice(h.relative_humidity_2m);
  const press = slice(h.pressure_msl);

  const n = times.length;
  const padL = 78, padR = 56, padTop = 6, padBottom = 22;
  const trackGap = 6;
  const tracksH = height - padTop - padBottom;
  const tracks = [
    { id: "temp", label: "Temp",      unit: "°C",  weight: 1.4 },
    { id: "prec", label: "Precip",    unit: "mm",  weight: 0.85 },
    { id: "wind", label: "Wind",      unit: "km/h",weight: 0.95 },
    { id: "cloud",label: "Cloud · RH",unit: "%",   weight: 0.9 },
    { id: "press",label: "Pressure",  unit: "hPa", weight: 0.85 },
  ];
  const wSum = tracks.reduce((a, t) => a + t.weight, 0);
  const plottedTracksH = tracksH - trackGap * (tracks.length - 1);
  let acc = padTop;
  const trackBounds = tracks.map((t) => {
    const h = (plottedTracksH / wSum) * t.weight;
    const b = { y: acc, h, ...t };
    acc += h + trackGap;
    return b;
  });
  const trackGaps = trackBounds.slice(1).map((t) => ({
    y: t.y - trackGap,
    h: trackGap,
  }));

  const xOf = (i) => padL + ((width - padL - padR) * i) / (n - 1);
  const xNow = xOf(hoursPast);
  const hourOf = (t) => Number(t.slice(11, 13));

  const tBand = trackBounds[0];
  const tMin = Math.floor(Math.min(...temps) - 1);
  const tMax = Math.ceil(Math.max(...temps) + 1);
  const tY = (v) => tBand.y + 6 + (tBand.h - 12) * (1 - (v - tMin) / (tMax - tMin));
  const tempPath = temps.map((v, i) => `${i ? "L" : "M"} ${xOf(i)} ${tY(v)}`).join(" ");
  const tempArea = `${tempPath} L ${xOf(n - 1)} ${tBand.y + tBand.h - 6} L ${xOf(0)} ${tBand.y + tBand.h - 6} Z`;
  const tNow = temps[hoursPast];
  const tHi = Math.max(...temps), tLo = Math.min(...temps);

  const pBand = trackBounds[1];
  const pMax = Math.max(2, Math.ceil(Math.max(...precs) * 1.2));
  const pY = (v) => pBand.y + pBand.h - 4 - ((pBand.h - 8) * v) / pMax;
  const colW = (width - padL - padR) / (n - 1);

  const wBand = trackBounds[2];
  const wMaxV = Math.max(...gusts) * 1.1;
  const wY = (v) => wBand.y + wBand.h - 4 - ((wBand.h - 12) * v) / wMaxV;
  const wNow = winds[hoursPast];

  const cBand = trackBounds[3];
  const cY = (pct) => cBand.y + cBand.h - 4 - ((cBand.h - 8) * pct) / 100;
  const cloudPath = clouds.map((v, i) => `${i ? "L" : "M"} ${xOf(i)} ${cY(v)}`).join(" ");
  const cloudArea = `${cloudPath} L ${xOf(n - 1)} ${cBand.y + cBand.h - 4} L ${xOf(0)} ${cBand.y + cBand.h - 4} Z`;
  const rhPath = rhums.map((v, i) => `${i ? "L" : "M"} ${xOf(i)} ${cY(v)}`).join(" ");

  const prBand = trackBounds[4];
  const prMin = Math.floor(Math.min(...press) - 1);
  const prMax = Math.ceil(Math.max(...press) + 1);
  const prY = (v) => prBand.y + prBand.h - 6 - ((prBand.h - 12) * (v - prMin)) / (prMax - prMin);
  const pressPath = press.map((v, i) => `${i ? "L" : "M"} ${xOf(i)} ${prY(v)}`).join(" ");

  const grids = [];
  for (let i = 0; i < n; i++) {
    const hr = hourOf(times[i]);
    if (hr % 3 === 0) {
      const x = xOf(i);
      const major = hr % 6 === 0;
      grids.push({ x, hr, major });
    }
  }

  return (
    <svg className="aw2-meteogram" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <rect x={padL} y={padTop} width={width - padL - padR} height={tracksH}
            fill="none" stroke="var(--rule)" strokeWidth="0.5"/>

      {grids.map((g, i) => (
        <line key={i} className={`gridline ${g.major ? "major" : ""}`}
              x1={g.x} x2={g.x} y1={padTop} y2={padTop + tracksH}/>
      ))}

      {trackGaps.map((g, i) => (
        <rect key={i} className="track-gap"
              x={padL} y={g.y} width={width - padL - padR} height={g.h}/>
      ))}

      {trackBounds.map((t) => (
        <g key={t.id}>
          <text className="tracklabel" x={padL - 8} y={t.y + 14} textAnchor="end">{t.label}</text>
          <text className="trackunit" x={padL - 8} y={t.y + 26} textAnchor="end">{t.unit}</text>
        </g>
      ))}

      <path className="temp-area" d={tempArea}/>
      <path className="temp-line" d={tempPath}/>
      {temps.map((v, i) => {
        if (v === tHi || v === tLo) {
          return (
            <g key={i}>
              <circle cx={xOf(i)} cy={tY(v)} r="2" fill="var(--rust)"/>
              <text className="ticklabel" x={xOf(i)} y={tY(v) + (v === tHi ? -6 : 12)} textAnchor="middle"
                    style={{ fill: "var(--ink)", fontSize: 10 }}>
                {v.toFixed(0)}°
              </text>
            </g>
          );
        }
        return null;
      })}

      {precs.map((v, i) => {
        if (v <= 0) return null;
        const x = xOf(i) - colW * 0.35;
        const y = pY(v);
        return <rect key={i} className="precip-bar" x={x} y={y} width={colW * 0.7} height={pBand.y + pBand.h - 4 - y}/>;
      })}
      <text className="ticklabel" x={width - padR + 4} y={pBand.y + 10}>{pMax} mm</text>
      <text className="ticklabel" x={width - padR + 4} y={pBand.y + pBand.h - 6}>0</text>

      {winds.map((v, i) => {
        const x = xOf(i) - colW * 0.30;
        const y = wY(v);
        const gx = xOf(i) - colW * 0.30;
        const gy = wY(gusts[i]);
        return (
          <g key={i}>
            <rect className="wind-bar" x={x} y={y} width={colW * 0.60} height={wBand.y + wBand.h - 4 - y}/>
            <line x1={gx - 1} x2={gx + colW * 0.60 + 1} y1={gy} y2={gy}
                  stroke="var(--rust)" strokeWidth="0.8"/>
          </g>
        );
      })}
      {winds.map((v, i) => {
        const hr = hourOf(times[i]);
        if (hr % 3 !== 0) return null;
        const x = xOf(i);
        const y = wBand.y + 10;
        const d = wdirs[i];
        const rot = d + 180;
        return (
          <g key={`a${i}`} transform={`translate(${x} ${y}) rotate(${rot})`}>
            <line x1="0" y1="-4" x2="0" y2="4" stroke="var(--ink-3)" strokeWidth="0.8"/>
            <polygon points="0,-5 -2,-1 2,-1" fill="var(--ink-3)"/>
          </g>
        );
      })}
      <text className="ticklabel" x={width - padR + 4} y={wBand.y + 10}>{Math.round(wMaxV)}</text>
      <text className="ticklabel" x={width - padR + 4} y={wBand.y + wBand.h - 6}>0</text>

      <path className="cloud-area" d={cloudArea}/>
      <path className="rh-line" d={rhPath}/>
      <text className="ticklabel" x={width - padR + 4} y={cBand.y + 10}>100</text>
      <text className="ticklabel" x={width - padR + 4} y={cBand.y + cBand.h - 6}>0</text>

      <path className="press-line" d={pressPath}/>
      <text className="ticklabel" x={width - padR + 4} y={prBand.y + 10}>{prMax}</text>
      <text className="ticklabel" x={width - padR + 4} y={prBand.y + prBand.h - 6}>{prMin}</text>

      <line className="nowline" x1={xNow} x2={xNow} y1={padTop} y2={padTop + tracksH}/>
      <text className="ticklabel" x={xNow + 4} y={padTop + 10} style={{ fill: "var(--rust)" }}>NOW</text>

      <text className="trackvalue" x={width - padR + 4} y={tBand.y + 26} fill="var(--rust)">{fmt1(tNow)}°</text>
      <text className="trackvalue" x={width - padR + 4} y={pBand.y + 26} fill="var(--teal)">{precs[hoursPast] > 0 ? fmt1(precs[hoursPast]) : "0.0"}</text>
      <text className="trackvalue" x={width - padR + 4} y={wBand.y + 26}>{fmt0(wNow)}</text>
      <text className="trackvalue" x={width - padR + 4} y={cBand.y + 26}>{fmt0(clouds[hoursPast])}</text>
      <text className="trackvalue" x={width - padR + 4} y={prBand.y + 26}>{fmt0(press[hoursPast])}</text>

      {grids.filter(g => g.major).map((g, i) => (
        <g key={`tx${i}`}>
          <line className="track-rule" x1={g.x} x2={g.x} y1={padTop + tracksH} y2={padTop + tracksH + 3}/>
          <text className="axis-text" x={g.x} y={padTop + tracksH + 14} textAnchor="middle">
            {String(g.hr).padStart(2, "0")}
          </text>
        </g>
      ))}
      {times.map((t, i) => {
        if (hourOf(t) !== 0) return null;
        const x = xOf(i);
        const day = new Date(t + ":00").toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();
        return (
          <text key={`d${i}`} className="axis-text" x={x + 4} y={padTop + 10}
                style={{ fill: "var(--ink-3)", letterSpacing: "0.14em" }}>
            {day}
          </text>
        );
      })}
    </svg>
  );
}
