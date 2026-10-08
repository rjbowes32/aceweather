import { z } from "zod";
import { cached } from "./cache.ts";
import { apiBase, apiHeaders } from "./config.ts";
import { isTimezone } from "./dates.ts";
import { invalid, ToolError } from "./errors.ts";
import { fetchJson } from "./upstream.ts";

export const locationInput = {
  place: z.string().trim().min(2).max(120).optional()
    .describe("Town, village, UK postcode, named region or 'lat,lon'. Ambiguous names are reported, never silently swapped."),
  latitude: z.number().min(-90).max(90).optional().describe("Decimal degrees (use with longitude)."),
  longitude: z.number().min(-180).max(180).optional().describe("Decimal degrees (use with latitude)."),
  saved_location: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/).optional()
    .describe("A saved group location as 'group/slug', e.g. 'cropdynamics/pocklington'. See get_saved_location_groups."),
  timezone: z.string().max(64).optional().describe("IANA timezone such as Europe/London. Defaults to the location's own timezone."),
};

export type LocationInput = { place?: string; latitude?: number; longitude?: number; saved_location?: string; timezone?: string };

export type Candidate = {
  name: string; admin1: string | null; country: string | null; country_code: string | null;
  latitude: number; longitude: number; timezone: string; elevation_m: number | null;
  feature_code: string | null; population: number | null; source: string;
};

export type ResolvedLocation = {
  name: string; latitude: number; longitude: number; timezone: string; elevation_m: number | null;
  resolution: { method: "coordinates" | "geocoded" | "saved_location"; query?: string; ambiguous?: boolean; candidates?: Candidate[]; feature_code?: string | null };
  warnings: string[];
};

export type SavedGroup = { id: string; locations: Array<{ slug: string; label: string; query: string; latitude: number; longitude: number; timezone: string }> };

const COORDS = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const REGION_CODES = /^(ADM|PCL|RGN|AREA|ISL|MT)/;

export const describe = (c: Candidate) => [c.name, c.admin1, c.country].filter(Boolean).join(", ");
export const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function parseCoordinates(text: string): [number, number] | null {
  const match = COORDS.exec(text);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export async function searchPlaces(query: string): Promise<Candidate[]> {
  const body = await cached(`search:${normal(query)}`, 24 * 3600_000, () =>
    fetchJson("AceWeather location search", `${apiBase()}/api/search?query=${encodeURIComponent(query)}`, apiHeaders()));
  return (body?.results ?? []).map((r: any): Candidate => ({
    name: String(r.name ?? ""),
    admin1: r.admin1 || null,
    country: r.country || null,
    country_code: r.country_code || null,
    latitude: Number(r.latitude),
    longitude: Number(r.longitude),
    timezone: r.timezone && r.timezone !== "auto" ? String(r.timezone) : "auto",
    elevation_m: r.elevation ?? null,
    feature_code: r.feature_code ?? null,
    population: r.population ?? null,
    source: "id" in r ? "Open-Meteo geocoding (GeoNames)" : "OpenStreetMap Nominatim",
  })).filter((c: Candidate) => Number.isFinite(c.latitude) && Number.isFinite(c.longitude));
}

export function getSavedGroups(): Promise<SavedGroup[]> {
  return cached("groups", 10 * 60_000, () =>
    fetchJson("AceWeather location groups", `${apiBase()}/api/groups`, apiHeaders()).then((body) => body.groups as SavedGroup[]));
}

function coordinates(latitude: number, longitude: number, timezone: string, query?: string): ResolvedLocation {
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw invalid("Coordinates are out of range.");
  return {
    name: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`, latitude, longitude, timezone, elevation_m: null,
    resolution: { method: "coordinates", ...(query ? { query } : {}) }, warnings: [],
  };
}

export async function resolveSaved(id: string, timezone?: string): Promise<ResolvedLocation> {
  const [groupId, slug] = id.split("/");
  const group = (await getSavedGroups()).find((g) => g.id === groupId);
  const location = group?.locations.find((l) => l.slug === slug);
  if (!location) throw new ToolError("not_found", `No saved location '${id}'. Call get_saved_location_groups for valid ids.`);
  return {
    name: location.label, latitude: location.latitude, longitude: location.longitude,
    timezone: timezone ?? location.timezone, elevation_m: null,
    resolution: { method: "saved_location", query: id }, warnings: [],
  };
}

async function geocode(query: string, timezone?: string): Promise<ResolvedLocation> {
  const candidates = await searchPlaces(query);
  const top = candidates[0];
  if (!top) throw new ToolError("not_found", `No location found for '${query}'. Try a nearby town, a postcode or coordinates.`);
  const warnings: string[] = [];
  const namesakes = candidates.slice(1).filter((c) => normal(c.name) === normal(top.name) && describe(c) !== describe(top));
  if (namesakes.length) {
    warnings.push(`'${query}' matched ${describe(top)}. ${namesakes.length} other place(s) share the name: ${namesakes.slice(0, 3).map(describe).join("; ")}. Give a more specific place or coordinates if this is not the intended one.`);
  }
  const head = normal(query.split(",")[0]);
  if (!normal(top.name).includes(head) && !head.includes(normal(top.name))) {
    warnings.push(`'${query}' resolved to ${describe(top)}. Check this is the intended location.`);
  }
  if (top.feature_code && REGION_CODES.test(top.feature_code)) {
    warnings.push(`${top.name} is an area; it is represented by a single point. Use get_regional_weather with several locations for area-wide conditions.`);
  }
  return {
    name: describe(top), latitude: top.latitude, longitude: top.longitude,
    timezone: timezone ?? top.timezone, elevation_m: top.elevation_m,
    resolution: {
      method: "geocoded", query, ambiguous: namesakes.length > 0, feature_code: top.feature_code,
      ...(namesakes.length ? { candidates: candidates.slice(0, 5) } : {}),
    },
    warnings,
  };
}

export async function resolveLocation(input: LocationInput): Promise<ResolvedLocation> {
  if (input.timezone && !isTimezone(input.timezone)) throw invalid(`Unknown timezone '${input.timezone}'.`);
  const hasCoords = input.latitude !== undefined || input.longitude !== undefined;
  const modes = [input.place !== undefined, hasCoords, input.saved_location !== undefined].filter(Boolean).length;
  if (modes !== 1) throw invalid("Provide exactly one of: place, latitude+longitude, or saved_location.");
  if (hasCoords) {
    if (input.latitude === undefined || input.longitude === undefined) throw invalid("latitude and longitude must be given together.");
    return coordinates(input.latitude, input.longitude, input.timezone ?? "auto");
  }
  if (input.saved_location) return resolveSaved(input.saved_location, input.timezone);
  const place = input.place as string;
  const coords = parseCoordinates(place);
  if (coords) return coordinates(coords[0], coords[1], input.timezone ?? "auto", place);
  return geocode(place, input.timezone);
}
