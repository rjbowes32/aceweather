// Fake open observation upstreams: MeteoGate E-SOH, aviationweather.gov METAR, COSMOS-UK and the Environment Agency rainfall API.
const HOUR = 3600_000;
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
const lastFullHour = (now) => Math.floor(now / HOUR) * HOUR;

/** Station catalogue around Pocklington (53.93, -0.78). Distances are approximate. */
export const ESOH_STATIONS = [
  { id: "0-20000-0-03382", name: "LECONFIELD", lon: -0.44176, lat: 53.87459, kind: "synop", temp: 14.6, dew: 7.9, rh: 64, pmsl: 1018.3, ws: 6, gust10: 12.4, gust1h: 15.4, dir: 260 },
  { id: "0-20000-0-03292", name: "BRIDLINGTON_MRSC", lon: -0.17585, lat: 54.09397, kind: "synop", temp: 14.7, dew: 6.9, rh: 59, pmsl: 1017.1, ws: 9, gust10: 14, gust1h: 15.9, dir: 250 },
  { id: "0-20000-0-03281", name: "FYLINGDALES", lon: -0.67166, lat: 54.35873, kind: "synop", temp: 11.7, dew: 6.8, rh: 72, pmsl: null, ws: 8.8, gust10: 15, gust1h: 16.9, dir: 240 },
  { id: "0-20000-0-03999", name: "OUTLIER_TEST_SITE", lon: -0.95, lat: 53.99, kind: "synop", temp: 24.9, dew: 7, rh: 30, pmsl: 1018, ws: 5, gust10: 8, gust1h: 9, dir: 250 },
  { id: "0-20000-0-99214", name: "HULL,_EAST_PARK_AUTO", lon: -0.29807, lat: 53.76581, kind: "aws", temp: 17.8, dew: 6.5, rh: 47 },
  { id: "0-20000-0-03265", name: "TOPCLIFFE", lon: -1.39013, lat: 54.20471, kind: "synop", temp: 11.9, dew: 8, rh: 77, pmsl: 1019, ws: 1.5, gust10: 3.1, gust1h: 4, dir: 200 },
  { id: "0-826-0-244", name: "TOPCLIFFE", lon: -1.39013, lat: 54.20471, kind: "national", temp: 12.1, dew: 8.1, rh: 76, pmsl: 1019.2, ws: 1.6, gust10: 3, dir: 205 },
];

const axes = (s, times) => ({ x: { values: [s.lon] }, y: { values: [s.lat] }, t: { values: times } });
const range = (values) => ({ axisNames: ["t"], dataType: "float", shape: [values.length], type: "NdArray", values });

/** CoverageJSON like the live radius endpoint: one coverage per (station, time axis), several ranges each. */
export function esohRadiusFixture(params, now) {
  const names = (params.get("standard_name") ?? "").split(",");
  const rainOnly = names.length === 1 && names[0] === "precipitation_amount";
  const latest = lastFullHour(now);
  const coverages = [];
  for (const s of ESOH_STATIONS) {
    const stale = s.kind === "aws";
    const end = stale ? latest - 3 * HOUR : latest;
    if (rainOnly) {
      if (s.kind === "national") {
        const times = Array.from({ length: 144 }, (_, i) => iso(end - (143 - i) * 10 * 60_000));
        coverages.push({ type: "Coverage", domain: { type: "Domain", axes: axes(s, times) }, ranges: { "precipitation_amount:2.0:point:PT10M": range(times.map((_, i) => (i % 72 === 0 ? 0.3 : 0))) }, "metocean:wigosId": s.id });
      } else {
        const times = Array.from({ length: stale ? 8 : 24 }, (_, i) => iso(end - ((stale ? 7 : 23) - i) * HOUR));
        coverages.push({ type: "Coverage", domain: { type: "Domain", axes: axes(s, times) }, ranges: { "precipitation_amount:0.0:sum:PT1H": range(times.map((_, i) => (i % 6 === 0 ? 0.4 : 0))) }, "metocean:wigosId": s.id });
        coverages.push({ type: "Coverage", domain: { type: "Domain", axes: axes(s, [iso(end - 11 * HOUR)]) }, ranges: { "precipitation_amount:0.0:sum:PT24H": range([2.2]) }, "metocean:wigosId": s.id });
      }
      continue;
    }
    const times = stale ? [iso(end)] : [iso(end - 2 * HOUR), iso(end - HOUR), iso(end)];
    const fill = (v) => times.map((_, i) => (v == null ? null : i === times.length - 1 ? v : v - 0.5));
    const level = s.kind === "national" ? "2.0" : "1.2";
    const ranges = {
      [`air_temperature:${level}:point:PT0S`]: range(fill(s.temp)),
      "dew_point_temperature:2.0:point:PT0S": range(fill(s.dew)),
      "relative_humidity:2.0:point:PT0S": range(fill(s.rh)),
      "precipitation_amount:0.0:sum:PT1H": range(times.map(() => 0)),
    };
    if (s.pmsl != null) ranges["air_pressure_at_mean_sea_level:0.0:point:PT0S"] = range(fill(s.pmsl));
    if (s.ws != null) {
      ranges["wind_speed:10.0:point:PT10M"] = range(fill(s.ws));
      ranges["wind_speed_of_gust:10.0:point:PT10M"] = range(fill(s.gust10));
      ranges["wind_from_direction:10.0:point:PT10M"] = range(fill(s.dir));
    }
    coverages.push({ type: "Coverage", domain: { type: "Domain", axes: axes(s, times) }, ranges, "metocean:wigosId": s.id });
    // Hourly gust lives on its own coverage with the same time axis, as the live service does for PT1H series.
    if (s.gust1h != null) coverages.push({ type: "Coverage", domain: { type: "Domain", axes: axes(s, times) }, ranges: { "wind_speed_of_gust:10.0:point:PT1H": range(fill(s.gust1h)) }, "metocean:wigosId": s.id });
    // A 12-hourly rainfall coverage on an older axis must not displace the station.
    coverages.push({ type: "Coverage", domain: { type: "Domain", axes: axes(s, [iso(end - 5 * HOUR)]) }, ranges: { "precipitation_amount:0.0:sum:PT12H": range([1.0]) }, "metocean:wigosId": s.id });
  }
  return { type: "CoverageCollection", coverages };
}

