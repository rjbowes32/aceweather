import { elements, state } from "./context.js";
import { buildHistoryParams } from "./render-secondary.js";
import { renderAll } from "./render-tertiary.js";
import {
  getCachedReport,
  getCachedWeather,
  saveCachedReport,
  saveCachedWeather,
  setDataSource,
} from "./storage.js";
import { setExportStatus, setSettingsStatus, resetPullRefreshUi, updateAppModeUi, updateRefreshUi } from "./ui-status.js";

export async function fetchJson(url) {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Unexpected server response (${response.status} ${response.statusText})`);
  }
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.message || "Request failed");
  }
  return payload;
}

export function applyWeatherData(data, { source = "live", cachedAt = null, preserveScroll = false, previousScrollY = 0 } = {}) {
  setDataSource(source, cachedAt);
  state.latestPayload = data;
  renderAll(data);
  setExportStatus(
    source === "cache"
      ? `Showing cached weather for ${data.location.name}. Live data will return when your connection does.`
      : `Ready to export charts for ${data.location.name}.`
  );
  if (preserveScroll) {
    window.scrollTo({ top: previousScrollY });
  }
  updateAppModeUi();
}

export async function loadWeather(location = state.selectedLocation, options = {}) {
  const { preserveScroll = false } = options;
  if (state.isRefreshing) {
    return;
  }

  state.selectedLocation = location;
  const params = new URLSearchParams({
    lat: location.latitude,
    lon: location.longitude,
    timezone: location.timezone || "auto",
    label: location.name,
  });
  buildHistoryParams(params);

  const previousScrollY = window.scrollY;
  state.isRefreshing = true;
  updateRefreshUi("Refreshing weather...", true);

  try {
    const data = await fetchJson(`/api/weather?${params.toString()}`);
    saveCachedWeather(location, data);
    applyWeatherData(data, { source: "live", preserveScroll, previousScrollY });
  } catch (error) {
    const cached = getCachedWeather(location);
    if (cached?.payload) {
      applyWeatherData(cached.payload, {
        source: "cache",
        cachedAt: cached.savedAt,
        preserveScroll,
        previousScrollY,
      });
      return;
    }
    elements.heroEyebrow.textContent = "Connection needed";
    elements.heroLocation.textContent = "Unable to load weather";
    elements.heroSummary.textContent = error.message;
    setExportStatus(error.message);
    updateAppModeUi();
  } finally {
    state.isRefreshing = false;
    updateRefreshUi("", false);
    resetPullRefreshUi();
  }
}

export function canUseGeolocation() {
  return "geolocation" in navigator;
}

export async function requestCurrentLocation(options = {}) {
  const { preserveScroll = false, fallbackToSelected = false } = options;
  if (!canUseGeolocation()) {
    setSettingsStatus("Current location is not available in this browser.");
    return;
  }
  elements.heroLocation.textContent = "Detecting your location…";
  elements.heroSummary.textContent = "Requesting GPS position.";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const name = await reverseGeocode(latitude, longitude);
      void loadWeather({ name, latitude, longitude, timezone: "auto" }, { preserveScroll });
    },
    () => {
      elements.heroLocation.textContent = state.selectedLocation.name;
      elements.heroSummary.textContent = "Could not get your current location.";
      setSettingsStatus("Location access was denied or unavailable.");
      if (fallbackToSelected) {
        void loadWeather(state.selectedLocation, { preserveScroll });
      }
    },
    { timeout: 8000, maximumAge: 60000 },
  );
}

export function clearResults() {
  elements.searchResults.hidden = true;
  elements.searchResults.innerHTML = "";
}

export async function handleSearch(event) {
  event.preventDefault();
  const query = elements.searchInput.value.trim();
  if (query.length < 2) {
    clearResults();
    return;
  }

  try {
    const payload = await fetchJson(`/api/search?query=${encodeURIComponent(query)}`);
    const results = payload.results || [];
    if (results.length === 0) {
      elements.searchResults.hidden = false;
      elements.searchResults.innerHTML = `<div class="result-item">No places matched that search.</div>`;
      return;
    }

    elements.searchResults.hidden = false;
    elements.searchResults.innerHTML = "";
    results.forEach((result) => {
      const button = elements.resultTemplate.content.firstElementChild.cloneNode(true);
      const admin = [result.admin1, result.country].filter(Boolean).join(", ");
      const strong = document.createElement("strong");
      strong.textContent = result.name;
      const br = document.createElement("br");
      const span = document.createElement("span");
      span.textContent = admin;
      button.replaceChildren(strong, br, span);
      button.addEventListener("click", () => {
        clearResults();
        elements.searchInput.value = `${result.name}, ${result.country}`;
        loadWeather({
          name: [result.name, result.admin1, result.country].filter(Boolean).join(", "),
          latitude: result.latitude,
          longitude: result.longitude,
          timezone: result.timezone || "auto",
        });
      });
      elements.searchResults.appendChild(button);
    });
  } catch (error) {
    elements.searchResults.hidden = false;
    const errDiv = document.createElement("div");
    errDiv.className = "result-item";
    errDiv.textContent = error.message;
    elements.searchResults.replaceChildren(errDiv);
  }
}

export async function copyAiReport() {
  const loc = state.selectedLocation;
  const params = new URLSearchParams({
    lat: loc.latitude,
    lon: loc.longitude,
    timezone: loc.timezone || "auto",
    label: loc.name,
  });
  setExportStatus("Generating AI report…");
  try {
    const response = await fetch(`/api/report?${params.toString()}`);
    const text = await response.text();
    if (!response.ok) {
      throw new Error("Report request failed");
    }
    saveCachedReport(loc, text);
    await navigator.clipboard.writeText(text);
    setExportStatus(`Copied report for ${loc.name} — paste it into Claude.`);
  } catch {
    const cached = getCachedReport(loc);
    if (cached?.text) {
      await navigator.clipboard.writeText(cached.text);
      setExportStatus(`Copied cached report for ${loc.name}. Refresh when you are back online for the latest version.`);
      return;
    }
    setExportStatus("Could not copy report. Try again.");
  }
}

export async function reverseGeocode(latitude, longitude) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const data = await res.json();
    const addr = data.address || {};
    const name = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.county || data.display_name?.split(",")[0] || "My Location";
    const region = addr.state || addr.county || "";
    const country = addr.country || "";
    return [name, region, country].filter(Boolean).join(", ");
  } catch {
    return "My Location";
  }
}
