// @ts-nocheck
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { buildModel } from "@/lib/aceweather/derive";
import { DEFAULT_LOCATION, fetchForecast, fetchSeasonal, searchLocations } from "@/lib/aceweather/open-meteo";
import { NavIcon, SearchIcon, ShareIcon, GpsIcon, RefreshIcon, SettingsIcon, BellIcon, DocsIcon } from "./icons";
import { NowCard, TrendCard, SunCard, RainCard, CalendarCard, SprayCard, DiseaseCard, SoilWaterCard, SeasonCard, SeasonalCard, SourcesCard } from "./cards";
import { enableRainAlerts, maybeNotifyRain, notifyPermission, saveLocationForSync } from "@/lib/aceweather/notify";

const RadarCard = dynamic(() => import("./radar-card").then((m) => m.RadarCard), {
  ssr: false,
  loading: () => <article className="awx-card"><div className="awx-radar-status">Loading radar…</div></article>,
});

const NAV = [["all", "Overview"], ["now", "Now"], ["rain", "Rain"], ["radar", "Radar"], ["field", "Field"], ["outlook", "Outlook"], ["seasonal", "Seasonal"]];
const MOBILE_NAV = [["all", "Overview"], ["now", "Now"], ["rain", "Rain"], ["radar", "Radar"], ["field", "Field"], ["more", "More"]];
const MORE_NAV = [["outlook", "Outlook"], ["seasonal", "Seasonal"], ["about", "Sources"]];
const MORE_VIEWS = new Set(MORE_NAV.map(([k]) => k));
const GPS_FOLLOW_KEY = "awx-gps-follow";
const GPS_UPDATE_MIN_KM = 0.75;
const GPS_OPTIONS = { enableHighAccuracy: true, maximumAge: 60 * 1000, timeout: 15 * 1000 };
const DOC_ENDPOINTS = [
  {
    label: "Crop Dynamics JSON",
    href: "https://aceweather.app/api/cropdynamics",
    detail: "Fast summary for agents: rain_mm, high_c, low_c across the seven Crop Dynamics locations.",
  },
  {
    label: "Regional text digest",
    href: "https://aceweather.app/api/digest?set=cropdynamics&history_days=29&format=short",
    detail: "Plain-text comparison table for browser tools that prefer text over JSON.",
  },
  {
    label: "Single-place report",
    href: "https://aceweather.app/api/report?query=Pocklington&history_days=29",
    detail: "Markdown report with observed daily rows, period summary, forecast, and agronomy context.",
  },
  {
    label: "Discovery index",
    href: "https://aceweather.app/api",
    detail: "Machine-readable endpoint catalogue with docs, examples, and supported parameters.",
  },
  {
    label: "OpenAPI",
    href: "https://aceweather.app/openapi.json",
    detail: "Schema reference for integrations and structured endpoint discovery.",
  },
];
const SEED_SAVED = [
  DEFAULT_LOCATION,
  { name: "Pocklington", region: "East Yorkshire", country: "United Kingdom", lat: 53.93, lon: -0.78, elev: 25, tz: "Europe/London" },
  { name: "York", region: "North Yorkshire", country: "United Kingdom", lat: 53.96, lon: -1.08, elev: 17, tz: "Europe/London" },
];

function tempForUnit(value, unit) {
  if (value == null) return "--";
  return Math.round(unit === "f" ? value * 9 / 5 + 32 : value);
}

function windForUnit(value, unit) {
  if (value == null) return "--";
  return Math.round(unit === "mph" ? value * 0.621371 : value);
}

