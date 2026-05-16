// @ts-nocheck
"use client";

import { useEffect, useState } from "react";

import {
  addSavedLocation as awAddSavedLocation,
  getCachedPayload as awGetCachedPayload,
  getSavedLocations as awGetSavedLocations,
  locationId as awLocationId,
  removeSavedLocation as awRemoveSavedLocation,
  setCachedPayload as awSetCachedPayload,
} from "@/lib/store";

import { DayDetail } from "./day-detail";
import { dirToCompass, fmt0, fmt1, requestBrowserLocation, searchMobileLocations } from "./helpers";
import { WeatherIcon } from "./icons";
import { MobileRainChart } from "./mobile-rain-chart";
import { MobileWindDial } from "./mobile-wind-dial";
import { awFetchLive, mergeOpenMeteo } from "./open-meteo";
import { AnomalyChips } from "./panels/anomaly-chips";
import { ClimatePanel } from "./panels/climate-panel";
import { RadarLive } from "./panels/radar-live";
import { ReportAction, shareWeatherReport } from "./report-action";
import { AW_FALLBACK, AW_LOCATION } from "./sample-data";
import { UpdateNotice } from "./update-notice";

export const Mobile = () => {
  const [data, setData] = useState(AW_FALLBACK);
  const [mobileLocation, setMobileLocation] = useState(AW_LOCATION);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [savedLocations, setSavedLocations] = useState([]);
  const [reportStatus, setReportStatus] = useState("");
  const [locationStatus, setLocationStatus] = useState("Locating…");
  const [selectedDay, setSelectedDay] = useState(null);
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

  useEffect(() => {
    let cancelled = false;
    awGetSavedLocations()
      .then((locs) => { if (!cancelled) setSavedLocations(locs); })
      .catch(() => {});
    return () => { cancelled = true; };
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
    let cancelled = false;
    requestBrowserLocation()
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
          awSetCachedPayload(id, "openmeteo", live).catch(() => {});
        } catch {
          if (cancelled) return;
          const cached = await awGetCachedPayload(id, "openmeteo");
          if (cached && cached.payload) {
            setData(mergeOpenMeteo(AW_FALLBACK, cached.payload));
            setMobileLocation(loc);
            const ageMin = Math.round((Date.now() - cached.fetchedAt) / 60000);
            setLocationStatus(`Offline copy · ${ageMin} min old`);
          } else {
            setLocationStatus("Located, but live data unavailable");
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLocationStatus(err && err.code === 1 ? "Location permission denied" : "Location unavailable");
      });
    return () => { cancelled = true; };
  }, []);

  async function loadLocation(location, reason = "Loaded") {
    setLocationStatus("Refreshing");
    const id = awLocationId(location.lat, location.lon);
    try {
      const live = await awFetchLive(location.lat, location.lon, undefined, location.tz);
      setData(mergeOpenMeteo(AW_FALLBACK, live));
      setMobileLocation(location);
      setQuery("");
      setSuggestions([]);
      setLocationStatus(`${reason} ${location.name}`);
      awSetCachedPayload(id, "openmeteo", live).catch(() => {});
    } catch {
      const cached = await awGetCachedPayload(id, "openmeteo");
      if (cached && cached.payload) {
        setData(mergeOpenMeteo(AW_FALLBACK, cached.payload));
        setMobileLocation(location);
        const ageMin = Math.round((Date.now() - cached.fetchedAt) / 60000);
        setLocationStatus(`Offline copy · ${ageMin} min old`);
      } else {
        setLocationStatus("Could not refresh");
      }
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
      <header className="aw2-m-head">
        <div className="row">
          <div className="mark">AceWeather</div>
          <div className="aw2-m-head-right">
            <UpdateNotice />
            <div className="sub">{obsTime} BST</div>
          </div>
        </div>
        <div className="row">
          <div className="loc">{mobileLocation.name}</div>
          <div className="obs">
            {[mobileLocation.region, mobileLocation.elev ? `${Math.round(mobileLocation.elev)} m` : null].filter(Boolean).join(" · ")}
          </div>
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
          <button type="button" onClick={() => loadLocation(mobileLocation, "Updated")} aria-label="Refresh selected location">Refresh</button>
          <button type="button" onClick={() => saveMobileLocation()}>Save</button>
        </form>
        <div className="aw2-m-location-status" role="status" aria-live="polite">{locationStatus}</div>
        {suggestions.length ? (
          <div className="aw2-m-location-suggestions">
            {suggestions.map((location) => (
              <button key={`${location.lat}-${location.lon}`} type="button" onClick={() => loadLocation(location)}>
                <span>{location.name}</span>
                <small>{[location.region, location.country].filter(Boolean).join(", ")}</small>
              </button>
            ))}
          </div>
        ) : null}
        {savedLocations.length ? (
          <div className="aw2-m-saved-locations" aria-label="Saved locations">
            {savedLocations.map((location) => (
              <span key={`${location.lat}-${location.lon}`} className="aw2-m-saved-pill">
                <button type="button" onClick={() => loadLocation(location)}>
                  {location.name}
                </button>
                <button
                  type="button"
                  className="aw2-m-saved-remove"
                  aria-label={`Remove ${location.name}`}
                  onClick={() => removeMobileLocation(location)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <section className="aw2-m-now">
        <div className="aw2-m-now-temp">
          <div className="num">{fmt0(c.temperature_2m)}</div>
          <div className="deg">°C</div>
        </div>
        <div className="aw2-m-now-hilo">
          <div className="hi">High <b>{Math.round(tHi)}°</b></div>
          <div className="lo">Low <b>{Math.round(tLo)}°</b></div>
          <div>Feels {fmt0(c.apparent_temperature)}°</div>
        </div>
        <div className="aw2-m-now-chips">
          <div className="aw2-m-now-chip"><div className="k">Wind</div><div className="v">{fmt0(c.wind_speed_10m)}<small>km/h</small></div></div>
          <div className="aw2-m-now-chip"><div className="k">Dir</div><div className="v">{dirToCompass(c.wind_direction_10m)}</div></div>
          <div className="aw2-m-now-chip"><div className="k">RH</div><div className="v">{fmt0(c.relative_humidity_2m)}<small>%</small></div></div>
          <div className="aw2-m-now-chip"><div className="k">Cloud</div><div className="v">{fmt0(c.cloud_cover)}<small>%</small></div></div>
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
        <div className="h"><b>7-day outlook</b><span>HI · LO · MM</span></div>
        <div className="aw2-m-7">
          {days7.map((day, i) => {
            const segL = ((day.lo - minLo) / (maxHi - minLo)) * 100;
            const segR = ((day.hi - minLo) / (maxHi - minLo)) * 100;
            return (
              <button key={i} type="button" className="aw2-m-7-row"
                onClick={() => setSelectedDay(day)}
                aria-label={`Open detailed forecast for ${day.d} ${day.dt}`}>
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
        <div className="h"><b>Wind today</b><span>10 m AGL</span></div>
        <MobileWindDial current={c} />
      </section>

      <footer className="aw2-m-foot">
        Open-Meteo · ECMWF · UKMO · Updated {obsTime}
      </footer>

      {selectedDay ? (
        <DayDetail
          day={selectedDay}
          hourly={data.hourly}
          location={mobileLocation}
          onClose={() => setSelectedDay(null)}
        />
      ) : null}
    </div>
  );
};
