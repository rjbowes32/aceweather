// Preloaded into the daily learning job by learning-job.test.mjs: answers every upstream from fixtures.
// NETATMO_MOCK_STATE names a file holding the one refresh token Netatmo currently accepts (they rotate).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { observationRoute, trueRain, trueTemperature } from "./observation-fixtures.mjs";

const HOUR = 3600_000;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const day = (ms) => new Date(ms).toISOString();

function sepa(url, now) {
  if (url.searchParams.get("request") === "getTimeseriesList") {
    return [["ts_id", "station_name", "station_no", "station_latitude", "station_longitude"], ["1001", "Perth", "S1", "56.39", "-3.43"], ["1002", "Inverness", "S2", "57.48", "-4.22"]];
  }
  const from = Date.parse(url.searchParams.get("from"));
  const to = Math.min(Date.parse(url.searchParams.get("to")), Math.floor(now / HOUR) * HOUR);
  const data = [];
  for (let t = Math.ceil(from / HOUR) * HOUR; t <= to; t += HOUR) data.push([day(t), trueRain(t)]);
  return [{ ts_id: url.searchParams.get("ts_id"), data }];
}

function netatmo(url, init) {
  const file = process.env.NETATMO_MOCK_STATE;
  if (url.pathname === "/oauth2/token") {
    const sent = new URLSearchParams(String(init.body)).get("refresh_token");
    const valid = existsSync(file) ? readFileSync(file, "utf8") : "refresh-1";
    if (sent !== valid) return json({ error: "invalid_grant" }, 400);
    const next = `refresh-${Number(valid.split("-")[1]) + 1}`;
    writeFileSync(file, next);
    return json({ access_token: "access", refresh_token: next, expires_in: 10800 });
  }
  if (init.headers?.authorization !== "Bearer access") return json({ error: { code: 3, message: "Access token expired" } }, 403);
  const p = url.searchParams;
  if (url.pathname === "/api/getpublicdata") {
    const lat = (Number(p.get("lat_ne")) + Number(p.get("lat_sw"))) / 2;
    const lon = (Number(p.get("lon_ne")) + Number(p.get("lon_sw"))) / 2;
    const id = `70:ee:50:${Math.round(lat * 100)}:${Math.round(lon * 100)}`;
    return json({ status: "ok", body: [{ _id: id, place: { location: [lon + 0.0123, lat + 0.0123], altitude: 40 }, module_types: { [`02:${id}`]: "NAModule1", [`05:${id}`]: "NAModule3" }, measures: {} }] });
  }
  if (url.pathname === "/api/getmeasure") {
    const body = {};
    for (let t = Number(p.get("date_begin")) * 1000; t <= Number(p.get("date_end")) * 1000; t += 5 * 60_000) {
      body[t / 1000] = [p.get("type") === "temperature" ? Math.round((trueTemperature(t) + 0.4) * 10) / 10 : trueRain(t)];
    }
    return json({ status: "ok", body });
  }
  return json({ error: "unexpected" }, 404);
}

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const now = Date.now();
  if (url.host === "api.meteogate.eu" && url.pathname.endsWith("/area")) return json({ type: "CoverageCollection", coverages: [] });
  if (url.host === "api.open-meteo.com" && url.pathname === "/v1/elevation") return json({ elevation: p(url, "latitude").map(() => 30) });
  if (url.host === "timeseries.sepa.org.uk") return json(sepa(url, now));
  if (url.host === "api.netatmo.com") return netatmo(url, init);
  const observation = observationRoute(url, now);
  if (observation?.__status) return new Response("", { status: observation.__status });
  if (typeof observation === "string") return new Response(observation, { status: 200 });
  if (observation) return json(observation);
  return json({ error: `unexpected ${url}` }, 404);
};
const p = (url, name) => url.searchParams.get(name).split(",");
