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

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Reverse ${response.status}`);
    const payload = await response.json();
    return {
      name: payload.city || payload.locality || payload.principalSubdivision || "My location",
      region: payload.principalSubdivision || payload.localityInfo?.administrative?.[1]?.name || "",
      country: payload.countryName || "",
    };
  } catch {
    return { name: "My location", region: "", country: "" };
  }
}

export function requestBrowserLocation(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation unavailable"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const place = await reverseGeocode(lat, lon);
        const tz = (typeof Intl !== "undefined" && Intl.DateTimeFormat().resolvedOptions().timeZone) || "auto";
        resolve({
          name: place.name,
          region: place.region,
          country: place.country,
          lat,
          lon,
          elev: position.coords.altitude ?? null,
          tz,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 5 * 60 * 1000 }
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
