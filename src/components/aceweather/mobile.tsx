// @ts-nocheck
"use client";

import { useEffect, useRef, useState } from "react";

import {
  addSavedLocation as awAddSavedLocation,
  getCachedPayload as awGetCachedPayload,
  getSavedLocations as awGetSavedLocations,
  locationId as awLocationId,
  removeSavedLocation as awRemoveSavedLocation,
  setCachedPayload as awSetCachedPayload,
} from "@/lib/store";

import { DayDetail } from "./day-detail";
import { InstallPrompt } from "./install-prompt";
import { LunarChip } from "./lunar";
import { NowFx } from "./now-fx";
import { RainGauge } from "./rain-gauge";
import { MobileLocationLists } from "./mobile-locations";
import { dirToCompass, fmt0, fmt1, requestBrowserLocation, searchMobileLocations } from "./helpers";
import { WeatherIcon } from "./icons";
import { MobileRainChart } from "./mobile-rain-chart";
import { MobileWindDial } from "./mobile-wind-dial";
import { awFetchLive, mergeOpenMeteo } from "./open-meteo";
import { AnomalyChips } from "./panels/anomaly-chips";
import { ClimatePanel } from "./panels/climate-panel";
import { ModelCompare } from "./panels/model-compare";
import { OnThisDay } from "./panels/on-this-day";
import { RadarLive } from "./panels/radar-live";
import { TropicalPanel } from "./panels/tropical";
import { ReportAction, shareWeatherReport } from "./report-action";
import { AW_FALLBACK, AW_LOCATION } from "./sample-data";
import { UpdateNotice } from "./update-notice";

const MOBILE_PREFS_KEY = "aceweather.mobile.prefs.v1";
const STALE_WEATHER_MS = 60 * 60 * 1000;

