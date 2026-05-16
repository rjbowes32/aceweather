// @ts-nocheck
"use client";

export function FortnightStrip({ data }) {
  const d = data.daily;
  const days = 14;
  const off = 7;
  const hi = d.temperature_2m_max.slice(off, off + days);
  const lo = d.temperature_2m_min.slice(off, off + days);
  const wd = d.weekday.slice(off, off + days);
  const dt = d.date.slice(off, off + days);
  const rain = d.precipitation_sum.slice(off, off + days);
  const pct = d.precipitation_probability_max.slice(off, off + days);
  const ws = d.wind_speed_10m_max.slice(off, off + days);
  const wdir = d.wind_direction_10m_dominant.slice(off, off + days);

  const min = Math.min(...lo);
  const max = Math.max(...hi);

  return (
    <div className="aw2-fortnight">
      {wd.map((w, i) => {
        const isToday = i === 0;
        const segL = ((lo[i] - min) / (max - min)) * 100;
        const segR = ((hi[i] - min) / (max - min)) * 100;
        return (
          <div key={i} className="aw2-day">
            <div className={"h" + (isToday ? " today" : "")}>
              <span>{w}</span><b>{dt[i]}</b>
            </div>
            <div className="temps">
              <span>{Math.round(hi[i])}°</span>
              <span className="sep">/</span>
              <span className="lo">{Math.round(lo[i])}°</span>
            </div>
            <div className="rangebar">
              <div className="seg" style={{ left: segL + "%", width: (segR - segL) + "%" }}/>
            </div>
            <div className={"rain" + (rain[i] < 0.1 ? " dry" : "")}>
              <span>{rain[i] < 0.1 ? "·" : rain[i].toFixed(1) + "mm"}</span>
              <span className="pct">{pct[i]}%</span>
            </div>
            <div className="wind">
              <span className="arr" style={{ display: "inline-block", transform: `rotate(${wdir[i] + 180}deg)` }}>↑</span>
              <span>{Math.round(ws[i])} km/h</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