function MobileGlance({ model, unit, windUnit, statusText, freshness, onShare, shareLabel }) {
  const sprayTone = model.agronomy.spray.label === "Go" ? "go" : model.agronomy.spray.label === "Hold" ? "risk" : "warn";
  const windLabel = windUnit === "mph" ? "mph" : "km/h";
  return (
    <section className="awx-mobile-glance" aria-label="Today at a glance">
      <div className="awx-glance-hero">
        <div>
          <span className="awx-glance-eyebrow">{statusText} forecast</span>
          <div className="awx-glance-temp">
            <span className="awx-tnum">{tempForUnit(model.now.temp, unit)}</span>
            <small>{unit === "f" ? "F" : "C"}</small>
          </div>
          <p>{model.now.condition.label} now. Feels {tempForUnit(model.now.feels, unit)} {unit === "f" ? "F" : "C"}.</p>
        </div>
        <div className="awx-glance-verdict">
          <span className={"awx-glance-pill awx-glance-pill-" + sprayTone}>{model.agronomy.spray.label}</span>
          <small>{model.agronomy.spray.sub}</small>
        </div>
      </div>
      <div className="awx-glance-grid">
        <div><span>High / low</span><b className="awx-tnum">{tempForUnit(model.now.hi, unit)} / {tempForUnit(model.now.lo, unit)}</b></div>
        <div><span>Rain 24h</span><b className="awx-tnum awx-rain-value">{model.rain.sum24} mm</b></div>
        <div><span>Wind</span><b className="awx-tnum">{windForUnit(model.now.wind, windUnit)} <small>{windLabel}</small></b></div>
        <div><span>Updated</span><b>{freshness}</b></div>
      </div>
      <button className="awx-glance-share" type="button" onClick={onShare}>
        <ShareIcon /><span>{shareLabel}</span>
      </button>
    </section>
  );
}

function gpsLocationFromPosition(pos) {
  return {
    name: "Current location",
    region: "GPS active",
    country: "",
    lat: Number(pos.coords.latitude.toFixed(5)),
    lon: Number(pos.coords.longitude.toFixed(5)),
    elev: Number.isFinite(pos.coords.altitude) ? Math.round(pos.coords.altitude) : null,
    tz: "auto",
  };
}

