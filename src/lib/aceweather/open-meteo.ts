/* Open-Meteo data access: forecast, geocoding search, archive climate context.
   Everything here is the live Open-Meteo API (no backend route needed). */

export type AwLocation = {
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  elev: number | null;
  tz: string;
};

export const DEFAULT_LOCATION: AwLocation = {
  name: "Bishopton",
  region: "Stockton-on-Tees",
  country: "United Kingdom",
  lat: 54.5435,
  lon: -1.4373,
  elev: 30,
  tz: "Europe/London",
};

type Series = (number | null)[];

export type ForecastResponse = {
  current: Record<string, number | string>;
  hourly: Record<string, Series | string[]>;
  daily: Record<string, Series | string[]>;
};

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

function fetchInit(signal?: AbortSignal, cache?: RequestCache): RequestInit {
  const init: RequestInit = {};
  if (signal) init.signal = signal;
  if (cache) init.cache = cache;
  return init;
}

export async function fetchForecast(loc: AwLocation, signal?: AbortSignal, cache?: RequestCache): Promise<ForecastResponse> {
  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lon),
    timezone: loc.tz || "auto",
    past_days: "7",
    forecast_days: "14",
    wind_speed_unit: "kmh",
    current: [
      "temperature_2m", "apparent_temperature", "relative_humidity_2m", "dew_point_2m",
      "pressure_msl", "cloud_cover", "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m",
      "precipitation", "visibility", "uv_index", "weather_code", "is_day",
    ].join(","),
    hourly: [
      "temperature_2m", "apparent_temperature", "precipitation", "precipitation_probability", "wind_speed_10m",
      "wind_gusts_10m", "wind_direction_10m", "cloud_cover", "relative_humidity_2m",
      "pressure_msl", "et0_fao_evapotranspiration", "soil_temperature_0cm", "soil_temperature_6cm",
      "soil_temperature_18cm", "soil_temperature_54cm", "soil_moisture_0_to_1cm", "soil_moisture_1_to_3cm",
      "soil_moisture_3_to_9cm", "soil_moisture_9_to_27cm", "soil_moisture_27_to_81cm",
    ].join(","),
    daily: [
      "temperature_2m_max", "temperature_2m_min", "precipitation_sum", "precipitation_probability_max",
      "wind_speed_10m_max", "wind_direction_10m_dominant", "weather_code",
      "sunrise", "sunset", "uv_index_max",
    ].join(","),
  });
  const r = await fetch(`${FORECAST}?${params}`, fetchInit(signal, cache));
  if (!r.ok) throw new Error(`Open-Meteo forecast ${r.status}`);
  return (await r.json()) as ForecastResponse;
}

export async function searchLocations(query: string, signal?: AbortSignal): Promise<AwLocation[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ name: q, count: "6", language: "en", format: "json" });
  const r = await fetch(`${GEOCODE}?${params}`, { signal });
  if (!r.ok) throw new Error(`Geocoding ${r.status}`);
  const body = (await r.json()) as { results?: Array<Record<string, unknown>> };
  return (body.results ?? []).map((res) => ({
    name: String(res.name ?? "Location"),
    region: String(res.admin1 ?? ""),
    country: String(res.country ?? ""),
    lat: Number(res.latitude),
    lon: Number(res.longitude),
    elev: res.elevation != null ? Number(res.elevation) : null,
    tz: String(res.timezone ?? "auto"),
  }));
}

