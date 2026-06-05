// @ts-nocheck
"use client";

import { useEffect, useState } from "react";

import { dirToCompass, fmt0, fmt1, requestBrowserLocation } from "./helpers";
import { awFetchLive, mergeOpenMeteo } from "./open-meteo";
import { ReportAction, shareWeatherReport } from "./report-action";
import { AW_FALLBACK, AW_LOCATION } from "./sample-data";
import { Stat } from "./stat";
import { AnomalyChips } from "./panels/anomaly-chips";
import { ClimatePanel } from "./panels/climate-panel";
import { FortnightStrip } from "./panels/fortnight-strip";
import { FrostPanel } from "./panels/frost-panel";
import { Meteogram } from "./panels/meteogram";
import { ModelCompare } from "./panels/model-compare";
import { OnThisDay } from "./panels/on-this-day";
import { RadarLive } from "./panels/radar-live";
import { TropicalPanel } from "./panels/tropical";
import { RainPanel } from "./panels/rain-panel";
import { SoilProfile } from "./panels/soil-profile";
import { SunPath } from "./panels/sun-path";

export const Desktop = () => {
  const [data, setData] = useState(AW_FALLBACK);
  const [live, setLive] = useState(null);
  const [reportStatus, setReportStatus] = useState("");
  const [desktopLocation, setDesktopLocation] = useState(AW_LOCATION);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches) {
      return;
    }
    let cancelled = false;
    setLive("loading");
    requestBrowserLocation()
      .then(async (loc) => {
        if (cancelled) return;
        setDesktopLocation(loc);
        try {
          const json = await awFetchLive(loc.lat, loc.lon, undefined, loc.tz);
          if (cancelled) return;
          setData(mergeOpenMeteo(AW_FALLBACK, json));
          setLive("live");
        } catch {
          if (!cancelled) setLive("offline");
        }
      })
      .catch(() => { if (!cancelled) setLive("offline"); });
    return () => { cancelled = true; };
  }, []);

  const c = data.current;
  const tHi = Math.max(...data.hourly.temperature_2m.slice(24, 48));
  const tLo = Math.min(...data.hourly.temperature_2m.slice(24, 48));

  const now = new Date();
  const obsTime = c.time || now.toTimeString().slice(0, 5);
  const dateLong = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="aw2 aw2-desktop" data-screen-label="01 Desktop · Mission Control">
      <header className="aw2-masthead">
        <div className="aw2-mast-brand">
          <span className="mark">AceWeather</span>
          <span className="sub">Mk III · Synoptic</span>
        </div>
        <div className="aw2-mast-meta">
          <div>LAT <b>{Math.abs(desktopLocation.lat).toFixed(4)}° {desktopLocation.lat >= 0 ? "N" : "S"}</b></div>
          <div>LON <b>{Math.abs(desktopLocation.lon).toFixed(4)}° {desktopLocation.lon >= 0 ? "E" : "W"}</b></div>
          {desktopLocation.elev != null ? <div>ELEV <b>{Math.round(desktopLocation.elev)} m</b></div> : null}
          <div>OBS <b>{obsTime}</b></div>
        </div>
        <div className="aw2-mast-search">
          <span style={{ color: "var(--muted)" }}>⌕</span>
          <input placeholder="Search location" defaultValue={[desktopLocation.name, desktopLocation.region].filter(Boolean).join(", ")} key={`${desktopLocation.lat}-${desktopLocation.lon}`} />
        </div>
        <ReportAction status={reportStatus} onShare={() => shareWeatherReport(setReportStatus, desktopLocation)} compact />
      </header>

      <section className="aw2-hero">
        <div className="aw2-hero-temp">
          <span className="num">{fmt0(c.temperature_2m)}</span>
          <span className="deg">°C</span>
          <div className="meta">
            <span>Feels <b className="feels">{fmt0(c.apparent_temperature)}°</b></span>
            <span>Hi <b>{Math.round(tHi)}°</b> · Lo <b>{Math.round(tLo)}°</b></span>
            <span>{dateLong}</span>
          </div>
        </div>
        <div className="aw2-hero-stats">
          <Stat k="Wind"     v={fmt0(c.wind_speed_10m)}  u="km/h"  sub={`${dirToCompass(c.wind_direction_10m)} · ${c.wind_direction_10m}°`}/>
          <Stat k="Gust"     v={fmt0(c.wind_gusts_10m)}  u="km/h"  sub="10-min max"/>
          <Stat k="Humidity" v={fmt0(c.relative_humidity_2m)} u="%"sub={`Dew ${fmt1(c.dew_point_2m)}°`}/>
          <Stat k="Pressure" v={fmt0(c.pressure_msl)}    u="hPa"   sub="MSL · steady"/>
          <Stat k="Cloud"    v={fmt0(c.cloud_cover)}     u="%"     sub="Overcast"/>
          <Stat k="Vis"      v={fmt1(c.visibility_km)}   u="km"    sub="Good"/>
          <Stat k="UV"       v={fmt1(c.uv_index)}        u=""      sub="Moderate"/>
        </div>
      </section>

      <AnomalyChips data={data} />

      <div className="aw2-mid">
        <div className="aw2-mid-left aw2-panel">
          <div className="aw2-panel-head">
            <span className="num">02</span>
            <span className="title">Meteogram · −12h → +24h</span>
            <span className="right">TEMP · PRECIP · WIND · CLOUD/RH · PRESSURE</span>
          </div>
          <Meteogram data={data} width={900} height={320}/>
        </div>
        <div className="aw2-mid-right">
          <div className="aw2-panel" style={{ borderBottom: "1px solid var(--rule)" }}>
            <div className="aw2-panel-head">
              <span className="num">03</span>
              <span className="title">Rainfall</span>
              <span className="right">FORECAST · PAST 7D · NEXT 7D</span>
            </div>
            <RainPanel data={data}/>
          </div>
          <div className="aw2-panel">
            <div className="aw2-panel-head">
              <span className="num">04</span>
              <span className="title">Frost overnight · {desktopLocation.name}</span>
              <span className="right">AIR · GRASS · 0° REFERENCE</span>
            </div>
            <FrostPanel data={data}/>
          </div>
        </div>
      </div>

      <div className="aw2-panel aw2-outlook-panel">
        <div className="aw2-panel-head">
          <span className="num">05</span>
          <span className="title">14-day outlook</span>
          <span className="right">HI · LO · MM · CHANCE · WIND</span>
        </div>
        <FortnightStrip data={data}/>
      </div>

      <div className="aw2-row">
        <div className="aw2-panel tight">
          <div className="aw2-panel-head">
            <span className="num">06</span>
            <span className="title">Soil profile</span>
            <span className="right">T · MOISTURE</span>
          </div>
          <SoilProfile data={data}/>
        </div>
        <div className="aw2-panel tight">
          <div className="aw2-panel-head">
            <span className="num">07</span>
            <span className="title">Sun · DLI</span>
            <span className="right">{data.daily.sunrise[7]} → {data.daily.sunset[7]}</span>
          </div>
          <SunPath data={data}/>
        </div>
        <div className="aw2-panel tight">
          <div className="aw2-panel-head">
            <span className="num">08</span>
            <span className="title">Live radar</span>
            <span className="right">RAINVIEWER · −2h → +30m</span>
          </div>
          <RadarLive location={desktopLocation} height={260}/>
        </div>
        <div className="aw2-panel tight">
          <div className="aw2-panel-head">
            <span className="num">09</span>
            <span className="title">Climate · {data.climate.month_label}</span>
            <span className="right">vs 30-Y NORM</span>
          </div>
          <ClimatePanel data={data}/>
        </div>
      </div>

      <div className="aw2-panel">
        <div className="aw2-panel-head">
          <span className="num">10</span>
          <span className="title">Model comparison · next 7 days</span>
          <span className="right">ECMWF · GFS · ICON · UKMO</span>
        </div>
        <ModelCompare location={desktopLocation}/>
      </div>

      <div className="aw2-panel">
        <div className="aw2-panel-head">
          <span className="num">11</span>
          <span className="title">On this day · {desktopLocation.name}</span>
          <span className="right">ERA5 ARCHIVE · BACK TO 1940</span>
        </div>
        <OnThisDay location={desktopLocation}/>
      </div>

      <div className="aw2-panel">
        <div className="aw2-panel-head">
          <span className="num">12</span>
          <span className="title">Active tropical systems</span>
          <span className="right">NHC · JTWC</span>
        </div>
        <TropicalPanel />
      </div>

      <footer className="aw2-foot">
        <span className="sources">SOURCE · <b>Open-Meteo</b> · ECMWF · UKMO · ERA5 · CMIP6</span>
        <span>Updated {obsTime} · {[desktopLocation.name, desktopLocation.region].filter(Boolean).join(", ")}</span>
        <span className={"live " + (live === "offline" ? "offline" : "")}>
          {live === "live" ? "LIVE" : live === "loading" ? "LOCATING" : live === "offline" ? "OFFLINE" : "OFFLINE"}
        </span>
      </footer>
    </div>
  );
};
