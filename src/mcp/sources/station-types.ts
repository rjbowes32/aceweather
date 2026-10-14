import type { Source } from "../envelope.ts";

export type NetworkId = "metoffice_synop" | "metoffice_aws" | "esoh_station" | "metar" | "cosmos_uk" | "ea_rain_gauge";
export type Tier = "official" | "official_gauge" | "research";

/** One station's latest reading in canonical units (°C, km/h, hPa, mm, %, km) before unit conversion and quality control. */
export type RawObservation = {
  id: string;
  name: string;
  network: NetworkId;
  network_label: string;
  tier: Tier;
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  observed_at: string;
  values: {
    temperature_c?: number | null;
    dew_point_c?: number | null;
    relative_humidity_pct?: number | null;
    pressure_msl_hpa?: number | null;
    wind_speed_kmh?: number | null;
    wind_gust_kmh?: number | null;
    wind_direction_deg?: number | null;
    precipitation_1h_mm?: number | null;
    precipitation_24h_mm?: number | null;
    visibility_km?: number | null;
    soil_moisture_10cm_pct?: number | null;
    soil_temperature_10cm_c?: number | null;
    condition?: string | null;
  };
  /** Source-specific notes that feed quality flags (e.g. partial 24 h rainfall). */
  notes: string[];
};

export type SourceResult = { stations: RawObservation[]; source: Source };

export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Index of the last non-null entry in a series, or -1. */
export function lastIndex(values: unknown[]): number {
  for (let i = values.length - 1; i >= 0; i--) if (num(values[i]) != null) return i;
  return -1;
}

/** Sum of the last `count` entries with a completeness count. */
export function tailSum(values: unknown[], count: number): { sum: number; available: number } {
  let sum = 0;
  let available = 0;
  for (let i = Math.max(0, values.length - count); i < values.length; i++) {
    const v = num(values[i]);
    if (v == null) continue;
    sum += v;
    available++;
  }
  return { sum, available };
}