export type SeasonalContext = {
  monthLabel: string;
  mtdRain: number;
  normalMtdRain: number | null;
  pctOfNormal: number | null;
  fullMonthNormal: number | null;
  tempAnomaly: number | null;
  years: Array<{ y: number; rain: number; partial: boolean }>;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

type DailyLite = { time?: string[]; precipitation_sum?: Series; temperature_2m_max?: Series; temperature_2m_min?: Series };

/** Real seasonal picture: this month's rain-to-date (forecast actuals fill the
    archive's ~5-day lag) vs the same-day-of-month average across prior years. */
export async function fetchSeasonal(loc: AwLocation, forecastDaily?: DailyLite, signal?: AbortSignal, cache?: RequestCache): Promise<SeasonalContext | null> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const dom = now.getDate();
  const startYear = year - 6;
  const end = isoDate(new Date(now.getTime() - 6 * 86400000)); // archive lag

  const params = new URLSearchParams({
    latitude: String(loc.lat),
    longitude: String(loc.lon),
    timezone: loc.tz || "auto",
    start_date: `${startYear}-01-01`,
    end_date: end,
    daily: "precipitation_sum,temperature_2m_mean",
  });
  const r = await fetch(`${ARCHIVE}?${params}`, fetchInit(signal, cache));
  if (!r.ok) throw new Error(`Archive ${r.status}`);
  const body = (await r.json()) as {
    daily?: { time?: string[]; precipitation_sum?: Series; temperature_2m_mean?: Series };
  };
  const time = body.daily?.time ?? [];
  const precip = body.daily?.precipitation_sum ?? [];
  const temp = body.daily?.temperature_2m_mean ?? [];
  if (!time.length) return null;

  type Acc = { rainAll: number; rainToDom: number; tempSum: number; tempCnt: number };
  const byYear = new Map<number, Acc>();
  const acc = (y: number): Acc => {
    let a = byYear.get(y);
    if (!a) { a = { rainAll: 0, rainToDom: 0, tempSum: 0, tempCnt: 0 }; byYear.set(y, a); }
    return a;
  };

  // archive rain for THIS month/year, indexed by day (merged with forecast below)
  const thisMonthByDay = new Map<number, number>();
  for (let i = 0; i < time.length; i++) {
    const [y, m, d] = time[i].slice(0, 10).split("-").map(Number);
    if (m !== month) continue;
    const a = acc(y);
    const p = precip[i];
    const t = temp[i];
    if (p != null) { a.rainAll += p; if (d <= dom) a.rainToDom += p; }
    if (t != null && d <= dom) { a.tempSum += t; a.tempCnt += 1; }
    if (y === year && p != null) thisMonthByDay.set(d, p);
  }

  // forecast actuals (past_days) fill the recent days the archive hasn't published
  const fcTime = forecastDaily?.time ?? [];
  const fcP = forecastDaily?.precipitation_sum ?? [];
  const fcMax = forecastDaily?.temperature_2m_max ?? [];
  const fcMin = forecastDaily?.temperature_2m_min ?? [];
  let thisTempSum = 0, thisTempCnt = 0;
  for (let i = 0; i < fcTime.length; i++) {
    const [y, m, d] = fcTime[i].slice(0, 10).split("-").map(Number);
    if (y !== year || m !== month || d > dom) continue;
    const p = fcP[i];
    if (!thisMonthByDay.has(d) && p != null) thisMonthByDay.set(d, p);
    const hi = fcMax[i]; const lo = fcMin[i];
    if (hi != null && lo != null) { thisTempSum += (hi + lo) / 2; thisTempCnt += 1; }
  }

  let mtdRain = 0;
  for (let d = 1; d <= dom; d++) mtdRain += thisMonthByDay.get(d) ?? 0;

  const prior = [...byYear.entries()].filter(([y]) => y < year);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);
  const normalMtdRain = mean(prior.map(([, a]) => a.rainToDom));
  const fullMonthNormal = mean(prior.map(([, a]) => a.rainAll));
  const priorTemp = mean(prior.filter(([, a]) => a.tempCnt).map(([, a]) => a.tempSum / a.tempCnt));
  const thisTemp = thisTempCnt ? thisTempSum / thisTempCnt : null;

  const yearKeys = [...byYear.keys()].sort((a, b) => a - b);
  if (!yearKeys.includes(year)) yearKeys.push(year);
  const years = yearKeys.map((y) => ({ y, rain: y === year ? mtdRain : (byYear.get(y)?.rainAll ?? 0), partial: y === year }));

  return {
    monthLabel: MONTHS[month - 1],
    mtdRain: Math.round(mtdRain * 10) / 10,
    normalMtdRain: normalMtdRain == null ? null : Math.round(normalMtdRain * 10) / 10,
    pctOfNormal: normalMtdRain && normalMtdRain > 0 ? Math.round((mtdRain / normalMtdRain) * 100) : null,
    fullMonthNormal: fullMonthNormal == null ? null : Math.round(fullMonthNormal * 10) / 10,
    tempAnomaly: thisTemp != null && priorTemp != null ? Math.round((thisTemp - priorTemp) * 10) / 10 : null,
    years,
  };
}
