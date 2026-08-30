"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import dynamic from "next/dynamic";

import { buildModel, type AwModel } from "@/lib/aceweather/derive";
import { formatNextRain, formatTemperature, type TemperatureUnit, type WindUnit } from "@/lib/aceweather/format";
import { DEFAULT_LOCATION, fetchForecast, fetchSeasonal, searchLocations, type AwLocation, type ForecastResponse, type SeasonalContext } from "@/lib/aceweather/open-meteo";
import { NavIcon, ShareIcon, GpsIcon, RefreshIcon, SettingsIcon, BellIcon, DocsIcon } from "./icons";
import { CalendarCard, SeasonalCard, SourcesCard } from "./cards";
import { enableRainAlerts, maybeNotifyRain, notifyPermission, saveLocationForSync } from "@/lib/aceweather/notify";
import { NowExperience } from "./now-experience";
import { OverviewExperience } from "./overview-experience";
import { LocationPickerContent } from "./location-picker-content";
import { FieldExperience } from "./field-experience";

const RadarCard = dynamic(() => import("./radar-card").then((m) => m.RadarCard), {
  ssr: false,
  loading: () => <article className="awx-card"><div className="awx-radar-status">Loading radar…</div></article>,
});

type View = "all" | "now" | "rain" | "radar" | "field" | "outlook" | "seasonal" | "about";
type MobileNavKey = View | "more";
type Theme = "dark" | "light";
type RainRange = keyof AwModel["rain"]["ranges"];
type GeoStatus = "idle" | "locating" | "following" | "blocked" | "unsupported" | "error";
type LoadLocationOptions = { keepGeoFollow?: boolean; resetView?: boolean; closeLocationSheet?: boolean; save?: boolean };
type LatLon = Pick<AwLocation, "lat" | "lon">;
type RainBar = { h: number; value: number; label: string; dry: boolean; now: boolean };

const NAV: ReadonlyArray<readonly [View, string]> = [["all", "Overview"], ["now", "Now"], ["rain", "Rain"], ["radar", "Radar"], ["field", "Field"], ["outlook", "Outlook"], ["seasonal", "Seasonal"], ["about", "Sources"]];
const MOBILE_NAV: ReadonlyArray<readonly [MobileNavKey, string]> = [["all", "Overview"], ["now", "Now"], ["rain", "Rain"], ["outlook", "Outlook"], ["field", "Field"], ["more", "More"]];
const MORE_NAV: ReadonlyArray<readonly [View, string]> = [["radar", "Radar"], ["seasonal", "Seasonal"], ["about", "Sources"]];
const MORE_VIEWS = new Set<View>(MORE_NAV.map(([k]) => k));
const isView = (value: string): value is View => NAV.some(([key]) => key === value);
const GPS_FOLLOW_KEY = "awx-gps-follow";
const GPS_UPDATE_MIN_KM = 0.75;
const GPS_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 60 * 1000, timeout: 15 * 1000 };
const DOC_ENDPOINTS = [
  {
    label: "Crop Dynamics JSON",
    href: "https://aceweather.app/api/cropdynamics",
  },
  {
    label: "Regional text digest",
    href: "https://aceweather.app/api/digest?set=cropdynamics&history_days=29&format=short",
  },
  {
    label: "Single-place report",
    href: "https://aceweather.app/api/report?query=Pocklington&history_days=29",
  },
  {
    label: "Discovery index",
    href: "https://aceweather.app/api",
  },
  {
    label: "OpenAPI",
    href: "https://aceweather.app/openapi.json",
  },
];
const SEED_SAVED = [
  DEFAULT_LOCATION,
  { name: "Pocklington", region: "East Yorkshire", country: "United Kingdom", lat: 53.93, lon: -0.78, elev: 25, tz: "Europe/London" },
  { name: "York", region: "North Yorkshire", country: "United Kingdom", lat: 53.96, lon: -1.08, elev: 17, tz: "Europe/London" },
];