export function esohLocationsFixture() {
  return { type: "FeatureCollection", features: ESOH_STATIONS.map((s) => ({ type: "Feature", id: s.id, geometry: { type: "Point", coordinates: [s.lon, s.lat] }, properties: { name: s.name } })) };
}

export function metarFixture(now) {
  const obs = Math.floor((lastFullHour(now) + 20 * 60_000) / 1000);
  const at = obs > now / 1000 ? obs - 3600 : obs;
  return [
    { icaoId: "EGXV", receiptTime: iso(now), obsTime: at, reportTime: iso(at * 1000), temp: 14, dewp: 8, wdir: 260, wspd: 10, visib: "6+", altim: 1018, metarType: "METAR", rawOb: "METAR EGXV AUTO 26010KT 9999 FEW030 14/08 Q1018", lat: 53.876, lon: -0.436, elev: 7, name: "Leconfield, EN, GB", cover: "FEW", clouds: [], fltCat: "VFR" },
    { icaoId: "EGXV", receiptTime: iso(now), obsTime: at - 1800, reportTime: iso((at - 1800) * 1000), temp: 13, dewp: 8, wdir: 260, wspd: 12, visib: "6+", altim: 1018, metarType: "METAR", rawOb: "older", lat: 53.876, lon: -0.436, elev: 7, name: "Leconfield, EN, GB", cover: "FEW", clouds: [], fltCat: "VFR" },
    { icaoId: "EGNJ", receiptTime: iso(now), obsTime: at, reportTime: iso(at * 1000), temp: 16, dewp: 8, wdir: 250, wspd: 15, wgst: 25, visib: 4, altim: 1019, metarType: "METAR", rawOb: "METAR EGNJ ...", lat: 53.574, lon: -0.351, elev: 31, name: "Humberside Intl, EN, GB", cover: "SCT", wxString: "-RA", clouds: [], fltCat: "VFR" },
  ];
}

export function cosmosLocationsFixture() {
  return { features: [
    { geometry: { coordinates: [54.110665, -0.959477], type: "Point" }, id: "HOLLN", properties: { label: "Hollin Hill", siteInfo: { altitude: { value: 82 } } } },
    { geometry: { coordinates: [53.86886, -1.31886], type: "Point" }, id: "SPENF", properties: { label: "Spen Farm", siteInfo: { altitude: { value: 57 } } } },
  ] };
}

