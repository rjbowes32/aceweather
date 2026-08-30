"use client";

import { buildModel } from "@/lib/aceweather/derive";
import {
  formatNextRain,
  formatTemperature,
  formatWind,
  temperatureUnitLabel,
  windUnitLabel,
  type TemperatureUnit,
  type WindUnit,
} from "@/lib/aceweather/format";
import { NavIcon, ShareIcon } from "./icons";

type WeatherModel = ReturnType<typeof buildModel>;

type OverviewExperienceProps = {
  model: WeatherModel;
  unit: TemperatureUnit;
  windUnit: WindUnit;
  statusText: string;
  freshness: string;
  onShare: () => void;
  shareLabel: string;
  onSelectView: (view: string) => void;
};

export function OverviewExperience({
  model,
  unit,
  windUnit,
  statusText,
  freshness,
  onShare,
  shareLabel,
  onSelectView,
}: OverviewExperienceProps) {
  const spraying = model.agronomy.spraying;
  const access = model.agronomy.access;
  const blight = model.agronomy.blight;
  const disease = model.agronomy.disease;
  const hourly = (model.todayHours || []).slice(0, 6);
  const nextDays = (model.calendar || []).slice(1, 4);
  const windLabel = windUnitLabel(windUnit);
  const rainTiming = formatNextRain(model.nextRain, model.rain.sum24, model.rain.peakProb);
  const sprayDetail = spraying.nextWindow
    ? `${spraying.nextWindow.start}–${spraying.nextWindow.end}${spraying.nextWindow.today ? " today" : " next"}`
    : spraying.verdictReason;
  const diseaseLabel = blight.status !== "Low" ? blight.status : disease.pressureLabel;
  const diseaseTone = blight.tone !== "go" ? blight.tone : disease.pressureTone;
  const diseaseDetail = blight.nextPeriod ? `Hutton period ${blight.nextPeriod}` : `${disease.lwd24}h leaf wetness`;

  return (
    <section className="awx-overview-experience" aria-label="Weather overview">
      <div className="awx-overview-current">
        <div className="awx-overview-current-head">
          <div>
            <span className="awx-overview-eyebrow">{statusText} · updated {freshness}</span>
            <div className="awx-overview-temp">
              <span className="awx-tnum">{formatTemperature(model.now.temp, unit)}</span>
              <small>{temperatureUnitLabel(unit)}</small>
            </div>
            <p>{model.now.condition.label} · feels {formatTemperature(model.now.feels, unit)}°</p>
          </div>
          <button className="awx-overview-share" type="button" onClick={onShare} aria-label={shareLabel}>
            <ShareIcon />
          </button>
        </div>
        <div className="awx-overview-basics">
          <div><span>High / low</span><b className="awx-tnum">{formatTemperature(model.now.hi, unit)}° / {formatTemperature(model.now.lo, unit)}°</b></div>
          <div><span>Rain · 24h</span><b className="awx-tnum awx-rain-value">{model.rain.sum24} mm</b></div>
          <div><span>Wind</span><b className="awx-tnum">{formatWind(model.now.wind, windUnit)} <small>{windLabel}</small></b></div>
        </div>
      </div>

      <button className="awx-overview-rain" type="button" onClick={() => onSelectView("rain")}>
        <span className="awx-overview-rain-icon" aria-hidden="true"><NavIcon name="rain" /></span>
        <span>
          <small>Rain timing</small>
          <strong>{rainTiming.headline}</strong>
          <span>{rainTiming.detail}</span>
        </span>
        <b aria-hidden="true">›</b>
      </button>

      <section className="awx-overview-section awx-overview-field" aria-labelledby="awx-field-guidance">
        <div className="awx-overview-section-head">
          <div><span id="awx-field-guidance">Field guidance</span></div>
          <button type="button" onClick={() => onSelectView("field")}>View field</button>
        </div>
        <div className="awx-overview-decisions">
          <button className={`awx-overview-decision awx-overview-tone-${spraying.verdictTone}`} type="button" onClick={() => onSelectView("field")}>
            <span>Spraying</span><strong>{spraying.verdict}</strong><small>{sprayDetail}</small>
          </button>
          <button className={`awx-overview-decision awx-overview-tone-${access.tone}`} type="button" onClick={() => onSelectView("field")}>
            <span>Workability</span><strong>{access.label}</strong><small>Surface {access.moist}% · {model.rain.past7} mm in 7d</small>
          </button>
          <button className={`awx-overview-decision awx-overview-tone-${diseaseTone}`} type="button" onClick={() => onSelectView("field")}>
            <span>Disease</span><strong>{diseaseLabel}</strong><small>{diseaseDetail}</small>
          </button>
          <button className="awx-overview-decision awx-overview-tone-cool" type="button" onClick={() => onSelectView("now")}>
            <span>Wind · gust</span><strong>{formatWind(model.now.wind, windUnit)} · {formatWind(model.now.gust, windUnit)} <small>{windLabel}</small></strong><small>{model.now.compass} airflow</small>
          </button>
        </div>
      </section>

      <section className="awx-overview-section awx-overview-hourly" aria-labelledby="awx-next-hours">
        <div className="awx-overview-section-head">
          <div><span id="awx-next-hours">Next six hours</span></div>
          <button type="button" onClick={() => onSelectView("now")}>View hourly</button>
        </div>
        <div className="awx-overview-hours">
          {hourly.map((hour) => (
            <div key={`${hour.dateKey}-${hour.label}`}>
              <span>{hour.label}</span>
              <strong className="awx-tnum">{formatTemperature(hour.temp, unit)}°</strong>
              <small className={(hour.precip ?? 0) > 0 ? "is-wet" : ""}>{(hour.precip ?? 0) > 0 ? `${hour.precip.toFixed(1)} mm` : `${Math.round(hour.prob ?? 0)}%`}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="awx-overview-section awx-overview-days-section" aria-labelledby="awx-next-days">
        <div className="awx-overview-section-head">
          <div><span id="awx-next-days">Next three days</span></div>
          <button type="button" onClick={() => onSelectView("outlook")}>View outlook</button>
        </div>
        <div className="awx-overview-days">
          {nextDays.map((day) => (
            <button key={day.dateKey} type="button" onClick={() => onSelectView("outlook")}>
              <span>{day.weekday}</span>
              <strong className="awx-tnum">{formatTemperature(day.hi, unit)}° <small>{formatTemperature(day.lo, unit)}°</small></strong>
              <small>{(day.rain ?? 0).toFixed(1)} mm · {Math.round(day.prob ?? 0)}%</small>
            </button>
          ))}
        </div>
      </section>
    </section>
  );
}
