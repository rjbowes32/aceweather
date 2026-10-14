import { z } from "zod";
import { dirToCompass } from "../lib/aceweather/format.ts";
import type { Source } from "./envelope.ts";
import { distanceKm } from "./geo.ts";
import type { ResolvedLocation } from "./locations.ts";
import { fetchCosmos } from "./sources/cosmos.ts";
import { fetchEaRainfall } from "./sources/ea-rainfall.ts";
import { fetchEsoh } from "./sources/esoh.ts";
import { fetchMetar } from "./sources/metar.ts";
import type { RawObservation, SourceResult } from "./sources/station-types.ts";
import { convertWind, round, type WindUnit } from "./units.ts";

const n = z.number().nullable();

export const stationObservationSchema = z.object({
  id: z.string(), name: z.string(), network: z.string(), network_label: z.string(),
  tier: z.enum(["official", "official_gauge", "research"]),
  latitude: z.number(), longitude: z.number(), elevation_m: n, distance_km: z.number(),
  observed_at: z.string(), age_minutes: z.number(),
  values: z.object({
    temperature_c: n, dew_point_c: n, relative_humidity_pct: n, pressure_msl_hpa: n,
    wind_speed: n, wind_gust: n, wind_direction_deg: n, wind_direction_compass: z.string().nullable(),
    precipitation_1h_mm: n, precipitation_24h_mm: n, visibility_km: n,
    soil_moisture_10cm_pct: n, soil_temperature_10cm_c: n, condition: z.string().nullable(),
  }),
  quality: z.object({
    flags: z.array(z.string()),
    usable_for_current: z.boolean(),
    notes: z.array(z.string()),
  }),
});

export type StationObservation = z.infer<typeof stationObservationSchema>;

export const QUALITY_FLAGS = {
  stale: "latest reading is older than the freshness limit for current conditions",
  out_of_range: "a value failed the physical range check and was removed",
  temperature_outlier: "temperature differs from the median of neighbouring official stations by more than 4 °C",
  differs_from_model: "temperature differs from the model grid-point analysis by more than 6 °C (informational)",
  partial_rainfall: "24 h rainfall total could not be computed because more than 10% of intervals are missing",
  no_air_readings: "station reports soil or rainfall only",
};

export const TIERS = {
  official: "national met service or airport station with professional siting and maintenance",
  official_gauge: "Environment Agency telemetered rain gauge (rainfall only)",
  research: "research network site (COSMOS-UK); published in daily batches",
};

export const CURRENT_MAX_AGE_MIN = 90;
export const CURRENT_MAX_DISTANCE_KM = 40;
const BUDDY_RADIUS_KM = 60;
const BUDDY_TEMP_DIFF_C = 4;
const MODEL_TEMP_DIFF_C = 6;

const RANGES: Record<string, [number, number]> = {
  temperature_c: [-40, 50], dew_point_c: [-50, 40], relative_humidity_pct: [0, 100], pressure_msl_hpa: [870, 1085],
  wind_speed_kmh: [0, 270], wind_gust_kmh: [0, 330], wind_direction_deg: [0, 360], precipitation_1h_mm: [0, 150],
  precipitation_24h_mm: [0, 400], visibility_km: [0, 200], soil_moisture_10cm_pct: [0, 100], soil_temperature_10cm_c: [-20, 50],
};

export type ObservationSet = {
  stations: StationObservation[];
  sources: Source[];
  warnings: string[];
};

type Options = { radiusKm: number; wind: WindUnit; now?: number; modelTemperatureC?: number | null };

const AIR_KEYS = ["temperature_c", "relative_humidity_pct", "pressure_msl_hpa", "wind_speed_kmh"] as const;

function rangeCheck(raw: RawObservation): string[] {
  const flags: string[] = [];
  for (const [key, [low, high]] of Object.entries(RANGES)) {
    const v = (raw.values as Record<string, number | null | undefined>)[key];
    if (v == null) continue;
    if (v < low || v > high) {
      (raw.values as Record<string, number | null | undefined>)[key] = null;
      if (!flags.includes("out_of_range")) flags.push("out_of_range");
    }
  }
  return flags;
}

