// AceWeather weather engine: the single source of truth for farm-weather
// decisions. Pure, dependency-free TypeScript (no React, no fetch, no app
// state) so AceAg can import it later. See README.md.
export { default } from "./weatherAgronomy.ts";
export * from "./weatherAgronomy.ts";
export { buildAccess } from "./weatherAgronomy.ts";
export { buildSpraying, isSprayable, markDarkHours } from "./sprayWindow.ts";
export { openMeteoHourlyRows, openMeteoDailyRows } from "./open-meteo-rows.ts";
export { overlayUkmoPayload, UKMO_HOURLY_OVERLAY, UKMO_CURRENT_OVERLAY } from "./ukmo-overlay.ts";
export { deltaTBand, LOW_DELTA_T_TONE, RAIN_ON_CANOPY_MM, RAIN_FAST_MM } from "./sprayWindow.ts";
export type { DeltaTSegment } from "./sprayWindow.ts";
export { ENGINE_TIME_ZONE, dayWord, endDayWord, clockTime, rangeText } from "./london-time.ts";
export { sprayRuns, mainLimit, limitOf } from "./spray-runs.ts";
export type { SprayRun, SprayHourSummary } from "./spray-runs.ts";
