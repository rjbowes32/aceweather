import {
  MAX_LOCATION_CACHE_ENTRIES,
  REPORT_CACHE_KEY,
  state,
  STORAGE_KEY,
  WEATHER_CACHE_KEY,
} from "./context.js";

export function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
}

export function loadSettings(onError) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (parsed.temperatureUnit === "c" || parsed.temperatureUnit === "f") {
      state.settings.temperatureUnit = parsed.temperatureUnit;
    } else if (parsed.unitSystem === "metric" || parsed.unitSystem === "imperial") {
      state.settings.temperatureUnit = parsed.unitSystem === "imperial" ? "f" : "c";
    }
    if (parsed.speedUnit === "kph" || parsed.speedUnit === "mph") {
      state.settings.speedUnit = parsed.speedUnit;
    } else if (parsed.unitSystem === "metric" || parsed.unitSystem === "imperial") {
      state.settings.speedUnit = parsed.unitSystem === "imperial" ? "mph" : "kph";
    }
    if (Array.isArray(parsed.savedLocations)) {
      state.settings.savedLocations = parsed.savedLocations;
    }
  } catch {
    onError?.("Could not read saved settings.");
  }
}

export function readStore(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function historyCacheDescriptor() {
  if (state.history.mode === "custom" && state.history.start && state.history.end) {
    return { mode: "custom", start: state.history.start, end: state.history.end };
  }
  return { mode: "range", days: state.history.days || 30 };
}

export function weatherCacheKey(location, historyDescriptor = historyCacheDescriptor()) {
  return JSON.stringify({
    lat: Number(location.latitude).toFixed(4),
    lon: Number(location.longitude).toFixed(4),
    timezone: location.timezone || "auto",
    history: historyDescriptor,
  });
}

export function reportCacheKey(location) {
  return JSON.stringify({
    lat: Number(location.latitude).toFixed(4),
    lon: Number(location.longitude).toFixed(4),
    timezone: location.timezone || "auto",
    label: location.name || "",
  });
}

export function trimStoreEntries(store) {
  const entries = Object.entries(store);
  if (entries.length <= MAX_LOCATION_CACHE_ENTRIES) {
    return store;
  }
  entries.sort(([, a], [, b]) => {
    const aTime = Date.parse(a?.savedAt || 0);
    const bTime = Date.parse(b?.savedAt || 0);
    return bTime - aTime;
  });
  return Object.fromEntries(entries.slice(0, MAX_LOCATION_CACHE_ENTRIES));
}

export function saveCachedWeather(location, payload) {
  const store = readStore(WEATHER_CACHE_KEY);
  store[weatherCacheKey(location)] = { savedAt: new Date().toISOString(), payload };
  writeStore(WEATHER_CACHE_KEY, trimStoreEntries(store));
}

export function getCachedWeather(location) {
  const store = readStore(WEATHER_CACHE_KEY);
  return store[weatherCacheKey(location)] || null;
}

export function saveCachedReport(location, text) {
  const store = readStore(REPORT_CACHE_KEY);
  store[reportCacheKey(location)] = { savedAt: new Date().toISOString(), text };
  writeStore(REPORT_CACHE_KEY, trimStoreEntries(store));
}

export function getCachedReport(location) {
  const store = readStore(REPORT_CACHE_KEY);
  return store[reportCacheKey(location)] || null;
}

export function setDataSource(source, cachedAt = null) {
  state.ui.dataSource = source;
  state.ui.cachedAt = cachedAt;
}

export function isOfflineSnapshot() {
  return state.ui.dataSource === "cache";
}

export function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}
