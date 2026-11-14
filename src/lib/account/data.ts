/** What an account keeps in sync: saved places and display settings. Rain alerts stay per device (they need that device's notification permission). */
import type { AwLocation } from "../aceweather/open-meteo.ts";
import { MAX_SAVED, parseSaved, placeKey } from "../aceweather/places.ts";

export type Prefs = { theme?: "dark" | "light"; unit?: "c" | "f"; windUnit?: "kmh" | "mph" };
export type AccountData = { saved: AwLocation[]; prefs: Prefs; updatedAt: string | null };

export const MAX_DATA_BYTES = 32_000;

export function parsePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const prefs: Prefs = {};
  if (r.theme === "dark" || r.theme === "light") prefs.theme = r.theme;
  if (r.unit === "c" || r.unit === "f") prefs.unit = r.unit;
  if (r.windUnit === "kmh" || r.windUnit === "mph") prefs.windUnit = r.windUnit;
  return prefs;
}

export function parseAccountData(raw: unknown): AccountData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    saved: parseSaved(r.saved),
    prefs: parsePrefs(r.prefs),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
  };
}

/** First sign-in on a device: the account's places first, then this device's places it doesn't have, up to the limit. */
export function mergePlaces(account: AwLocation[], device: AwLocation[]): AwLocation[] {
  const seen = new Set(account.map(placeKey));
  const merged = account.slice(0, MAX_SAVED);
  for (const place of device) {
    if (merged.length >= MAX_SAVED) break;
    const key = placeKey(place);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(place);
  }
  return merged;
}
