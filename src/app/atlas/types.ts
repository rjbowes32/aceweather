export type AtlasFreshnessState = "current" | "provisional" | "cached" | "unavailable";

export type AtlasFreshness = {
  state: AtlasFreshnessState;
  as_of: string | null;
};

export type AtlasCrop = {
  crop: string;
  yield_t_ha: number;
  ten_year_avg_t_ha: number;
  anomaly_pct: number;
  harvested_pct: number;
};

export type AtlasRainLocation = {
  location?: string;
  rain_mm?: number;
  high_c?: number;
  low_c?: number;
};

export type AtlasRecentRain = {
  available?: boolean;
  retrieved_at?: string;
  message?: string;
  date_range?: {
    start?: string;
    end?: string;
    days?: number;
  };
  locations?: AtlasRainLocation[];
};

export type AtlasPayload = {
  schema_version: "atlas.v1";
  name: string;
  edition: number;
  updated: string;
  status: string;
  generated_at: string;
  freshness: {
    snapshot: AtlasFreshness;
    recent_rain: AtlasFreshness;
  };
  headline: {
    england_july_rain_mm: number;
    england_july_rain_context: string;
    east_anglia_mar_may_rain_mm: number;
    england_august_rain_pct_lta: number;
    england_august_rain_to_date: string;
    england_september_rain_pct_lta: number;
    england_september_rain_to_date: string;
    reservoir_storage_pct: number;
    reservoir_context: string;
    recovery_rainfall_pct_lta: number;
    recovery_period: string;
    wheat_yield_t_ha: number;
    wheat_vs_10y_pct: number;
  };
  drought: {
    meteorological: { status: string };
    agricultural: { status: string };
    hydrological: { status: string };
    measured_yield_impact: { status: string };
    england_area_pct: number;
    river_flows_below_normal_or_lower_pct: number;
    river_flow_breakdown_pct?: {
      below_normal: number;
      notably_low: number;
      exceptionally_low: number;
    };
    groundwater_exceptionally_low_sites: number;
    groundwater_context: string;
    abstraction_restrictions: number;
    voluntary_abstraction_restrictions: number;
    agriculture_context: string;
    recovery_outlook: {
      rainfall_needed_pct_lta: number;
      period: string;
      most_likely_april_drought_areas: string[];
      dry_scenario_probability_pct: number;
      severe_drought_probability_pct: number;
      context: string;
    };
  };
  crops: AtlasCrop[];
  wheat_genetics: {
    benchmark: string;
    "2026_t_ha": number;
    five_year_mean_t_ha: number;
    anomaly_pct: number;
  };
  forage: Array<{
    location: string;
    grass_growth_kg_dm_ha_day: number;
  }>;
  recent_rain: AtlasRecentRain;
  caveats: {
    oilseed_rape: string;
    "2026_yields": string;
  };
  sources: Record<string, string>;
  source_details: Array<{
    key: string;
    label: string;
    url: string;
    licence: string;
    observed_at: string | null;
  }>;
};

