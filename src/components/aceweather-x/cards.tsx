/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import { useState } from "react";
import { Card, Tags, Meter, Bars, LineTrend, Sky, SoilRows, ConditionIcon, HourlyChart, Verdict, DeltaTBand, RiskStrip, OpsMatrix, SunArc } from "./ui";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const tC = (v, unit) => (v == null ? "—" : String(Math.round(unit === "f" ? v * 9 / 5 + 32 : v)));
const U = (unit) => (unit === "f" ? "°F" : "°C");
const wSpd = (kmh, wu) => (kmh == null ? "—" : String(Math.round(wu === "mph" ? kmh * 0.621371 : kmh)));
const WU = (wu) => (wu === "mph" ? "mph" : "km/h");

export function NowCard({ model, unit, windUnit, view }) {
  const { now, agronomy } = model;
  const summary = `${now.summary}. ${agronomy.spray.label === "Go" ? "Spray window open" : "Spray limited"} — ${agronomy.spray.sub}.`;
  return (
    <Card section="now" currentView={view} tick="sun" kicker="Conditions now"
      meta={`Observed ${now.obsTime} · open-meteo`}
      note={`Dew ${now.dew == null ? "—" : now.dew.toFixed(1)}° · Visibility ${now.vis == null ? "—" : now.vis.toFixed(0)} km`}
      detail={`UV index ${now.uv ?? "—"}, cloud cover ${Math.round(now.cloud ?? 0)}%. Pressure ${Math.round(now.pressure ?? 0)} hPa. Wind from ${now.compass} (${Math.round(now.windDir ?? 0)}°).`}>
      <div className="awx-now">
        <div>
          <div className="awx-now-read"><span className="awx-val awx-tnum">{tC(now.temp, unit)}</span><span className="awx-deg">{U(unit)}</span></div>
          <p className="awx-now-cond">{now.condition.label} · {now.compass} airflow</p>
          <p className="awx-now-sub">Feels <b>{tC(now.feels, unit)}°</b> · High <b>{tC(now.hi, unit)}°</b> · Low <b>{tC(now.lo, unit)}°</b></p>
          <p className="awx-now-summary">{summary}</p>
          <Tags items={model.alerts} />
        </div>
        <Sky condition={now.condition} isDay={now.isDay} label={`${Math.round(now.cloud ?? 0)}% cloud · UV ${Math.round(now.uv ?? 0)}`} />
      </div>
      <div className="awx-metrics">
        <div className="awx-metric"><span className="awx-k">Wind</span><span className="awx-v awx-tnum">{wSpd(now.wind, windUnit)}<small>{WU(windUnit)}</small></span></div>
        <div className="awx-metric"><span className="awx-k">Gust</span><span className={"awx-v awx-tnum" + (now.gust >= 25 ? " awx-v-warn" : "")}>{wSpd(now.gust, windUnit)}<small>{WU(windUnit)}</small></span></div>
        <div className="awx-metric"><span className="awx-k">Rain chance</span><span className="awx-v awx-tnum">{Math.round(now.precipProb ?? 0)}<small>%</small></span></div>
        <div className="awx-metric"><span className="awx-k">Rain</span><span className="awx-v awx-tnum">{(now.precip ?? 0).toFixed(1)}<small>mm</small></span></div>
        <div className="awx-metric"><span className="awx-k">Humidity</span><span className="awx-v awx-tnum">{Math.round(now.rh ?? 0)}<small>%</small></span></div>
        <div className="awx-metric"><span className="awx-k">Pressure</span><span className="awx-v awx-tnum">{Math.round(now.pressure ?? 0)}<small>hPa</small></span></div>
      </div>
    </Card>
  );
}

