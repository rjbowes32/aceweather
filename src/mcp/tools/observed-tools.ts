import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { currentBlock, currentSchema } from "../current.ts";
import { locationOut } from "../envelope.ts";
import { hourlySummarySchema, loadHistory, type HistoryResult } from "../history.ts";
import { locationInput, resolveLocation } from "../locations.ts";
import {
  ageLabel, CURRENT_MAX_AGE_MIN, CURRENT_MAX_DISTANCE_KM, describeStation, nearbyObservations, QUALITY_FLAGS, selectCurrent, selectRain24, selectSoil,
  stationObservationSchema, TIERS, type StationObservation,
} from "../observations.ts";
import {
  DEFINITIONS, historyRowSchema, historySummarySchema, hourlyRowSchema, monthRowSchema, type Detail,
} from "../rows.ts";
import { FORECAST_SOURCE, getForecast, withTimezone } from "../sources/forecast.ts";
import { units, type WindUnit } from "../units.ts";
import { detailInput, periodInput, readTool, windUnitInput } from "./define.ts";

const CURRENT_RADIUS_KM = 60;
const radiusInput = z.number().int().min(5).max(100).default(50).describe("Search radius in km (5-100). Default 50.");
const observedSchema = z.object({
  station: stationObservationSchema,
  rain_24h: z.object({ station: z.string(), precipitation_24h_mm: z.number().nullable(), observed_at: z.string() }).nullable(),
  soil: z.object({ station: z.string(), soil_moisture_10cm_pct: z.number().nullable(), soil_temperature_10cm_c: z.number().nullable(), observed_at: z.string() }).nullable(),
});

function describeObserved(station: StationObservation, windLabel: string): string {
  const v = station.values;
  const parts = [
    v.temperature_c != null ? `${v.temperature_c} °C` : null,
    v.condition,
    v.wind_speed != null ? `wind ${v.wind_speed}${v.wind_gust != null ? ` gusting ${v.wind_gust}` : ""} ${windLabel}${v.wind_direction_compass ? ` from ${v.wind_direction_compass}` : ""}` : null,
    v.relative_humidity_pct != null ? `humidity ${v.relative_humidity_pct}%` : null,
    v.precipitation_1h_mm != null ? `${v.precipitation_1h_mm} mm rain in the last hour` : null,
  ].filter(Boolean);
  return `Observed at ${describeStation(station)} ${station.observed_at} (${ageLabel(station.age_minutes)}): ${parts.join(", ")}.`;
}

const summarySchema = z.union([historySummarySchema, hourlySummarySchema]);
const definitionsSchema = z.record(z.string(), z.string());

function describeHistory(name: string, h: HistoryResult): string {
  const s = h.summary as Record<string, any>;
  const rain = s.precipitation_total_mm == null ? "rainfall unavailable" : `${s.precipitation_total_mm} mm rain`;
  const high = s.temp_max ? `high ${s.temp_max.value} °C` : null;
  const low = s.temp_min ? `low ${s.temp_min.value} °C` : null;
  const days = h.granularity === "hour" ? "" : `, ${s.rain_days} rain day(s)`;
  return `${name}, ${h.period.label}: ${rain}${days}${[high, low].filter(Boolean).length ? `, ${[high, low].filter(Boolean).join(", ")}` : ""}. Data ${h.completeness.percent}% complete (${h.classification}).`;
}

