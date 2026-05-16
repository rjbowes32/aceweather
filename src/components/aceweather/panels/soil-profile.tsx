// @ts-nocheck
"use client";

import { fmt1 } from "../helpers";

export function SoilProfile({ data }) {
  const h = data.hourly;
  const nowIdx = 27;
  const profile = [
    { depth: "0 cm", sub: "Surface", t: h.soil_temperature_0cm[nowIdx],  m: h.soil_moisture_0_to_1cm[nowIdx] },
    { depth: "6 cm", sub: "Topsoil", t: h.soil_temperature_6cm[nowIdx],  m: h.soil_moisture_1_to_3cm[nowIdx] },
    { depth: "18 cm",sub: "Root zone", t: h.soil_temperature_18cm[nowIdx], m: h.soil_moisture_3_to_9cm[nowIdx] },
    { depth: "54 cm",sub: "Sub-soil",  t: h.soil_temperature_54cm[nowIdx], m: h.soil_moisture_27_to_81cm[nowIdx] },
  ];
  return (
    <div className="aw2-soil">
      {profile.map((p, i) => {
        const moistPct = Math.round(p.m * 100);
        return (
          <div key={i} className="aw2-soil-row">
            <div className="depth">{p.depth}<small>{p.sub}</small></div>
            <div className="meter">
              <div className="meter-fill" style={{ width: moistPct + "%" }}/>
              <div className="meter-marker" style={{ left: "32%" }}/>
              <div className="meter-marker" style={{ left: "45%" }}/>
            </div>
            <div className="temp">{fmt1(p.t)}<small>°C</small></div>
            <div className="moist">{moistPct}<small>%</small></div>
          </div>
        );
      })}
    </div>
  );
}
