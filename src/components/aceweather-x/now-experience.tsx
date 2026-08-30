"use client";

import type { AwModel } from "@/lib/aceweather/derive";
import {
  formatNextRain,
  formatTemperature,
  formatWind,
  temperatureUnitLabel,
  windUnitLabel,
  type TemperatureUnit,
  type WindUnit,
} from "@/lib/aceweather/format";
import { NavIcon } from "./icons";
import { LineTrend } from "./ui";

type Props = {
  model: AwModel;
  unit: TemperatureUnit;
  windUnit: WindUnit;
  freshness: string;
  onSelectView: (view: string) => void;
};

export function NowExperience({ model, unit, windUnit, freshness, onSelectView }: Props) {
  const now = model.now;
  const sun = model.sun;
  const hourly = (model.todayHours || []).slice(0, 10);
  const rain = formatNextRain(model.nextRain, model.rain.sum24, model.rain.peakProb);
  const windLabel = windUnitLabel(windUnit);

  return (
    <section className="awx-now-experience" aria-label="Current and hourly weather">
      <section className="awx-now-current" aria-labelledby="awx-now-current-title">
        <div className="awx-now-current-head">
          <div>
            <span className="awx-overview-eyebrow" id="awx-now-current-title">Now · updated {freshness}</span>
            <div className="awx-now-current-reading">
              <span className="awx-tnum">{formatTemperature(now.temp, unit)}</span>
              <small>{temperatureUnitLabel(unit)}</small>
            </div>
            <strong>{now.condition.label}</strong>
            <p>Feels {formatTemperature(now.feels, unit)}° · high {formatTemperature(now.hi, unit)}° · low {formatTemperature(now.lo, unit)}°</p>
          </div>
          <div className="awx-now-condition-mark" aria-hidden="true"><NavIcon name="now" /></div>
        </div>
        <div className="awx-now-key-metrics">
          <div><span>Wind · gust</span><strong className="awx-tnum">{formatWind(now.wind, windUnit)} · {formatWind(now.gust, windUnit)} <small>{windLabel}</small></strong></div>
          <div><span>Rain now</span><strong className="awx-tnum">{Math.round(now.precipProb ?? 0)}% · {(now.precip ?? 0).toFixed(1)} <small>mm</small></strong></div>
          <div><span>Humidity</span><strong className="awx-tnum">{Math.round(now.rh ?? 0)}%</strong></div>
          <div><span>Pressure</span><strong className="awx-tnum">{Math.round(now.pressure ?? 0)} <small>hPa</small></strong></div>
        </div>
        <div className="awx-now-secondary">
          <span>Dew {now.dew == null ? "—" : now.dew.toFixed(1)}°</span>
          <span>{Math.round(now.cloud ?? 0)}% cloud</span>
          <span>UV {Math.round(now.uv ?? 0)}</span>
          <span>Visibility {now.vis == null ? "—" : now.vis.toFixed(0)} km</span>
        </div>
      </section>

      <section className="awx-now-hourly" aria-labelledby="awx-now-hourly-title">
        <div className="awx-now-section-head">
          <div><span id="awx-now-hourly-title">Next ten hours</span></div>
          <button type="button" onClick={() => onSelectView("rain")}>Rain detail</button>
        </div>
        <button className="awx-now-rain-callout" type="button" onClick={() => onSelectView("rain")}>
          <span><small>Change ahead</small><strong>{rain.headline}</strong></span>
          <span>{rain.detail}</span>
          <b aria-hidden="true">›</b>
        </button>
        <div className="awx-now-hours" role="list" aria-label="Hourly forecast">
          {hourly.map((hour) => (
            <div key={`${hour.dateKey}-${hour.label}`} role="listitem" className={(hour.precip ?? 0) > 0 ? "is-wet" : ""}>
              <span>{hour.label}</span>
              <strong className="awx-tnum">{formatTemperature(hour.temp, unit)}°</strong>
              <small>{Math.round(hour.prob ?? 0)}% rain</small>
              <small>{formatWind(hour.wind, windUnit)} {windLabel}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="awx-now-daylight" aria-labelledby="awx-now-daylight-title">
        <div className="awx-now-section-head">
          <div><span id="awx-now-daylight-title">Sun & daylight</span><small>{sun.isDay ? `${sun.daylightLeft} remaining` : "After sunset"}</small></div>
        </div>
        <div className="awx-now-daylight-grid">
          <div><span>Sunrise</span><strong className="awx-tnum">{sun.sunrise}</strong></div>
          <div><span>Sunset</span><strong className="awx-tnum">{sun.sunset}</strong></div>
          <div><span>Day length</span><strong className="awx-tnum">{sun.dayLength}</strong></div>
          <div><span>UV</span><strong className="awx-tnum">{Math.round(sun.uvNow ?? 0)} now · {Math.round(sun.uvMax ?? 0)} max</strong></div>
        </div>
      </section>

      <details className="awx-now-detail">
        <summary>Full hourly detail</summary>
        <div className="awx-now-detail-body">
          <div className="awx-now-trend"><LineTrend trend={model.trend} /></div>
          <div className="awx-now-table" role="table" aria-label="Full hourly forecast">
            <div className="awx-now-table-row is-head" role="row">
              <span role="columnheader">Time</span><span role="columnheader">Temp</span><span role="columnheader">Feels</span><span role="columnheader">Wind</span><span role="columnheader">Gust</span><span role="columnheader">Rain</span>
            </div>
            {(model.todayHours || []).map((hour) => (
              <div className="awx-now-table-row" role="row" key={`detail-${hour.dateKey}-${hour.label}`}>
                <span role="cell">{hour.label}</span>
                <strong role="cell" className="awx-tnum">{formatTemperature(hour.temp, unit)}°</strong>
                <span role="cell" className="awx-tnum">{formatTemperature(hour.feels, unit)}°</span>
                <span role="cell" className="awx-tnum">{formatWind(hour.wind, windUnit)}</span>
                <span role="cell" className="awx-tnum">{formatWind(hour.gust, windUnit)}</span>
                <span role="cell" className={(hour.precip ?? 0) > 0 ? "is-wet" : ""}>{Math.round(hour.prob ?? 0)}% · {(hour.precip ?? 0).toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}