export function cosmosRadiusFixture(now) {
  const midnight = Math.floor(now / 86_400_000) * 86_400_000;
  const times = Array.from({ length: 48 }, (_, i) => iso(midnight - (47 - i) * 30 * 60_000));
  const site = (id, lon, lat, z, vwc) => ({
    "dct:identifier": id, type: "Coverage",
    domain: { type: "Domain", axes: { t: { values: times }, x: { values: [lon] }, y: { values: [lat] }, z: { values: [z] } } },
    ranges: {
      pa: range(times.map(() => 1001)), precip: range(times.map((_, i) => (i % 12 === 0 ? 0.5 : 0))), rh: range(times.map(() => 95)),
      stp_tsoil10: range(times.map(() => 13.6)), ta: range(times.map(() => 14.9)), tdt1_vwc: range(times.map(() => vwc)), tdt2_vwc: range(times.map(() => vwc + 1)), ws: range(times.map(() => 2.7)),
    },
  });
  return { type: "CoverageCollection", coverages: [site("HOLLN", -0.959477, 54.110665, 82, 25.2), site("SPENF", -1.31886, 53.86886, 57, 22.1)] };
}

export const EA_GAUGES = [
  { id: "038179", lat: 54.105159, long: -0.642597, grid: "SE888685", lagMinutes: 30 },
  { id: "059793", lat: 53.966652, long: -1.115089, grid: "SE581526", lagMinutes: 30 },
  { id: "05973", lat: 53.966652, long: -1.115089, grid: "SE581526", lagMinutes: 30 },
  { id: "046222", lat: 53.719928, long: -0.676248, grid: "SE874256", lagMinutes: 9 * 60 },
];

export function eaStationsFixture() {
  return { items: EA_GAUGES.map((g) => ({ "@id": `http://environment.data.gov.uk/flood-monitoring/id/stations/${g.id}`, label: "Rainfall station", lat: g.lat, long: g.long, gridReference: g.grid, stationReference: g.id, notation: g.id, measures: [{ parameter: "rainfall", period: 900 }] })) };
}

export function eaReadingsFixture(stationId, now) {
  const g = EA_GAUGES.find((x) => x.id === stationId);
  if (!g) return { items: [] };
  const latest = Math.floor((now - g.lagMinutes * 60_000) / (15 * 60_000)) * 15 * 60_000;
  const measure = `http://environment.data.gov.uk/flood-monitoring/id/measures/${g.id}-rainfall-tipping_bucket_raingauge-t-15_min-mm`;
  const items = Array.from({ length: 96 }, (_, i) => ({ dateTime: iso(latest - i * 15 * 60_000), value: i % 24 === 1 ? 0.4 : 0, measure }));
  return { items };
}

/** Routes an observation upstream URL to a fixture, or returns null when it is not one. */
export function observationRoute(url, now = Date.now()) {
  if (url.host === "api.meteogate.eu") {
    if (url.pathname.endsWith("/radius")) return esohRadiusFixture(url.searchParams, now);
    if (url.pathname.endsWith("/locations")) return esohLocationsFixture();
  }
  if (url.host === "aviationweather.gov") return metarFixture(now);
  if (url.host === "cosmos-api.ceh.ac.uk") {
    const site = /\/locations\/([^/]+)$/.exec(url.pathname);
    if (site) return cosmosHistoryFixture(decodeURIComponent(site[1]), url.searchParams, now);
    return url.pathname.endsWith("/locations") ? cosmosLocationsFixture() : cosmosRadiusFixture(now);
  }
  if (url.host === "mesonet.agron.iastate.edu") return url.pathname.endsWith(".geojson") ? iemStationsFixture() : iemCsvFixture(url.searchParams, now);
  if (url.host === "www.ncei.noaa.gov") {
    if (url.pathname.endsWith("/ghcnh-station-list.csv")) return GHCNH_LIST;
    const m = /GHCNh_([^_]+)_(\d{4})\.psv$/.exec(url.pathname);
    return (m && ghcnhPsvFixture(m[1], Number(m[2]), now)) ?? { __status: 404 };
  }
  if (url.host === "previous-runs-api.open-meteo.com") return previousRunsFixture(url.searchParams, now);
  if (url.host === "api.open-meteo.com" && url.searchParams.get("hourly") && url.searchParams.get("models")?.includes(",")) return liveMultiModelFixture(url.searchParams, now);
  if (url.host === "environment.data.gov.uk") {
    const match = /\/id\/stations\/([^/]+)\/readings$/.exec(url.pathname);
    const since = Date.parse(url.searchParams.get("since") ?? "");
    if (match && Number.isFinite(since) && now - since > 25 * HOUR) return eaHistoryFixture(decodeURIComponent(match[1]), since, now);
    if (match) return eaReadingsFixture(decodeURIComponent(match[1]), now);
    if (url.pathname.endsWith("/id/stations")) return eaStationsFixture();
  }
  return null;
}

