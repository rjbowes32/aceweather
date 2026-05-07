import { state } from "./context.js";
import { loadWeather } from "./data.js";
import { setSettingsStatus, updateAppModeUi } from "./ui-status.js";

export function registerPwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {
        setSettingsStatus("Offline mode is unavailable right now.");
      });
    });
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.ui.deferredInstallPrompt = event;
    updateAppModeUi();
  });

  window.addEventListener("appinstalled", () => {
    state.ui.deferredInstallPrompt = null;
    updateAppModeUi();
  });

  window.addEventListener("online", updateAppModeUi);
  window.addEventListener("offline", updateAppModeUi);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.latestPayload && navigator.onLine) {
      void loadWeather(state.selectedLocation, { preserveScroll: true });
    }
  });
}