export function classifyAtlasTrust(input: {
  cacheSource: string | null;
  cacheAgeMs: number;
  generatedAgeMs: number;
  repeatedSnapshot: boolean;
}): "fresh" | "cached" {
  return input.cacheSource === "cache"
    || input.cacheAgeMs > 15 * 60 * 1000
    || input.generatedAgeMs > 15 * 60 * 1000
    || input.repeatedSnapshot
    ? "cached"
    : "fresh";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasStatus(value: unknown): value is { status: string } {
  return isRecord(value) && isText(value.status);
}

function validFreshness(value: unknown) {
  if (!isRecord(value)) return false;
  return ["current", "provisional", "cached", "unavailable"].includes(String(value.state))
    && (value.as_of === null || isText(value.as_of));
}

function validRecentRain(value: unknown) {
  if (!isRecord(value)) return false;
  if (value.available === false) return true;
  if (value.available !== true || !isRecord(value.date_range) || !Array.isArray(value.locations)) return false;
  if (!isText(value.date_range.end) || !isNumber(value.date_range.days)) return false;
  return value.locations.length > 0 && value.locations.every((row) => (
    isRecord(row) && isText(row.location) && isNumber(row.rain_mm)
  ));
}

export function isAtlasPayload(value: unknown): value is AtlasPayload {
  if (!isRecord(value) || value.schema_version !== "atlas.v1") return false;
  if (!isText(value.name) || !isNumber(value.edition) || !isText(value.updated) || !isText(value.status) || !isText(value.generated_at)) return false;
  if (!isRecord(value.freshness) || !validFreshness(value.freshness.snapshot) || !validFreshness(value.freshness.recent_rain)) return false;

  const headline = value.headline;
  if (!isRecord(headline) || ![
    headline.england_july_rain_mm,
    headline.east_anglia_mar_may_rain_mm,
    headline.england_august_rain_pct_lta,
    headline.england_september_rain_pct_lta,
    headline.reservoir_storage_pct,
    headline.recovery_rainfall_pct_lta,
    headline.wheat_yield_t_ha,
    headline.wheat_vs_10y_pct,
  ].every(isNumber)
    || !isText(headline.england_july_rain_context)
    || !isText(headline.england_august_rain_to_date)
    || !isText(headline.england_september_rain_to_date)
    || !isText(headline.reservoir_context)
    || !isText(headline.recovery_period)) return false;

  const drought = value.drought;
  if (!isRecord(drought)
    || !hasStatus(drought.meteorological)
    || !hasStatus(drought.agricultural)
    || !hasStatus(drought.hydrological)
    || !hasStatus(drought.measured_yield_impact)
    || ![
      drought.england_area_pct,
      drought.river_flows_below_normal_or_lower_pct,
      drought.groundwater_exceptionally_low_sites,
      drought.abstraction_restrictions,
      drought.voluntary_abstraction_restrictions,
    ].every(isNumber)
    || !isText(drought.groundwater_context)
    || !isText(drought.agriculture_context)
    || !isRecord(drought.recovery_outlook)
    || ![
      drought.recovery_outlook.rainfall_needed_pct_lta,
      drought.recovery_outlook.dry_scenario_probability_pct,
      drought.recovery_outlook.severe_drought_probability_pct,
    ].every(isNumber)
    || !isText(drought.recovery_outlook.period)
    || !isText(drought.recovery_outlook.context)
    || !Array.isArray(drought.recovery_outlook.most_likely_april_drought_areas)
    || !drought.recovery_outlook.most_likely_april_drought_areas.every(isText)) return false;

  if (!Array.isArray(value.crops) || !value.crops.length || !value.crops.every((crop) => (
    isRecord(crop)
    && isText(crop.crop)
    && [crop.yield_t_ha, crop.ten_year_avg_t_ha, crop.anomaly_pct, crop.harvested_pct].every(isNumber)
  ))) return false;

  if (!isRecord(value.wheat_genetics)
    || !isText(value.wheat_genetics.benchmark)
    || ![value.wheat_genetics["2026_t_ha"], value.wheat_genetics.five_year_mean_t_ha, value.wheat_genetics.anomaly_pct].every(isNumber)) return false;

  if (!Array.isArray(value.forage) || !value.forage.every((row) => (
    isRecord(row) && isText(row.location) && isNumber(row.grass_growth_kg_dm_ha_day)
  ))) return false;
  if (!validRecentRain(value.recent_rain)) return false;
  if (!isRecord(value.caveats) || !isText(value.caveats["2026_yields"]) || !isText(value.caveats.oilseed_rape)) return false;
  if (!isRecord(value.sources) || !Object.values(value.sources).every(isText)) return false;
  if (!Array.isArray(value.source_details) || !value.source_details.every((source) => (
    isRecord(source)
    && isText(source.key)
    && isText(source.label)
    && isText(source.url)
    && isText(source.licence)
    && (source.observed_at === null || isText(source.observed_at))
  ))) return false;
  return true;
}
