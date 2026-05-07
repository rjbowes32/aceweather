import { elements, PULL_REFRESH_MAX_PX, state } from "./context.js";
import { formatDate } from "./formatters.js";
import { isOfflineSnapshot, isStandaloneMode } from "./storage.js";

export function isAtTopOfPage() {
  return window.scrollY <= 0;
}

export function setExportStatus(message) {
  elements.exportStatus.textContent = message;
}

export function setSettingsStatus(message) {
  elements.settingsStatus.textContent = message;
}

export function updateRefreshUi(message = "", isRefreshing = false) {
  if (elements.refreshButton) {
    elements.refreshButton.disabled = isRefreshing;
    elements.refreshButton.textContent = isRefreshing ? "Refreshing..." : "Refresh";
  }
  if (!elements.pullRefreshIndicator || !elements.pullRefreshLabel) {
    return;
  }
  if (message) {
    elements.pullRefreshIndicator.hidden = false;
    elements.pullRefreshLabel.textContent = message;
  } else if (!state.pullRefresh.pulling && !isRefreshing) {
    elements.pullRefreshIndicator.hidden = true;
    elements.pullRefreshLabel.textContent = "Pull to refresh";
  }
}

export function setPullRefreshDistance(distance) {
  if (!elements.pullRefreshIndicator) {
    return;
  }
  const boundedDistance = Math.max(0, Math.min(distance, PULL_REFRESH_MAX_PX));
  elements.pullRefreshIndicator.style.setProperty("--pull-offset", `${boundedDistance}px`);
}

export function resetPullRefreshUi() {
  state.pullRefresh.active = false;
  state.pullRefresh.pulling = false;
  state.pullRefresh.startY = 0;
  state.pullRefresh.distance = 0;
  setPullRefreshDistance(0);
  if (!state.isRefreshing && elements.pullRefreshIndicator) {
    elements.pullRefreshIndicator.hidden = true;
  }
  if (elements.pullRefreshLabel && !state.isRefreshing) {
    elements.pullRefreshLabel.textContent = "Pull to refresh";
  }
}

export function updateAppModeUi() {
  if (!elements.networkStatusBadge || !elements.snapshotStatusBadge || !elements.appModeNote || !elements.installAppButton) {
    return;
  }

  const online = navigator.onLine;
  elements.networkStatusBadge.textContent = online ? "Online" : "Offline";
  elements.networkStatusBadge.classList.toggle("is-offline", !online);

  elements.snapshotStatusBadge.hidden = false;
  elements.snapshotStatusBadge.textContent = isOfflineSnapshot()
    ? state.ui.cachedAt
      ? `Cached ${formatDate(state.ui.cachedAt, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}`
      : "Cached weather"
    : "Live weather";

  const installReady = Boolean(state.ui.deferredInstallPrompt) && !isStandaloneMode();
  elements.installAppButton.hidden = !installReady;

  if (!online && isOfflineSnapshot()) {
    elements.appModeNote.textContent = "Reading from your last saved weather snapshot while the connection is down.";
    return;
  }
  if (!online) {
    elements.appModeNote.textContent = "You are offline. Saved weather and copied reports stay available when cached.";
    return;
  }
  if (isStandaloneMode()) {
    elements.appModeNote.textContent = "Installed app mode active with fast reopen and offline fallbacks.";
    return;
  }
  if (installReady) {
    elements.appModeNote.textContent = "Install AceWeather to keep the same interface with faster reopen and offline resilience.";
    return;
  }
  elements.appModeNote.textContent = "The same interface works on desktop and as an installed app, with caching and offline fallbacks built in.";
}