function readMobilePrefs() {
  if (typeof window === "undefined") return { startupLocationMode: "gps" };
  try {
    const raw = window.localStorage.getItem(MOBILE_PREFS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return { startupLocationMode: parsed.startupLocationMode === "saved" ? "saved" : "gps" };
  } catch {
    return { startupLocationMode: "gps" };
  }
}

function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "now";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function trendFor(value, previous, tolerance = 0.2) {
  if (value == null || previous == null || Number.isNaN(value) || Number.isNaN(previous)) {
    return { glyph: "→", label: "steady", className: "steady" };
  }
  const delta = value - previous;
  if (Math.abs(delta) <= tolerance) return { glyph: "→", label: "steady", className: "steady" };
  return delta > 0 ? { glyph: "↑", label: "rising", className: "up" } : { glyph: "↓", label: "falling", className: "down" };
}

function weatherConditionFor(code) {
  if (code === 0) return { key: "sun", label: "Sunny" };
  if (code === 1) return { key: "sun", label: "Mainly clear" };
  if (code === 2) return { key: "partly", label: "Partly cloudy" };
  if (code === 3) return { key: "cloud", label: "Overcast" };
  if (code === 45 || code === 48) return { key: "fog", label: "Fog" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { key: "rain", label: "Rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { key: "snow", label: "Snow" };
  if (code >= 95) return { key: "storm", label: "Thunder" };
  return { key: "cloud", label: "Cloudy" };
}

function buildWeatherAlerts(data, current, next24, next24p) {
  const alerts = [];
  const gust = current?.wind_gusts_10m ?? 0;
  const rain24 = next24.reduce((sum, value) => sum + (value || 0), 0);
  const peakChance = Math.max(0, ...next24p);
  const minTemp = Math.min(...(data?.daily?.temperature_2m_min || [99]).slice(0, 2));
  const codes = [
    current?.weather_code,
    ...(data?.hourly?.weather_code || []).slice(0, 12),
    ...(data?.daily?.weather_code || []).slice(0, 3),
  ].filter((code) => code != null);

  if (codes.some((code) => code >= 95)) alerts.push({ level: "high", label: "Thunder risk" });
  if (gust >= 45) alerts.push({ level: "high", label: "High gusts" });
  else if (gust >= 32) alerts.push({ level: "watch", label: "Gusty" });
  if (rain24 >= 12 || peakChance >= 85) alerts.push({ level: "watch", label: "Wet spell" });
  if (minTemp <= 2) alerts.push({ level: "watch", label: "Cold night" });
  return alerts.slice(0, 3);
}

function withTimeout(promise, timeoutMs, message = "Request timed out") {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]).finally(() => window.clearTimeout(timer));
}

export const Mobile = () => {
  const [data, setData] = useState(AW_FALLBACK);
  const [mobileLocation, setMobileLocation] = useState(AW_LOCATION);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [savedLocations, setSavedLocations] = useState([]);
  const [mobilePrefs, setMobilePrefs] = useState({ startupLocationMode: "gps" });
  const [reportStatus, setReportStatus] = useState("");
  const [locationStatus, setLocationStatus] = useState("Locating…");
  const [isRefreshingLocation, setIsRefreshingLocation] = useState(false);
  const [weatherFetchedAt, setWeatherFetchedAt] = useState(null);
  const [locationFixAt, setLocationFixAt] = useState(null);
  const [weatherSource, setWeatherSource] = useState("local");
  const [gpsFallbackAvailable, setGpsFallbackAvailable] = useState(false);
  const [nowTick, setNowTick] = useState(null);
  const [expandedDayIdx, setExpandedDayIdx] = useState(null);
  const [hasMounted, setHasMounted] = useState(false);
  const startupLoadStartedRef = useRef(false);
  const c = data.current;
  const tHi = Math.max(...data.hourly.temperature_2m.slice(24, 48));
  const tLo = Math.min(...data.hourly.temperature_2m.slice(24, 48));
  const obsTime = c.time || "15:00";

  const nowIdx = 27;
  const next24 = data.hourly.precipitation.slice(nowIdx, nowIdx + 24);
  const next24p = data.hourly.precipitation_probability.slice(nowIdx, nowIdx + 24);
  const sum24 = next24.reduce((a, b) => a + b, 0);
  const peakP = Math.max(...next24p);

  const d = data.daily;
  const days7 = Array.from({ length: 7 }, (_, i) => ({
    d: d.weekday[7 + i], dt: d.date[7 + i],
    hi: d.temperature_2m_max[7 + i], lo: d.temperature_2m_min[7 + i],
    rain: d.precipitation_sum[7 + i], pct: d.precipitation_probability_max[7 + i],
    wind: d.wind_speed_10m_max[7 + i], wdir: d.wind_direction_10m_dominant[7 + i],
    code: d.weather_code[7 + i],
    dailyIdx: 7 + i,
    dateIso: d.time?.[7 + i] || null,
    sunrise: d.sunrise?.[7 + i] || null,
    sunset: d.sunset?.[7 + i] || null,
  }));
  const minLo = Math.min(...days7.map(x => x.lo));
  const maxHi = Math.max(...days7.map(x => x.hi));

  const h = data.hourly;
  const soil = [
    { d: "0",  s: "Surface",  t: h.soil_temperature_0cm[nowIdx],  m: h.soil_moisture_0_to_1cm[nowIdx] },
    { d: "6",  s: "Topsoil",  t: h.soil_temperature_6cm[nowIdx],  m: h.soil_moisture_1_to_3cm[nowIdx] },
    { d: "18", s: "Root zone",t: h.soil_temperature_18cm[nowIdx], m: h.soil_moisture_3_to_9cm[nowIdx] },
    { d: "54", s: "Sub-soil", t: h.soil_temperature_54cm[nowIdx], m: h.soil_moisture_27_to_81cm[nowIdx] },
  ];
  const condition = weatherConditionFor(c.weather_code);
  const dayState = c.is_day === 0 ? "night" : "day";
  const effectiveNow = nowTick ?? 0;
  const weatherAge = weatherFetchedAt && nowTick ? nowTick - weatherFetchedAt : null;
  const fixAge = locationFixAt && nowTick ? nowTick - locationFixAt : null;
  const isStale = weatherAge != null && weatherAge > STALE_WEATHER_MS;
  const previousIdx = Math.max(0, nowIdx - 1);
  const tempTrend = trendFor(c.temperature_2m, h.temperature_2m[previousIdx]);
  const windTrend = trendFor(c.wind_speed_10m, h.wind_speed_10m[previousIdx], 0.8);
  const humidityTrend = trendFor(c.relative_humidity_2m, h.relative_humidity_2m[previousIdx], 1);
  const pressureTrend = trendFor(c.pressure_msl, h.pressure_msl[previousIdx], 0.4);
  const daylightRemaining = (() => {
    const sunset = d.sunset?.[7] || d.sunset?.[0];
    if (!sunset || c.is_day === 0) return c.is_day === 0 ? "Night" : "--";
    const [hours, minutes] = sunset.split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "--";
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    if (!nowTick) return "--";
    return formatAge(target.getTime() - effectiveNow);
  })();
  const weatherAlerts = buildWeatherAlerts(data, c, next24, next24p);
  const statusTone = isRefreshingLocation ? "loading" : isStale ? "stale" : weatherSource === "cached" ? "cached" : weatherSource === "live" ? "live" : "offline";

  useEffect(() => {
    setHasMounted(true);
    setNowTick(Date.now());
    setMobilePrefs(readMobilePrefs());
  }, []);

  useEffect(() => {
    let cancelled = false;
    awGetSavedLocations()
      .then((locs) => { if (!cancelled) setSavedLocations(locs); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(MOBILE_PREFS_KEY, JSON.stringify(mobilePrefs));
    } catch {
      // Preferences are best-effort.
    }
  }, [mobilePrefs]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sharedLat = parseFloat(params.get("lat") || "");
    const sharedLon = parseFloat(params.get("lon") || "");
    const sharedQuery = params.get("q");
    const cleanup = () => {
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, "", window.location.pathname);
      }
    };
    if (Number.isFinite(sharedLat) && Number.isFinite(sharedLon)) {
      const sharedName = params.get("name") || "Shared location";
      const sharedTz = params.get("tz") || "auto";
      const incoming = {
        name: sharedName, region: "", country: "",
        lat: sharedLat, lon: sharedLon, elev: null, tz: sharedTz,
      };
      loadLocation(incoming, "Opened shared");
      cleanup();
      return;
    }
    if (sharedQuery && sharedQuery.length >= 2) {
      searchMobileLocations(sharedQuery)
        .then((results) => { if (results[0]) loadLocation(results[0], "Opened shared"); })
        .catch(() => {})
        .finally(cleanup);
    }
  }, []);

  useEffect(() => {
    if (!hasMounted) return;
    if (startupLoadStartedRef.current) return;
    if (mobilePrefs.startupLocationMode === "saved" && savedLocations[0]) {
      startupLoadStartedRef.current = true;
      loadLocation(savedLocations[0], "Loaded");
      return;
    }
    if (mobilePrefs.startupLocationMode === "saved") return;

    startupLoadStartedRef.current = true;
    let cancelled = false;
    setIsRefreshingLocation(true);
    withTimeout(requestBrowserLocation(), 12000, "Location timed out")
      .then(async (loc) => {
        if (cancelled) return;
        setLocationStatus("Refreshing");
        const id = awLocationId(loc.lat, loc.lon);
        try {
          const live = await awFetchLive(loc.lat, loc.lon, undefined, loc.tz);
          if (cancelled) return;
          setData(mergeOpenMeteo(AW_FALLBACK, live));
          setMobileLocation(loc);
          setLocationStatus(`Located ${loc.name}`);
          setWeatherFetchedAt(Date.now());
          setLocationFixAt(Date.now());
          setWeatherSource("live");
          awSetCachedPayload(id, "openmeteo", live).catch(() => {});
        } catch {
          if (cancelled) return;
          const cached = await awGetCachedPayload(id, "openmeteo");
          if (cached && cached.payload) {
            setData(mergeOpenMeteo(AW_FALLBACK, cached.payload));
            setMobileLocation(loc);
            const ageMin = Math.round((Date.now() - cached.fetchedAt) / 60000);
            setWeatherFetchedAt(cached.fetchedAt);
            setLocationFixAt(Date.now());
            setWeatherSource("cached");
            setLocationStatus(`Offline copy · ${ageMin} min old`);
          } else {
            setLocationStatus("Located, but live data unavailable");
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLocationStatus(err && err.code === 1 ? "Location permission denied" : "Location unavailable");
        setGpsFallbackAvailable(savedLocations.length > 0);
      })
      .finally(() => {
        if (!cancelled) setIsRefreshingLocation(false);
      });
    return () => { cancelled = true; };
  }, [hasMounted, mobilePrefs.startupLocationMode, savedLocations]);

  async function loadLocation(location, reason = "Loaded") {
    setGpsFallbackAvailable(false);
    setIsRefreshingLocation(true);
    setLocationStatus("Refreshing");
    const id = awLocationId(location.lat, location.lon);
    try {
      const live = await awFetchLive(location.lat, location.lon, undefined, location.tz);
      setData(mergeOpenMeteo(AW_FALLBACK, live));
      setMobileLocation(location);
      setQuery("");
      setSuggestions([]);
      setLocationStatus(`${reason} ${location.name}`);
      setWeatherFetchedAt(Date.now());
      setWeatherSource("live");
      awSetCachedPayload(id, "openmeteo", live).catch(() => {});
    } catch {
      const cached = await awGetCachedPayload(id, "openmeteo");
      if (cached && cached.payload) {
        setData(mergeOpenMeteo(AW_FALLBACK, cached.payload));
        setMobileLocation(location);
        const ageMin = Math.round((Date.now() - cached.fetchedAt) / 60000);
        setWeatherFetchedAt(cached.fetchedAt);
        setWeatherSource("cached");
        setLocationStatus(`Offline copy · ${ageMin} min old`);
      } else {
        setLocationStatus("Could not refresh");
      }
    } finally {
      setIsRefreshingLocation(false);
    }
  }

  async function refreshCurrentLocation(reason = "Updated") {
    setGpsFallbackAvailable(false);
    setIsRefreshingLocation(true);
    setLocationStatus("Detecting location");
    try {
      const loc = await withTimeout(requestBrowserLocation(), 12000, "Location timed out");
      setLocationFixAt(Date.now());
      await loadLocation(loc, reason);
      return true;
    } catch (err) {
      setLocationStatus(err && err.code === 1 ? "Location permission denied" : "Location unavailable");
      setGpsFallbackAvailable(savedLocations.length > 0);
      setIsRefreshingLocation(false);
      return false;
    }
  }

  async function submitLocationSearch(event) {
    event.preventDefault();
    if (query.trim().length < 2) {
      setLocationStatus("Type a place");
      return;
    }
    setLocationStatus("Searching");
    try {
      const results = await searchMobileLocations(query.trim());
      setSuggestions(results);
      setLocationStatus(results.length ? "Select a result" : "No location found");
    } catch {
      setLocationStatus("Search unavailable");
    }
  }

  function saveMobileLocation(location = mobileLocation) {
    const id = awLocationId(location.lat, location.lon);
    setSavedLocations((previous) => {
      const exists = previous.some((item) => awLocationId(item.lat, item.lon) === id);
      if (exists) {
        setLocationStatus("Already saved");
        return previous;
      }
      setLocationStatus(`Saved ${location.name}`);
      const record = { ...location, id, pinnedAt: Date.now() };
      awAddSavedLocation(record).catch(() => {});
      return [record, ...previous].slice(0, 8);
    });
  }

  function removeMobileLocation(location) {
    const id = awLocationId(location.lat, location.lon);
    setSavedLocations((previous) => previous.filter((item) => awLocationId(item.lat, item.lon) !== id));
    awRemoveSavedLocation(id).catch(() => {});
    setLocationStatus(`Removed ${location.name}`);
  }

  return (
    <div className="aw2 aw2-mobile" data-screen-label="02 Mobile PWA">
      <InstallPrompt />
      <header className="aw2-m-head">
        <div className="row">
          <div className="mark">AceWeather</div>
          <div className="aw2-m-head-right">
            <UpdateNotice />
            <div className={`sub aw2-m-source ${statusTone}`}>{weatherSource === "live" ? "LIVE" : weatherSource === "cached" ? "CACHED" : "LOCAL"} Â· {obsTime} BST</div>
          </div>
        </div>
        <div className="row">
          <div className="loc">{mobileLocation.name}</div>
          <div className="obs">
            {[mobileLocation.region, mobileLocation.elev ? `${Math.round(mobileLocation.elev)} m` : null].filter(Boolean).join(" · ")}
          </div>
        </div>
        <div className="aw2-m-freshness" aria-label="Forecast freshness">
          <span className={isStale ? "stale" : ""}>Weather {!hasMounted || weatherAge == null ? "--" : formatAge(weatherAge)} old</span>
          <span>Fix {!hasMounted || fixAge == null ? "--" : formatAge(fixAge)} old</span>
          <b>{!hasMounted ? "--" : isStale ? "Stale" : "Fresh"}</b>
        </div>
        <ReportAction status={reportStatus} onShare={() => shareWeatherReport(setReportStatus, mobileLocation)} compact />
        <form className="aw2-m-location-search" onSubmit={submitLocationSearch}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search location"
            aria-label="Search location"
          />
          <button type="submit">Search</button>
          <button className={isRefreshingLocation ? "is-loading" : ""} type="button" onClick={() => refreshCurrentLocation("Updated")} aria-label="Refresh current location" disabled={isRefreshingLocation}>
            {isRefreshingLocation ? "Fixing" : "Refresh"}
          </button>
          <button type="button" onClick={() => saveMobileLocation()}>Save</button>
        </form>
        <div className="aw2-m-startup-mode" role="group" aria-label="Startup location mode">
          <button type="button" aria-pressed={mobilePrefs.startupLocationMode === "gps"} onClick={() => setMobilePrefs({ startupLocationMode: "gps" })}>GPS launch</button>
          <button type="button" aria-pressed={mobilePrefs.startupLocationMode === "saved"} onClick={() => setMobilePrefs({ startupLocationMode: "saved" })}>Saved launch</button>
        </div>
        <div className="aw2-m-location-status" role="status" aria-live="polite">{locationStatus}</div>
        {gpsFallbackAvailable && savedLocations[0] ? (
          <button className="aw2-m-fallback" type="button" onClick={() => loadLocation(savedLocations[0], "Loaded")}>
            Use {savedLocations[0].name}
          </button>
        ) : null}
        <MobileLocationLists
          suggestions={suggestions}
          savedLocations={savedLocations}
          onPick={loadLocation}
          onRemove={removeMobileLocation}
        />
        <div className="aw2-m-quick-actions">
          <button type="button" onClick={() => shareWeatherReport(setReportStatus, mobileLocation)}>Copy report</button>
          <button type="button" onClick={() => saveMobileLocation()}>Save</button>
          <button type="button" onClick={() => refreshCurrentLocation("Updated")} disabled={isRefreshingLocation}>GPS</button>
          {savedLocations[0] ? <button type="button" onClick={() => loadLocation(savedLocations[0], "Loaded")}>Saved</button> : null}
        </div>
      </header>

      <section className={`aw2-m-now ${condition.key} ${dayState} ${statusTone}`}>
        <NowFx code={c.weather_code} isDay={c.is_day} />
        <div className="aw2-m-now-temp">
          <div className="num">{fmt0(c.temperature_2m)}</div>
          <div className="deg">°C</div>
          <span className={`aw2-trend ${tempTrend.className}`} aria-label={`Temperature ${tempTrend.label}`}>{tempTrend.glyph}</span>
        </div>
        {weatherAlerts.length ? (
          <div className="aw2-m-alerts">
            {weatherAlerts.map((alert) => <span key={alert.label} className={alert.level}>{alert.label}</span>)}
          </div>
        ) : null}
        <div className="aw2-m-now-hilo">
          <div className="hi">High <b>{Math.round(tHi)}°</b></div>
          <div className="lo">Low <b>{Math.round(tLo)}°</b></div>
          <div>Feels {fmt0(c.apparent_temperature)}°</div>
        </div>
        <div className="aw2-m-condition-strip">
          <div><span>Now</span><b>{condition.label}</b></div>
          <div><span>Rain 3h</span><b>{next24.slice(0, 3).reduce((a, b) => a + b, 0).toFixed(1)}mm</b></div>
          <div><span>Gust</span><b>{fmt0(c.wind_gusts_10m)} km/h</b></div>
          <div><span>Light</span><b>{daylightRemaining}</b></div>
        </div>
        <div className="aw2-m-now-chips">
          <div className="aw2-m-now-chip"><div className="k">Wind</div><div className="v">{fmt0(c.wind_speed_10m)}<small>km/h</small><span className={`aw2-trend ${windTrend.className}`}>{windTrend.glyph}</span></div></div>
          <div className="aw2-m-now-chip"><div className="k">Pressure</div><div className="v">{fmt0(c.pressure_msl)}<small>hPa</small><span className={`aw2-trend ${pressureTrend.className}`}>{pressureTrend.glyph}</span></div></div>
          <div className="aw2-m-now-chip"><div className="k">RH</div><div className="v">{fmt0(c.relative_humidity_2m)}<small>%</small><span className={`aw2-trend ${humidityTrend.className}`}>{humidityTrend.glyph}</span></div></div>
          <div className="aw2-m-now-chip"><div className="k">Cloud</div><div className="v">{fmt0(c.cloud_cover)}<small>%</small></div></div>
          <LunarChip />
        </div>
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>Now vs normal</b><span>CLIMATOLOGY</span></div>
        <AnomalyChips data={data} />
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>Rainfall · next 24h</b><span>+0 → +24h</span></div>
        <div className="aw2-m-rain">
          <div className="aw2-m-rain-cell">
            <div className="k">Total</div>
            <div className={"v" + (sum24 < 0.1 ? " dry" : "")}>{sum24.toFixed(1)}<small>mm</small></div>
            <div className="sub">Across 24h</div>
          </div>
          <div className="aw2-m-rain-cell">
            <div className="k">Peak chance</div>
            <div className={"v" + (peakP < 20 ? " dry" : "")}>{peakP}<small>%</small></div>
            <div className="sub">Highest hour</div>
          </div>
          <MobileRainChart next24={next24} next24p={next24p} />
        </div>
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>My rain gauge</b><span>MANUAL · {mobileLocation.name?.toUpperCase()}</span></div>
        <RainGauge location={mobileLocation} />
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>7-day outlook</b><span>HI · LO · MM</span></div>
        <div className="aw2-m-7">
          {days7.map((day, i) => {
            const segL = ((day.lo - minLo) / (maxHi - minLo)) * 100;
            const segR = ((day.hi - minLo) / (maxHi - minLo)) * 100;
            const isOpen = expandedDayIdx === i;
            return (
              <div key={i} className={"aw2-m-7-item" + (isOpen ? " open" : "")}>
                <button type="button" className="aw2-m-7-row"
                  onClick={() => setExpandedDayIdx(isOpen ? null : i)}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Collapse" : "Expand"} detailed forecast for ${day.d} ${day.dt}`}>
                  <div className="d">{i === 0 ? "TODAY" : day.d}<b>{day.dt}</b></div>
                  <WeatherIcon code={day.code} />
                  <div className="bar"><div className="seg" style={{ left: segL + "%", width: (segR - segL) + "%" }}/></div>
                  <div className={"rain" + (day.rain < 0.1 ? " dry" : "")}>
                    <span>{day.rain < 0.1 ? "·" : day.rain.toFixed(1) + "mm"}</span>
                    <span className="pct">{day.pct}%</span>
                  </div>
                  <div className="temps">
                    <span>{Math.round(day.hi)}°</span>
                    <span className="sep"> / </span>
                    <span className="lo">{Math.round(day.lo)}°</span>
                  </div>
                </button>
                {isOpen ? (
                  <DayDetail day={day} hourly={data.hourly} location={mobileLocation} onClose={() => setExpandedDayIdx(null)} />
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>Soil · multi-depth</b><span>NOW</span></div>
        <div className="aw2-m-soil">
          {soil.map((s, i) => {
            const moistPct = Math.round(s.m * 100);
            return (
              <div key={i} className="aw2-m-soil-row">
                <div className="d">{s.s}<b>{s.d} cm</b></div>
                <div className="meter"><div className="meter-fill" style={{ width: moistPct + "%" }}/></div>
                <div className="moist">{moistPct}<small>%</small></div>
                <div className="temp">{fmt1(s.t)}<small>°C</small></div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>Seasonal difference</b><span>vs 30-Y norm</span></div>
        <div className="aw2-m-climate"><ClimatePanel data={data}/></div>
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>Live radar</b><span>RainViewer · −2h → +30m</span></div>
        <div className="aw2-m-radar"><RadarLive location={mobileLocation} height={280}/></div>
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>Model comparison</b><span>NEXT 7 DAYS</span></div>
        <ModelCompare location={mobileLocation} />
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>On this day</b><span>HISTORY · ERA5</span></div>
        <OnThisDay location={mobileLocation} />
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>Active tropical systems</b><span>NHC · JTWC</span></div>
        <TropicalPanel />
      </section>

      <section className="aw2-m-section">
        <div className="h"><b>Wind today</b><span>10 m AGL</span></div>
        <MobileWindDial current={c} />
      </section>

      <footer className="aw2-m-foot">
        Open-Meteo · ECMWF · UKMO · Updated {obsTime}
      </footer>

    </div>
  );
};
