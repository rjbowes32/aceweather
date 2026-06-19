/* eslint-disable @typescript-eslint/ban-ts-comment, react-hooks/set-state-in-effect */
// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";

import { buildModel } from "@/lib/aceweather/derive";
import { DEFAULT_LOCATION, fetchForecast, fetchSeasonal, searchLocations } from "@/lib/aceweather/open-meteo";
import { NavIcon, SearchIcon, ShareIcon, GpsIcon, SettingsIcon, BellIcon, DocsIcon } from "./icons";
import { NowCard, TrendCard, SunCard, RainCard, CalendarCard, SprayCard, DiseaseCard, SoilWaterCard, SeasonCard, SeasonalCard, SourcesCard } from "./cards";
import { enableRainAlerts, maybeNotifyRain, notifyPermission, saveLocationForSync } from "@/lib/aceweather/notify";

const RadarCard = dynamic(() => import("./radar-card").then((m) => m.RadarCard), {
  ssr: false,
  loading: () => <article className="awx-card"><div className="awx-radar-status">Loading radar…</div></article>,
});

const NAV = [["all", "Overview"], ["now", "Now"], ["rain", "Rain"], ["radar", "Radar"], ["field", "Field"], ["outlook", "Outlook"], ["seasonal", "Seasonal"]];
const MOBILE_NAV = NAV.slice(0, 6);
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
  const [seasonal, setSeasonal] = useState(null);
  const [status, setStatus] = useState("loading");
  const [theme, setTheme] = useState("dark");
  const [unit, setUnit] = useState("c");
  const [windUnit, setWindUnit] = useState("kmh");
  const [view, setView] = useState("all");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [saved, setSaved] = useState(SEED_SAVED);
  const [shareLabel, setShareLabel] = useState("Share report");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rainAlerts, setRainAlerts] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);

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
  useEffect(() => { saveLocationForSync(location); }, [location]);
  useEffect(() => {
    const onUpd = () => setUpdateReady(true);
    window.addEventListener("aceweather:pwa-update-ready", onUpd);
    return () => window.removeEventListener("aceweather:pwa-update-ready", onUpd);
  }, []);

  // fetch forecast on location change
  useEffect(() => {
    const ctrl = new AbortController();
    setStatus("loading");
    fetchForecast(location, ctrl.signal)
      .then((data) => { setRaw(data); setStatus("live"); })
      .catch((e) => { if (e.name !== "AbortError") setStatus("error"); });
    return () => ctrl.abort();
  }, [location]);

  // seasonal (best-effort, async; forecast actuals fill the archive's recent-day gap)
  useEffect(() => {
    if (!raw) return undefined;
    const ctrl = new AbortController();
    fetchSeasonal(location, raw.daily, ctrl.signal).then(setSeasonal).catch(() => setSeasonal(null));
    return () => ctrl.abort();
  }, [location, raw]);

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

  function loadLocation(loc) {
    setLocation(loc); setQuery(""); setSuggestions([]); setView("all");
    setSaved((prev) => {
      const next = [loc, ...prev.filter((p) => p.name !== loc.name)].slice(0, 8);
      try { localStorage.setItem("awx-saved", JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }
  function onSubmit(e) { e.preventDefault(); if (suggestions[0]) loadLocation(suggestions[0]); }
  function locateMe() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      loadLocation({ name: "Current location", region: "", country: "", lat: pos.coords.latitude, lon: pos.coords.longitude, elev: null, tz: "auto" });
    });
  }
  function share() {
    if (!model) return;
    const n = model.now;
    const text = `${location.name}: ${Math.round(n.temp)}°C, ${n.condition.label}. Rain next 24h ${model.rain.sum24} mm. Spray window: ${model.agronomy.spray.label}.`;
    try { navigator.clipboard?.writeText(text); } catch { /* */ }
    setShareLabel("Copied"); setTimeout(() => setShareLabel("Share report"), 1400);
  }

  async function toggleRainAlerts() {
    if (rainAlerts) { setRainAlerts(false); return; }
    const perm = await enableRainAlerts();
    if (perm === "granted") { setRainAlerts(true); saveLocationForSync(location); if (model) maybeNotifyRain(model, location.name); }
  }

  const statusCls = status === "live" ? "" : status === "loading" ? " is-stale" : " is-offline";
  const statusText = status === "live" ? "Live" : status === "loading" ? "Fetching" : "Offline";

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
        <a className="awx-brand" href="#top"><span className="awx-brand-mark">A</span>
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
      <main className="awx-feed" id="top">
        <header className="awx-mobile-top">
          <span className="awx-brand-mark">A</span>
          <strong>{location.name}</strong>
          <div className="awx-mtop-right">
            <span className={"awx-status" + statusCls}>{statusText}</span>
            <button className="awx-icon-btn" type="button" onClick={() => setSettingsOpen(true)} aria-label="Settings"><SettingsIcon /></button>
          </div>
        </header>
        <div className="awx-feed-head">
          <div>
            <h1>{location.name}</h1>
            <span className="awx-sub">{[location.region, model ? `updated ${freshness}` : "loading"].filter(Boolean).join(" · ")}</span>
          </div>
          <span className={"awx-status" + statusCls}>{statusText}</span>
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
            <button className="awx-btn awx-btn-ghost" type="button" onClick={locateMe}><GpsIcon /><span>Use my location</span></button>
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
          <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>
            <NavIcon name={k === "all" ? "overview" : k} />{label}
          </button>
        ))}
      </nav>

      {settingsOpen ? (
        <div className="awx-sheet-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="awx-sheet" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
            <div className="awx-sheet-head"><strong>Settings</strong><button className="awx-icon-btn" type="button" onClick={() => setSettingsOpen(false)} aria-label="Close">✕</button></div>
            <div className="awx-sheet-body">
              {settingsControls}
              <div className="awx-sheet-actions">
                <button className="awx-btn awx-btn-ghost" type="button" onClick={() => { locateMe(); setSettingsOpen(false); }}><GpsIcon /><span>Use my location</span></button>
                <button className="awx-btn awx-btn-primary" type="button" onClick={share}><ShareIcon /><span>{shareLabel}</span></button>
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