// ---- Verification fixtures: METAR history (IEM), Open-Meteo Previous Runs, multi-day gauge and COSMOS history ----
const DAY_MS = 86_400_000;
/** Truth used by every fake station: a smooth daily cycle, identical everywhere. */
export const trueTemperature = (ms) => 10 + 5 * Math.sin((2 * Math.PI * (ms / HOUR)) / 24);
export const trueWindKmh = (ms) => 15 + 5 * Math.cos((2 * Math.PI * (ms / HOUR)) / 24);
/** 4.8 mm falls in the interval ending 06:00 UTC on every third day. */
export const trueRain = (ms) => (new Date(ms).getUTCHours() === 6 && new Date(ms).getUTCMinutes() === 0 && Math.floor(ms / DAY_MS) % 3 === 0 ? 4.8 : 0);

export const MODEL_ERRORS = {
  ukmo_seamless: { temp: 0.1, wind: 1, rain: 1 },
  ecmwf_ifs025: { temp: 0.6, wind: 3, rain: 1.3 },
  icon_seamless: { temp: -1.2, wind: -5, rain: 0.7 },
  gfs_seamless: { temp: 2.0, wind: 8, rain: 0 },
  ecmwf_aifs025_single: { temp: 0.3, wind: 2, rain: 1.1 },
};

export function iemStationsFixture() {
  const f = (id, sname, lat, lon, elevation, archive_end = null) => ({ type: "Feature", id, properties: { sname, elevation, archive_end, online: archive_end == null }, geometry: { type: "Point", coordinates: [lon, lat] } });
  return { type: "FeatureCollection", features: [
    f("EGXV", "LECONFIELD (AUT)", 53.8758, -0.435, 6),
    f("EGNJ", "Humberside", 53.5744, -0.3508, 31),
    f("EGXZ", "TOPCLIFFE", 54.2056, -1.3824, 28, "2019-01-01"),
  ] };
}

export function iemCsvFixture(params, now) {
  const start = Date.parse(`${params.get("year1")}-${params.get("month1").padStart(2, "0")}-${params.get("day1").padStart(2, "0")}T00:00:00Z`);
  const end = Math.min(now, Date.parse(`${params.get("year2")}-${params.get("month2").padStart(2, "0")}-${params.get("day2").padStart(2, "0")}T00:00:00Z`));
  const rows = ["station,valid,tmpc,sknt"];
  for (let t = start + 20 * 60_000; t < end; t += 30 * 60_000) {
    const d = new Date(t).toISOString();
    rows.push(`${params.get("station")},${d.slice(0, 10)} ${d.slice(11, 16)},${Math.round(trueTemperature(t)).toFixed(2)},${Math.round(trueWindKmh(t) / 1.852).toFixed(2)}`);
  }
  return rows.join("\n");
}

export function previousRunsFixture(params, now) {
  const pastDays = Number(params.get("past_days"));
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const times = [];
  for (let t = today - pastDays * DAY_MS; t < today + DAY_MS; t += HOUR) times.push(t);
  const hourly = { time: times.map((t) => new Date(t).toISOString().slice(0, 16)) };
  for (const name of params.get("hourly").split(",")) {
    const [, variable, lead] = /^(.*)_previous_day(\d)$/.exec(name);
    for (const model of params.get("models").split(",")) {
      const e = MODEL_ERRORS[model === "best_match" ? "ukmo_seamless" : model];
      hourly[`${name}_${model}`] = times.map((t) => {
        if (variable === "temperature_2m") return Math.round((trueTemperature(t) + e.temp + 0.05 * Number(lead)) * 10) / 10;
        if (variable === "wind_speed_10m") return Math.round((trueWindKmh(t) + e.wind) * 10) / 10;
        if (variable === "precipitation") return Math.round(trueRain(t) * e.rain * 10) / 10;
        return null;
      });
    }
  }
  return { latitude: Number(params.get("latitude")), longitude: Number(params.get("longitude")), elevation: Number(params.get("elevation") ?? 10), hourly };
}

/** Multi-day gauge history (verification calls ask for more than a day); the truth rain pattern only. */
export function eaHistoryFixture(stationId, since, now) {
  const g = EA_GAUGES.find((x) => x.id === stationId);
  if (!g) return { items: [] };
  const latest = Math.floor((now - g.lagMinutes * 60_000) / (15 * 60_000)) * 15 * 60_000;
  const measure = `http://environment.data.gov.uk/flood-monitoring/id/measures/${g.id}-rainfall-tipping_bucket_raingauge-t-15_min-mm`;
  const items = [];
  for (let t = latest; t > since; t -= 15 * 60_000) items.push({ dateTime: iso(t), value: trueRain(t), measure });
  return { items };
}