function RainExperience({ model, seasonal, onSelectView }: { model: AwModel; seasonal: SeasonalContext | null; onSelectView: (view: View) => void }) {
  const [range, setRange] = useState<RainRange>("24h");
  const selected = model.rain.ranges[range];
  const rainTiming = formatNextRain(model.nextRain, model.rain.sum24, model.rain.peakProb);
  const lastYearRain = seasonal?.lastYearMtdRain;
  const comparisonDelta = seasonal == null || lastYearRain == null ? null : +(seasonal.mtdRain - lastYearRain).toFixed(1);
  const comparisonDirection = comparisonDelta == null || Math.abs(comparisonDelta) < 0.1
    ? "similar"
    : comparisonDelta > 0 ? "wetter" : "drier";
  const comparisonArrow = comparisonDirection === "wetter" ? "↑" : comparisonDirection === "drier" ? "↓" : "→";

  return (
    <section className="awx-rain-experience" aria-label="Rainfall forecast">
      <section className="awx-rain-summary" aria-labelledby="awx-rain-summary-title">
        <div className="awx-rain-summary-head">
          <div className="awx-rain-summary-icon" aria-hidden="true"><NavIcon name="rain" /></div>
          <div>
            <span className="awx-overview-eyebrow" id="awx-rain-summary-title">Next rain</span>
            <strong>{rainTiming.headline}</strong>
            <small>{rainTiming.detail}</small>
          </div>
        </div>
        <div className="awx-rain-key-metrics">
          <div><span>Next 24h</span><strong className="awx-tnum">{model.rain.sum24} <small>mm</small></strong></div>
          <div><span>Peak chance</span><strong className="awx-tnum">{Math.round(model.rain.peakProb)}%</strong></div>
          <div><span>Next 7 days</span><strong className="awx-tnum">{model.rain.next7} <small>mm</small></strong></div>
          <div><span>Past 7 days</span><strong className="awx-tnum">{model.rain.past7} <small>mm</small></strong></div>
        </div>
        <div className="awx-rain-comparison">
          <div className={`awx-rain-comparison-tile is-${comparisonDirection}`} aria-label={seasonal && lastYearRain != null && comparisonDelta != null ? `${seasonal.monthLabel} rainfall to day ${seasonal.comparisonDay}: ${seasonal.mtdRain} millimetres, ${Math.abs(comparisonDelta)} millimetres ${comparisonDirection} than ${seasonal.lastYear}` : "Loading rainfall comparison with last year"}>
            <span>{seasonal ? `${seasonal.monthLabel} to date` : "Month to date"}</span>
            <strong className="awx-tnum">{seasonal ? seasonal.mtdRain : "—"}<small> mm</small></strong>
            <b>{comparisonDelta == null ? "Loading comparison" : `${comparisonArrow} ${Math.abs(comparisonDelta).toFixed(1)} mm ${comparisonDirection}`}</b>
            <small>{seasonal && lastYearRain != null ? `vs ${lastYearRain} mm in ${seasonal.lastYear}` : "Archive data"}</small>
          </div>
        </div>
      </section>

      <section className="awx-rain-chart" aria-labelledby="awx-rain-chart-title">
        <div className="awx-rain-chart-head">
          <div><span id="awx-rain-chart-title">Rainfall outlook</span></div>
          <strong className="awx-tnum">{selected.total} mm</strong>
        </div>
        <div className="awx-rain-range" role="group" aria-label="Rain range">
          {(["24h", "7d", "14d"] as RainRange[]).map((key) => (
            <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)}>{key}</button>
          ))}
        </div>
        {range === "24h" ? (
          <div className="awx-rain-timeline" role="list" aria-label={`${selected.cap}, total ${selected.total} millimetres`}>
            {selected.bars.map((bar: RainBar, index: number) => (
              <div key={`${bar.label}-${index}`} role="listitem" aria-label={`${bar.label}, ${Number(bar.value ?? 0).toFixed(1)} millimetres${bar.now ? ", current period" : ""}`} className={(bar.dry ? "is-dry" : "") + (bar.now ? " is-now" : "")}>
                <span aria-hidden="true" style={{ opacity: bar.dry ? 0.12 : 0.28 + (bar.h / 100) * 0.72 }} />
                <small>{String(bar.label).split(":")[0]}</small>
              </div>
            ))}
          </div>
        ) : range === "7d" ? (
          <div className="awx-rain-day-list" role="list" aria-label="Seven-day rainfall totals">
            {selected.bars.map((bar: RainBar, index: number) => (
              <div key={`${bar.label}-${index}`} role="listitem">
                <span>{bar.label}</span>
                <i><b style={{ width: `${bar.h}%` }} /></i>
                <strong className="awx-tnum">{bar.value.toFixed(1)} mm</strong>
                <small>{Math.round(model.calendar[index]?.prob ?? 0)}%</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="awx-rain-heat-strip" role="list" aria-label="Fourteen-day rainfall pattern">
            {selected.bars.map((bar: RainBar, index: number) => (
              <div key={`${bar.label}-${index}`} role="listitem" aria-label={`${bar.label}: ${bar.value.toFixed(1)} millimetres`} className={bar.dry ? "is-dry" : ""} style={{ "--awx-rain-alpha": `${Math.round((bar.dry ? 0.04 : 0.12 + (bar.h / 100) * 0.34) * 100)}%` } as CSSProperties}>
                <span>{bar.label}</span>
                <strong className="awx-tnum">{bar.value.toFixed(1)}</strong>
                <small>mm</small>
              </div>
            ))}
          </div>
        )}
      </section>

      <button className="awx-rain-radar-link" type="button" onClick={() => onSelectView("radar")}>
        <span className="awx-rain-radar-icon" aria-hidden="true"><NavIcon name="radar" /></span>
        <span><strong>See where the rain is</strong></span>
        <b aria-hidden="true">›</b>
      </button>
    </section>
  );
}

function gpsLocationFromPosition(pos: GeolocationPosition): AwLocation {
  return {
    name: "Current location",
    region: "GPS active",
    country: "",
    lat: Number(pos.coords.latitude.toFixed(5)),
    lon: Number(pos.coords.longitude.toFixed(5)),
    elev: pos.coords.altitude != null && Number.isFinite(pos.coords.altitude) ? Math.round(pos.coords.altitude) : null,
    tz: "auto",
  };
}

function distanceKm(a: LatLon | null, b: LatLon | null) {
  if (!a || !b) return Infinity;
  const toRad = (value: number) => (value * Math.PI) / 180;
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
          </span>
        </summary>
        {content}
      </details>
    );
  }

  return (
    <details className="awx-docs awx-docs-rail" aria-label="Endpoint documentation">
      <summary className="awx-docs-head">
        <DocsIcon />
        <span>
          <strong>Docs</strong>
        </span>
      </summary>
      {content}
    </details>
  );
}

