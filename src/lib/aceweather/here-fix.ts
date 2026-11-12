import { HERE_NAME } from "./places.ts";

/** Last Here fix. Kept on the phone so a home-screen launch can show a forecast without asking again. */
export const HERE_CACHE_KEY = "awx-here";
export const HERE_ACTIVE_KEY = "awx-here-active";
/** A stored Here fix older than this is deleted and not sent anywhere. */
export const HERE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

type KeyStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function browserStore(): KeyStore | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

/** About 110 m. Enough for a village forecast, not a street address. */
export function roundHereDegrees(value: number): number {
  return Number(value.toFixed(3));
}

export function coarsenHereFix<T extends { lat: number; lon: number }>(fix: T): T {
  return { ...fix, lat: roundHereDegrees(fix.lat), lon: roundHereDegrees(fix.lon) };
}

/** A fix older than three days is no longer used. */
export function hereFixFresh(cache: { at: number }, now = Date.now()): boolean {
  return Number.isFinite(cache.at) && now - cache.at <= HERE_MAX_AGE_MS;
}

/**
 * A district label can be written onto the stored fix without making it new.
 * A different point, or no stored fix, is left alone so only a GPS reading refreshes the age.
 */
export function hereFixWithDistrict(stored: HereCache | null, lat: number, lon: number, region: string): HereCache | null {
  if (!stored) return null;
  if (roundHereDegrees(stored.lat) !== roundHereDegrees(lat) || roundHereDegrees(stored.lon) !== roundHereDegrees(lon)) return null;
  return { ...stored, lat: roundHereDegrees(lat), lon: roundHereDegrees(lon), region };
}

export type GeoPermission = "granted" | "prompt" | "denied" | "unknown";
export type GeoEvent =
  | { type: "load"; hereActive: boolean; permission: GeoPermission }
  | { type: "tap-here" }
  | { type: "refresh"; hereActive: boolean };

export type HereCache = {
  lat: number;
  lon: number;
  name: string;
  region: string;
  at: number;
};

/**
 * When a position may be requested.
 * A launch only requests when the browser already says granted. "unknown" (typical of
 * an iPhone home-screen app, which has no Permissions API) must not request, or iOS asks again.
 */
export function geolocationPlan(event: GeoEvent): "request" | "none" {
  if (event.type === "tap-here") return "request";
  if (event.type === "refresh") return event.hereActive ? "request" : "none";
  if (event.type === "load") return event.hereActive && event.permission === "granted" ? "request" : "none";
  return "none";
}

export function hereIsActive(store: KeyStore | null = browserStore()): boolean {
  try { return store?.getItem(HERE_ACTIVE_KEY) === "1"; } catch { return false; }
}

export function markHereActive(active: boolean, store: KeyStore | null = browserStore()): void {
  try { store?.setItem(HERE_ACTIVE_KEY, active ? "1" : "0"); } catch { /* private mode */ }
}

/** Drop the stored fix. Turning Here off must not leave the coordinates behind. */
export function clearStoredHere(store: KeyStore | null = browserStore()): void {
  try { store?.removeItem(HERE_CACHE_KEY); } catch { /* private mode */ }
  markHereActive(false, store);
}

export function readStoredHere(now = Date.now(), store: KeyStore | null = browserStore()): HereCache | null {
  try {
    const cache = parseHereCache(JSON.parse(store?.getItem(HERE_CACHE_KEY) || "null"));
    if (!cache) return null;
    if (!hereFixFresh(cache, now)) {
      clearStoredHere(store);
      return null;
    }
    const coarse = coarsenHereFix(cache);
    if (coarse.lat !== cache.lat || coarse.lon !== cache.lon) {
      try { store?.setItem(HERE_CACHE_KEY, JSON.stringify(coarse)); } catch { /* private mode */ }
    }
    return coarse;
  } catch {
    return null;
  }
}

export function storeHereFix(fix: HereCache, store: KeyStore | null = browserStore()): void {
  try { store?.setItem(HERE_CACHE_KEY, JSON.stringify(coarsenHereFix(fix))); } catch { /* private mode */ }
  markHereActive(true, store);
}

export function parseHereCache(raw: unknown): HereCache | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  const at = Number(item.at);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(at)) return null;
  return {
    lat,
    lon,
    name: typeof item.name === "string" && item.name ? item.name : HERE_NAME,
    region: typeof item.region === "string" ? item.region : "",
    at,
  };
}

export type GeoProbe = {
  getCurrentPosition: (
    success: (pos: { coords: { latitude: number; longitude: number } }) => void,
    error?: (err: { code: number }) => void,
  ) => void;
  watchPosition?: (...args: unknown[]) => number;
};

export type BootHereInput = {
  hereActive: boolean;
  cache: HereCache | null;
  permission: GeoPermission;
  geo: GeoProbe;
};

/** What a cold start is allowed to do. Never calls watchPosition. */
export function bootHere(input: BootHereInput): { requested: number; watched: number; shown: HereCache | null } {
  const shown = input.hereActive && input.cache ? input.cache : null;
  const plan = geolocationPlan({
    type: "load",
    hereActive: Boolean(shown),
    permission: input.permission,
  });
  let requested = 0;
  if (plan === "request") {
    requested += 1;
    input.geo.getCurrentPosition(() => {}, () => {});
  }
  return { requested, watched: 0, shown };
}

export async function readGeoPermission(
  permissions?: { query: (desc: { name: string }) => Promise<{ state: string }> } | null,
): Promise<GeoPermission> {
  const api = permissions === undefined
    ? (typeof navigator === "undefined" ? null : navigator.permissions)
    : permissions;
  if (!api?.query) return "unknown";
  try {
    const status = await api.query({ name: "geolocation" });
    if (status.state === "granted" || status.state === "prompt" || status.state === "denied") return status.state;
    return "unknown";
  } catch {
    return "unknown";
  }
}