function toStation(raw: RawObservation, location: ResolvedLocation, wind: WindUnit, now: number): StationObservation {
  const flags = rangeCheck(raw);
  const age = Math.max(0, Math.round((now - Date.parse(raw.observed_at)) / 60_000));
  const v = raw.values;
  const hasAir = AIR_KEYS.some((k) => v[k] != null);
  if (!hasAir) flags.push("no_air_readings");
  if (age > CURRENT_MAX_AGE_MIN) flags.push("stale");
  else if (raw.notes.some((note) => /incomplete/.test(note))) flags.push("partial_rainfall");
  const direction = v.wind_direction_deg ?? null;
  return {
    id: raw.id, name: raw.name, network: raw.network, network_label: raw.network_label, tier: raw.tier,
    latitude: raw.latitude, longitude: raw.longitude, elevation_m: raw.elevation_m,
    distance_km: round(distanceKm(location.latitude, location.longitude, raw.latitude, raw.longitude), 1) ?? 0,
    observed_at: raw.observed_at, age_minutes: age,
    values: {
      temperature_c: round(v.temperature_c), dew_point_c: round(v.dew_point_c), relative_humidity_pct: round(v.relative_humidity_pct, 0),
      pressure_msl_hpa: round(v.pressure_msl_hpa), wind_speed: convertWind(v.wind_speed_kmh, wind), wind_gust: convertWind(v.wind_gust_kmh, wind),
      wind_direction_deg: direction, wind_direction_compass: direction == null ? null : dirToCompass(direction),
      precipitation_1h_mm: round(v.precipitation_1h_mm), precipitation_24h_mm: round(v.precipitation_24h_mm), visibility_km: round(v.visibility_km),
      soil_moisture_10cm_pct: round(v.soil_moisture_10cm_pct), soil_temperature_10cm_c: round(v.soil_temperature_10cm_c), condition: v.condition ?? null,
    },
    quality: { flags, usable_for_current: false, notes: [...raw.notes] },
  };
}

const filled = (s: StationObservation) => Object.values(s.values).filter((v) => v != null).length;

/** Of two co-located records: the fresh one with more readings (a Met Office synop beats the airport METAR), then the newest, then the lower id. */
function preferred(a: StationObservation, b: StationObservation): StationObservation {
  const freshA = !a.quality.flags.includes("stale");
  const freshB = !b.quality.flags.includes("stale");
  if (freshA !== freshB) return freshA ? a : b;
  if (freshA && filled(a) !== filled(b)) return filled(a) > filled(b) ? a : b;
  if (a.observed_at !== b.observed_at) return a.observed_at > b.observed_at ? a : b;
  return a.id <= b.id ? a : b;
}

/**
 * Removes duplicate station ids and co-located stations (the same Met Office site can arrive under a WMO and a national id).
 * The preferred record wins; values it lacks are filled from the other record when that is also fresh.
 */