function HourlyTable({ hours, unit, windUnit }) {
  if (!hours.length) return null;
  const rows = [];
  let prevDate = hours[0].dateKey;
  hours.forEach((h, i) => {
    if (h.dateKey !== prevDate) {
      rows.push(<div className="awx-htable-day" key={"d" + i}>Tomorrow · {h.weekday}</div>);
      prevDate = h.dateKey;
    }
    rows.push(
      <div className="awx-htable-row" key={i}>
        <span className="awx-htt-h">{h.label}</span>
        <span className="awx-tnum">{tC(h.temp, unit)}°</span>
        <span className="awx-tnum awx-htt-feels">{tC(h.feels, unit)}°</span>
        <span className="awx-tnum">{wSpd(h.wind, windUnit)}</span>
        <span className={"awx-tnum" + (h.gust >= 40 ? " awx-v-warn" : "")}>{wSpd(h.gust, windUnit)}</span>
        <span className="awx-tnum">{Math.round(h.prob)}%</span>
        <span className={"awx-tnum" + (h.precip > 0 ? " awx-htt-wet" : "")}>{h.precip > 0 ? h.precip.toFixed(1) : "·"}</span>
      </div>,
    );
  });
  return (
    <div className="awx-htable">
      <div className="awx-htable-head"><span>Hour</span><span>Temp</span><span>Feels</span><span>Wind</span><span>Gust</span><span>Rain</span><span>mm</span></div>
      <div className="awx-htable-scroll">{rows}</div>
    </div>
  );
}

export function TrendCard({ model, unit, windUnit, view }) {
  const hrs = model.todayHours || [];
  const temps = hrs.map((x) => x.temp).filter((v) => v != null);
  const hi = temps.length ? Math.max(...temps) : null;
  const lo = temps.length ? Math.min(...temps) : null;
  const extended = hrs.some((x) => x.dateKey !== model.todayKey);
  const range = extended ? `Next ${hrs.length}h · into tomorrow AM` : `Rest of today · ${hrs.length}h`;
  return (
    <Card section="now" currentView={view} tick="violet" kicker="Today · hour by hour"
      meta={hrs.length ? `${range} · hi ${tC(hi, unit)}° / lo ${tC(lo, unit)}°` : "Temperature · rain · pressure"}
      note={`Feels-like + wind/gust (${WU(windUnit)}) + rain chance & mm`}>
      <div className="awx-chart-card"><LineTrend trend={model.trend} /></div>
      <Tags items={[{ tone: "sun", label: "Temperature" }, { tone: "rain", label: "Rain" }, { tone: "violet", label: "Pressure" }]} />
      <HourlyTable hours={hrs} unit={unit} windUnit={windUnit} />
    </Card>
  );
}

export function SunCard({ model, view }) {
  const s = model.sun;
  return (
    <Card section="now" currentView={view} tick="sun" kicker="Sun & daylight"
      meta={`${s.sunrise} → ${s.sunset} · ${s.dayLength}`}
      note={s.isDay ? `${s.daylightLeft} of daylight left` : "After sunset"}>
      <SunArc elapsed={s.elapsed} sunrise={s.sunrise} sunset={s.sunset} isDay={s.isDay} />
      <div className="awx-season-stats">
        <div><span className="awx-k">Sunrise</span><span className="awx-v awx-tnum">{s.sunrise}</span></div>
        <div><span className="awx-k">Sunset</span><span className="awx-v awx-tnum">{s.sunset}</span></div>
        <div><span className="awx-k">Day length</span><span className="awx-v awx-tnum">{s.dayLength}</span></div>
      </div>
      <div className="awx-rows">
        <div className="awx-row-item"><span className="awx-k">Daylight remaining</span><span className="awx-v">{s.isDay ? s.daylightLeft : "Night"}</span></div>
        <div className="awx-row-item"><span className="awx-k">UV index</span><span className={"awx-v awx-tnum" + ((s.uvMax ?? 0) >= 6 ? " awx-v-warn" : "")}>now {Math.round(s.uvNow ?? 0)} · max {Math.round(s.uvMax ?? 0)}</span></div>
      </div>
    </Card>
  );
}

