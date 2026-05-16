// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";

function pad2(n: number) { return String(n).padStart(2, "0"); }

function defaultMonthDay(): { month: number; day: number } {
  const d = new Date();
  return { month: d.getMonth() + 1, day: d.getDate() };
}

export function OnThisDay({ location }) {
  const initial = useMemo(defaultMonthDay, []);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);
  const [years, setYears] = useState(40);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("idle");

  const hasLocation = location && typeof location.lat === "number" && typeof location.lon === "number";

  useEffect(() => {
    if (!hasLocation) return;
    let cancelled = false;
    const params = new URLSearchParams({
      lat: String(location.lat),
      lon: String(location.lon),
      month: String(month),
      day: String(day),
      years: String(years),
    });
    if (location.tz) params.set("timezone", location.tz);
    setStatus("loading");
    fetch(`/api/onthisday?${params}`, { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((json) => { if (!cancelled) { setData(json); setStatus("ready"); } })
      .catch(() => { if (!cancelled) setStatus("error"); });
    return () => { cancelled = true; };
  }, [hasLocation, location?.lat, location?.lon, location?.tz, month, day, years]);

  if (!hasLocation) {
    return (
      <div className="aw2-otd placeholder">
        <div className="aw2-otd-status">Locate to view historical climatology.</div>
      </div>
    );
  }

  const observations = (data?.years ?? []).filter((y) => y.tmax != null);
  const tmaxes = observations.map((y) => y.tmax);
  const tmin = tmaxes.length ? Math.min(...tmaxes) - 1 : 0;
  const tmax = tmaxes.length ? Math.max(...tmaxes) + 1 : 10;
  const range = tmax - tmin || 1;

  const W = 480, H = 120, padL = 28, padR = 8, padT = 8, padB = 18;
  const inner = W - padL - padR;
  const span = (data?.target?.year_range?.[1] ?? 0) - (data?.target?.year_range?.[0] ?? 0) || 1;
  const xFor = (year: number) => padL + ((year - (data?.target?.year_range?.[0] ?? 0)) / span) * inner;
  const yFor = (t: number) => padT + (H - padT - padB) * (1 - (t - tmin) / range);
  const meanT = data?.summary?.tmax_mean;
  const meanY = meanT != null ? yFor(meanT) : null;

  const summary = data?.summary ?? {};
  const records: { k: string; v: string }[] = [];
  if (summary.hottest) records.push({ k: "Hottest", v: `${summary.hottest.year} · ${summary.hottest.value.toFixed(1)}°` });
  if (summary.coldest) records.push({ k: "Coldest", v: `${summary.coldest.year} · ${summary.coldest.value.toFixed(1)}°` });
  if (summary.wettest) records.push({ k: "Wettest", v: `${summary.wettest.year} · ${summary.wettest.value.toFixed(1)} mm` });
  if (summary.windiest) records.push({ k: "Windiest", v: `${summary.windiest.year} · ${Math.round(summary.windiest.value)} km/h` });

  return (
    <div className="aw2-otd">
      <div className="aw2-otd-controls">
        <label>
          <span>Date</span>
          <input
            type="date"
            value={`2024-${pad2(month)}-${pad2(day)}`}
            onChange={(event) => {
              const v = event.target.value;
              const parts = v.split("-");
              if (parts.length === 3) {
                setMonth(Number(parts[1]));
                setDay(Number(parts[2]));
              }
            }}
          />
        </label>
        <label>
          <span>Years</span>
          <select value={years} onChange={(event) => setYears(Number(event.target.value))}>
            <option value={20}>20</option>
            <option value={40}>40</option>
            <option value={60}>60</option>
            <option value={80}>80</option>
          </select>
        </label>
        <span className={"aw2-otd-pill " + status}>{status === "loading" ? "Loading…" : status === "error" ? "Unavailable" : `${observations.length} years`}</span>
      </div>

      {observations.length ? (
        <svg className="aw2-otd-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <rect x={padL} y={padT} width={W - padL - padR} height={H - padT - padB} fill="none" stroke="var(--rule)" strokeWidth="0.5"/>
          {meanY != null ? (
            <>
              <line x1={padL} x2={W - padR} y1={meanY} y2={meanY} stroke="var(--ink)" strokeWidth="0.5" strokeDasharray="3 3"/>
              <text x={W - padR - 4} y={meanY - 3} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ink)" }}>{meanT.toFixed(1)}° mean</text>
            </>
          ) : null}
          {observations.map((y) => {
            const x = xFor(y.year);
            const yy = yFor(y.tmax);
            const tone = meanT != null && y.tmax > meanT ? "var(--rust)" : "var(--teal)";
            return (
              <g key={y.year}>
                <rect x={x - 2} y={yy} width={4} height={H - padB - yy} fill={tone} opacity={0.85}/>
                <title>{`${y.year}: max ${y.tmax.toFixed(1)}°${y.rain_mm != null ? `, rain ${y.rain_mm.toFixed(1)} mm` : ""}`}</title>
              </g>
            );
          })}
          <text x={padL - 4} y={padT + 8} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{Math.round(tmax)}°</text>
          <text x={padL - 4} y={H - padB} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{Math.round(tmin)}°</text>
          <text x={padL} y={H - 3} style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{data?.target?.year_range?.[0]}</text>
          <text x={W - padR} y={H - 3} textAnchor="end" style={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--muted)" }}>{data?.target?.year_range?.[1]}</text>
        </svg>
      ) : status === "loading" ? (
        <div className="aw2-otd-status">Fetching {years} years of archive…</div>
      ) : (
        <div className="aw2-otd-status">No archive data for this date.</div>
      )}

      {records.length ? (
        <div className="aw2-otd-records">
          {records.map((r) => (
            <div key={r.k} className="aw2-otd-record">
              <div className="k">{r.k}</div>
              <div className="v">{r.v}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
