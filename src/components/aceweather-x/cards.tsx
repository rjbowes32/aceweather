"use client";

import { useEffect, useRef, useState } from "react";
import type { AwModel } from "@/lib/aceweather/derive";
import type { SeasonalContext } from "@/lib/aceweather/open-meteo";
import { formatTemperature, formatWind, windUnitLabel, type TemperatureUnit, type WindUnit } from "@/lib/aceweather/format";
import { Card, Tags, Meter, Bars, SoilRows, ConditionIcon, HourlyChart, Verdict, DeltaTBand, RiskStrip, OpsMatrix } from "./ui";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const tC = formatTemperature;
const wSpd = formatWind;
const WU = windUnitLabel;

type CalendarDay = AwModel["calendar"][number];

function HourlyDetail({ day, unit, windUnit }: { day?: CalendarDay; unit: TemperatureUnit; windUnit: WindUnit }) {
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
        {hrs.labels.map((l: string, i: number) => (
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

function outlookRainNumber(v: number | null | undefined) {
  if (v == null) return "—";
  return (v || 0) < 0.1 ? "0" : v.toFixed(1);
}

function outlookRainText(v: number | null | undefined) {
  if (v == null) return "—";
  return `${outlookRainNumber(v)} mm`;
}

function outlookChanceText(v: number | null | undefined) {
  return v == null ? "—" : `${Math.round(v)}%`;
}

function outlookWind(day: CalendarDay | undefined, windUnit: WindUnit) {
  const wind = day?.hours?.windMax;
  return wind == null ? "—" : wSpd(wind, windUnit);
}

function outlookWindText(day: CalendarDay | undefined, windUnit: WindUnit) {
  const wind = day?.hours?.windMax;
  return wind == null ? "—" : `${wSpd(wind, windUnit)} ${WU(windUnit)}`;
}

function outlookTone(day: CalendarDay | undefined) {
  const rain = day?.rain ?? 0;
  const chance = day?.prob ?? 0;
  const wind = day?.hours?.windMax ?? 0;
  if (rain >= 5 || chance >= 70) return " is-wet";
  if (wind >= 30) return " is-breezy";
  return "";
}

export function CalendarCard({ model, unit, windUnit }: { model: AwModel; unit: TemperatureUnit; windUnit: WindUnit }) {
  const [sel, setSel] = useState(0);
  const selectedDayRef = useRef<HTMLButtonElement | null>(null);
  const day = model.calendar[sel] || model.calendar[0];
  const leading = Array.from({ length: model.calendarOffset });
  const trailing = Array.from({ length: (7 - ((leading.length + model.calendar.length) % 7)) % 7 });

  useEffect(() => {
    selectedDayRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [sel]);

  return (
    <Card section="outlook" tick="cool" kicker="14-day outlook">
      {day && (
        <div className={"awx-outlook-lead" + outlookTone(day)}>
          <div className="awx-outlook-lead-main">
            <ConditionIcon className="awx-outlook-icon" k={day.condition.key} />
            <div>
              <span>{day.weekday} {day.dayNum}</span>
              <strong>{day.condition.label}</strong>
            </div>
          </div>
          <div className="awx-outlook-stat">
            <span>High / low</span>
            <b className="awx-tnum">{tC(day.hi, unit)}° / {tC(day.lo, unit)}°</b>
          </div>
          <div className="awx-outlook-stat">
            <span>Rain</span>
            <b className="awx-tnum">{outlookRainText(day.rain)} <small>{outlookChanceText(day.prob)}</small></b>
          </div>
          <div className="awx-outlook-stat">
            <span>Wind</span>
            <b className="awx-tnum">{outlookWind(day, windUnit)} <small>{day?.hours?.windMax == null ? "" : WU(windUnit)}</small></b>
          </div>
        </div>
      )}
      <div className="awx-cal">
        {DOW.map((dn) => <div key={dn} className="awx-cal-dow">{dn}</div>)}
        {leading.map((_, i) => <div key={"e" + i} className="awx-cal-day is-empty" />)}
        {model.calendar.map((c, i) => {
          const dry = (c.rain ?? 0) < 0.1;
          const wind = c.hours?.windMax;
          return (
            <button key={c.dateKey} type="button"
              ref={sel === i ? selectedDayRef : null}
              className={"awx-cal-day" + (c.isToday ? " is-today" : "") + (sel === i ? " is-sel" : "") + outlookTone(c)}
              aria-pressed={sel === i}
              aria-label={`${c.weekday} ${c.dayNum}: high ${tC(c.hi, unit)}°, low ${tC(c.lo, unit)}°, rain ${outlookRainText(c.rain)}, chance ${outlookChanceText(c.prob)}, wind ${outlookWindText(c, windUnit)}`}
              onClick={() => setSel(i)}>
              <div className="awx-date"><b>{c.dayNum}</b><ConditionIcon className="awx-cal-icon" k={c.condition.key} /></div>
              <div className="awx-cal-temps awx-tnum"><span className="awx-cal-hi">{tC(c.hi, unit)}°</span><span className="awx-lo">{tC(c.lo, unit)}°</span></div>
              <div className="awx-cal-rainbar" aria-hidden="true"><i style={{ width: c.rainPct + "%" }} /></div>
              <div className="awx-cal-meta">
                <span className={"awx-cal-mini awx-cal-rain" + (dry ? " is-dry" : "")} title="Rainfall"><b>{outlookRainNumber(c.rain)}</b><small>mm</small></span>
                <span className="awx-cal-mini" title="Rain chance"><b>{outlookChanceText(c.prob)}</b><small>rain</small></span>
                <span className="awx-cal-mini awx-cal-wind" title="Max wind"><b>{wind == null ? "—" : wSpd(wind, windUnit)}</b><small>{wind == null ? "" : WU(windUnit)}</small></span>
              </div>
            </button>
          );
        })}
        {trailing.map((_, i) => <div key={"t" + i} className="awx-cal-day is-empty" />)}
      </div>
      <HourlyDetail day={day} unit={unit} windUnit={windUnit} />
    </Card>
  );
}

function Decision({ title, sub, score, tone, label }: { title: string; sub: string; score: number; tone: string; label: string }) {
  return (
    <div className="awx-decision">
      <div><div className="awx-d-title">{title}</div><div className="awx-d-sub">{sub}</div></div>
      <Meter value={score} tone={tone} label={`${score} · ${label}`} />
    </div>
  );
}

export function SprayCard({ model, windUnit }: { model: AwModel; windUnit: WindUnit }) {
  const s = model.agronomy.spraying;
  const dry = model.agronomy.drying;
  const invTone = s.inversion.risk === "Low" ? "go" : s.inversion.risk === "High" ? "risk" : "warn";
  return (
    <Card section="field" tick="go" kicker="Spraying"
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

export function DiseaseCard({ model }: { model: AwModel }) {
  const b = model.agronomy.blight;
  const ds = model.agronomy.disease;
  return (
    <Card section="field" tick="risk" kicker="Disease pressure"
      detail="Hutton Criteria (UK national late-blight standard, James Hutton Institute, 2017): a risk day needs minimum temperature ≥10 °C and ≥6 h of RH ≥90 %; two consecutive risk days flag a blight period. Septoria is driven by rain-splash and leaf-wetness duration. Heuristic models — validate against local pathology services.">
      <Verdict label={`Late blight: ${b.status}`} tone={b.tone} reason={b.nextPeriod ? `Next period ${b.nextPeriod}` : "No period forecast in range"} />
      <div>
        <div className="awx-hours-cap">Hutton risk · next days</div>
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

export function SoilWaterCard({ model }: { model: AwModel }) {
  const sw = model.agronomy.soilWater;
  const dr = model.agronomy.drilling;
  const access = model.agronomy.access;
  return (
    <Card section="field" tick="cool" kicker="Soil & water"
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

export function SeasonCard({ model }: { model: AwModel }) {
  const g = model.agronomy.gdd;
  const fo = model.agronomy.frostOutlook;
  const ops = model.agronomy.ops;
  const maxG = Math.max(1, ...g.strip.map((s) => s.g));
  const gbars = g.strip.map((s) => ({ h: Math.max(3, (s.g / maxG) * 100), label: s.day, value: s.g, unit: "GDD", dry: false, now: false }));
  return (
    <Card section="field" tick="sun" kicker="Season & operations"
      detail="Growing degree days accumulate heat above the base temperature (°C·day) and track crop development pace. Frost uses a radiative grass-minimum estimate. The operations grid blends the spray, soil-moisture and drying models — heuristic planning support.">
      <div className="awx-season-stats">
        <div><span className="awx-k">GDD today</span><span className="awx-v awx-tnum">{g.today}</span></div>
        <div><span className="awx-k">Last 7 days</span><span className="awx-v awx-tnum">{g.last7}</span></div>
        <div><span className="awx-k">Next 14 days</span><span className="awx-v awx-tnum">{g.next14}</span></div>
      </div>
      <div className="awx-chart-card"><Bars bars={gbars} label="Growing degree days" /></div>
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

export function SeasonalCard({ seasonal }: { seasonal: SeasonalContext | null }) {
  const loading = !seasonal;
  const years = seasonal?.years ?? [];
  const yMax = Math.max(1, ...years.map((y) => y.rain));
  const bars = years.map((y) => ({ h: Math.max(2, (y.rain / yMax) * 100), label: String(y.y).slice(2), value: y.rain, unit: "mm", now: y.partial, dry: false }));
  return (
    <Card section="seasonal" tick="violet" kicker="Seasonal context"
      meta={seasonal ? seasonal.monthLabel : null}
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
          <div className="awx-chart-card"><Bars bars={bars} label={`${seasonal.monthLabel} rainfall by year`} /></div>
        </>
      )}
    </Card>
  );
}

export function SourcesCard({ source, freshness }: { source: string; freshness: string }) {
  if (source === "refreshing") source = "loading";
  return (
    <Card section="about" tick="go" kicker="Data sources">
      <div className="awx-rows">
        <div className="awx-row-item"><span className="awx-k">Forecast · current, hourly, daily, soil</span><span className="awx-v awx-v-go">Open-Meteo</span></div>
        <div className="awx-row-item"><span className="awx-k">Rainfall radar</span><span className="awx-v awx-v-go">Met Office open data</span></div>
        <div className="awx-row-item"><span className="awx-k">Seasonal normals</span><span className="awx-v awx-v-go">Open-Meteo archive</span></div>
        <div className="awx-row-item"><span className="awx-k">Status</span><span className={"awx-v " + (source === "live" ? "awx-v-go" : "awx-v-warn")}>{source === "live" ? "Live" : source === "loading" ? "Fetching" : "Offline"} · {freshness}</span></div>
      </div>
    </Card>
  );
}
