"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";

import { buildModel, type AwModel } from "@/lib/aceweather/derive";
import { formatNextRain, formatRain, formatTemperature, type TemperatureUnit, type WindUnit } from "@/lib/aceweather/format";
import { DEFAULT_LOCATION, fetchForecast, fetchSeasonal, nearestUkDistrict, searchLocations, type AwLocation, type ForecastResponse, type SeasonalContext } from "@/lib/aceweather/open-meteo";
import { HERE_NAME, addSaved, forecastNotice, isUk, moveSaved, parseSaved, placeKey, removeSaved, renameSaved } from "@/lib/aceweather/places";
import { clearStoredHere, geolocationPlan, hereIsActive, readGeoPermission, readStoredHere, roundHereDegrees, storeHereFix } from "@/lib/aceweather/here-fix";
import { applyLearned, fetchLearned, type LearnedOverlay } from "@/lib/aceweather/learned";
import { CloseIcon, NavIcon, ShareIcon, GpsIcon, RefreshIcon, SettingsIcon, BellIcon, DocsIcon } from "./icons";
import { CalendarCard, SeasonalCard, SourcesCard } from "./cards";
import { enableRainAlerts, maybeNotifyRain, notifyPermission, saveLocationForSync } from "@/lib/aceweather/notify";
import { NowExperience } from "./now-experience";
import { OverviewExperience } from "./overview-experience";
import { PlaceMenu, PlaceSlot } from "./place-menu";
import { FieldExperience } from "./field-experience";
import { SprayCardSkeleton } from "./spray-strip";
import { SetupHint, showSetupHint } from "./setup-hint";
import { AccountPanel, useAccountSync } from "./account";
import { mergePlaces } from "@/lib/account/data";

const RADAR_LOAD_TIMEOUT_MS = 12_000;
type RadarModule = typeof import("./radar-card");

/** Same shape as the real radar card, so opening Radar never shows a blank screen. */
function RadarShell({ failed, onRetry }: { failed?: boolean; onRetry?: () => void }) {
  return (
    <article className="awx-card awx-radar-fallback" data-section="radar">
      <div className={"awx-radar" + (failed ? "" : " is-loading")}>
        <div className="awx-radar-stage">
          <div className="awx-radar-map" style={{ height: 300 }} />
          {failed ? (
            <RadarErrorPanel onRetry={onRetry} />
          ) : (
            <div className="awx-radar-loading" role="status" aria-live="polite"><span>Loading rainfall radar</span><i aria-hidden="true" /></div>
          )}
        </div>
      </div>
    </article>
  );
}

export function RadarErrorPanel({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="awx-radar-error" role="alert">
      <span>Radar couldn&apos;t load. Check your signal.</span>
      {onRetry ? <button type="button" className="awx-btn awx-btn-ghost awx-radar-retry" onClick={onRetry}>Retry</button> : null}
    </div>
  );
}

/** Warm the radar chunk (map library included) so opening Radar is instant. */
let radarPrefetch: Promise<RadarModule> | null = null;
function prefetchRadar(): Promise<RadarModule> {
  if (!radarPrefetch) {
    radarPrefetch = import("./radar-card");
    radarPrefetch.catch(() => { radarPrefetch = null; });
  }
  return radarPrefetch;
}

/** Loads the radar code with a timeout, an error card and Retry (replaces next/dynamic, which spun for ever on weak signal). */
function RadarSlot({ location, theme }: { location: AwLocation; theme: Theme }) {
  const [mod, setMod] = useState<RadarModule | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let done = false;
    setFailed(false);
    const timer = window.setTimeout(() => { if (!done) { done = true; radarPrefetch = null; setFailed(true); } }, RADAR_LOAD_TIMEOUT_MS);
    prefetchRadar().then((m) => { if (!done) { done = true; setMod(m); } }).catch(() => { if (!done) { done = true; setFailed(true); } });
    return () => { done = true; window.clearTimeout(timer); };
  }, [attempt]);
  const retry = () => { setMod(null); setAttempt((n) => n + 1); };
  if (mod) return <mod.RadarCard key={attempt} location={location} theme={theme} onRetry={retry} />;
  return <RadarShell failed={failed} onRetry={retry} />;
}

