"use client";

import { useEffect, useState } from "react";
import { findWorkWindows } from "@/lib/aceweather/work-windows";
import type { AwModel } from "@/lib/aceweather/derive";
import { Card } from "./ui";

function dateLabel(time: string) {
  return `${time.slice(8, 10)}/${time.slice(5, 7)} · ${time.slice(11, 16)}`;
}

export function WorkWindowPlanner({ model }: { model: AwModel }) {
  const [hours, setHours] = useState(4);
  const [rain, setRain] = useState(0.1);
  const [gust, setGust] = useState(20);
  const [clock, setClock] = useState<Date | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const parts = clock ? new Intl.DateTimeFormat("en-GB", { timeZone: model.planning.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(clock) : [];
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  const localNow = clock ? `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}` : null;
  const windows = localNow ? findWorkWindows(model.planning, localNow, { hours, rain, gust }) : [];
  return (
    <Card section="work-windows" kicker="Weather windows" meta="72h · Estimate" detail={
      <p>Earliest complete, non-overlapping windows within your hourly rain and gust limits. Times are local to the selected location. Missing hours are excluded. This weather-only estimate does not assess soil access, crop readiness, spray suitability or rain-fast requirements. Check local conditions and product labels.</p>
    }>
      <div className="awx-planner-controls">
        <label>Time needed<select value={hours} onChange={(event) => setHours(Number(event.target.value))}>
          {[2, 4, 6].map((value) => <option key={value} value={value}>{value} hours</option>)}
        </select></label>
        <label>Rain limit<select value={rain} onChange={(event) => setRain(Number(event.target.value))}>
          {[0, 0.1, 0.5, 1].map((value) => <option key={value} value={value}>{value} mm/h</option>)}
        </select></label>
        <label>Gust limit<select value={gust} onChange={(event) => setGust(Number(event.target.value))}>
          {[15, 20, 25, 30].map((value) => <option key={value} value={value}>{value} km/h</option>)}
        </select></label>
      </div>
      <div className="awx-planner-results" aria-live="polite" aria-atomic="true">
        {windows.length ? windows.map((window) => (
          <div className="awx-planner-window" key={window.start}>
            <strong>{dateLabel(window.start)}–{window.start.slice(0, 10) === window.end.slice(0, 10) ? window.end.slice(11, 16) : dateLabel(window.end)}</strong>
            <span>{hours}h · {window.rain.toFixed(1)} mm · Gust {Math.round(window.gust)} km/h</span>
          </div>
        )) : <span>{localNow ? "No complete window within these limits" : "Checking windows…"}</span>}
      </div>
    </Card>
  );
}
