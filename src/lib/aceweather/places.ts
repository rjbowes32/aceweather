import type { AwLocation } from "./open-meteo.ts";

export const HERE_NAME = "Here";
/** Enough farms and fields for a day's round, with a visible stop instead of a silent drop. */
export const MAX_SAVED = 24;
/** Search text sent to a geocoder. Longer pastes are cut, not forwarded. */
export const MAX_SEARCH_CHARS = 80;

export type SearchKind = "full-postcode" | "outcode" | "place";

export type ClassifiedQuery = { kind: SearchKind; compact: string };

const FULL_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/;

export function capSearchQuery(raw: string): string {
  return raw.trim().slice(0, MAX_SEARCH_CHARS);
}

/** Great Britain and Northern Ireland, with a little slack. Outside this, postcodes.io is not asked. */
export function inRoughUkBox(lat: number, lon: number): boolean {
  return lat >= 49.5 && lat <= 61 && lon >= -8.8 && lon <= 1.9;
}

/** A UK postcode (full or outward code) or an ordinary place name. */
export function classifyQuery(raw: string): ClassifiedQuery | null {
  const trimmed = capSearchQuery(raw);
  if (trimmed.length < 2) return null;
  const compact = trimmed.toUpperCase().replace(/\s+/g, "");
  if (FULL_POSTCODE.test(compact)) return { kind: "full-postcode", compact };
  if (OUTCODE.test(compact)) return { kind: "outcode", compact };
  return { kind: "place", compact: trimmed };
}

export function isUk(place: { country?: string; countryCode?: string }): boolean {
  return place.countryCode === "GB" || place.country === "United Kingdom";
}

/** British matches first, then everywhere else, keeping the order within each group. */
export function rankPlaces<T extends { country?: string; countryCode?: string }>(places: T[], limit = 8): T[] {
  const uk: T[] = [];
  const rest: T[] = [];
  for (const place of places) (isUk(place) ? uk : rest).push(place);
  return [...uk, ...rest].slice(0, limit);
}

/** County or district in Britain. The state (or equivalent) elsewhere. */
export function regionFromGeocode(row: {
  country?: string;
  country_code?: string;
  admin1?: unknown;
  admin2?: unknown;
  admin3?: unknown;
}): string {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const uk = row.country_code === "GB" || row.country === "United Kingdom";
  if (uk) return text(row.admin2) || text(row.admin3) || text(row.admin1);
  return text(row.admin1);
}

export function placeKey(place: { id?: string; lat: number; lon: number }): string {
  return place.id || `${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

/** Saved places from storage. An empty or broken list stays empty. Nothing is planted. */
export function parseSaved(raw: unknown): AwLocation[] {
  if (!Array.isArray(raw)) return [];
  const places: AwLocation[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.name !== "string") continue;
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const place: AwLocation = {
      id: typeof item.id === "string" ? item.id : undefined,
      name: item.name,
      region: typeof item.region === "string" ? item.region : "",
      country: typeof item.country === "string" ? item.country : "",
      countryCode: typeof item.countryCode === "string" ? item.countryCode : undefined,
      lat,
      lon,
      elev: typeof item.elev === "number" ? item.elev : null,
      tz: typeof item.tz === "string" ? item.tz : "auto",
    };
    place.id = placeKey(place);
    places.push(place);
    if (places.length >= MAX_SAVED) break;
  }
  return places;
}

export type SavedUpdate = { places: AwLocation[]; atLimit: boolean };

/** Add or move a place to the front. A new place past the limit is refused. */
export function addSaved(list: AwLocation[], place: AwLocation): SavedUpdate {
  const id = placeKey(place);
  const next: AwLocation = { ...place, id };
  const index = list.findIndex((item) => placeKey(item) === id);
  if (index >= 0) {
    const copy = list.slice();
    copy.splice(index, 1);
    return { places: [next, ...copy], atLimit: false };
  }
  if (list.length >= MAX_SAVED) return { places: list, atLimit: true };
  return { places: [next, ...list], atLimit: false };
}

export function renameSaved(list: AwLocation[], id: string, name: string): AwLocation[] {
  const trimmed = name.trim();
  if (!trimmed) return list;
  return list.map((place) => (placeKey(place) === id ? { ...place, name: trimmed } : place));
}

export function removeSaved(list: AwLocation[], id: string): AwLocation[] {
  return list.filter((place) => placeKey(place) !== id);
}

/** Move a place so it sits where another place currently sits. */
export function moveSaved(list: AwLocation[], fromId: string, toId: string): AwLocation[] {
  const from = list.findIndex((place) => placeKey(place) === fromId);
  const to = list.findIndex((place) => placeKey(place) === toId);
  if (from < 0 || to < 0 || from === to) return list;
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/** What Overview shows while the forecast is missing. */
export function forecastNotice(status: string, hasModel: boolean): "loading" | "offline" | null {
  if (hasModel) return null;
  return status === "error" ? "offline" : "loading";
}
