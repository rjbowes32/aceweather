import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { currentBlock, currentSchema } from "../current.ts";
import { candidateSchema, completenessSchema, locationOut, periodSchema, type Source } from "../envelope.ts";
import { ToolError } from "../errors.ts";
import { loadHistory } from "../history.ts";
import {
  describe, getSavedGroups, locationInput, normal, parseCoordinates, resolveLocation, searchPlaces, type Candidate,
} from "../locations.ts";
import { dailyForecastRow, dailyForecastRowSchema, gustsByDate, historySummarySchema } from "../rows.ts";
import { FORECAST_SOURCE, getForecast, withTimezone } from "../sources/forecast.ts";
import { units, type WindUnit } from "../units.ts";
import { detailInput, readTool, windUnitInput } from "./define.ts";

const savedSchema = z.object({ id: z.string(), label: z.string(), query: z.string(), latitude: z.number(), longitude: z.number(), timezone: z.string() });
const SEARCH_SOURCE = "AceWeather /api/search (Open-Meteo geocoding, OpenStreetMap Nominatim fallback)";
const GROUPS_SOURCE = "AceWeather saved location groups (/api/groups)";

async function savedMatches(query: string) {
  const q = normal(query);
  const groups = await getSavedGroups().catch(() => []);
  return groups.flatMap((g) => g.locations
    .filter((l) => normal(l.label).includes(q) || normal(l.query).includes(q) || q.includes(normal(l.query.split(",")[0])))
    .map((l) => ({ id: `${g.id}/${l.slug}`, label: l.label, query: l.query, latitude: l.latitude, longitude: l.longitude, timezone: l.timezone })));
}

export function registerLocationTools(server: McpServer): string[] {
  return [
    readTool(server, "search_locations", {
      title: "Search locations",
      description: "Find towns, villages, UK postcodes, named regions or 'lat,lon' coordinates. Returns ranked candidates with coordinates and timezone, plus matching saved AceWeather locations. Pass a candidate's coordinates or a saved_location id to the weather tools.",
      input: {
        query: z.string().trim().min(2).max(120).describe("Place name, postcode, region or 'lat,lon'."),
        limit: z.number().int().min(1).max(10).default(5),
      },
      data: z.object({ query: z.string(), candidates: z.array(candidateSchema), saved_locations: z.array(savedSchema) }),
    }, async ({ query, limit }) => {
      const retrieved_at = new Date().toISOString();
      const coords = parseCoordinates(query);
      const candidates: Candidate[] = coords
        ? [{ name: `${coords[0]}, ${coords[1]}`, admin1: null, country: null, country_code: null, latitude: coords[0], longitude: coords[1], timezone: "auto", elevation_m: null, feature_code: null, population: null, source: "coordinates" }]
        : (await searchPlaces(query)).slice(0, limit);
      const saved = coords ? [] : await savedMatches(query);
      return {
        summary: candidates.length
          ? `${candidates.length} match(es) for '${query}': ${candidates.map(describe).join("; ")}.${saved.length ? ` Saved: ${saved.map((s) => s.id).join(", ")}.` : ""}`
          : `No locations found for '${query}'.`,
        classification: "reference",
        sources: [{ name: SEARCH_SOURCE, classification: "reference", retrieved_at }],
        warnings: candidates.some((c) => normal(c.name) === normal(candidates[0].name) && describe(c) !== describe(candidates[0]))
          ? ["Several places share this name; check admin1/country before choosing."] : [],
        data: { query, candidates, saved_locations: saved },
      };
    }),

    readTool(server, "get_saved_location_groups", {
      title: "Saved location groups",
      description: "List AceWeather's predefined location groups (for example the Crop Dynamics regional locations) with each location's id, coordinates and timezone.",
      input: { group: z.string().regex(/^[a-z0-9-]+$/).optional().describe("Return only this group, e.g. 'cropdynamics'.") },
      data: z.object({ groups: z.array(z.object({ id: z.string(), location_count: z.number(), locations: z.array(savedSchema) })) }),
    }, async ({ group }) => {
      const retrieved_at = new Date().toISOString();
      const groups = (await getSavedGroups()).filter((g) => !group || g.id === group);
      if (group && !groups.length) throw new ToolError("not_found", `No saved group '${group}'.`);
      return {
        summary: groups.map((g) => `${g.id}: ${g.locations.map((l) => l.label.split(",")[0]).join(", ")}`).join(". "),
        classification: "reference",
        sources: [{ name: GROUPS_SOURCE, classification: "reference", retrieved_at }],
        warnings: [],
        data: {
          groups: groups.map((g) => ({
            id: g.id,
            location_count: g.locations.length,
            locations: g.locations.map((l) => ({ id: `${g.id}/${l.slug}`, label: l.label, query: l.query, latitude: l.latitude, longitude: l.longitude, timezone: l.timezone })),
          })),
        },
      };
    }),

    readTool(server, "get_location_weather", {
      title: "Location weather overview",
      description: "One-call overview for a location: modelled current conditions, the next 7 days of forecast and a summary of the last 7 days from the historical archive. Each part is labelled as model, forecast or reanalysis.",
      input: { ...locationInput, wind_unit: windUnitInput, detail: detailInput },
      data: z.object({
        current: currentSchema,
        next_7_days: z.array(dailyForecastRowSchema),
        last_7_days: z.object({ period: periodSchema, summary: historySummarySchema, completeness: completenessSchema }).nullable(),
      }),
    }, async (args) => {
      const location = await withTimezone(await resolveLocation(args));
      const wind = args.wind_unit as WindUnit;
      const [forecast, history] = await Promise.all([getForecast(location), loadHistory(location, { period: "last_7d" }, wind, "compact").catch((error: Error) => error)]);
      const d = forecast.raw.daily ?? {};
      const start = Math.max(0, (d.time ?? []).indexOf(String(forecast.raw.current?.time ?? "").slice(0, 10)));
      const gusts = gustsByDate(forecast.raw.hourly ?? {});
      const next = Array.from({ length: Math.min(7, (d.time?.length ?? 0) - start) }, (_, k) => dailyForecastRow(d, start + k, gusts, wind, args.detail));
      const current = currentBlock(forecast.raw, wind);
      const warnings = [...location.warnings, "Current conditions are modelled for the grid point, not measured by a station."];
      const sources: Source[] = [{ ...FORECAST_SOURCE, classification: "forecast", retrieved_at: forecast.retrieved_at }];
      if (history instanceof Error) warnings.push(`Last 7 days unavailable: ${history.message}`);
      else sources.push(...history.sources);
      const rain7 = next.reduce((total, row) => total + (Number(row.precipitation_mm) || 0), 0);
      return {
        summary: `${location.name}: ${current.temperature_c ?? "?"} °C now (modelled), ${current.condition ?? "condition unknown"}. Next 7 days: ${rain7.toFixed(1)} mm forecast rain.${history instanceof Error ? "" : ` Last 7 days: ${history.summary.precipitation_total_mm ?? "?"} mm over ${history.summary.rain_days} rain day(s).`}`,
        classification: "mixed",
        location: locationOut(location),
        units: units(wind),
        sources,
        warnings,
        data: {
          current,
          next_7_days: next,
          last_7_days: history instanceof Error ? null : { period: history.period, summary: history.summary, completeness: history.completeness },
        },
      };
    }),
  ];
}
