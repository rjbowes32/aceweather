// @ts-nocheck
"use client";

import { fmt1 } from "../helpers";

export function FrostPanel({ data }) {
  const h = data.hourly;
  const tonightStart = 36;
  const tonightLen = 12;
  const airTemp = h.temperature_2m.slice(tonightStart, tonightStart + tonightLen);
  const cloud = h.cloud_cover.slice(tonightStart, tonightStart + tonightLen);
  const grass = airTemp.map((t, i) => t - (2.8 - (cloud[i] / 100) * 1.6));
  const minAir = Math.min(...airTemp);
  const minGrass = Math.min(...grass);

  const W = 440, H = 110;
  const padL = 28, padR = 8, padT = 8, padB = 18;
  const all = [...airTemp, ...grass, 0];
  const tMin = Math.floor(Math.min(...all) - 1);
  const tMax = Math.ceil(Math.max(...all) + 1);
  const xs = (i) => padL + ((W - padL - padR) * i) / (tonightLen - 1);
  const ys = (v) => padT + (H - padT - padB) * (1 - (v - tMin) / (tMax - tMin));
  const airPath = airTemp.map((v, i) => `${i ? "L" : "M"} ${xs(i)} ${ys(v)}`).join(" ");
  const grassPath = grass.map((v, i) => `${i ? "L" : "M"} ${xs(i)} ${ys(v)}`).join(" ");
  const zeroY = ys(0);

  const risk = minGrass <= 0 ? "warn" : minGrass <= 2 ? "cold" : "";

  return (
    <div className="aw2-frost">
      <div className="aw2-frost-bar">
        <div className="k">Air min</div>
        <div className={"v" + (minAir <= 2 ? " cold" : "")}>{fmt1(minAir)}°</div>
      </div>
      <div className="aw2-frost-bar">
        <div className="k">Grass min</div>
        <div className={"v " + risk}>{fmt1(minGrass)}°</div>
      </div>

      <svg className="aw2-frost-chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB}
              fill="none" stroke="var(--rule)" strokeWidth="0.5"/>
        {zeroY >= padT && zeroY <= H - padB && (
          <>
            <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY}
                  stroke="var(--ink)" strokeWidth="0.5" strokeDasharray="3 3"/>
            <text x={W - padR - 2} y={zeroY - 3} textAnchor="end"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ink)" }}>0°C · FROST</text>
          </>
        )}
        <path d={airPath} fill="none" stroke="var(--ink)" strokeWidth="1.4"/>
        <path d={grassPath} fill="none" stroke="var(--frost)" strokeWidth="1.4" strokeDasharray="3 2"/>
        <text x={padL - 4} y={padT + 8} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{tMax}°</text>
        <text x={padL - 4} y={H - padB} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{tMin}°</text>
        {[0,3,6,9,11].map(i => (
          <text key={i} x={xs(i)} y={H - 4} textAnchor="middle"
                style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>
            {String((i) % 24).padStart(2, "0")}
          </text>
        ))}
      </svg>

      <div className="aw2-frost-legend">
        <span><i className="air"></i>Air 1.5m</span>
        <span><i className="grass"></i>Grass</span>
        <span><i className="zero"></i>Freeze line</span>
      </div>
    </div>
  );
}
