// @ts-nocheck
"use client";

import { dirToCompass, fmt0 } from "./helpers";

function buildThreeHourlySlots(hourly, dateIso) {
  if (!hourly || !Array.isArray(hourly.time) || !dateIso) return [];
  const indices = [];
  for (let i = 0; i < hourly.time.length; i++) {
    if (typeof hourly.time[i] === "string" && hourly.time[i].startsWith(dateIso)) {
      indices.push(i);
    }
  }
  if (!indices.length) return [];
  return indices.filter((_, k) => k % 3 === 0).map((idx) => {
    const time = hourly.time[idx] || "";
    const hh = time.includes("T") ? time.split("T")[1].slice(0, 5) : "";
    return {
      hh,
      temp: hourly.temperature_2m?.[idx],
      precip: hourly.precipitation?.[idx],
      precipProb: hourly.precipitation_probability?.[idx],
      windSpeed: hourly.wind_speed_10m?.[idx],
      windGust: hourly.wind_gusts_10m?.[idx],
      windDir: hourly.wind_direction_10m?.[idx],
      cloud: hourly.cloud_cover?.[idx],
      humidity: hourly.relative_humidity_2m?.[idx],
      pressure: hourly.pressure_msl?.[idx],
    };
  });
}

export const DayDetail = ({ day, hourly, location, onClose }) => {
  const slots = buildThreeHourlySlots(hourly, day.dateIso);
  const fullDate = (() => {
    if (!day.dateIso) return `${day.d} ${day.dt}`;
    try {
      return new Date(day.dateIso + "T12:00:00").toLocaleDateString("en-GB", {
        weekday: "long", day: "numeric", month: "long",
      });
    } catch {
      return `${day.d} ${day.dt}`;
    }
  })();

  const sunTime = (iso) => {
    if (!iso) return null;
    const t = iso.includes("T") ? iso.split("T")[1].slice(0, 5) : iso;
    return t;
  };

  return (
    <div className="aw2-m-day-detail" aria-label={`Detailed forecast for ${fullDate}`}>
      <div className="aw2-m-day-detail-card">
        <header className="aw2-m-day-detail-head">
          <div>
            <div className="aw2-m-day-detail-date">{fullDate}</div>
            <div className="aw2-m-day-detail-sub">{[location?.name, location?.region].filter(Boolean).join(", ") || "—"}</div>
          </div>
          <button type="button" className="aw2-m-day-detail-close" onClick={onClose} aria-label="Collapse detailed forecast">×</button>
        </header>

        <div className="aw2-m-day-detail-summary">
          <div className="block">
            <div className="lbl">High / Low</div>
            <div className="val">{Math.round(day.hi)}° / <span className="lo">{Math.round(day.lo)}°</span></div>
          </div>
          <div className="block">
            <div className="lbl">Rain</div>
            <div className="val">{day.rain < 0.1 ? "—" : `${day.rain.toFixed(1)} mm`}<small> · {day.pct}%</small></div>
          </div>
          <div className="block">
            <div className="lbl">Wind max</div>
            <div className="val">{Math.round(day.wind)}<small> km/h {dirToCompass(day.wdir)}</small></div>
          </div>
          {day.sunrise || day.sunset ? (
            <div className="block">
              <div className="lbl">Sun</div>
              <div className="val">{sunTime(day.sunrise) || "—"}<small> → {sunTime(day.sunset) || "—"}</small></div>
            </div>
          ) : null}
        </div>

        {slots.length ? (
          <div className="aw2-m-day-detail-slots" role="list">
            {slots.map((s) => (
              <div key={s.hh} className="aw2-m-day-detail-slot" role="listitem">
                <div className="hr">{s.hh}</div>
                <div className="temp">{fmt0(s.temp)}<small>°C</small></div>
                <div className={"rain" + ((s.precip ?? 0) < 0.1 ? " dry" : "")}>
                  {s.precip != null && s.precip >= 0.1 ? `${s.precip.toFixed(1)} mm` : "—"}
                  <small>{s.precipProb != null ? `${Math.round(s.precipProb)}%` : ""}</small>
                </div>
                <div className="wind">
                  {fmt0(s.windSpeed)}<small> km/h</small>
                  <small className="dir">{s.windDir != null ? `${dirToCompass(s.windDir)} · gust ${fmt0(s.windGust)}` : ""}</small>
                </div>
                <div className="misc">
                  <span>Cloud {fmt0(s.cloud)}%</span>
                  <span>RH {fmt0(s.humidity)}%</span>
                  <span>{fmt0(s.pressure)} hPa</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="aw2-m-day-detail-empty">
            Hourly forecast not available for this day.
          </div>
        )}
      </div>
    </div>
  );
};
