import { HERE_NAME } from "./places.ts";

/** Last Here fix. Kept on the phone so a home-screen launch can show a forecast without asking again. */
export const HERE_CACHE_KEY = "awx-here";
export const HERE_ACTIVE_KEY = "awx-here-active";

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

export function hereIsActive(): boolean {
  try { return localStorage.getItem(HERE_ACTIVE_KEY) === "1"; } catch { return false; }
}

export function markHereActive(active: boolean): void {
  try { localStorage.setItem(HERE_ACTIVE_KEY, active ? "1" : "0"); } catch { /* private mode */ }
}

export function readStoredHere(): HereCache | null {
  try { return parseHereCache(JSON.parse(localStorage.getItem(HERE_CACHE_KEY) || "null")); } catch { return null; }
}

export function storeHereFix(fix: HereCache): void {
  try { localStorage.setItem(HERE_CACHE_KEY, JSON.stringify(fix)); } catch { /* private mode */ }
  markHereActive(true);
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