/** Desktop: stretch the shorter of the feed's last card and the side column's last card so both columns end level. */
function useLevelColumnEnds(feedRef: React.RefObject<HTMLElement | null>, sideRef: React.RefObject<HTMLElement | null>, key: string) {
  useEffect(() => {
    const feed = feedRef.current, side = sideRef.current;
    if (!feed || !side || typeof ResizeObserver === "undefined") return undefined;
    const desktop = window.matchMedia("(min-width: 1081px)");
    let frame = 0;
    const lastCard = (root: Element, sel: string) => [...root.querySelectorAll<HTMLElement>(sel)].filter((e) => e.offsetParent !== null).at(-1);
    const level = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const a = lastCard(feed, ".awx-feed-list > *"), b = lastCard(side, ".awx-side-card");
        [a, b].forEach((e) => { if (e) e.style.minHeight = ""; });
        if (!a || !b || !desktop.matches || getComputedStyle(side).display === "none") return;
        const diff = a.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom;
        const grow = diff > 0 ? b : a;
        if (Math.abs(diff) >= 1 && Math.abs(diff) < 24) grow.style.minHeight = `${grow.getBoundingClientRect().height + Math.abs(diff)}px`;
      });
    };
    const ro = new ResizeObserver(level);
    [...feed.querySelectorAll(".awx-feed-list > *"), ...side.querySelectorAll(".awx-side-card")].forEach((e) => ro.observe(e));
    desktop.addEventListener("change", level);
    level();
    return () => { ro.disconnect(); desktop.removeEventListener("change", level); cancelAnimationFrame(frame); };
  }, [feedRef, sideRef, key]);
}

const LONDON_HM = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Observation time as 24-hour Europe/London HH:MM, no zone label. */
function londonTime(at: number | null | undefined, fallback: string): string {
  return typeof at === "number" && Number.isFinite(at) ? LONDON_HM.format(at) : fallback;
}

type View = "all" | "now" | "rain" | "radar" | "field" | "outlook" | "seasonal" | "about";
type MobileNavKey = View | "more";
type Theme = "dark" | "light";
type RainRange = keyof AwModel["rain"]["ranges"];
type GeoStatus = "idle" | "locating" | "following" | "blocked" | "unsupported" | "error";
type LoadLocationOptions = { keepGeoFollow?: boolean; resetView?: boolean; closeLocationSheet?: boolean; save?: boolean };
type RainBar = { h: number; value: number; label: string; dry: boolean; now: boolean };

