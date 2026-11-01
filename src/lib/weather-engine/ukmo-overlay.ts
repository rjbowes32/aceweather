// Ported from AceAg packages/shared/src/openMeteoPayload.js (main 41ce0ffd).
// The 2 km UKMO (UKV) model is sharper than best_match for UK wind/rain/temp
// but does not publish soil, UV, ET0 or precipitation probability. It is
// fetched as a second request and overlays ONLY the atmospheric fields it
// serves well. Pure; returns base untouched on any mismatch so a UKMO hiccup
// can never degrade the forecast.
type Payload = { hourly?: Record<string, unknown>; current?: Record<string, unknown> } & Record<string, unknown>;

export const UKMO_HOURLY_OVERLAY = [
  "temperature_2m", "apparent_temperature", "relative_humidity_2m",
  "wind_speed_10m", "wind_gusts_10m", "wind_direction_10m",
  "precipitation", "cloud_cover",
];
export const UKMO_CURRENT_OVERLAY = UKMO_HOURLY_OVERLAY;

export function overlayUkmoPayload<T extends Payload>(base: T, ukmo: Payload | null | undefined): T {
  const baseTimes = base?.hourly?.time;
  const ukmoTimes = ukmo?.hourly?.time;
  if (!Array.isArray(baseTimes) || !Array.isArray(ukmoTimes)) return base;
  if (baseTimes.length !== ukmoTimes.length || baseTimes[0] !== ukmoTimes[0]) return base;
  const merged = { ...base, hourly: { ...base.hourly }, current: { ...(base.current || {}) } };
  for (const field of UKMO_HOURLY_OVERLAY) {
    const arr = ukmo?.hourly?.[field];
    // UKMO stops short of a long forecast: keep the base value for any hour it leaves blank.
    if (Array.isArray(arr) && arr.length === baseTimes.length) {
      const own = (base.hourly?.[field] as unknown[]) || [];
      merged.hourly[field] = arr.map((v, i) => (v === null || v === undefined ? own[i] ?? null : v));
    }
  }
  for (const field of UKMO_CURRENT_OVERLAY) {
    const v = ukmo?.current?.[field];
    if (v !== null && v !== undefined) merged.current[field] = v;
  }
  return merged;
}
