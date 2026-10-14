import { cached } from "../cache.ts";
import type { Source } from "../envelope.ts";
import type { ResolvedLocation } from "../locations.ts";
import { fetchJson } from "../upstream.ts";
import { lastIndex, num, tailSum, type RawObservation, type SourceResult } from "./station-types.ts";

const BASE = "https://cosmos-api.ceh.ac.uk/collections/30M";
const LABEL = "COSMOS-UK";
const TTL = 30 * 60_000;
const SITES_TTL = 24 * 3600_000;
const WINDOW_H = 60; // 24 h of data plus up to 36 h of publication lag
const PARAMS = ["precip", "ta", "rh", "ws", "pa", "tdt1_vwc", "tdt2_vwc", "stp_tsoil10"];

export const COSMOS_SOURCE: Omit<Source, "retrieved_at" | "classification"> = {
  name: "COSMOS-UK soil moisture network (UK Centre for Ecology & Hydrology)",
  url: "https://cosmos-api.ceh.ac.uk",
  notes: "Open Government Licence. Provisional 30-minute data published in daily batches, so readings are usually several hours old. Soil moisture is volumetric water content at 10 cm from TDT point probes.",
};

type Site = { label: string; altitude: number | null; latitude: number | null; longitude: number | null };
type Coverage = { "dct:identifier"?: string; domain: { axes: { x: { values: number[] }; y: { values: number[] }; z?: { values: number[] }; t: { values: string[] } } }; ranges: Record<string, { values: Array<number | null> }> };

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:\d{2}Z$/, ":00Z");

export function sites(): Promise<Map<string, Site>> {
  return cached("cosmos:sites", SITES_TTL, async () => {
    const body = await fetchJson(LABEL, `${BASE}/locations`);
    const out = new Map<string, Site>();
    for (const f of body?.features ?? []) {
      if (!f?.id) continue;
      // COSMOS-UK publishes site coordinates as [latitude, longitude].
      const [lat, lon] = f.geometry?.coordinates ?? [];
      out.set(String(f.id), { label: String(f.properties?.label ?? f.id), altitude: num(f.properties?.siteInfo?.altitude?.value), latitude: num(lat), longitude: num(lon) });
    }
    return out;
  });
}

function parse(c: Coverage, siteMap: Map<string, Site>): RawObservation | null {
  const id = c["dct:identifier"];
  const t = c.domain?.axes?.t?.values ?? [];
  const x = c.domain?.axes?.x?.values?.[0];
  const y = c.domain?.axes?.y?.values?.[0];
  if (!id || !t.length || x == null || y == null) return null;
  const r = c.ranges ?? {};
  const series = (k: string) => r[k]?.values ?? [];
  const i = Math.max(lastIndex(series("ta")), lastIndex(series("tdt1_vwc")), lastIndex(series("precip")));
  if (i < 0) return null;
  const at = (k: string) => num(series(k)[i]);
  const vwc = [at("tdt1_vwc"), at("tdt2_vwc")].filter((v): v is number => v != null);
  const rain = tailSum(series("precip").slice(0, i + 1), 48);
  const ws = at("ws");
  const site = siteMap.get(id);
  return {
    id, name: site?.label ?? id, network: "cosmos_uk", network_label: "COSMOS-UK research site", tier: "research",
    latitude: y, longitude: x, elevation_m: num(c.domain.axes.z?.values?.[0]) ?? site?.altitude ?? null, observed_at: t[i],
    values: {
      temperature_c: at("ta"),
      relative_humidity_pct: at("rh"),
      pressure_msl_hpa: null,
      wind_speed_kmh: ws == null ? null : ws * 3.6,
      precipitation_1h_mm: (() => { const h = tailSum(series("precip").slice(0, i + 1), 2); return h.available === 2 ? h.sum : null; })(),
      precipitation_24h_mm: rain.available >= 44 ? Math.round(rain.sum * 10) / 10 : null,
      soil_moisture_10cm_pct: vwc.length ? Math.round((vwc.reduce((a, b) => a + b, 0) / vwc.length) * 10) / 10 : null,
      soil_temperature_10cm_c: at("stp_tsoil10"),
    },
    notes: [
      "Station pressure (not sea-level) is omitted.",
      ...(rain.available < 48 && rain.available >= 44 ? [`24 h rainfall total from ${rain.available}/48 half-hours`] : []),
      ...(rain.available > 0 && rain.available < 44 ? ["24 h rainfall incomplete"] : []),
    ],
  };
}

/** COSMOS-UK sites within the radius with their latest half-hourly readings. */
export function fetchCosmos(location: ResolvedLocation, radiusKm: number, now = Date.now()): Promise<SourceResult> {
  const params = new URLSearchParams({
    coords: `POINT(${location.longitude} ${location.latitude})`, within: String(radiusKm), "within-units": "km",
    datetime: `${iso(now - WINDOW_H * 3600_000)}/${iso(now)}`, "parameter-name": PARAMS.join(","),
  });
  return cached(`cosmos:${location.latitude.toFixed(2)},${location.longitude.toFixed(2)},${radiusKm}`, TTL, async () => {
    const [body, siteMap] = await Promise.all([fetchJson(LABEL, `${BASE}/radius?${params}`), sites().catch(() => new Map<string, Site>())]);
    const stations = ((body?.coverages ?? []) as Coverage[]).map((c) => parse(c, siteMap)).filter((s): s is RawObservation => s != null);
    return { stations, source: { ...COSMOS_SOURCE, classification: "observation", retrieved_at: new Date(now).toISOString() } };
  });
}

export type CosmosHistory = { times: string[]; ta: Array<number | null>; ws: Array<number | null>; precip: Array<number | null> };

/** Half-hourly air temperature (°C), wind speed (m/s) and rainfall (mm) for one site between two instants. */
export function cosmosHistory(id: string, startMs: number, endMs: number): Promise<CosmosHistory> {
  const params = new URLSearchParams({ datetime: `${iso(startMs)}/${iso(endMs)}`, "parameter-name": "ta,ws,precip" });
  return cached(`cosmos:history:${id}:${iso(startMs)}:${iso(endMs)}`, 3600_000, async () => {
    const body = await fetchJson(LABEL, `${BASE}/locations/${encodeURIComponent(id)}?${params}`);
    const c: Coverage | undefined = (body?.coverages ?? [])[0];
    const r = c?.ranges ?? {};
    return { times: c?.domain?.axes?.t?.values ?? [], ta: r.ta?.values ?? [], ws: r.ws?.values ?? [], precip: r.precip?.values ?? [] };
  });
}