export function cosmosHistoryFixture(id, params, now) {
  const [startRaw, endRaw] = params.get("datetime").split("/");
  const midnight = Math.floor(now / DAY_MS) * DAY_MS;
  const start = Date.parse(startRaw);
  const end = Math.min(Date.parse(endRaw), midnight);
  const times = [];
  for (let t = Math.ceil(start / (30 * 60_000)) * 30 * 60_000; t <= end; t += 30 * 60_000) times.push(t);
  return { type: "CoverageCollection", coverages: [{
    "dct:identifier": id, type: "Coverage",
    domain: { type: "Domain", axes: { t: { values: times.map(iso) }, x: { values: [-0.959477] }, y: { values: [54.110665] }, z: { values: [82] } } },
    ranges: { ta: range(times.map(trueTemperature)), ws: range(times.map(() => 2.7)), precip: range(times.map(trueRain)) },
  }] };
}

/** Live hourly multi-model forecast: each model is the truth plus its fixed error (no lead term). */
export function liveMultiModelFixture(params, now) {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const days = Number(params.get("forecast_days") ?? 7);
  const times = [];
  for (let t = today; t < today + days * DAY_MS; t += HOUR) times.push(t);
  const hourly = { time: times.map((t) => new Date(t).toISOString().slice(0, 16)) };
  for (const variable of params.get("hourly").split(",")) {
    for (const model of params.get("models").split(",")) {
      const e = MODEL_ERRORS[model === "best_match" ? "ukmo_seamless" : model];
      hourly[`${variable}_${model}`] = times.map((t) => {
        if (variable === "temperature_2m") return Math.round((trueTemperature(t) + e.temp) * 10) / 10;
        if (variable === "wind_speed_10m") return Math.round((trueWindKmh(t) + e.wind) * 10) / 10;
        if (variable === "precipitation") return Math.round(trueRain(t) * e.rain * 10) / 10;
        return null;
      });
    }
  }
  return { latitude: Number(params.get("latitude")), longitude: Number(params.get("longitude")), hourly };
}

// ---- GHCNh (NOAA hourly archive) ----
export const GHCNH_LIST = [
  "GHCN_ID,LATITUDE,LONGITUDE,ELEVATION,STATE,NAME,GSN,(US)HCN_(US)CRN,WMO_ID,ICAO,ISO_CODE",
  "UKM00003382,53.875,-0.442,7.0,,LECONFIELD,,,03382,EGXV,GB",
  "UKM00003999,54.05,-0.85,40.0,,SPARSE SITE,,,03999,,GB",
  "UKU12-00001,53.94,-0.78,20.0,,CLIMATE SITE,,,,,GB",
  "FRM00007149,48.72,2.38,89.0,,ORLY,,,07149,LFPO,FR",
].join("\n");

const PSV_HEADER = "STATION|Station_name|DATE|Year|Month|Day|Hour|Minute|LATITUDE|LONGITUDE|ELEVATION|temperature|temperature_Measurement_Code|temperature_Quality_Code|temperature_Report_Type|wind_speed|wind_speed_Measurement_Code|wind_speed_Quality_Code";

/** Leconfield reports hourly up to three days ago (GHCNh lag); every 40th hour also carries a failed-QC duplicate. The sparse site has a handful of rows. */
export function ghcnhPsvFixture(id, year, now) {
  const start = Date.UTC(year, 0, 1);
  const end = Math.min(Date.UTC(year + 1, 0, 1), now - 3 * DAY_MS);
  const rows = [PSV_HEADER];
  const row = (t, temp, qc, wind) => { const d = new Date(t).toISOString().slice(0, 19); rows.push(`${id}|X|${d}|${year}|1|1|0|0|53.875|-0.442|7.0|${temp}||${qc}|FM94_1|${wind}||${qc}`); };
  if (id === "UKM00003382") {
    for (let t = start, i = 0; t < end; t += HOUR, i++) {
      if (i % 40 === 0) row(t, "85.0", "3", "99.0");
      row(t, (Math.round(trueTemperature(t) * 10) / 10).toFixed(1), "", (Math.round((trueWindKmh(t) / 3.6) * 10) / 10).toFixed(1));
    }
  } else if (id === "UKM00003999") {
    for (let t = start; t < end; t += 30 * DAY_MS) row(t, "10.0", "1", "3.0");
  } else return null;
  return rows.join("\n");
}