export function AceWeatherApp() {
  const [location, setLocation] = useState<AwLocation>(DEFAULT_LOCATION);
  const [raw, setRaw] = useState<ForecastResponse | null>(null);
  const [rawCacheMode, setRawCacheMode] = useState<RequestCache | undefined>(undefined);
  const [seasonal, setSeasonal] = useState<SeasonalContext | null>(null);
  const [status, setStatus] = useState<"loading" | "refreshing" | "live" | "error">("loading");
  const [loadRequest, setLoadRequest] = useState<{ nonce: number; cache?: RequestCache }>({ nonce: 0, cache: undefined });
  const [theme, setTheme] = useState<Theme>("dark");
  const [unit, setUnit] = useState<TemperatureUnit>("c");
  const [windUnit, setWindUnit] = useState<WindUnit>("kmh");
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<AwLocation[]>([]);
  const [saved, setSaved] = useState<AwLocation[]>(SEED_SAVED);
  const [shareLabel, setShareLabel] = useState("Share report");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [geoFollow, setGeoFollow] = useState(false);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [rainAlerts, setRainAlerts] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const gpsLastLoadedRef = useRef<LatLon | null>(null);
  const lastSheetFocusRef = useRef<HTMLElement | null>(null);

  // prefs on mount
  useEffect(() => {
    try {
      const t = localStorage.getItem("awx-theme"); if (t === "dark" || t === "light") setTheme(t);
      const u = localStorage.getItem("awx-unit"); if (u === "c" || u === "f") setUnit(u);
      const wu = localStorage.getItem("awx-windunit"); if (wu === "kmh" || wu === "mph") setWindUnit(wu);
      const s = localStorage.getItem("awx-saved"); if (s) { const p: unknown = JSON.parse(s); if (Array.isArray(p) && p.length) setSaved(p as AwLocation[]); }
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
    if (focus && isView(focus)) setView(focus);
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
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("error"); });
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
    const sheet = document.querySelector<HTMLElement>(".awx-sheet");
    const focusableSelector = [
      "a[href]",
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");
    const focusables = () => Array.from(sheet?.querySelectorAll<HTMLElement>(focusableSelector) || []).filter((el) => el.getClientRects().length > 0);
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
    function onKeyDown(event: KeyboardEvent) {
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
    const applyGpsPosition = (pos: GeolocationPosition) => {
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
    const onGpsError = (error: GeolocationPositionError) => {
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

  function loadLocation(loc: AwLocation, opts: LoadLocationOptions = {}) {
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
  function onSubmit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (suggestions[0]) loadLocation(suggestions[0]); }
  function openLocationSheet() {
    setQuery("");
    setSuggestions([]);
    setLocationOpen(true);
    setSettingsOpen(false);
    setMoreOpen(false);
  }
  function selectViewAndReset(nextView: string) {
    if (!isView(nextView)) return;
    setView(nextView);
    setMoreOpen(false);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }));
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
    const text = `${location.name}: ${Math.round(n.temp)}°C, ${n.condition.label}. Rain next 24h ${model.rain.sum24} mm. Spraying: ${model.agronomy.spraying.verdict}.`;
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
          <span><span className="awx-brand-name">AceWeather</span></span></a>
        <nav className="awx-nav" aria-label="Sections">
          {NAV.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => selectViewAndReset(k)}>
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
        {model && view === "all" ? (
          <OverviewExperience
            model={model}
            unit={unit}
            windUnit={windUnit}
            statusText={statusText}
            freshness={freshness}
            onShare={share}
            shareLabel={shareLabel}
            onSelectView={selectViewAndReset}
          />
        ) : null}

        <section className="awx-feed-list" aria-label="Weather">
          {model ? (
            <>
              {view === "now" ? (
                <NowExperience model={model} unit={unit} windUnit={windUnit} freshness={freshness} onSelectView={selectViewAndReset} />
              ) : null}
              {view === "rain" ? (
                <RainExperience model={model} seasonal={seasonal} onSelectView={selectViewAndReset} />
              ) : null}
              {view === "radar" ? <RadarCard location={location} theme={theme} /> : null}
              {view === "outlook" ? <CalendarCard model={model} unit={unit} windUnit={windUnit} /> : null}
              {view === "field" ? <FieldExperience model={model} windUnit={windUnit} /> : null}
              {view === "seasonal" ? <SeasonalCard seasonal={seasonal} /> : null}
              {view === "about" ? <SourcesCard source={status} freshness={freshness} /> : null}
            </>
          ) : (
            <article className="awx-card"><div className="awx-radar-status">{status === "error" ? "Could not reach Open-Meteo. Check your connection and retry." : "Loading live conditions…"}</div></article>
          )}
        </section>
      </main>

      {/* SIDEBAR */}
      <aside className="awx-side" aria-label="Utilities">
        <div className="awx-side-card">
          <h3>Location</h3>
          <div className="awx-side-body">
            <LocationPickerContent
              query={query}
              suggestions={suggestions}
              saved={saved}
              activeLocationName={location.name}
              currentTemperature={model ? `${formatTemperature(model.now.temp, unit)}°` : undefined}
              gpsButtonLabel={gpsButtonLabel}
              onQueryChange={setQuery}
              onSubmit={onSubmit}
              onSelectLocation={loadLocation}
              onLocate={locateMe}
            />
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
                <div><span className="awx-k">Spray</span><span className="awx-v awx-tnum" style={{ color: `var(--awx-${model.agronomy.spraying.verdictTone})` }}>{model.agronomy.spraying.nextWindow?.hours ?? 0}h</span></div>
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
                selectViewAndReset(k);
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
            <div className="awx-sheet-body">
              <LocationPickerContent
                query={query}
                suggestions={suggestions}
                saved={saved}
                activeLocationName={location.name}
                currentTemperature={model ? `${formatTemperature(model.now.temp, unit)}°` : undefined}
                gpsButtonLabel={gpsButtonLabel}
                autoFocus
                onQueryChange={setQuery}
                onSubmit={onSubmit}
                onSelectLocation={loadLocation}
                onLocate={locateMe}
              />
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
                  <button key={k} type="button" aria-pressed={view === k} onClick={() => selectViewAndReset(k)}>
                    <NavIcon name={k} />
                    <span>{label}</span>
                  </button>
                ))}
                <a href="/atlas" aria-label="Open Crop Weather Atlas">
                  <NavIcon name="atlas" />
                  <span>Atlas</span>
                </a>
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
