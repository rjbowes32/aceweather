// @ts-nocheck
/* Stateless helpers used across panels and views. */

export const dirToCompass = (deg) => {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
};

export const fmt1 = (v) => (v == null || isNaN(v) ? "—" : (+v).toFixed(1));
export const fmt0 = (v) => (v == null || isNaN(v) ? "—" : Math.round(+v).toString());

export function mobileLocationLabel(location) {
  return [location.name, location.region, location.country].filter(Boolean).join(", ");
}

export function mobileLocationFromSearch(result) {
  return {
    name: result.name || "Selected location",
    region: result.admin1 || "",
    country: result.country || "",
    lat: Number(result.latitude),
    lon: Number(result.longitude),
    elev: result.elevation ?? result.elevation_m ?? null,
    tz: result.timezone || "auto",
  };
}

export async function searchMobileLocations(query) {
  const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Search ${response.status}`);
  const payload = await response.json();
  return (payload.results || []).slice(0, 5).map(mobileLocationFromSearch);
}

async function reverseGeocode(lat, lon, timeoutMs = 2500) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? globalThis.setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const response = await fetch(url, { cache: "no-store", signal: controller?.signal });
    if (!response.ok) throw new Error(`Reverse ${response.status}`);
    const payload = await response.json();
    return {
      name: payload.city || payload.locality || payload.principalSubdivision || "My location",
      region: payload.principalSubdivision || payload.localityInfo?.administrative?.[1]?.name || "",
      country: payload.countryName || "",
    };
  } catch {
    return { name: "My location", region: "", country: "" };
  } finally {
    if (timer) globalThis.clearTimeout(timer);
  }
}

function locationFromPosition(position, place = null) {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const tz = (typeof Intl !== "undefined" && Intl.DateTimeFormat().resolvedOptions().timeZone) || "auto";
  return {
    name: place?.name || "Current location",
    region: place?.region || "GPS fix",
    country: place?.country || "",
    lat,
    lon,
    elev: position.coords.altitude ?? null,
    tz,
  };
}

export async function reverseGeocodeLocation(location, timeoutMs = 2500) {
  const place = await reverseGeocode(location.lat, location.lon, timeoutMs);
  return {
    ...location,
    name: place.name || location.name,
    region: place.region || location.region,
    country: place.country || location.country,
  };
}

export function requestBrowserLocation(timeoutMs = 10000, options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation unavailable"));
      return;
    }
    const shouldReverseGeocode = options.reverseGeocode !== false;
    const maximumAge = options.maximumAge ?? 5 * 60 * 1000;
    const enableHighAccuracy = options.enableHighAccuracy ?? false;
    const reverseTimeoutMs = options.reverseTimeoutMs ?? 2500;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const rawLocation = locationFromPosition(position);
        if (!shouldReverseGeocode) {
          resolve(rawLocation);
          return;
        }
        const place = await reverseGeocode(rawLocation.lat, rawLocation.lon, reverseTimeoutMs);
        resolve(locationFromPosition(position, place));
      },
      (err) => reject(err),
      { enableHighAccuracy, timeout: timeoutMs, maximumAge }
    );
  });
}

export function weatherConditionFor(code) {
  if (code === 0) return { key: "sun", label: "Sunny" };
  if (code === 1) return { key: "sun", label: "Mainly clear" };
  if (code === 2) return { key: "partly", label: "Partly cloudy" };
  if (code === 3) return { key: "cloud", label: "Overcast" };
  if (code === 45 || code === 48) return { key: "fog", label: "Fog" };
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return { key: "rain", label: "Rain" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { key: "snow", label: "Snow" };
  if (code >= 95) return { key: "storm", label: "Thunder" };
  return { key: "cloud", label: "Cloudy" };
}
