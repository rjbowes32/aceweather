// AceWeather weather engine: the single source of truth for farm-weather
// decisions. Pure, dependency-free TypeScript (no React, no fetch, no app
// state) so AceAg can import it later. See README.md.
export { default } from "./weatherAgronomy.ts";
export * from "./weatherAgronomy.ts";
export { buildAccess } from "./weatherAgronomy.ts";
export { buildSpraying, isSprayable, markDarkHours } from "./sprayWindow.ts";
export { openMeteoHourlyRows, openMeteoDailyRows } from "./open-meteo-rows.ts";
export { overlayUkmoPayload, UKMO_HOURLY_OVERLAY, UKMO_CURRENT_OVERLAY } from "./ukmo-overlay.ts";
