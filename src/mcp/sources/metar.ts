import { cached } from "../cache.ts";
import type { Source } from "../envelope.ts";
import { bboxAround, relativeHumidity } from "../geo.ts";
import type { ResolvedLocation } from "../locations.ts";
import { fetchJson } from "../upstream.ts";
import { num, type RawObservation, type SourceResult } from "./station-types.ts";

const LABEL = "aviationweather.gov METAR";
const TTL = 10 * 60_000;
const KNOT_KMH = 1.852;
const MILE_KM = 1.609344;

export const METAR_SOURCE: Omit<Source, "retrieved_at" | "classification"> = {
  name: "aviationweather.gov METAR (NOAA Aviation Weather Center)",
  url: "https://aviationweather.gov/data/api/",
  notes: "Airport observations, usually every 30 minutes. US public domain; temperatures are reported to the whole degree and rainfall is not included for UK airports.",
};

const COVER: Record<string, string> = { CLR: "Clear", SKC: "Clear", CAVOK: "Clear", FEW: "Mostly clear", SCT: "Partly cloudy", BKN: "Mostly cloudy", OVC: "Overcast", OVX: "Obscured" };

function visibilityKm(raw: unknown): number | null {
  if (typeof raw === "number") return Math.round(raw * MILE_KM * 10) / 10;
  if (typeof raw !== "string") return null;
  const miles = Number(raw.replace("+", ""));
  return Number.isFinite(miles) ? Math.round(miles * MILE_KM * 10) / 10 : null;
}

function parse(m: any): RawObservation | null {
  const lat = num(m.lat);
  const lon = num(m.lon);
  const obs = num(m.obsTime);
  if (!m.icaoId || lat == null || lon == null || obs == null) return null;
  const temp = num(m.temp);
  const dew = num(m.dewp);
  const wind = num(m.wspd);
  const gust = num(m.wgst);
  const condition = typeof m.wxString === "string" && m.wxString ? String(m.wxString) : COVER[String(m.cover ?? "")] ?? null;
  return {
    id: String(m.icaoId), name: String(m.name ?? m.icaoId).replace(/, [A-Z]{2}, [A-Z]{2}$/, ""), network: "metar", network_label: "Airport METAR", tier: "official",
    latitude: lat, longitude: lon, elevation_m: num(m.elev), observed_at: new Date(obs * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    values: {
      temperature_c: temp,
      dew_point_c: dew,
      relative_humidity_pct: temp != null && dew != null ? Math.round(relativeHumidity(temp, dew)) : null,
      pressure_msl_hpa: num(m.altim),
      wind_speed_kmh: wind == null ? null : wind * KNOT_KMH,
      wind_gust_kmh: gust == null ? null : gust * KNOT_KMH,
      wind_direction_deg: num(m.wdir),
      visibility_km: visibilityKm(m.visib),
      condition,
    },
    notes: ["Temperature and dew point reported to the whole degree."],
  };
}

/** Latest METAR for each airport inside a bounding box around the location. */
export function fetchMetar(location: ResolvedLocation, radiusKm: number, now = Date.now()): Promise<SourceResult> {
  const b = bboxAround(location.latitude, location.longitude, radiusKm);
  const url = `https://aviationweather.gov/api/data/metar?bbox=${[b.south, b.west, b.north, b.east].map((v) => v.toFixed(3)).join(",")}&format=json`;
  return cached(`metar:${location.latitude.toFixed(2)},${location.longitude.toFixed(2)},${radiusKm}`, TTL, async () => {
    const body = await fetchJson(LABEL, url);
    const latest = new Map<string, RawObservation>();
    for (const m of Array.isArray(body) ? body : []) {
      const parsed = parse(m);
      if (!parsed) continue;
      const seen = latest.get(parsed.id);
      if (!seen || seen.observed_at < parsed.observed_at) latest.set(parsed.id, parsed);
    }
    return { stations: [...latest.values()], source: { ...METAR_SOURCE, classification: "observation", retrieved_at: new Date(now).toISOString() } };
  });
}
