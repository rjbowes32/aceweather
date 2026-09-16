/** Weather-only planning. Open-Meteo hourly rain is the preceding-hour total. */
export type PlanningForecast = {
  time: string[];
  precipitation?: Array<number | null>;
  wind_gusts_10m?: Array<number | null>;
};
export type WindowLimits = { hours: number; rain: number; gust: number };
export type WeatherWindow = { start: string; end: string; rain: number; gust: number };

const valid = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const localHour = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(value) ? Date.parse(`${value}:00Z`) : NaN;

export function findWorkWindows(hourly: PlanningForecast, now: string, limits: WindowLimits): WeatherWindow[] {
  if (!Number.isInteger(limits.hours) || limits.hours < 1 || !valid(limits.rain) || !valid(limits.gust) || !now) return [];
  const windows: WeatherWindow[] = [];
  for (let i = 0; i + limits.hours < hourly.time.length; i++) {
    const start = hourly.time[i];
    if (start < now) continue; // Never offer a partially elapsed hour.
    const startMs = localHour(start);
    if (!Number.isFinite(startMs)) continue;
    let rain = 0, gust = 0, complete = true;
    for (let offset = 1; offset <= limits.hours; offset++) {
      const j = i + offset;
      const amount = hourly.precipitation?.[j];
      const peak = hourly.wind_gusts_10m?.[j];
      if (localHour(hourly.time[j]) - startMs !== offset * 3600000 || !valid(amount) || !valid(peak) || amount > limits.rain || peak > limits.gust) {
        complete = false;
        break;
      }
      rain += amount;
      gust = Math.max(gust, peak);
    }
    if (complete) {
      windows.push({ start, end: hourly.time[i + limits.hours], rain, gust });
      i += limits.hours - 1; // Non-overlapping options, earliest first.
    }
    if (windows.length === 3) break;
  }
  return windows;
}