export function RainCard({ model, view }) {
  const [range, setRange] = useState("24h");
  const r = model.rain.ranges[range];
  return (
    <Card section="rain" currentView={view} tick="rain" kicker="Rainfall"
      meta={<><b>{model.rain.sum24} mm</b> next 24h · peak chance {model.rain.peakProb}%</>}
      note={`Past 7 days observed ${model.rain.past7} mm`}
      detail={`Next 7 days total ${model.rain.next7} mm. Hourly accumulation is Open-Meteo's best estimate — compare against a local gauge before committing machinery.`}>
      <div className="awx-chart-card">
        <div className="awx-chart-head">
          <span className="awx-cap">{r.cap} · {r.total} mm</span>
          <div className="awx-range" role="group" aria-label="Rain range">
            {["24h", "7d", "14d"].map((k) => (
              <button key={k} type="button" aria-pressed={range === k} onClick={() => setRange(k)}>{k}</button>
            ))}
          </div>
        </div>
        <Bars bars={r.bars} />
      </div>
    </Card>
  );
}

function HourlyDetail({ day, unit, windUnit }) {
  const hrs = day?.hours;
  if (!hrs || !hrs.labels.length) return null;
  return (
    <div className="awx-hourly">
      <div className="awx-hourly-head">
        <strong>{day.weekday} {day.dayNum} · hour by hour</strong>
        <span>High {tC(hrs.tMax, unit)}° · Low {tC(hrs.tMin, unit)}° · {hrs.rainSum} mm · wind to {wSpd(hrs.windMax, windUnit)} {WU(windUnit)}</span>
      </div>
      <HourlyChart temp={hrs.temp} rain={hrs.rain} wind={hrs.wind} labels={hrs.labels} />
      <div className="awx-hours-cap">Hour · temp · rain (mm) · wind ({WU(windUnit)})</div>
      <div className="awx-hours">
        {hrs.labels.map((l, i) => (
          <div className="awx-hour" key={i}>
            <span className="awx-h-h">{l}</span>
            <b className="awx-h-t awx-tnum">{tC(hrs.temp[i], unit)}°</b>
            <span className={"awx-h-r awx-tnum" + ((hrs.rain[i] || 0) > 0 ? " wet" : "")}>{(hrs.rain[i] || 0) > 0 ? hrs.rain[i].toFixed(1) : "·"}</span>
            <span className="awx-h-w awx-tnum">{wSpd(hrs.wind[i], windUnit)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarCard({ model, unit, windUnit, view }) {
  const [sel, setSel] = useState(0);
  const day = model.calendar[sel] || model.calendar[0];
  const leading = Array.from({ length: model.calendarOffset });
  return (
    <Card section="outlook" currentView={view} tick="cool" kicker="14-day outlook"
      meta={day ? `${day.weekday} ${day.dayNum}: ${tC(day.hi, unit)}° / ${tC(day.lo, unit)}° · ${day.rain == null ? "—" : day.rain.toFixed(1)} mm` : "—"}
      note="Tap any day for its hour-by-hour detail">
      <div className="awx-cal">
        {DOW.map((dn) => <div key={dn} className="awx-cal-dow">{dn}</div>)}
        {leading.map((_, i) => <div key={"e" + i} className="awx-cal-day is-empty" />)}
        {model.calendar.map((c, i) => (
          <button key={c.dateKey} type="button"
            className={"awx-cal-day" + (c.isToday ? " is-today" : "") + (sel === i ? " is-sel" : "")}
            aria-pressed={sel === i} onClick={() => setSel(i)}>
            <div className="awx-date"><b>{c.dayNum}</b><ConditionIcon className="awx-cal-icon" k={c.condition.key} /></div>
            <div className="awx-cal-temps awx-tnum">{tC(c.hi, unit)}° <span className="awx-lo">{tC(c.lo, unit)}°</span></div>
            <div className="awx-cal-rainbar"><i style={{ width: c.rainPct + "%" }} /></div>
            <div className={"awx-cal-rain awx-tnum" + ((c.rain ?? 0) < 0.1 ? " is-dry" : "")}>{(c.rain ?? 0) < 0.1 ? "—" : c.rain.toFixed(1)}</div>
          </button>
        ))}
      </div>
      <HourlyDetail day={day} unit={unit} windUnit={windUnit} />
    </Card>
  );
}

function Decision({ title, sub, score, tone, label }) {
  return (
    <div className="awx-decision">
      <div><div className="awx-d-title">{title}</div><div className="awx-d-sub">{sub}</div></div>
      <Meter value={score} tone={tone} label={`${score} · ${label}`} />
    </div>
  );
}

export function SprayCard({ model, windUnit, view }) {
  const s = model.agronomy.spraying;
  const dry = model.agronomy.drying;
  const invTone = s.inversion.risk === "Low" ? "go" : s.inversion.risk === "High" ? "risk" : "warn";
  return (
    <Card section="field" currentView={view} tick="go" kicker="Spraying"
      meta="Delta-T · drift · drying — heuristic"
      note={s.nextWindow ? `Next window ${s.nextWindow.start}–${s.nextWindow.end}${s.nextWindow.today ? " today" : ""}` : "No clear window in 48h"}
      detail="Delta-T is the wet-bulb depression (dry-bulb − wet-bulb). 2–8 °C is the ideal spraying band: below it drift rises and droplets dry slowly; above ~10 they evaporate before reaching target. Inversions (calm, clear nights) trap spray near the ground — avoid. Drying uses FAO ET₀. Heuristic guidance — always follow the product label.">
      <Verdict label={s.verdict} tone={s.verdictTone} reason={s.verdictReason} />
      <DeltaTBand value={s.deltaT} label={s.deltaTLabel} tone={s.deltaTTone} />
      <div className="awx-rows">
        <div className="awx-row-item"><span className="awx-k">Wind · gust</span><span className="awx-v awx-tnum">{wSpd(s.windNow, windUnit)} · {wSpd(s.gustNow, windUnit)} {WU(windUnit)}</span></div>
        <div className="awx-row-item"><span className="awx-k">Next spray window</span><span className="awx-v">{s.nextWindow ? `${s.nextWindow.start}–${s.nextWindow.end} (${s.nextWindow.hours}h)` : "—"}</span></div>
        <div className="awx-row-item"><span className="awx-k">Rain-fast</span><span className="awx-v">{s.rainFast == null ? "Dry 48h+" : s.rainFast === 0 ? "Raining now" : `${s.rainFast}h until rain`}</span></div>
        <div className="awx-row-item"><span className="awx-k">Inversion risk</span><span className={"awx-v awx-v-" + invTone}>{s.inversion.risk}{s.inversion.window ? ` · ${s.inversion.window}` : ""}</span></div>
        <div className="awx-row-item"><span className="awx-k">Drying today</span><span className={"awx-v awx-v-" + (dry.today ? dry.today.tone : "muted")}>{dry.today ? `${dry.today.label} · ${dry.today.et} mm ET₀` : "—"}</span></div>
      </div>
      <Tags items={[dry.best ? { tone: "go", label: `Best drying ${dry.best.weekday}` } : { tone: "warn", label: "No strong drying day in 6d" }]} />
    </Card>
  );
}

export function DiseaseCard({ model, view }) {
  const b = model.agronomy.blight;
  const ds = model.agronomy.disease;
  return (
    <Card section="field" currentView={view} tick="risk" kicker="Disease pressure"
      meta="Late blight (Hutton) · Septoria · leaf wetness"
      note={b.nextPeriod ? `Next Hutton period ${b.nextPeriod}` : "No Hutton period in range"}
      detail="Hutton Criteria (UK national late-blight standard, James Hutton Institute, 2017): a risk day needs minimum temperature ≥10 °C and ≥6 h of RH ≥90 %; two consecutive risk days flag a blight period. Septoria is driven by rain-splash and leaf-wetness duration. Heuristic models — validate against local pathology services.">
      <Verdict label={`Late blight: ${b.status}`} tone={b.tone} reason={b.nextPeriod ? `Next period ${b.nextPeriod}` : "No period forecast in range"} />
      <div>
        <div className="awx-hours-cap">Hutton risk · next days (hours RH ≥ 90%)</div>
        <RiskStrip days={b.days} />
      </div>
      <div className="awx-decisions">
        <div className="awx-decision">
          <div><div className="awx-d-title">Leaf-wetness pressure</div><div className="awx-d-sub">{ds.lwd24}h wet next 24h</div></div>
          <Meter value={ds.pressure} tone={ds.pressureTone} label={`${ds.pressure} · ${ds.pressureLabel}`} />
        </div>
      </div>
      <div className="awx-rows">
        <div className="awx-row-item"><span className="awx-k">Septoria (rain-splash)</span><span className={"awx-v awx-v-" + ds.septoriaTone}>{ds.septoriaLabel}</span></div>
        <div className="awx-row-item"><span className="awx-k">Driver</span><span className="awx-v">{ds.septoriaDriver}</span></div>
      </div>
    </Card>
  );
}

export function SoilWaterCard({ model, view }) {
  const sw = model.agronomy.soilWater;
  const dr = model.agronomy.drilling;
  const access = model.agronomy.access;
  return (
    <Card section="field" currentView={view} tick="cool" kicker="Soil & water"
      meta="Water balance · workability · drilling"
      note={`Topsoil ${sw.surfMoist}% · ${sw.workLabel} going`}
      detail={<div className="awx-detail-grid"><SoilRows soil={model.soil} /><div>Soil-moisture deficit is a 7-day rolling water balance (ET₀ − rainfall) — a guide to irrigation and trafficability, not a soil-calibrated figure. Drilling thresholds are seedbed (6 cm) soil-temperature guides.</div></div>}>
      <div className="awx-season-stats">
        <div><span className="awx-k">Deficit now</span><span className="awx-v awx-tnum">{sw.smd}<small> mm</small></span></div>
        <div><span className="awx-k">In 7 days</span><span className="awx-v awx-tnum">{sw.smd7}<small> mm</small></span></div>
        <div><span className="awx-k">Trend</span><span className="awx-v">{sw.trend}</span></div>
      </div>
      <div className="awx-decisions">
        <Decision title="Field workability" sub={access.sub} score={access.score} tone={access.tone} label={access.label} />
      </div>
      <div className="awx-rows">
        <div className="awx-row-item"><span className="awx-k">Irrigation need</span><span className={"awx-v awx-v-" + sw.irrigTone}>{sw.irrigation}</span></div>
        <div className="awx-row-item"><span className="awx-k">Seedbed temp · 6 cm</span><span className="awx-v awx-tnum">{dr.soil6 ?? "—"}° · {dr.trend}</span></div>
        {dr.crops.map((c, i) => (
          <div className="awx-row-item" key={i}><span className="awx-k">{c.crop} <small style={{ color: "var(--awx-faint)" }}>≥{c.th}°</small></span><span className={"awx-v awx-v-" + (c.ok ? "go" : "warn")}>{c.ok ? "Drill OK" : "Wait"}</span></div>
        ))}
      </div>
    </Card>
  );
}

export function SeasonCard({ model, view }) {
  const g = model.agronomy.gdd;
  const fo = model.agronomy.frostOutlook;
  const ops = model.agronomy.ops;
  const maxG = Math.max(1, ...g.strip.map((s) => s.g));
  const gbars = g.strip.map((s) => ({ h: Math.max(3, (s.g / maxG) * 100), label: s.day, dry: false, now: false }));
  return (
    <Card section="field" currentView={view} tick="sun" kicker="Season & operations"
      meta={`GDD base ${g.base}°C · frost · field ops`}
      note={`${g.next14} GDD next 14 days`}
      detail="Growing degree days accumulate heat above the base temperature (°C·day) and track crop development pace. Frost uses a radiative grass-minimum estimate. The operations grid blends the spray, soil-moisture and drying models — heuristic planning support.">
      <div className="awx-season-stats">
        <div><span className="awx-k">GDD today</span><span className="awx-v awx-tnum">{g.today}</span></div>
        <div><span className="awx-k">Last 7 days</span><span className="awx-v awx-tnum">{g.last7}</span></div>
        <div><span className="awx-k">Next 14 days</span><span className="awx-v awx-tnum">{g.next14}</span></div>
      </div>
      <div className="awx-chart-card"><Bars bars={gbars} /></div>
      <div>
        <div className="awx-hours-cap">Frost outlook · grass minimum (next nights)</div>
        <RiskStrip days={fo} />
      </div>
      <div>
        <div className="awx-hours-cap">Field operations · next {ops.days.length} days</div>
        <OpsMatrix days={ops.days} rows={ops.rows} />
        <Tags items={[{ tone: "go", label: "Go" }, { tone: "warn", label: "Caution" }, { tone: "risk", label: "Avoid" }]} />
      </div>
    </Card>
  );
}

export function SeasonalCard({ seasonal, view }) {
  const loading = !seasonal;
  const years = seasonal?.years ?? [];
  const yMax = Math.max(1, ...years.map((y) => y.rain));
  const bars = years.map((y) => ({ h: Math.max(2, (y.rain / yMax) * 100), label: String(y.y).slice(2), now: y.partial, dry: false }));
  return (
    <Card section="seasonal" currentView={view} tick="violet" kicker="Seasonal context"
      meta={seasonal ? `${seasonal.monthLabel} · vs prior years (Open-Meteo archive)` : "Climate archive"}
      detail={seasonal ? `Full-month normal ≈ ${seasonal.fullMonthNormal ?? "—"} mm (prior-year mean). Month-to-date is compared against the same-day-of-month average so early-month readings stay fair. Bars show ${seasonal.monthLabel} rainfall per year; the highlighted bar is this year so far.` : "Loading the multi-year archive…"}>
      {loading ? (
        <div className="awx-radar-status">Loading climate context…</div>
      ) : (
        <>
          <div className="awx-season-stats">
            <div><span className="awx-k">Rain so far</span><span className="awx-v awx-tnum">{seasonal.mtdRain}<small> mm</small></span></div>
            <div><span className="awx-k">vs normal</span><span className={"awx-v awx-tnum " + ((seasonal.pctOfNormal ?? 100) >= 100 ? "cool" : "warm")}>{seasonal.pctOfNormal == null ? "—" : seasonal.pctOfNormal + "%"}</span></div>
            <div><span className="awx-k">Temp anomaly</span><span className={"awx-v awx-tnum " + ((seasonal.tempAnomaly ?? 0) >= 0 ? "warm" : "cool")}>{seasonal.tempAnomaly == null ? "—" : (seasonal.tempAnomaly >= 0 ? "+" : "") + seasonal.tempAnomaly + "°"}</span></div>
          </div>
          <div className="awx-chart-card"><Bars bars={bars} /></div>
        </>
      )}
    </Card>
  );
}

export function SourcesCard({ source, freshness, view }) {
  return (
    <Card section="about" currentView={view} tick="go" kicker="Data sources"
      meta="What powers this view">
      <div className="awx-rows">
        <div className="awx-row-item"><span className="awx-k">Forecast · current, hourly, daily, soil</span><span className="awx-v awx-v-go">Open-Meteo</span></div>
        <div className="awx-row-item"><span className="awx-k">Rainfall radar</span><span className="awx-v awx-v-go">RainViewer</span></div>
        <div className="awx-row-item"><span className="awx-k">Seasonal normals</span><span className="awx-v awx-v-go">Open-Meteo archive</span></div>
        <div className="awx-row-item"><span className="awx-k">Status</span><span className={"awx-v " + (source === "live" ? "awx-v-go" : "awx-v-warn")}>{source === "live" ? "Live" : source === "loading" ? "Fetching" : "Offline"} · {freshness}</span></div>
      </div>
    </Card>
  );
}