export function registerObservedTools(server: McpServer): string[] {
  return [
    readTool(server, "get_current_weather", {
      title: "Current weather",
      description: "Current conditions for a location. Prefers the nearest fresh, quality-controlled official station observation (Met Office station via MeteoGate E-SOH or airport METAR within 40 km and 90 minutes) and always includes the forecast model's current-hour grid-point analysis for comparison. Also attaches the nearest 24 h rain-gauge total and COSMOS-UK soil moisture when available. data.preferred says which one to quote.",
      input: { ...locationInput, wind_unit: windUnitInput },
      data: z.object({ preferred: z.enum(["observation", "model"]), observed: observedSchema.nullable(), model: currentSchema, nearby_stations: z.number() }),
    }, async (args) => {
      const location = await withTimezone(await resolveLocation(args));
      const wind = args.wind_unit as WindUnit;
      const { raw, retrieved_at } = await getForecast(location);
      const model = currentBlock(raw, wind);
      const observations = await nearbyObservations(location, { radiusKm: CURRENT_RADIUS_KM, wind, modelTemperatureC: model.temperature_c })
        .catch((error: Error) => ({ stations: [], sources: [], warnings: [`Observations unavailable: ${error.message}`] }));
      const station = selectCurrent(observations.stations);
      const rain = selectRain24(observations.stations);
      const soil = selectSoil(observations.stations);
      const observed = station ? {
        station,
        rain_24h: rain ? { station: describeStation(rain), precipitation_24h_mm: rain.values.precipitation_24h_mm, observed_at: rain.observed_at } : null,
        soil: soil ? { station: describeStation(soil), soil_moisture_10cm_pct: soil.values.soil_moisture_10cm_pct, soil_temperature_10cm_c: soil.values.soil_temperature_10cm_c, observed_at: soil.observed_at } : null,
      } : null;
      const modelLine = `Model grid point at ${model.valid_at ?? "now"} (${location.timezone}): ${model.temperature_c ?? "?"} °C, ${model.condition ?? "condition unknown"}, wind ${model.wind_speed ?? "?"} gusting ${model.wind_gust ?? "?"} ${units(wind).wind_speed}, humidity ${model.relative_humidity_pct ?? "?"}%.`;
      const extras = observed ? [
        observed.rain_24h?.precipitation_24h_mm != null ? `Rain last 24 h: ${observed.rain_24h.precipitation_24h_mm} mm at ${observed.rain_24h.station}.` : null,
        observed.soil?.soil_moisture_10cm_pct != null ? `Soil moisture ${observed.soil.soil_moisture_10cm_pct}% at 10 cm, ${observed.soil.station} (${observed.soil.observed_at}).` : null,
      ].filter(Boolean) : [];
      const warnings = [...location.warnings, ...observations.warnings];
      if (station) {
        warnings.push(`Observation is from a station ${station.distance_km} km away; conditions at the location itself can differ, especially rainfall and wind.`);
        if (station.quality.flags.length) warnings.push(`Station quality flags: ${station.quality.flags.join(", ")}.`);
      } else {
        warnings.push(`No usable official station within ${CURRENT_MAX_DISTANCE_KM} km reporting in the last ${CURRENT_MAX_AGE_MIN} minutes; values are modelled grid-point conditions, not measured.`);
      }
      return {
        summary: `${location.name}: ${station ? `${describeObserved(station, units(wind).wind_speed)} ${extras.join(" ")} ${modelLine}` : `${modelLine} Modelled, not measured.`}`.replace(/\s+/g, " ").trim(),
        classification: station ? "mixed" : "model_current",
        location: locationOut(location),
        units: units(wind),
        sources: [
          ...observations.sources,
          { ...FORECAST_SOURCE, classification: "model_current", retrieved_at, notes: "Current-hour model values for the grid point (15-minute resolution where available)." },
        ],
        warnings,
        data: { preferred: station ? "observation" : "model", observed, model, nearby_stations: observations.stations.length },
      };
    }),

    readTool(server, "get_nearby_observations", {
      title: "Nearby observations",
      description: "Real station observations around a location from open sources: Met Office synoptic and automatic stations (via MeteoGate E-SOH), airport METARs, Environment Agency 15-minute rain gauges and COSMOS-UK soil moisture sites. Each station carries distance, age, tier and quality flags from range, freshness, neighbour and model-residual checks. Sorted by distance.",
      input: { ...locationInput, radius_km: radiusInput, limit: z.number().int().min(1).max(25).default(10).describe("Maximum stations to return (1-25). Default 10."), wind_unit: windUnitInput },
      data: z.object({
        stations: z.array(stationObservationSchema),
        total_within_radius: z.number(),
        tiers: z.record(z.string(), z.string()),
        quality_flags: z.record(z.string(), z.string()),
      }),
    }, async (args) => {
      const location = await withTimezone(await resolveLocation(args));
      const wind = args.wind_unit as WindUnit;
      const model = await getForecast(location).then(({ raw }) => currentBlock(raw, wind).temperature_c).catch(() => null);
      const observations = await nearbyObservations(location, { radiusKm: args.radius_km, wind, modelTemperatureC: model });
      const stations = observations.stations.slice(0, args.limit);
      const usable = observations.stations.filter((s) => s.quality.usable_for_current).length;
      const nearest = stations[0];
      return {
        summary: `${observations.stations.length} station(s) within ${args.radius_km} km of ${location.name}, ${usable} usable for current conditions.${nearest ? ` Nearest: ${describeObserved(nearest, units(wind).wind_speed)}` : ""}`,
        classification: "observation",
        location: locationOut(location),
        units: { ...units(wind), soil_moisture_10cm_pct: "% volumetric water content at 10 cm", visibility: "km" },
        sources: observations.sources,
        warnings: [...location.warnings, ...observations.warnings, "Station readings are measured at the station, not at the location; use distance and age to judge relevance."],
        data: { stations, total_within_radius: observations.stations.length, tiers: TIERS, quality_flags: QUALITY_FLAGS },
      };
    }),

    readTool(server, "get_weather_history", {
      title: "Weather history",
      description: "Historical weather for a location over a named or custom period: daily rows (or monthly rows for long periods) plus totals, extremes, rain days, frost days and dry/wet spells. Daily periods use the ERA5 reanalysis archive back to 1940 and end yesterday; today/last_24h/48h/72h use the model's recent hours. Up to 730 days per call.",
      input: { ...locationInput, ...periodInput, wind_unit: windUnitInput, detail: detailInput },
      data: z.object({
        granularity: z.enum(["day", "month", "hour"]),
        summary: summarySchema,
        rows: z.array(z.union([historyRowSchema, monthRowSchema, hourlyRowSchema])),
        definitions: definitionsSchema,
      }),
    }, async (args) => {
      const location = await withTimezone(await resolveLocation(args));
      const wind = args.wind_unit as WindUnit;
      const history = await loadHistory(location, args, wind, args.detail as Detail);
      return {
        summary: describeHistory(location.name, history),
        classification: history.classification,
        location: locationOut(location),
        period: history.period,
        units: units(wind),
        sources: history.sources,
        completeness: history.completeness,
        warnings: [...location.warnings, ...history.warnings],
        data: { granularity: history.granularity, summary: history.summary, rows: history.rows, definitions: DEFINITIONS },
      };
    }),

    readTool(server, "get_weather_digest", {
      title: "Weather digest",
      description: "Compact summary of what the weather did over a period at one location (no daily rows): rainfall, rain days, temperature extremes, frost days, gusts, humidity, evapotranspiration, sunshine, soil and dry/wet spells, with a one-paragraph summary.",
      input: { ...locationInput, ...periodInput, wind_unit: windUnitInput },
      data: z.object({ summary: summarySchema, definitions: definitionsSchema }),
    }, async (args) => {
      const location = await withTimezone(await resolveLocation(args));
      const wind = args.wind_unit as WindUnit;
      const history = await loadHistory(location, args, wind, "compact");
      return {
        summary: describeHistory(location.name, history),
        classification: history.classification,
        location: locationOut(location),
        period: history.period,
        units: units(wind),
        sources: history.sources,
        completeness: history.completeness,
        warnings: [...location.warnings, ...history.warnings],
        data: { summary: history.summary, definitions: DEFINITIONS },
      };
    }),
  ];
}