function dedupe(stations: StationObservation[]): StationObservation[] {
  const byKey = new Map<string, StationObservation>();
  for (const s of stations) {
    const key = s.network === "ea_rain_gauge" || s.network === "cosmos_uk" ? `${s.network}:${s.id}` : `${s.latitude.toFixed(3)},${s.longitude.toFixed(3)}`;
    const seen = byKey.get(key);
    if (!seen) {
      byKey.set(key, s);
      continue;
    }
    const newer = preferred(seen, s);
    const older = newer === s ? seen : s;
    if (!older.quality.flags.includes("stale")) {
      for (const [k, v] of Object.entries(older.values)) {
        if ((newer.values as Record<string, unknown>)[k] == null && v != null) (newer.values as Record<string, unknown>)[k] = v;
      }
      if (newer.quality.flags.includes("partial_rainfall") && newer.values.precipitation_24h_mm != null) {
        newer.quality.flags = newer.quality.flags.filter((f) => f !== "partial_rainfall");
        newer.quality.notes = newer.quality.notes.filter((note) => !/incomplete/.test(note));
      }
    }
    byKey.set(key, newer);
  }
  return [...byKey.values()];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Buddy check: an official station's temperature against the median of the other fresh official stations nearby. */
function buddyCheck(stations: StationObservation[]): void {
  const fresh = stations.filter((s) => s.tier === "official" && !s.quality.flags.includes("stale") && s.values.temperature_c != null);
  if (fresh.length < 3) return;
  for (const s of fresh) {
    const neighbours = fresh.filter((o) => o !== s && distanceKm(s.latitude, s.longitude, o.latitude, o.longitude) <= BUDDY_RADIUS_KM).map((o) => o.values.temperature_c as number);
    if (neighbours.length < 2) continue;
    if (Math.abs((s.values.temperature_c as number) - median(neighbours)) > BUDDY_TEMP_DIFF_C) s.quality.flags.push("temperature_outlier");
  }
}

function finalise(s: StationObservation, modelTemperatureC: number | null | undefined): void {
  if (modelTemperatureC != null && s.values.temperature_c != null && Math.abs(s.values.temperature_c - modelTemperatureC) > MODEL_TEMP_DIFF_C) {
    s.quality.flags.push("differs_from_model");
  }
  const hard = ["stale", "temperature_outlier", "no_air_readings"];
  s.quality.usable_for_current = s.tier === "official" && s.values.temperature_c != null && !s.quality.flags.some((f) => hard.includes(f));
}

/** Rough UK and Irish Sea bounding box, padded by the search radius, for the UK-only networks. */
export function inUk(location: Pick<ResolvedLocation, "latitude" | "longitude">, radiusKm: number): boolean {
  const pad = radiusKm / 100;
  return location.latitude >= 49.7 - pad && location.latitude <= 61.1 + pad && location.longitude >= -8.7 - pad && location.longitude <= 2.0 + pad;
}

/**
 * Every open observation source around a location, merged, de-duplicated, quality-flagged and sorted by distance.
 * A failing source adds a warning and never fails the whole set.
 */
export async function nearbyObservations(location: ResolvedLocation, options: Options): Promise<ObservationSet> {
  const now = options.now ?? Date.now();
  const radius = options.radiusKm;
  const loaders: Array<[string, Promise<SourceResult>]> = [
    ["Met Office stations via MeteoGate E-SOH", fetchEsoh(location, radius, now)],
    ["Airport METARs", fetchMetar(location, radius, now)],
    ...(inUk(location, radius) ? [
      ["COSMOS-UK", fetchCosmos(location, radius, now)] as [string, Promise<SourceResult>],
      ["Environment Agency rain gauges", fetchEaRainfall(location, radius, now)] as [string, Promise<SourceResult>],
    ] : []),
  ];
  const settled = await Promise.allSettled(loaders.map(([, p]) => p));
  const sources: Source[] = [];
  const warnings: string[] = [];
  const raw: RawObservation[] = [];
  settled.forEach((result, i) => {
    const label = loaders[i][0];
    if (result.status === "rejected") {
      warnings.push(`${label} unavailable: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
      return;
    }
    sources.push(result.value.source);
    raw.push(...result.value.stations);
  });
  const stations = dedupe(raw.map((r) => toStation(r, location, options.wind, now)))
    .filter((s) => s.distance_km <= radius)
    .sort((a, b) => a.distance_km - b.distance_km);
  buddyCheck(stations);
  for (const s of stations) finalise(s, options.modelTemperatureC);
  if (!stations.length && !warnings.length) warnings.push(`No open observation stations within ${radius} km.`);
  return { stations, sources, warnings };
}

/** The nearest official station whose reading is fresh enough and passed quality control. */
export function selectCurrent(stations: StationObservation[], maxDistanceKm = CURRENT_MAX_DISTANCE_KM): StationObservation | null {
  return stations.find((s) => s.quality.usable_for_current && s.distance_km <= maxDistanceKm) ?? null;
}

/** Nearest fresh 24 h rainfall reading from a gauge or station (gauges first, since they are the purpose-built instrument). */
export function selectRain24(stations: StationObservation[], maxDistanceKm = CURRENT_MAX_DISTANCE_KM): StationObservation | null {
  const fresh = stations.filter((s) => s.values.precipitation_24h_mm != null && s.distance_km <= maxDistanceKm && s.age_minutes <= 6 * 60);
  return fresh.find((s) => s.tier === "official_gauge") ?? fresh.find((s) => s.tier === "official") ?? fresh[0] ?? null;
}

/** Nearest soil moisture reading (COSMOS-UK), regardless of age up to two days. */
export function selectSoil(stations: StationObservation[], maxDistanceKm = 60): StationObservation | null {
  return stations.find((s) => s.values.soil_moisture_10cm_pct != null && s.distance_km <= maxDistanceKm && s.age_minutes <= 48 * 60) ?? null;
}

export function describeStation(s: StationObservation): string {
  return `${s.name} (${s.network_label}, ${s.distance_km} km)`;
}

export function ageLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} h ago`;
}
