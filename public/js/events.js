import { downloadCanvas } from "./charts.js";
import { elements, PULL_REFRESH_TRIGGER_PX, state } from "./context.js";
import { copyAiReport, handleSearch, loadWeather, requestCurrentLocation } from "./data.js";
import { updateHistoryInputs, syncHistoryPresetUi } from "./render-secondary.js";
import { renderAll, renderSettings } from "./render-tertiary.js";
import { speedUnitLabel, temperatureUnitLabel } from "./formatters.js";
import { loadSettings, saveSettings } from "./storage.js";
import { isAtTopOfPage, resetPullRefreshUi, setExportStatus, setSettingsStatus, updateRefreshUi, updateAppModeUi } from "./ui-status.js";

export function initHistoryDefaults() {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  state.history.start = start.toISOString().slice(0, 10);
  state.history.end = end.toISOString().slice(0, 10);
  updateHistoryInputs();
  syncHistoryPresetUi();
}

export function hydrateSettings() {
  loadSettings(setSettingsStatus);
  renderSettings();
}

export function shouldPreferSavedDesktopLocation() {
  return state.settings.savedLocations.length > 0
    && window.matchMedia("(min-width: 761px) and (pointer:fine)").matches;
}

export function loadInitialWeather() {
  if (shouldPreferSavedDesktopLocation()) {
    void loadWeather(state.settings.savedLocations[0]);
    return;
  }
  if ("geolocation" in navigator) {
    void requestCurrentLocation({ fallbackToSelected: true });
    return;
  }
  void loadWeather();
}

function savedLocationKey(location) {
  return `${location.latitude}:${location.longitude}:${location.name}`;
}

function rerenderAfterSettingsChange(message) {
  saveSettings();
  if (state.latestPayload) {
    renderAll(state.latestPayload);
  } else {
    renderSettings();
  }
  setSettingsStatus(message);
}

