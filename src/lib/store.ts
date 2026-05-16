"use client";

import { openDB, type IDBPDatabase, type DBSchema } from "idb";

export type SavedLocation = {
  id: string;
  name: string;
  region?: string;
  country?: string;
  lat: number;
  lon: number;
  elev?: number | null;
  tz?: string;
  pinnedAt?: number;
};

export type CachedPayload = {
  key: string;
  locationId: string;
  period: string;
  payload: unknown;
  fetchedAt: number;
};

interface AceWeatherDB extends DBSchema {
  locations: {
    key: string;
    value: SavedLocation;
    indexes: { "by-pinnedAt": number };
  };
  payloads: {
    key: string;
    value: CachedPayload;
    indexes: { "by-fetchedAt": number; "by-location": string };
  };
}

const DB_NAME = "aceweather";
const DB_VERSION = 1;
const LEGACY_LOCAL_STORAGE_KEY = "aceweather.mobile.savedLocations.v1";
const MAX_PAYLOADS = 100;

let dbPromise: Promise<IDBPDatabase<AceWeatherDB>> | null = null;

function getDb(): Promise<IDBPDatabase<AceWeatherDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (!dbPromise) {
    dbPromise = openDB<AceWeatherDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("locations")) {
          const locations = db.createObjectStore("locations", { keyPath: "id" });
          locations.createIndex("by-pinnedAt", "pinnedAt");
        }
        if (!db.objectStoreNames.contains("payloads")) {
          const payloads = db.createObjectStore("payloads", { keyPath: "key" });
          payloads.createIndex("by-fetchedAt", "fetchedAt");
          payloads.createIndex("by-location", "locationId");
        }
      },
    });
  }
  return dbPromise;
}

export function locationId(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

export function payloadKey(id: string, period: string = "default"): string {
  return `${id}::${period}`;
}

export async function getSavedLocations(): Promise<SavedLocation[]> {
  try {
    const db = await getDb();
    const all = await db.getAll("locations");
    return all.sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0));
  } catch {
    return [];
  }
}

export async function addSavedLocation(loc: Omit<SavedLocation, "id" | "pinnedAt"> & { id?: string }): Promise<SavedLocation> {
  const id = loc.id ?? locationId(loc.lat, loc.lon);
  const record: SavedLocation = { ...loc, id, pinnedAt: Date.now() };
  try {
    const db = await getDb();
    await db.put("locations", record);
  } catch { /* swallow */ }
  return record;
}

export async function removeSavedLocation(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete("locations", id);
  } catch { /* swallow */ }
}

export async function setSavedLocations(locations: SavedLocation[]): Promise<void> {
  try {
    const db = await getDb();
    const tx = db.transaction("locations", "readwrite");
    await tx.store.clear();
    const stamp = Date.now();
    await Promise.all(locations.map((loc, idx) => tx.store.put({ ...loc, pinnedAt: loc.pinnedAt ?? stamp - idx })));
    await tx.done;
  } catch { /* swallow */ }
}

export async function getCachedPayload<T = unknown>(id: string, period: string = "default"): Promise<CachedPayload | null> {
  try {
    const db = await getDb();
    const found = await db.get("payloads", payloadKey(id, period));
    return (found as CachedPayload | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function setCachedPayload(id: string, period: string, payload: unknown): Promise<void> {
  const record: CachedPayload = {
    key: payloadKey(id, period),
    locationId: id,
    period,
    payload,
    fetchedAt: Date.now(),
  };
  try {
    const db = await getDb();
    await db.put("payloads", record);
    await trimPayloads(db);
  } catch { /* swallow */ }
}

async function trimPayloads(db: IDBPDatabase<AceWeatherDB>): Promise<void> {
  try {
    const count = await db.count("payloads");
    if (count <= MAX_PAYLOADS) return;
    const tx = db.transaction("payloads", "readwrite");
    const index = tx.store.index("by-fetchedAt");
    let cursor = await index.openCursor();
    const toDelete = count - MAX_PAYLOADS;
    let deleted = 0;
    while (cursor && deleted < toDelete) {
      await cursor.delete();
      deleted += 1;
      cursor = await cursor.continue();
    }
    await tx.done;
  } catch { /* swallow */ }
}

export async function migrateFromLocalStorage(): Promise<{ migrated: number }> {
  if (typeof window === "undefined") return { migrated: 0 };
  try {
    const raw = window.localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
    if (!raw) return { migrated: 0 };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { migrated: 0 };
    const existing = await getSavedLocations();
    if (existing.length > 0) {
      window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
      return { migrated: 0 };
    }
    const mapped: SavedLocation[] = parsed
      .filter((entry) => entry && typeof entry.lat === "number" && typeof entry.lon === "number")
      .map((entry, idx) => ({
        id: locationId(entry.lat, entry.lon),
        name: entry.name ?? "Saved location",
        region: entry.region ?? "",
        country: entry.country ?? "",
        lat: entry.lat,
        lon: entry.lon,
        elev: entry.elev ?? null,
        tz: entry.tz ?? "auto",
        pinnedAt: Date.now() - idx,
      }));
    await setSavedLocations(mapped);
    window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
    return { migrated: mapped.length };
  } catch {
    return { migrated: 0 };
  }
}
