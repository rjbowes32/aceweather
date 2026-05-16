// @ts-nocheck
"use client";

import { useEffect, useState } from "react";

import {
  getCachedPayload as awGetCachedPayload,
  locationId as awLocationId,
  setCachedPayload as awSetCachedPayload,
} from "@/lib/store";

import { dirToCompass, fmt0 } from "./helpers";
import { awFetchLive } from "./open-meteo";

const FRESH_MS = 30 * 60 * 1000;

function summarise(payload) {
  if (!payload) return null;
  const cur = payload.current || {};
  const daily = payload.daily || {};
  const idx = Array.isArray(daily.time)
    ? Math.max(0, daily.time.findIndex((t) => typeof t === "string" && t.slice(0, 10) === new Date().toISOString().slice(0, 10)))
    : 0;
  return {
    temp: cur.temperature_2m,
    hi: daily.temperature_2m_max?.[idx],
    lo: daily.temperature_2m_min?.[idx],
    rain: daily.precipitation_sum?.[idx],
    pct: daily.precipitation_probability_max?.[idx],
    wind: cur.wind_speed_10m,
    wdir: cur.wind_direction_10m,
  };
}

function SavedLocationCard({ location, onPick, onRemove }) {
  const [summary, setSummary] = useState(null);
  const [state, setState] = useState("idle");

  useEffect(() => {
    let cancelled = false;
    const id = awLocationId(location.lat, location.lon);
    (async () => {
      const cached = await awGetCachedPayload(id, "openmeteo");
      if (cached && cached.payload) {
        if (!cancelled) {
          setSummary(summarise(cached.payload));
          setState("ready");
        }
        if (Date.now() - cached.fetchedAt < FRESH_MS) return;
      } else if (!cancelled) {
        setState("loading");
      }
      try {
        const live = await awFetchLive(location.lat, location.lon, undefined, location.tz);
        if (cancelled) return;
        setSummary(summarise(live));
        setState("ready");
        awSetCachedPayload(id, "openmeteo", live).catch(() => {});
      } catch {
        if (!cancelled && state !== "ready") setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [location.lat, location.lon, location.tz]);

  return (
    <div className="aw2-m-saved-card">
      <button type="button" className="aw2-m-saved-card-main" onClick={() => onPick(location)}>
        <div className="head">
          <div className="name">{location.name}</div>
          <div className="region">{[location.region, location.country].filter(Boolean).join(", ")}</div>
        </div>
        {summary ? (
          <div className="summary">
            <div className="temp">{fmt0(summary.temp)}<small>°C</small></div>
            <div className="metric">
              <div className="k">Hi / Lo</div>
              <div className="v">{Math.round(summary.hi ?? 0)}° / <span className="lo">{Math.round(summary.lo ?? 0)}°</span></div>
            </div>
            <div className="metric">
              <div className="k">Rain</div>
              <div className={"v" + ((summary.rain ?? 0) < 0.1 ? " dry" : "")}>
                {(summary.rain ?? 0) < 0.1 ? "—" : `${summary.rain.toFixed(1)}mm`}
                <small> · {Math.round(summary.pct ?? 0)}%</small>
              </div>
            </div>
            <div className="metric">
              <div className="k">Wind</div>
              <div className="v">{fmt0(summary.wind)}<small> km/h {dirToCompass(summary.wdir)}</small></div>
            </div>
          </div>
        ) : (
          <div className="summary placeholder">
            {state === "error" ? "Summary unavailable" : "Loading summary…"}
          </div>
        )}
      </button>
      <button
        type="button"
        className="aw2-m-saved-card-remove"
        aria-label={`Remove ${location.name}`}
        onClick={() => onRemove(location)}
      >×</button>
    </div>
  );
}

export function MobileLocationLists({ suggestions, savedLocations, onPick, onRemove }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {suggestions.length ? (
        <div className="aw2-m-location-suggestions">
          {suggestions.map((location) => (
            <button key={`${location.lat}-${location.lon}`} type="button" onClick={() => onPick(location)}>
              <span>{location.name}</span>
              <small>{[location.region, location.country].filter(Boolean).join(", ")}</small>
            </button>
          ))}
        </div>
      ) : null}
      {savedLocations.length ? (
        <div className="aw2-m-saved-wrap">
          <button
            type="button"
            className="aw2-m-saved-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <span>Saved · {savedLocations.length}</span>
            <span className="chev">{open ? "▴" : "▾"}</span>
          </button>
          {open ? (
            <div className="aw2-m-saved-cards" aria-label="Saved locations">
              {savedLocations.map((location) => (
                <SavedLocationCard
                  key={`${location.lat}-${location.lon}`}
                  location={location}
                  onPick={onPick}
                  onRemove={onRemove}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
