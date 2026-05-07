import { hydrateSettings, initHistoryDefaults, loadInitialWeather, registerEvents } from "./events.js";
import { registerPwa } from "./pwa.js";
import { renderSettings } from "./render-tertiary.js";
import { updateAppModeUi, updateRefreshUi } from "./ui-status.js";

export function initApp() {
  initHistoryDefaults();
  hydrateSettings();
  renderSettings();
  updateRefreshUi();
  updateAppModeUi();
  registerEvents();
  registerPwa();
  loadInitialWeather();
}
