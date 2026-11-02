/* One ruleset for weather icons: hour strip, Outlook rows and calendar.
   Rules: /home/box/coding/AceWeather/plans/2026-11-01-weather-icon-rules.md */

// Same names and values as src/lib/weather-engine/sprayWindow.ts on
// feat/aceag-weather-alignment. Import from there once both branches merge.
export const RAIN_ON_CANOPY_MM = 0.1;
export const RAIN_FAST_MM = 0.2;
/** Rain at or below this air temperature (°C) shows as snow/sleet. */
export const SNOW_MAX_TEMP_C = 1;
/** Gust badge trigger, km/h (the app's internal unit; matches the "Gust watch" alert). */
export const GUST_BADGE_KMH = 25;
/** Grass minimum (°C) bands. */
export const FROST_GRASS_C = 0;
export const FROST_RISK_GRASS_C = 2;

export type IconKey = "storm" | "snow" | "rain" | "drizzle" | "fog" | "cloud" | "partly" | "partly-night" | "clear" | "night";
export type FrostBadge = "frost" | "risk" | null;
export type WeatherIcon = { key: IconKey; label: string; frost: FrostBadge; gust: boolean };

export type IconInput = {
  code?: number | null;
  isDay?: number | boolean | null;
  precipMm?: number | null;
  tempC?: number | null;
  gustKmh?: number | null;
  grassMinC?: number | null;
};

const has = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Grass-minimum offset below air temperature: bigger on clear, calm nights. */
export function grassOffset(cloudPct?: number | null, windKmh?: number | null): number {
  const c = has(cloudPct) ? cloudPct : 50;
  const w = has(windKmh) ? windKmh : 10;
  return c < 45 && w < 8 ? 3.5 : c < 70 ? 2 : 1;
}

export function pickWeatherIcon(i: IconInput): WeatherIcon {
  const code = has(i.code) ? Math.round(i.code) : null;
  const night = i.isDay === 0 || i.isDay === false;
  const mm = has(i.precipMm) ? i.precipMm : null;
  const wet = mm == null ? null : mm >= RAIN_ON_CANOPY_MM;
  const cold = has(i.tempC) && i.tempC <= SNOW_MAX_TEMP_C;
  const frost: FrostBadge = !has(i.grassMinC) ? null : i.grassMinC <= FROST_GRASS_C ? "frost" : i.grassMinC <= FROST_RISK_GRASS_C ? "risk" : null;
  const gust = has(i.gustKmh) && i.gustKmh >= GUST_BADGE_KMH;
  const out = (key: IconKey, label: string): WeatherIcon => ({ key, label, frost, gust });

  const snowCode = code != null && ((code >= 71 && code <= 77) || code === 85 || code === 86);
  const rainCode = code != null && ((code >= 61 && code <= 67) || (code >= 80 && code <= 82));
  const drizzleCode = code != null && code >= 51 && code <= 57;

  if (code === 95 || code === 96 || code === 99) return out("storm", "Thunderstorm");
  // Precipitation codes only count when the forecast amount agrees (or no amount is known).
  const precipOk = wet !== false;
  if ((snowCode && precipOk) || (wet && cold)) return out("snow", snowCode ? "Snow" : "Sleet or snow");
  if ((mm != null && mm >= RAIN_FAST_MM) || (rainCode && precipOk && (mm == null || mm >= RAIN_FAST_MM))) return out("rain", rainCode && code >= 80 ? "Rain showers" : "Rain");
  if (wet || ((rainCode || drizzleCode) && precipOk)) return out("drizzle", drizzleCode ? "Drizzle" : "Light rain");
  if (code === 45 || code === 48) return out("fog", "Fog");
  if (code === 3) return out("cloud", "Overcast");
  if (code === 0 || code === 1) return night ? out("night", code === 0 ? "Clear night" : "Mainly clear") : out("clear", code === 0 ? "Clear" : "Mainly clear");
  if (code === 2) return out(night ? "partly-night" : "partly", "Partly cloudy");
  return out("partly", "Cloudy");
}

/** Spoken/title text for an icon and its badges. Wording lives here, never as visible helper text. */
export function weatherIconText(icon: WeatherIcon): string {
  const parts = [icon.label];
  if (icon.frost === "frost") parts.push("frost overnight");
  if (icon.frost === "risk") parts.push("frost risk overnight");
  if (icon.gust) parts.push("gusty");
  return parts.join(", ");
}
