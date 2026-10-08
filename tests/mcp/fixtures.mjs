// Fake upstreams for the MCP tests: Open-Meteo forecast/archive/multi-model/meta and the AceWeather Python API.
import { localNow } from "../../src/mcp/dates.ts";
import { clearCache } from "../../src/mcp/cache.ts";
import { resetRateLimits } from "../../src/mcp/rate-limit.ts";

process.env.ACEWEATHER_MCP_LOG = "off";
process.env.ACEWEATHER_API_BASE = "http://aceweather.test";

const DAY = 86_400_000;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const range = (start, end) => {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
};

export const GROUPS = {
  groups: [{
    id: "cropdynamics",
    locations: [
      ["scotch-corner", "Scotch Corner, England, United Kingdom", 54.44158, -1.6658],
      ["boroughbridge", "Boroughbridge, England, United Kingdom", 54.0895, -1.4011],
      ["pocklington", "Pocklington, England, United Kingdom", 53.93335, -0.78106],
      ["alford-east-lindsey", "Alford / East Lindsey, England, United Kingdom", 53.2591409, 0.1777346],
      ["sleaford", "Sleaford, England, United Kingdom", 52.99826, -0.40941],
      ["longhirst", "Longhirst, Northumberland, United Kingdom", 55.1774, -1.6894],
      ["berwick", "Berwick", 55.76868, -2.00537],
    ].map(([slug, label, latitude, longitude]) => ({ slug, label, query: label.split(",")[0], latitude, longitude, timezone: "Europe/London" })),
  }],
};

const place = (id, name, admin1, country, latitude, longitude, extra = {}) => ({
  id, name, admin1, country, country_code: "GB", latitude, longitude, elevation: 20, feature_code: "PPL", timezone: "Europe/London", population: 1000, ...extra,
});

export const SEARCH = {
  pocklington: { results: [place(1, "Pocklington", "England", "United Kingdom", 53.93335, -0.78106)] },
  alford: { results: [
    place(2, "Alford", "Scotland", "United Kingdom", 57.2329, -2.7046),
    place(3, "Alford", "England", "United Kingdom", 53.2591, 0.1777),
    place(4, "Alford", "England", "United Kingdom", 51.0964, -2.5574, { admin1: "Somerset" }),
  ] },
  "east anglia": { results: [place(5, "East Anglia", "England", "United Kingdom", 52.5, 1.0, { feature_code: "RGN" })] },
  "yo42 2ab": { results: [{ name: "Pocklington", admin1: "East Riding of Yorkshire", country: "United Kingdom", latitude: 53.93, longitude: -0.78, timezone: "auto" }] },
};