function distanceKm(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function EndpointDocs({ rail = false }: { rail?: boolean }) {
  const content = (
    <div className="awx-docs-list">
      {DOC_ENDPOINTS.map((endpoint) => (
        <a key={endpoint.href} className="awx-doc-link" href={endpoint.href} target="_blank" rel="noreferrer">
          <span>
            <b>{endpoint.label}</b>
            <small>{endpoint.detail}</small>
          </span>
          <code>{endpoint.href.replace("https://aceweather.app", "")}</code>
        </a>
      ))}
    </div>
  );

  if (rail) {
    return (
      <details className="awx-docs awx-docs-rail" aria-label="Endpoint documentation">
        <summary className="awx-docs-head">
          <DocsIcon />
          <span>
            <strong>Docs</strong>
            <small>Endpoint guide</small>
          </span>
        </summary>
        {content}
      </details>
    );
  }

  return (
    <section className="awx-docs" aria-label="Endpoint documentation">
      <div className="awx-docs-head">
        <DocsIcon />
        <div>
          <strong>Docs</strong>
          <span>Endpoints for agents, dashboards and AppSheet workflows.</span>
        </div>
      </div>
      {content}
    </section>
  );
}

export function AceWeatherApp() {
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [raw, setRaw] = useState(null);
  const [rawCacheMode, setRawCacheMode] = useState(undefined);
  const [seasonal, setSeasonal] = useState(null);
  const [status, setStatus] = useState("loading");
  const [loadRequest, setLoadRequest] = useState({ nonce: 0, cache: undefined });
  const [theme, setTheme] = useState("dark");
  const [unit, setUnit] = useState("c");
  const [windUnit, setWindUnit] = useState("kmh");
  const [view, setView] = useState("all");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [saved, setSaved] = useState(SEED_SAVED);
  const [shareLabel, setShareLabel] = useState("Share report");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [geoFollow, setGeoFollow] = useState(false);
  const [geoStatus, setGeoStatus] = useState("idle");
  const [rainAlerts, setRainAlerts] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const gpsLastLoadedRef = useRef(null);
  const lastSheetFocusRef = useRef(null);

  // prefs on mount
  useEffect(() => {
    try {
      const t = localStorage.getItem("awx-theme"); if (t) setTheme(t);
      const u = localStorage.getItem("awx-unit"); if (u) setUnit(u);
      const wu = localStorage.getItem("awx-windunit"); if (wu) setWindUnit(wu);
      const s = localStorage.getItem("awx-saved"); if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) setSaved(p); }
      if (localStorage.getItem("awx-rainalerts") === "1" && notifyPermission() === "granted") setRainAlerts(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem("awx-theme", theme); } catch { /* */ } }, [theme]);
  useEffect(() => { try { localStorage.setItem("awx-unit", unit); } catch { /* */ } }, [unit]);
  useEffect(() => { try { localStorage.setItem("awx-windunit", windUnit); } catch { /* */ } }, [windUnit]);
  useEffect(() => { try { localStorage.setItem("awx-rainalerts", rainAlerts ? "1" : "0"); } catch { /* */ } }, [rainAlerts]);
  useEffect(() => {
    let cancelled = false;
    try {
      if (localStorage.getItem(GPS_FOLLOW_KEY) !== "1") return undefined;
    } catch {
      return undefined;
    }
    if (!navigator.geolocation) {
      setGeoStatus("unsupported");
      return undefined;
    }
    const resumeFollow = () => {
      if (cancelled) return;
      setGeoStatus("locating");
      setGeoFollow(true);
    };
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((permission) => {
          if (permission.state === "granted") resumeFollow();
          else localStorage.removeItem(GPS_FOLLOW_KEY);
        })
        .catch(resumeFollow);
    } else {
      resumeFollow();
    }
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    try {
      if (geoFollow) localStorage.setItem(GPS_FOLLOW_KEY, "1");
      else localStorage.removeItem(GPS_FOLLOW_KEY);
    } catch { /* */ }
  }, [geoFollow]);
  useEffect(() => { saveLocationForSync(location); }, [location]);
  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus");
    if (!focus) return;
    const allowedViews = new Set([...NAV.map(([key]) => key), "about"]);
    if (allowedViews.has(focus)) setView(focus);
  }, []);
  useEffect(() => {
    const onUpd = () => setUpdateReady(true);
    window.addEventListener("aceweather:pwa-update-ready", onUpd);
    return () => window.removeEventListener("aceweather:pwa-update-ready", onUpd);
  }, []);

  // fetch forecast on location change
  useEffect(() => {
    const ctrl = new AbortController();
    const cacheMode = loadRequest.cache;
    setStatus(cacheMode === "reload" ? "refreshing" : "loading");
    fetchForecast(location, ctrl.signal, cacheMode)
      .then((data) => { setRaw(data); setRawCacheMode(cacheMode); setStatus("live"); })
      .catch((e) => { if (e.name !== "AbortError") setStatus("error"); });
    return () => ctrl.abort();
  }, [location, loadRequest]);

  // seasonal (best-effort, async; forecast actuals fill the archive's recent-day gap)
  useEffect(() => {
    if (!raw) return undefined;
    const ctrl = new AbortController();
    fetchSeasonal(location, raw.daily, ctrl.signal, rawCacheMode).then(setSeasonal).catch(() => setSeasonal(null));
    return () => ctrl.abort();
  }, [location, raw, rawCacheMode]);

  // search debounce
  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); return undefined; }
    const ctrl = new AbortController();
    const t = setTimeout(() => { searchLocations(query, ctrl.signal).then(setSuggestions).catch(() => {}); }, 280);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  const model = useMemo(() => (raw ? buildModel(raw) : null), [raw]);
  const freshness = model ? `${model.now.obsTime} ${location.tz?.includes("London") ? "BST" : ""}`.trim() : "—";

  useEffect(() => { if (rainAlerts && model) maybeNotifyRain(model, location.name); }, [rainAlerts, model, location.name]);
  useEffect(() => {
    const sheetOpen = locationOpen || settingsOpen || moreOpen;
    if (!sheetOpen) return undefined;
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest(".awx-sheet")) {
      lastSheetFocusRef.current = active;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sheet = document.querySelector(".awx-sheet");
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const focusables = () => Array.from(sheet?.querySelectorAll(focusableSelector) || []).filter((el) => el instanceof HTMLElement && el.getClientRects().length > 0);
    window.setTimeout(() => {
      const preferred = sheet?.matches(".awx-location-sheet") ? sheet.querySelector("input") : null;
      const first = preferred || focusables()[0];
      if (first instanceof HTMLElement) first.focus();
    }, 0);
    function closeSheets() {
      setLocationOpen(false);
      setSettingsOpen(false);
      setMoreOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSheets();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => {
        const target = lastSheetFocusRef.current;
        if (target instanceof HTMLElement && document.contains(target)) target.focus();
      }, 0);
    };
  }, [locationOpen, settingsOpen, moreOpen]);
  useEffect(() => {
    if (!geoFollow) return undefined;
    if (!navigator.geolocation) {
      setGeoStatus("unsupported");
      setGeoFollow(false);
      return undefined;
    }
    setGeoStatus("locating");
    const applyGpsPosition = (pos) => {
      const next = gpsLocationFromPosition(pos);
      if (distanceKm(gpsLastLoadedRef.current, next) < GPS_UPDATE_MIN_KM) {
        setGeoStatus("following");
        return;
      }
      gpsLastLoadedRef.current = { lat: next.lat, lon: next.lon };
      setLoadRequest((current) => ({ nonce: current.nonce + 1, cache: undefined }));
      setLocation(next);
      setQuery("");
      setSuggestions([]);
      setLocationOpen(false);
      setGeoStatus("following");
    };
    const onGpsError = (error) => {
      if (error?.code === 1) {
        gpsLastLoadedRef.current = null;
        setGeoFollow(false);
        setGeoStatus("blocked");
      } else {
        setGeoStatus("error");
      }
    };
    const watchId = navigator.geolocation.watchPosition(applyGpsPosition, onGpsError, GPS_OPTIONS);
    return () => navigator.geolocation.clearWatch(watchId);
  }, [geoFollow]);

  function loadLocation(loc, opts = {}) {
    if (!opts.keepGeoFollow) {
      gpsLastLoadedRef.current = null;
      setGeoFollow(false);
      setGeoStatus("idle");
    }
    setLoadRequest((current) => ({ nonce: current.nonce + 1, cache: undefined }));
    setLocation(loc); setQuery(""); setSuggestions([]);
    if (opts.resetView !== false) setView("all");
    if (opts.closeLocationSheet !== false) setLocationOpen(false);
    if (opts.save !== false) {
      setSaved((prev) => {
        const next = [loc, ...prev.filter((p) => p.name !== loc.name)].slice(0, 8);
        try { localStorage.setItem("awx-saved", JSON.stringify(next)); } catch { /* */ }
        return next;
      });
    }
  }
  function onSubmit(e) { e.preventDefault(); if (suggestions[0]) loadLocation(suggestions[0]); }
  function openLocationSheet() {
    setQuery("");
    setSuggestions([]);
    setLocationOpen(true);
    setSettingsOpen(false);
    setMoreOpen(false);
  }
  function selectMobileView(nextView) {
    setView(nextView);
    setMoreOpen(false);
  }
  function locateMe() {
    if (!navigator.geolocation) {
      setGeoStatus("unsupported");
      return;
    }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition((pos) => {
      const next = gpsLocationFromPosition(pos);
      gpsLastLoadedRef.current = { lat: next.lat, lon: next.lon };
      loadLocation(next, { keepGeoFollow: true, save: false });
      setGeoFollow(true);
      setGeoStatus("following");
    }, (error) => {
      setGeoFollow(false);
      setGeoStatus(error?.code === 1 ? "blocked" : "error");
    }, GPS_OPTIONS);
  }
  function share() {
    if (!model) return;
    const n = model.now;
    const text = `${location.name}: ${Math.round(n.temp)}°C, ${n.condition.label}. Rain next 24h ${model.rain.sum24} mm. Spray window: ${model.agronomy.spray.label}.`;
    try { navigator.clipboard?.writeText(text); } catch { /* */ }
    setShareLabel("Copied"); setTimeout(() => setShareLabel("Share report"), 1400);
  }

  function reloadData() {
    setStatus("refreshing");
    setLoadRequest((current) => ({ nonce: current.nonce + 1, cache: "reload" }));
  }

  async function toggleRainAlerts() {
    if (rainAlerts) { setRainAlerts(false); return; }
    const perm = await enableRainAlerts();
    if (perm === "granted") { setRainAlerts(true); saveLocationForSync(location); if (model) maybeNotifyRain(model, location.name); }
  }

  const isFetching = status === "loading" || status === "refreshing";
  const statusCls = status === "live" ? "" : isFetching ? " is-stale" : " is-offline";
  const statusText = status === "live" ? "Live" : status === "refreshing" ? "Reloading" : status === "loading" ? "Fetching" : "Offline";
  const reloadLabel = status === "refreshing" ? "Reloading data" : "Reload data";
  const gpsButtonLabel = geoStatus === "locating" ? "Locating..." : geoFollow ? "GPS location on" : geoStatus === "blocked" ? "Location blocked" : "Use my location";

  const settingsControls = (
    <>
      <div className="awx-segmented" role="group" aria-label="Theme">
        <button type="button" className={theme === "dark" ? "is-on" : ""} onClick={() => setTheme("dark")}>Dark</button>
        <button type="button" className={theme === "light" ? "is-on" : ""} onClick={() => setTheme("light")}>Light</button>
      </div>
      <div className="awx-segmented" role="group" aria-label="Temperature units">
        <button type="button" className={unit === "c" ? "is-on" : ""} onClick={() => setUnit("c")}>°C</button>
        <button type="button" className={unit === "f" ? "is-on" : ""} onClick={() => setUnit("f")}>°F</button>
      </div>
      <div className="awx-segmented" role="group" aria-label="Wind units">
        <button type="button" className={windUnit === "kmh" ? "is-on" : ""} onClick={() => setWindUnit("kmh")}>km/h</button>
        <button type="button" className={windUnit === "mph" ? "is-on" : ""} onClick={() => setWindUnit("mph")}>mph</button>
      </div>
      <button type="button" className={"awx-btn awx-btn-ghost awx-bell" + (rainAlerts ? " is-on" : "")} onClick={toggleRainAlerts}>
        <BellIcon /><span>{rainAlerts ? "Rain alerts on" : "Rain alerts"}</span>
      </button>
    </>
  );

  return (
    <div className="awx">
      {/* RAIL */}
      <aside className="awx-rail" aria-label="Primary">
        <a className="awx-brand" href="#top"><span className="awx-brand-mark" aria-hidden="true" />
          <span><span className="awx-brand-name">AceWeather</span><span className="awx-brand-sub">Field console</span></span></a>
        <nav className="awx-nav" aria-label="Sections">
          {NAV.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>
              <NavIcon name={k === "all" ? "overview" : k} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="awx-rail-spacer" />
        <div className="awx-rail-foot">
          <button className="awx-btn awx-btn-primary" type="button" onClick={share}><ShareIcon /><span>{shareLabel}</span></button>
          <section className="awx-settings-panel" aria-label="Settings">
            <div className="awx-settings-head">
              <SettingsIcon />
              <span>
                <strong>Settings</strong>
                <small>Display, units and docs</small>
              </span>
            </div>
            <div className="awx-settings-body">
              {settingsControls}
              <EndpointDocs rail />
            </div>
          </section>
        </div>
      </aside>

      {/* FEED */}
      <main className="awx-feed" id="top" data-view={view}>
        <header className="awx-mobile-top">
          <span className="awx-brand-mark" aria-hidden="true" />
          <button className="awx-location-trigger" type="button" onClick={openLocationSheet} aria-label={`Search or change location. Current location ${location.name}`}>
            <strong>{location.name}</strong>
            <small>{location.region || (geoFollow ? "GPS active" : "Change location")}</small>
          </button>
          <div className="awx-mtop-right">
            <span className={"awx-status" + statusCls}>{statusText}</span>
            <button className={"awx-icon-btn awx-refresh-icon" + (status === "refreshing" ? " is-loading" : "")} type="button" onClick={reloadData} disabled={isFetching} aria-label="Reload weather data" title={reloadLabel}><RefreshIcon /></button>
            <button className="awx-icon-btn" type="button" onClick={() => { setSettingsOpen(true); setLocationOpen(false); setMoreOpen(false); }} aria-label="Settings"><SettingsIcon /></button>
          </div>
        </header>
        <div className="awx-feed-head">
          <div>
            <h1>{location.name}</h1>
            <span className="awx-sub">{[location.region, model ? `updated ${freshness}` : "loading"].filter(Boolean).join(" · ")}</span>
          </div>
          <div className="awx-head-actions">
            <span className={"awx-status" + statusCls}>{statusText}</span>
            <button className={"awx-btn awx-btn-ghost awx-refresh-btn" + (status === "refreshing" ? " is-loading" : "")} type="button" onClick={reloadData} disabled={isFetching} title={reloadLabel}>
              <RefreshIcon /><span>{reloadLabel}</span>
            </button>
          </div>
        </div>
        <form className="awx-composer" onSubmit={onSubmit}>
          <label className="awx-search">
            <SearchIcon />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a town, postcode or field" autoComplete="off" />
            <button className="awx-go" type="submit">Load</button>
          </label>
          {suggestions.length ? (
            <div className="awx-suggest">
              {suggestions.map((s) => (
                <button key={`${s.lat},${s.lon}`} type="button" onClick={() => loadLocation(s)}>
                  <span className="awx-s-name">{s.name}</span>
                  <span className="awx-s-region">{[s.region, s.country].filter(Boolean).join(", ")}</span>
                </button>
              ))}
            </div>
          ) : null}
        </form>

        {model && view === "all" ? (
          <MobileGlance
            model={model}
            unit={unit}
            windUnit={windUnit}
            statusText={statusText}
            freshness={freshness}
            onShare={share}
            shareLabel={shareLabel}
          />
        ) : null}

        <section className="awx-feed-list" aria-label="Weather">
          {model ? (
            <>
              <NowCard model={model} unit={unit} windUnit={windUnit} view={view} />
              <TrendCard model={model} unit={unit} windUnit={windUnit} view={view} />
              <SunCard model={model} view={view} />
              <RainCard model={model} view={view} />
              <RadarCard location={location} theme={theme} view={view} />
              <CalendarCard model={model} unit={unit} windUnit={windUnit} view={view} />
              <SprayCard model={model} windUnit={windUnit} view={view} />
              <DiseaseCard model={model} view={view} />
              <SoilWaterCard model={model} view={view} />
              <SeasonCard model={model} view={view} />
              <SeasonalCard seasonal={seasonal} view={view} />
              <SourcesCard source={status} freshness={freshness} view={view} />
            </>
          ) : (
            <article className="awx-card"><div className="awx-radar-status">{status === "error" ? "Could not reach Open-Meteo. Check your connection and retry." : "Loading live conditions…"}</div></article>
          )}
        </section>
      </main>

      {/* SIDEBAR */}
      <aside className="awx-side" aria-label="Utilities">
        <div className="awx-side-card">
          <h3>Find a location</h3>
          <div className="awx-side-body">
            <label className="awx-side-search"><SearchIcon />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Town, postcode, field" /></label>
            <button className="awx-btn awx-btn-ghost" type="button" onClick={locateMe}><GpsIcon /><span>{gpsButtonLabel}</span></button>
          </div>
        </div>
        <div className="awx-side-card">
          <h3>Saved places</h3>
          <div className="awx-side-body">
            {saved.map((p) => (
              <button key={`${p.lat},${p.lon}`} className="awx-place" type="button" aria-pressed={p.name === location.name} onClick={() => loadLocation(p)}>
                <span><span className="awx-p-name">{p.name}</span><span className="awx-p-region">{p.region || p.country}</span></span>
                <span className="awx-p-temp">{p.name === location.name && model ? `${Math.round(unit === "f" ? model.now.temp * 9 / 5 + 32 : model.now.temp)}°` : "›"}</span>
              </button>
            ))}
          </div>
        </div>
        {model ? (
          <div className="awx-side-card">
            <h3>Today at a glance</h3>
            <div className="awx-side-body">
              <div className="awx-glance">
                <div><span className="awx-k">High</span><span className="awx-v awx-tnum">{Math.round(unit === "f" ? model.now.hi * 9 / 5 + 32 : model.now.hi)}°</span></div>
                <div><span className="awx-k">Low</span><span className="awx-v awx-tnum">{Math.round(unit === "f" ? model.now.lo * 9 / 5 + 32 : model.now.lo)}°</span></div>
                <div><span className="awx-k">Rain · 24h</span><span className="awx-v awx-tnum" style={{ color: "var(--awx-accent)" }}>{model.rain.sum24} mm</span></div>
                <div><span className="awx-k">Spray</span><span className="awx-v awx-tnum" style={{ color: "var(--awx-go)" }}>{model.agronomy.spray.longest}h</span></div>
              </div>
            </div>
          </div>
        ) : null}
      </aside>

      {/* MOBILE NAV */}
      <nav className="awx-mobile-nav" aria-label="Mobile">
        {MOBILE_NAV.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={k === "more" ? moreOpen || MORE_VIEWS.has(view) : view === k}
            onClick={() => {
              if (k === "more") {
                setMoreOpen(true);
                setSettingsOpen(false);
                setLocationOpen(false);
              } else {
                setView(k);
                setMoreOpen(false);
              }
            }}
          >
            <NavIcon name={k === "all" ? "overview" : k} />{label}
          </button>
        ))}
      </nav>

      {locationOpen ? (
        <div className="awx-sheet-overlay" onClick={() => setLocationOpen(false)}>
          <div className="awx-sheet awx-location-sheet" role="dialog" aria-modal="true" aria-label="Change location" onClick={(e) => e.stopPropagation()}>
            <div className="awx-sheet-head">
              <strong>Location</strong>
              <button className="awx-icon-btn" type="button" onClick={() => setLocationOpen(false)} aria-label="Close">x</button>
            </div>
            <form className="awx-location-form" onSubmit={onSubmit}>
              <label className="awx-search">
                <SearchIcon />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search town, postcode or field" autoComplete="off" autoFocus />
                <button className="awx-go" type="submit">Load</button>
              </label>
            </form>
            <div className="awx-sheet-body">
              {suggestions.length ? (
                <section className="awx-sheet-section" aria-label="Search results">
                  <div className="awx-sheet-section-title">Results</div>
                  <div className="awx-sheet-list">
                    {suggestions.map((s) => (
                      <button key={`${s.lat},${s.lon}`} className="awx-place" type="button" onClick={() => loadLocation(s)}>
                        <span><span className="awx-p-name">{s.name}</span><span className="awx-p-region">{[s.region, s.country].filter(Boolean).join(", ")}</span></span>
                        <span className="awx-p-temp">Load</span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
              <section className="awx-sheet-section" aria-label="Saved places">
                <div className="awx-sheet-section-title">Saved places</div>
                <div className="awx-sheet-list">
                  {saved.map((p) => (
                    <button key={`${p.lat},${p.lon}`} className="awx-place" type="button" aria-pressed={p.name === location.name} onClick={() => loadLocation(p)}>
                      <span><span className="awx-p-name">{p.name}</span><span className="awx-p-region">{p.region || p.country || "Saved location"}</span></span>
                      <span className="awx-p-temp">{p.name === location.name ? "Current" : "Load"}</span>
                    </button>
                  ))}
                </div>
              </section>
              <button className="awx-btn awx-btn-ghost" type="button" onClick={locateMe}><GpsIcon /><span>{gpsButtonLabel}</span></button>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? (
        <div className="awx-sheet-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="awx-sheet" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
            <div className="awx-sheet-head">
              <strong>Settings</strong>
              <button className="awx-icon-btn" type="button" onClick={() => setSettingsOpen(false)} aria-label="Close">x</button>
            </div>
            <div className="awx-sheet-body">
              {settingsControls}
              <div className="awx-sheet-actions">
                <button className="awx-btn awx-btn-ghost" type="button" onClick={() => { locateMe(); setSettingsOpen(false); }}><GpsIcon /><span>{gpsButtonLabel}</span></button>
                <button className="awx-btn awx-btn-primary" type="button" onClick={share}><ShareIcon /><span>{shareLabel}</span></button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {moreOpen ? (
        <div className="awx-sheet-overlay" onClick={() => setMoreOpen(false)}>
          <div className="awx-sheet awx-more-sheet" role="dialog" aria-modal="true" aria-label="More" onClick={(e) => e.stopPropagation()}>
            <div className="awx-sheet-head">
              <strong>More</strong>
              <button className="awx-icon-btn" type="button" onClick={() => setMoreOpen(false)} aria-label="Close">x</button>
            </div>
            <div className="awx-sheet-body">
              <div className="awx-more-grid" role="group" aria-label="More sections">
                {MORE_NAV.map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={view === k} onClick={() => selectMobileView(k)}>
                    <NavIcon name={k} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <EndpointDocs />
            </div>
          </div>
        </div>
      ) : null}
      {updateReady ? <div className="awx-toast" role="status">Updating to the latest version…</div> : null}
    </div>
  );
}
