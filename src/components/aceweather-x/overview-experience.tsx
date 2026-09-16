"use client";
import { useState } from "react";
import { buildModel } from "@/lib/aceweather/derive";
import { formatNextRain, formatTemperature, formatWind, windUnitLabel, type TemperatureUnit, type WindUnit } from "@/lib/aceweather/format";
import { ConditionIcon, NavIcon, ShareIcon } from "./icons";

type Props = { model: ReturnType<typeof buildModel>; unit: TemperatureUnit; windUnit: WindUnit; statusText: string; freshness: string; onShare: () => void; shareLabel: string; onSelectView: (view: string) => void };
function Meter({ value }: { value: number }) {
  return <div className="weather-meter" aria-hidden="true"><div><span>0%</span><span>50%</span><span>100%</span></div><div className="weather-track"><i style={{width: Math.max(0, Math.min(100, value)) + "%"}} /></div></div>;
}
export function OverviewExperience({model, unit, windUnit, statusText, freshness, onShare, shareLabel, onSelectView}: Props) {
  const [metric, setMetric] = useState("prob");
  const hours = model.todayHours.slice(0,8);
  const values = hours.map(h => metric === "prob" ? h.prob : metric === "rain" ? h.precip : Number(formatTemperature(h.temp,unit)));
  const min = metric === "temp" ? Math.min(...values)-3 : 0;
  const max = metric === "prob" ? 100 : Math.max(...values,min+1);
  const points = values.map((v,i) => (50+i*100)+","+(120-(v-min)/(max-min)*100)).join(" ");
  const rain = formatNextRain(model.nextRain,model.rain.sum24,model.rain.peakProb);
  const uv = model.now.uv;
  const cards = [
    {name:"Feels like",value:formatTemperature(model.now.feels,unit)+"°",unit:"",icon:"thermometer",note:"High "+formatTemperature(model.now.hi,unit)+"° · Low "+formatTemperature(model.now.lo,unit)+"°"},
    {name:"Wind",value:formatWind(model.now.wind,windUnit),unit:windUnitLabel(windUnit),icon:"wind",note:model.now.compass+" · Gusts "+formatWind(model.now.gust,windUnit)+" "+windUnitLabel(windUnit)},
    {name:"Rainfall",value:model.rain.sum24,unit:"mm",icon:"rain",note:"Next 24 hours"},
    {name:"UV index",value:Math.round(uv),unit:uv>=11?"Extreme":uv>=8?"Very high":uv>=6?"High":uv>=3?"Moderate":"Low",icon:"now",note:"Peak today "+Math.round(model.sun.uvMax ?? uv)},
    {name:"Humidity", value: Math.round(model.now.rh), unit:"%", icon:"humidity", note:"Relative humidity", meter:model.now.rh},
    {name:"Rain chance",value:Math.round(model.rain.peakProb),unit:"%",icon:"umbrella",note:"Peak · next 24 hours",meter:model.rain.peakProb},
  ];
  return <section className="weather-dashboard" aria-label="Weather overview">
    <header className="weather-intro"><div className="weather-current"><ConditionIcon k={model.now.condition.key}/><strong>{formatTemperature(model.now.temp,unit)}°</strong><div><h2>{model.now.condition.label}</h2><span>{statusText} · {freshness}</span></div></div><button className="weather-share" onClick={onShare} aria-label={shareLabel}><ShareIcon/></button></header>
    <section className="weather-surface weather-hours" aria-labelledby="weather-hours-title">
      <header className="weather-section-head"><h2 id="weather-hours-title">Upcoming hours</h2><div><select aria-label="Hourly chart measurement" value={metric} onChange={e=>setMetric(e.target.value)}><option value="prob">Rain chance</option><option value="rain">Rainfall · mm</option><option value="temp">Temperature · °{unit.toUpperCase()}</option></select><button onClick={()=>onSelectView("outlook")}>Next days ›</button></div></header>
      <div className="weather-hours-scroll" tabIndex={0} role="region" aria-label="Hourly forecast">
        <div style={{minWidth:hours.length*78}}>
          <div className="weather-hour-labels" style={{gridTemplateColumns:"repeat("+hours.length+",1fr)"}}>{hours.map(h=><div key={h.dateKey+h.label}><span>{h.label}</span><ConditionIcon k={h.condition.key}/><strong>{formatTemperature(h.temp,unit)}°</strong></div>)}</div>
          <svg className="weather-area" viewBox={"0 0 "+hours.length*100+" 135"} preserveAspectRatio="none" aria-hidden="true"><polygon points={"50,130 "+points+" "+(50+(hours.length-1)*100)+",130"}/><polyline points={points}/>{hours.map((h,i)=><line key={h.label} x1={50+i*100} x2={50+i*100} y1="0" y2="135"/>)}</svg>
          <div className="weather-hour-values" style={{gridTemplateColumns:"repeat("+hours.length+",1fr)"}}>{values.map((v,i)=><span key={i}><span className="weather-sr">{hours[i].label} {metric==="prob"?"rain chance":metric==="rain"?"rainfall":"temperature"}: </span>{metric==="rain"?v.toFixed(1):Math.round(v)}{metric==="prob"?"%":metric==="rain"?" mm":"°"}</span>)}</div>
          {metric !== "rain" ? <div className="weather-hour-values weather-hour-rain" style={{gridTemplateColumns:"repeat("+hours.length+",1fr)"}}>{hours.map(hour=><span key={hour.dateKey+hour.label}><span className="weather-sr">{hour.label} rainfall: </span>{hour.precip.toFixed(1)} mm</span>)}</div> : null}
        </div>
      </div>
    </section>
    <h2 className="weather-details-title">Today’s weather</h2>
    <div className="weather-detail-grid">{cards.map(card=><article className="weather-surface weather-detail" key={card.name}><header><h3>{card.name}</h3><span className="weather-icon"><NavIcon name={card.icon}/></span></header><strong>{card.value}<small> {card.unit}</small></strong><span className="weather-detail-note">{card.note}</span>{card.meter!==undefined?<Meter value={card.meter}/>:null}</article>)}</div>
    <section className="weather-surface weather-daylight" aria-label="Daylight"><div><span>Sunrise</span><strong>{model.sun.sunrise}</strong></div><div><NavIcon name="now"/><span>{model.sun.daylightLeft==="Night"?"Night-time":model.sun.daylightLeft+" daylight left"}</span></div><div><span>Sunset</span><strong>{model.sun.sunset}</strong></div></section>
    <button className="weather-surface weather-next-rain" onClick={()=>onSelectView("rain")}><NavIcon name="rain"/><span><strong>{rain.headline}</strong><small>{rain.detail}</small></span><span aria-hidden="true">›</span></button>
    <button className="weather-field-link" onClick={()=>onSelectView("field")}>Field conditions <span>Spraying · {model.agronomy.spraying.verdict}</span><span aria-hidden="true">›</span></button>
  </section>;
}