export function forecastFixture(tz = "Europe/London") {
  const { day, hour } = localNow(tz);
  const days = range(addDays(day, -7), addDays(day, 13));
  const hours = days.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, "0")}:00`));
  const series = (fn) => hours.map((_, i) => fn(i));
  return {
    latitude: 53.93, longitude: -0.78, timezone: tz, elevation: 25,
    current: { time: hour, interval: 900, temperature_2m: 13.6, apparent_temperature: 9.8, relative_humidity_2m: 47, dew_point_2m: 2.4, pressure_msl: 1018.2, cloud_cover: 100, wind_speed_10m: 20.4, wind_gusts_10m: 36, wind_direction_10m: 250, precipitation: 0, visibility: 24000, uv_index: 1.2, weather_code: 3, is_day: 1 },
    hourly: {
      time: hours,
      temperature_2m: series((i) => 8 + (i % 24) / 3), apparent_temperature: series((i) => 6 + (i % 24) / 3),
      precipitation: series((i) => (i % 24 === 6 ? 1.5 : 0)), precipitation_probability: series((i) => (i % 24 === 6 ? 80 : 10)),
      wind_speed_10m: series(() => 18), wind_gusts_10m: series((i) => 30 + (i % 5)), wind_direction_10m: series(() => 240),
      cloud_cover: series(() => 70), relative_humidity_2m: series(() => 85), pressure_msl: series(() => 1015),
      et0_fao_evapotranspiration: series(() => 0.05), soil_temperature_0cm: series(() => 11), soil_temperature_6cm: series(() => 12),
      soil_moisture_0_to_1cm: series(() => 0.31),
    },
    daily: {
      time: days,
      temperature_2m_max: days.map(() => 16), temperature_2m_min: days.map(() => 7), precipitation_sum: days.map(() => 1.5),
      precipitation_probability_max: days.map(() => 80), wind_speed_10m_max: days.map(() => 25), wind_direction_10m_dominant: days.map(() => 240),
      weather_code: days.map(() => 61), sunrise: days.map((d) => `${d}T07:20`), sunset: days.map((d) => `${d}T18:30`), uv_index_max: days.map(() => 2),
    },
  };
}

export function archiveFixture(params, missing = new Set()) {
  const days = range(params.get("start_date"), params.get("end_date"));
  const v = (fn) => days.map((d, i) => (missing.has(d) ? null : fn(i, d)));
  return {
    timezone: params.get("timezone") === "auto" ? "Europe/London" : params.get("timezone"),
    daily: {
      time: days,
      weather_code: v(() => 61), temperature_2m_max: v((i) => 14 + (i % 3)), temperature_2m_min: v((i) => (i % 4 === 0 ? -1 : 5)),
      temperature_2m_mean: v(() => 10), precipitation_sum: v((i) => (i % 2 ? 2 : 0)), rain_sum: v((i) => (i % 2 ? 2 : 0)),
      snowfall_sum: v(() => 0), precipitation_hours: v((i) => (i % 2 ? 3 : 0)), wind_speed_10m_max: v(() => 20),
      wind_gusts_10m_max: v((i) => 40 + i), wind_direction_10m_dominant: v(() => 230), shortwave_radiation_sum: v(() => 8),
      et0_fao_evapotranspiration: v(() => 1.5), sunshine_duration: v(() => 18000), relative_humidity_2m_mean: v(() => 80),
      soil_temperature_0_to_7cm_mean: v(() => 12), soil_moisture_0_to_7cm_mean: v(() => 0.25),
    },
  };
}

export function multiModelFixture(params) {
  const tz = params.get("timezone") === "auto" ? "Europe/London" : params.get("timezone");
  const days = range(localNow(tz).day, addDays(localNow(tz).day, 6));
  const models = { ecmwf_ifs025: 0, gfs_seamless: 1, icon_seamless: 2, ukmo_seamless: 3 };
  const daily = { time: days };
  for (const [id, k] of Object.entries(models)) {
    daily[`temperature_2m_max_${id}`] = days.map((_, i) => 15 + (i >= 4 ? k * 2 : k * 0.3));
    daily[`temperature_2m_min_${id}`] = days.map(() => 6);
    daily[`precipitation_sum_${id}`] = days.map((_, i) => (i === 0 ? 0 : i < 4 ? 3 + k : k % 2 ? 6 : 0));
    daily[`wind_speed_10m_max_${id}`] = days.map(() => 20 + k);
  }
  return { timezone: tz, daily };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Installs a fake fetch. Overrides map a URL predicate to a handler for failure tests. */
export function installFetch({ missing = new Set(), overrides = [] } = {}) {
  clearCache();
  resetRateLimits();
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push(url);
    for (const [match, handler] of overrides) if (match(url)) return handler(url, init);
    if (url.host === "aceweather.test" && url.pathname === "/api/groups") return json(GROUPS);
    if (url.host === "aceweather.test" && url.pathname === "/api/search") return json(SEARCH[url.searchParams.get("query").toLowerCase()] ?? { results: [] });
    if (url.host === "aceweather.test" && url.pathname === "/api/providers") return json({ meteomaticsEnabled: false });
    if (url.host === "archive-api.open-meteo.com") return json(archiveFixture(url.searchParams, missing));
    if (url.pathname.endsWith("/static/meta.json")) return json({ last_run_initialisation_time: 1791439200, last_run_availability_time: 1791459959 });
    if (url.host === "api.open-meteo.com" && url.searchParams.get("models")?.includes(",")) return json(multiModelFixture(url.searchParams));
    if (url.host === "api.open-meteo.com") {
      const tz = url.searchParams.get("timezone");
      return json(forecastFixture(tz === "auto" ? "Europe/London" : tz));
    }
    return json({ error: true, reason: `unexpected ${url}` }, 500);
  };
  return calls;
}

let id = 0;
export async function rpc(handle, method, params = {}, headers = {}) {
  const response = await handle(new Request("http://localhost/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
  }));
  return { status: response.status, headers: response.headers, body: await response.json() };
}

export async function callTool(handle, name, args = {}) {
  const { body } = await rpc(handle, "tools/call", { name, arguments: args });
  const result = body.result;
  let error = null;
  if (result?.isError) {
    try {
      error = JSON.parse(result.content[0].text);
    } catch {
      error = { error: { code: "protocol", message: result.content[0].text } };
    }
  }
  return { result, data: result?.structuredContent, error, raw: body };
}