function setSettingsPopoverOpen(isOpen) {
  if (!elements.settingsPopover || !elements.settingsButton) {
    return;
  }
  elements.settingsPopover.hidden = !isOpen;
  elements.settingsButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function toggleSettingsPopover() {
  setSettingsPopoverOpen(elements.settingsPopover.hidden);
}

function handleManualRefresh() {
  void loadWeather(state.selectedLocation, { preserveScroll: true });
}

function handleHistoryPresetClick(event) {
  const button = event.target.closest("[data-range]");
  if (!button) return;
  const range = button.dataset.range;
  if (range === "custom") {
    state.history.mode = "custom";
  } else {
    state.history.mode = range;
    state.history.days = Number(range);
  }
  syncHistoryPresetUi();
  if (state.history.mode !== "custom") {
    void loadWeather();
  }
}

function handleCustomHistorySubmit(event) {
  event.preventDefault();
  const start = elements.historyStart.value;
  const end = elements.historyEnd.value;
  if (!start || !end) {
    setExportStatus("Choose both a start and end date for a custom historical range.");
    return;
  }
  state.history.mode = "custom";
  state.history.start = start;
  state.history.end = end;
  syncHistoryPresetUi();
  void loadWeather();
}

function handleSaveCurrentLocation() {
  const location = state.selectedLocation;
  const exists = state.settings.savedLocations.some((item) => savedLocationKey(item) === savedLocationKey(location));
  if (exists) {
    setSettingsStatus("That location is already saved.");
    return;
  }
  state.settings.savedLocations.unshift({
    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: location.timezone || "auto",
  });
  state.settings.savedLocations = state.settings.savedLocations.slice(0, 12);
  saveSettings();
  renderSettings();
  setSettingsStatus(`Saved ${location.name}.`);
}

function handleSavedLocationsClick(event) {
  const loadButton = event.target.closest("[data-saved-load]");
  const removeButton = event.target.closest("[data-saved-remove]");
  if (loadButton) {
    const location = state.settings.savedLocations[Number(loadButton.dataset.savedLoad)];
    if (location) {
      setSettingsPopoverOpen(false);
      void loadWeather(location);
    }
    return;
  }
  if (removeButton) {
    const index = Number(removeButton.dataset.savedRemove);
    const [removed] = state.settings.savedLocations.splice(index, 1);
    saveSettings();
    renderSettings();
    setSettingsStatus(removed ? `Removed ${removed.name}.` : "Saved location removed.");
  }
}

function handleTempUnitToggleClick(event) {
  const button = event.target.closest("[data-temp-unit]");
  if (!button) return;
  const nextUnit = button.dataset.tempUnit;
  if (!nextUnit || nextUnit === state.settings.temperatureUnit) return;
  state.settings.temperatureUnit = nextUnit;
  rerenderAfterSettingsChange(`Switched temperature to ${temperatureUnitLabel()}.`);
}

function handleSpeedUnitToggleClick(event) {
  const button = event.target.closest("[data-speed-unit]");
  if (!button) return;
  const nextUnit = button.dataset.speedUnit;
  if (!nextUnit || nextUnit === state.settings.speedUnit) return;
  state.settings.speedUnit = nextUnit;
  rerenderAfterSettingsChange(`Switched wind speed to ${speedUnitLabel()}.`);
}

function handleSettingsTabClick(event) {
  const button = event.target.closest("[data-settings-tab]");
  if (!button) return;
  const nextTab = button.dataset.settingsTab;
  if (!nextTab || nextTab === state.ui.settingsTab) return;
  state.ui.settingsTab = nextTab;
  renderSettings();
}

function handleTouchStart(event) {
  if (state.isRefreshing || !isAtTopOfPage() || event.touches.length !== 1) {
    resetPullRefreshUi();
    return;
  }
  state.pullRefresh.active = true;
  state.pullRefresh.startY = event.touches[0].clientY;
  state.pullRefresh.distance = 0;
}

function handleTouchMove(event) {
  if (!state.pullRefresh.active || state.isRefreshing || event.touches.length !== 1) {
    return;
  }
  const distance = event.touches[0].clientY - state.pullRefresh.startY;
  if (distance <= 0) {
    if (!state.pullRefresh.pulling) {
      resetPullRefreshUi();
    }
    return;
  }
  if (!isAtTopOfPage()) {
    resetPullRefreshUi();
    return;
  }
  state.pullRefresh.pulling = true;
  state.pullRefresh.distance = distance;
  elements.pullRefreshIndicator.style.setProperty("--pull-offset", `${Math.max(0, Math.min(distance, 128))}px`);
  updateRefreshUi(distance >= PULL_REFRESH_TRIGGER_PX ? "Release to refresh" : "Pull to refresh", false);
  event.preventDefault();
}

function handleTouchEnd() {
  if (!state.pullRefresh.active && !state.pullRefresh.pulling) {
    return;
  }
  const shouldRefresh = state.pullRefresh.distance >= PULL_REFRESH_TRIGGER_PX;
  resetPullRefreshUi();
  if (shouldRefresh) {
    void loadWeather(state.selectedLocation, { preserveScroll: true });
  }
}

async function handleInstallApp() {
  const promptEvent = state.ui.deferredInstallPrompt;
  if (!promptEvent) {
    updateAppModeUi();
    return;
  }
  promptEvent.prompt();
  try {
    await promptEvent.userChoice;
  } finally {
    state.ui.deferredInstallPrompt = null;
    updateAppModeUi();
  }
}

export function registerEvents() {
  document.addEventListener("click", (event) => {
    if (!elements.searchForm.contains(event.target)) {
      elements.searchResults.hidden = true;
      elements.searchResults.innerHTML = "";
    }
    if (elements.settingsPopover.hidden) {
      return;
    }
    if (!elements.settingsPopover.contains(event.target) && !elements.settingsButton.contains(event.target)) {
      setSettingsPopoverOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setSettingsPopoverOpen(false);
    }
  });

  elements.searchForm.addEventListener("submit", handleSearch);
  elements.historyPresets.addEventListener("click", handleHistoryPresetClick);
  elements.historyCustomForm.addEventListener("submit", handleCustomHistorySubmit);
  elements.currentLocationButton.addEventListener("click", () => void requestCurrentLocation({ preserveScroll: true }));
  elements.saveLocationButton.addEventListener("click", handleSaveCurrentLocation);
  elements.refreshButton.addEventListener("click", handleManualRefresh);
  elements.settingsButton.addEventListener("click", toggleSettingsPopover);
  elements.settingsCloseButton.addEventListener("click", () => setSettingsPopoverOpen(false));
  elements.settingsTabs?.addEventListener("click", handleSettingsTabClick);
  elements.savedLocations.addEventListener("click", handleSavedLocationsClick);
  elements.tempUnitToggle.addEventListener("click", handleTempUnitToggleClick);
  elements.speedUnitToggle.addEventListener("click", handleSpeedUnitToggleClick);
  elements.exportHourlyChart.addEventListener("click", () => {
    downloadCanvas(elements.hourlyChart, "aceweather-24h-forecast.png");
    setExportStatus("Downloaded the 24-hour forecast chart.");
  });
  elements.exportHistoryChart.addEventListener("click", () => {
    const suffix = state.history.mode === "custom" ? `${state.history.start}-to-${state.history.end}` : `${state.history.days}d`;
    downloadCanvas(elements.historyChart, `aceweather-history-${suffix}.png`);
    setExportStatus("Downloaded the historical weather chart.");
  });
  elements.installAppButton?.addEventListener("click", () => void handleInstallApp());
  elements.copyAiReport.addEventListener("click", () => void copyAiReport());
  document.addEventListener("touchstart", handleTouchStart, { passive: true });
  document.addEventListener("touchmove", handleTouchMove, { passive: false });
  document.addEventListener("touchend", handleTouchEnd, { passive: true });
  document.addEventListener("touchcancel", handleTouchEnd, { passive: true });
}