const NAV: ReadonlyArray<readonly [View, string]> = [["all", "Overview"], ["now", "Now"], ["rain", "Rain"], ["radar", "Radar"], ["field", "Field"], ["outlook", "Outlook"], ["seasonal", "Seasonal"], ["about", "Sources"]];
const MOBILE_NAV: ReadonlyArray<readonly [MobileNavKey, string]> = [["all", "Overview"], ["now", "Now"], ["rain", "Rain"], ["outlook", "Outlook"], ["field", "Field"], ["more", "More"]];
const MORE_NAV: ReadonlyArray<readonly [View, string]> = [["radar", "Radar"], ["seasonal", "Seasonal"], ["about", "Sources"]];
const MORE_VIEWS = new Set<View>(MORE_NAV.map(([k]) => k));
const isView = (value: string): value is View => NAV.some(([key]) => key === value);
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
function RainExperience({ model, seasonal, onSelectView }: { model: AwModel; seasonal: SeasonalContext | null; onSelectView: (view: View) => void }) {
  const [range, setRange] = useState<RainRange>("24h");
  const selected = model.rain.ranges[range];
  const rainTiming = formatNextRain(model.nextRain, model.rain.sum24);
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
          <div><span>Rain tomorrow</span><strong className="awx-tnum">{model.rain.tomorrowChance == null ? "—" : `${Math.round(model.rain.tomorrowChance)}%`}</strong></div>
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
                <strong className="awx-tnum">{formatRain(bar.value)} mm</strong>
                <small>{model.calendar[index]?.chance == null ? "—" : `${Math.round(model.calendar[index].chance as number)}%`}</small>
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
    name: HERE_NAME,
    region: "",
    country: "",
    lat: roundHereDegrees(pos.coords.latitude),
    lon: roundHereDegrees(pos.coords.longitude),
    elev: pos.coords.altitude != null && Number.isFinite(pos.coords.altitude) ? Math.round(pos.coords.altitude) : null,
    tz: "auto",
  };
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
  const [learnedOverlay, setLearnedOverlay] = useState<LearnedOverlay | null>(null);
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
  const [saved, setSaved] = useState<AwLocation[]>([]);
  const [shareLabel, setShareLabel] = useState("Share report");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [searchNote, setSearchNote] = useState<string | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!locationOpen || !vv) return;
    const root = document.documentElement;
    const sync = () => {
      root.style.setProperty("--awx-vvh", `${Math.round(vv.height)}px`);
      root.style.setProperty("--awx-kb", `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => { vv.removeEventListener("resize", sync); vv.removeEventListener("scroll", sync); root.style.removeProperty("--awx-vvh"); root.style.removeProperty("--awx-kb"); };
  }, [locationOpen]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [rainAlerts, setRainAlerts] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  // Set when the rail's "Sign in to sync" opens the Settings sheet straight at the email step.
  const [accountStart, setAccountStart] = useState(false);
  const account = useAccountSync(saved, { theme, unit, windUnit }, (data, mode) => {
    const places = mode === "merge" ? mergePlaces(data.saved, saved) : data.saved;
    remember(places);
    if (data.prefs.theme) setTheme(data.prefs.theme);
    if (data.prefs.unit) setUnit(data.prefs.unit);
    if (data.prefs.windUnit) setWindUnit(data.prefs.windUnit);
    // A device still on the default place opens the account's first place; one showing Here or a picked place stays put.
    const onDefault = location.lat === DEFAULT_LOCATION.lat && location.lon === DEFAULT_LOCATION.lon;
    if (places[0] && onDefault && geoStatus !== "following") setLocation(places[0]);
  });
  // Set when the user picks a place by hand; any GPS reading still in flight is ignored.
  const manualPickRef = useRef(false);
  const locateRef = useRef<() => void>(() => {});
  const lastSheetFocusRef = useRef<HTMLElement | null>(null);

  // prefs on mount
  useEffect(() => {
    try {
      const t = localStorage.getItem("awx-theme"); if (t === "dark" || t === "light") setTheme(t);
      const u = localStorage.getItem("awx-unit"); if (u === "c" || u === "f") setUnit(u);
      const wu = localStorage.getItem("awx-windunit"); if (wu === "kmh" || wu === "mph") setWindUnit(wu);
      const s = localStorage.getItem("awx-saved");
      const places = s ? parseSaved(JSON.parse(s)) : [];
      if (places.length) setSaved(places);
      const cachedHere = hereIsActive() ? readStoredHere() : null;
      if (!cachedHere) clearStoredHere();
      if (cachedHere) {
        setLocation({ name: cachedHere.name, region: cachedHere.region, country: "", lat: cachedHere.lat, lon: cachedHere.lon, elev: null, tz: "auto" });
        setGeoStatus("following");
      } else if (places[0]) {
        setLocation(places[0]);
      }
      if (localStorage.getItem("awx-rainalerts") === "1" && notifyPermission() === "granted") setRainAlerts(true);
      const hereActive = Boolean(cachedHere);
      void readGeoPermission().then((permission) => {
        if (geolocationPlan({ type: "load", hereActive, permission }) === "request") locateRef.current();
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem("awx-theme", theme); } catch { /* */ } }, [theme]);
  useEffect(() => { try { localStorage.setItem("awx-unit", unit); } catch { /* */ } }, [unit]);
  useEffect(() => { try { localStorage.setItem("awx-windunit", windUnit); } catch { /* */ } }, [windUnit]);
  useEffect(() => { try { localStorage.setItem("awx-rainalerts", rainAlerts ? "1" : "0"); } catch { /* */ } }, [rainAlerts]);
  useEffect(() => { saveLocationForSync(location); }, [location]);
  // Local authority from the point, not the geocoder's county or a stored post town.
  const districtLat = location.lat;
  const districtLon = location.lon;
  const districtCountry = location.country;
  const districtCode = location.countryCode;
  // Here has no country yet; nearestUkDistrict only asks postcodes.io for a point inside the UK.
  const districtForHere = location.name === HERE_NAME;
  useEffect(() => {
    if (!districtForHere && !isUk({ country: districtCountry, countryCode: districtCode })) return undefined;
    let cancelled = false;
    void nearestUkDistrict(districtLat, districtLon).then((district) => {
      if (cancelled || !district) return;
      if (districtForHere) storeHereFix({ lat: districtLat, lon: districtLon, name: HERE_NAME, region: district, at: Date.now() });
      else {
        // Keep the saved row in step with the header.
        setSaved((prev) => {
          if (!prev.some((p) => p.lat === districtLat && p.lon === districtLon && p.region !== district)) return prev;
          const next = prev.map((p) => (p.lat === districtLat && p.lon === districtLon ? { ...p, region: district } : p));
          try { localStorage.setItem("awx-saved", JSON.stringify(next)); } catch { /* */ }
          return next;
        });
      }
      setLocation((current) => (
        current.lat === districtLat && current.lon === districtLon && current.region !== district
          ? { ...current, region: district }
          : current
      ));
    });
    return () => { cancelled = true; };
  }, [districtLat, districtLon, districtCountry, districtCode, districtForHere]);
  useEffect(() => {
    const focus = new URLSearchParams(window.location.search).get("focus");
    if (focus && isView(focus)) setView(focus);
  }, []);
  useEffect(() => {
    const onUpd = () => setUpdateReady(true);
    window.addEventListener("aceweather:pwa-update-ready", onUpd);
    return () => window.removeEventListener("aceweather:pwa-update-ready", onUpd);
  }, []);

  // The forecast depends on the point only. A district filled in later, or a rename, must not refetch it.
  const pointLat = location.lat;
  const pointLon = location.lon;
  const pointTz = location.tz;
  const point = useMemo<AwLocation>(
    () => ({ name: "", region: "", country: "", lat: pointLat, lon: pointLon, elev: null, tz: pointTz }),
    [pointLat, pointLon, pointTz],
  );

  // fetch forecast when the point changes or a reload is asked for
  useEffect(() => {
    const ctrl = new AbortController();
    const cacheMode = loadRequest.cache;
    // A new place must not keep showing the previous forecast. A reload of the same place can.
    if (cacheMode !== "reload") {
      setRaw(null);
      setSeasonal(null);
    }
    setStatus(cacheMode === "reload" ? "refreshing" : "loading");
    fetchForecast(point, ctrl.signal, cacheMode)
      .then((data) => {
        if (ctrl.signal.aborted) return;
        setRaw(data);
        setRawCacheMode(cacheMode);
        setStatus("live");
      })
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("error"); });
    // The learned forecast arrives separately and is laid over temperature, wind and rain; if it fails the page keeps Open-Meteo's values.
    setLearnedOverlay(null);
    fetchLearned(point, ctrl.signal).then(setLearnedOverlay).catch(() => {});
    return () => ctrl.abort();
  }, [point, loadRequest]);

  // seasonal (best-effort, async; forecast actuals fill the archive's recent-day gap)
  useEffect(() => {
    if (!raw) return undefined;
    const ctrl = new AbortController();
    fetchSeasonal(point, raw.daily, ctrl.signal, rawCacheMode).then(setSeasonal).catch(() => setSeasonal(null));
    return () => ctrl.abort();
  }, [point, raw, rawCacheMode]);

  // search debounce
  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); setSearchNote(null); return undefined; }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchLocations(query, ctrl.signal).then((rows) => {
        if (ctrl.signal.aborted) return;
        setSuggestions(rows);
        setSearchNote(rows.length ? null : "No places found");
      }).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSuggestions([]);
        setSearchNote("Search failed");
      });
    }, 280);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  const learned = useMemo(() => (raw ? applyLearned(raw, learnedOverlay) : null), [raw, learnedOverlay]);
  const model = useMemo(() => (learned ? buildModel(learned.forecast) : null), [learned]);
  const feedRef = useRef<HTMLElement>(null);
  const sideRef = useRef<HTMLElement>(null);
  useLevelColumnEnds(feedRef, sideRef, `${view}|${model ? 1 : 0}`);
  const freshness = model ? londonTime(model.now.obsAt, model.now.obsTime) : "—";

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
      if (locationOpen && !settingsOpen && !moreOpen) {
        const visible = [...document.querySelectorAll<HTMLInputElement>(".awx-place-search input")].find((el) => el.getClientRects().length > 0);
        visible?.focus();
        return;
      }
      const first = focusables()[0];
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
  function remember(next: AwLocation[]) {
    setSaved(next);
    try { localStorage.setItem("awx-saved", JSON.stringify(next)); } catch { /* */ }
  }
  function loadLocation(loc: AwLocation, opts: LoadLocationOptions = {}) {
    const saving = opts.save !== false && loc.name !== HERE_NAME;
    if (saving) {
      const result = addSaved(saved, loc);
      if (result.atLimit) {
        setSearchNote("24 place limit");
        setLocationOpen(true);
        return;
      }
      remember(result.places);
    }
    if (!opts.keepGeoFollow) {
      manualPickRef.current = true;
      clearStoredHere();
      setGeoStatus("idle");
    }
    setLoadRequest((current) => ({ nonce: current.nonce + 1, cache: undefined }));
    setLocation(loc); setQuery(""); setSuggestions([]); setSearchNote(null);
    if (opts.closeLocationSheet !== false) setLocationOpen(false);
  }
  function onSubmit(e: FormEvent<HTMLFormElement>) { e.preventDefault(); if (suggestions[0]) loadLocation(suggestions[0]); }
  function openLocationSheet() {
    setQuery("");
    setSuggestions([]);
    setSearchNote(null);
    setLocationOpen(true);
    setSettingsOpen(false);
    setMoreOpen(false);
  }
  function renamePlace(id: string, name: string) {
    remember(renameSaved(saved, id, name));
    if (placeKey(location) === id) setLocation((current) => ({ ...current, name: name.trim() || current.name }));
  }
  function deletePlace(id: string) {
    remember(removeSaved(saved, id));
  }
  function movePlace(fromId: string, toId: string) {
    remember(moveSaved(saved, fromId, toId));
  }
  function selectViewAndReset(nextView: string) {
    if (!isView(nextView)) return;
    setView(nextView);
    setMoreOpen(false);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }));
  }
  function locateMe() {
    if (geolocationPlan({ type: "tap-here" }) !== "request") return;
    if (!navigator.geolocation) {
      setGeoStatus("unsupported");
      return;
    }
    setGeoStatus("locating");
    manualPickRef.current = false;
    navigator.geolocation.getCurrentPosition((pos) => {
      if (manualPickRef.current) return;
      const next = gpsLocationFromPosition(pos);
      storeHereFix({ lat: next.lat, lon: next.lon, name: HERE_NAME, region: "", at: Date.now() });
      loadLocation(next, { keepGeoFollow: true, save: false });
      setGeoStatus("following");
      // The district is filled by the district effect, which also stores it with the fix.
    }, (error) => {
      if (error?.code === 1) clearStoredHere();
      setGeoStatus(error?.code === 1 ? "blocked" : "error");
    }, GPS_OPTIONS);
  }
  useEffect(() => { locateRef.current = locateMe; });
  function share() {
    if (!model) return;
    const n = model.now;
    const text = `${location.name}: ${Math.round(n.temp)}°C, ${n.condition.label}. Rain next 24h ${model.rain.sum24} mm. Spraying: ${model.agronomy.spraying.verdict}.`;
    try { navigator.clipboard?.writeText(text); } catch { /* */ }
    setShareLabel("Copied"); setTimeout(() => setShareLabel("Share report"), 1400);
  }

  function reloadData() {
    if (geolocationPlan({ type: "refresh", hereActive: location.name === HERE_NAME }) === "request") locateMe();
    setStatus("refreshing");
    setLoadRequest((current) => ({ nonce: current.nonce + 1, cache: "reload" }));
  }

  async function toggleRainAlerts() {
    if (rainAlerts) { setRainAlerts(false); return; }
    const perm = await enableRainAlerts();
    if (perm === "granted") { setRainAlerts(true); saveLocationForSync(location); if (model) maybeNotifyRain(model, location.name); }
  }

  const isFetching = status === "loading" || status === "refreshing";
  const statusText = status === "live" ? "Live" : status === "refreshing" ? "Reloading" : status === "loading" ? "Fetching" : "Offline";
  const reloadLabel = status === "refreshing" ? "Reloading data" : "Reload data";
  const hereOn = location.name === HERE_NAME;
  const hereDetail = geoStatus === "blocked" ? "Location blocked" : geoStatus === "error" ? "Couldn't find you" : hereOn ? location.region : "";
  const notice = forecastNotice(status, Boolean(model));
  const temperature = model ? `${formatTemperature(model.now.temp, unit)}°` : undefined;
  const placeCluster = (
    <div className="awx-place-cluster">
      <PlaceSlot
        open={locationOpen}
        name={location.name}
        region={location.region}
        query={query}
        onOpen={openLocationSheet}
        onClose={() => setLocationOpen(false)}
        onQuery={setQuery}
        onSubmit={onSubmit}
      />
    </div>
  );
  const placeMenu = locationOpen ? (
    <PlaceMenu
      query={query}
      suggestions={suggestions}
      saved={saved}
      note={searchNote}
      hereDetail={hereDetail}
      hereOn={hereOn}
      activeKey={hereOn ? null : placeKey(location)}
      temperature={temperature}
      onSelect={loadLocation}
      onHere={locateMe}
      onRename={renamePlace}
      onDelete={deletePlace}
      onMove={movePlace}
    />
  ) : null;

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
      <button type="button" title={rainAlerts ? "Rain alerts on" : "Rain alerts"} className={"awx-btn awx-btn-ghost awx-bell" + (rainAlerts ? " is-on" : "")} onClick={toggleRainAlerts}>
        <BellIcon /><span>{rainAlerts ? "Rain alerts on" : "Rain alerts"}</span>
      </button>
      <button type="button" className="awx-link-btn awx-tips-btn" aria-label="Show set-up tips" title="Show set-up tips" onClick={() => { showSetupHint(); setSettingsOpen(false); setView("all"); }}><svg className="awx-tips-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg><span>Show set-up tips</span></button>
    </>
  );

  return (
    <div className="awx">
      {/* RAIL */}
      <aside className="awx-rail" aria-label="Primary">
        <a className="awx-brand" href="#top" title="AceWeather"><span className="awx-brand-mark" aria-hidden="true" />
          <span><span className="awx-brand-name">AceWeather</span></span></a>
        <nav className="awx-nav" aria-label="Sections">
          {NAV.map(([k, label]) => (
            <button key={k} type="button" title={label} aria-pressed={view === k} onClick={() => selectViewAndReset(k)}>
              <NavIcon name={k === "all" ? "overview" : k} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="awx-rail-spacer" />
        <div className="awx-rail-foot">
          <button className="awx-btn awx-btn-primary" type="button" title={shareLabel} onClick={share}><ShareIcon /><span>{shareLabel}</span></button>
          <section className="awx-settings-panel" aria-label="Settings">
            <div className="awx-settings-head" title="Settings">
              <SettingsIcon />
              <span>
                <strong>Settings</strong>
              </span>
            </div>
            <div className="awx-settings-body">
              <AccountPanel account={account} compact onStart={(signIn) => { setAccountStart(signIn); setSettingsOpen(true); setLocationOpen(false); setMoreOpen(false); }} />
              {settingsControls}
              <EndpointDocs rail />
            </div>
          </section>
        </div>
      </aside>

      {/* FEED */}
      <main ref={feedRef} className="awx-feed" id="top" data-view={view}>
        <header className={"awx-mobile-top" + (locationOpen ? " is-finding" : "")}>
          <span className="awx-brand-mark" aria-hidden="true" />
          {placeCluster}
          <div className="awx-mtop-right">
            <button className={"awx-icon-btn awx-refresh-icon" + (status === "refreshing" ? " is-loading" : "")} type="button" onClick={reloadData} disabled={isFetching} aria-label="Reload weather data" title={reloadLabel}><RefreshIcon /></button>
            <button className="awx-icon-btn" type="button" onClick={() => { setAccountStart(false); setSettingsOpen(true); setLocationOpen(false); setMoreOpen(false); }} aria-label="Settings"><SettingsIcon /></button>
          </div>
          {placeMenu}
        </header>
        <div className={"awx-feed-head" + (locationOpen ? " is-finding" : "")}>
          {placeCluster}
          <div className="awx-head-actions">
            <button className={"awx-btn awx-btn-ghost awx-refresh-btn" + (status === "refreshing" ? " is-loading" : "")} type="button" onClick={reloadData} disabled={isFetching} title={reloadLabel}>
              <RefreshIcon /><span>{reloadLabel}</span>
            </button>
          </div>
          {placeMenu}
        </div>
        {notice && !(view === "field" && notice === "loading") ? (
          <div className="awx-feed-status">
            <article className="awx-card awx-overview-status">
              <span>{notice === "offline" ? "Offline" : "Loading"}</span>
              {notice === "offline" ? <button className="awx-btn" type="button" onClick={reloadData}>Retry</button> : null}
            </article>
          </div>
        ) : null}
        {model && view === "all" ? (
          <OverviewExperience
            hint={<SetupHint onAllowLocation={locateMe} geoFollow={hereOn} />}
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
              {view === "radar" ? <RadarSlot location={location} theme={theme} /> : null}
              {view === "outlook" ? <CalendarCard model={model} unit={unit} windUnit={windUnit} /> : null}
              {view === "field" ? <FieldExperience model={model} windUnit={windUnit} /> : null}
              {view === "seasonal" ? <SeasonalCard seasonal={seasonal} /> : null}
              {view === "about" ? <SourcesCard source={status} freshness={freshness} aceForecast={Boolean(learned?.meta)} /> : null}
            </>
          ) : (
            status !== "error" && view === "field" ? <SprayCardSkeleton /> : null
          )}
        </section>
      </main>

      {/* SIDEBAR */}
      <aside ref={sideRef} className="awx-side" aria-label="Utilities">
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
                void prefetchRadar();
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

      {settingsOpen ? (
        <div className="awx-sheet-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="awx-sheet" role="dialog" aria-modal="true" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
            <div className="awx-sheet-head">
              <strong>Settings</strong>
              <button className="awx-icon-btn" type="button" onClick={() => setSettingsOpen(false)} aria-label="Close"><CloseIcon /></button>
            </div>
            <div className="awx-sheet-body">
              <AccountPanel account={account} startOpen={accountStart} />
              {settingsControls}
              <div className="awx-sheet-actions">
                <button className="awx-btn awx-btn-ghost" type="button" onClick={() => { locateMe(); setSettingsOpen(false); }}><GpsIcon /><span>Here</span></button>
                <button className="awx-btn awx-btn-primary" type="button" title={shareLabel} onClick={share}><ShareIcon /><span>{shareLabel}</span></button>
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
              <button className="awx-icon-btn" type="button" onClick={() => setMoreOpen(false)} aria-label="Close"><CloseIcon /></button>
            </div>
            <div className="awx-sheet-body">
              <div className="awx-more-grid" role="group" aria-label="More sections">
                {MORE_NAV.map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={view === k} onClick={() => selectViewAndReset(k)}>
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
