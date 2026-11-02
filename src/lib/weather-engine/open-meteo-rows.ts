// Turns a raw Open-Meteo payload (parallel hourly/daily arrays) into the
// engine's row shape. The only place that knows Open-Meteo field names.
import type { WeatherRow } from "./weatherRows.ts";
import { markDarkHours } from "./sprayWindow.ts";

type Series = Record<string, unknown>;
const HOURLY: Record<string, string> = {
  temperature: "temperature_2m", humidity: "relative_humidity_2m", precipitation: "precipitation",
  precipProbability: "precipitation_probability", windSpeed: "wind_speed_10m", windGusts: "wind_gusts_10m",
  cloudCover: "cloud_cover", et0: "et0_fao_evapotranspiration", soilTemp0: "soil_temperature_0cm",
  soilTemp6: "soil_temperature_6cm", soilMoisture0to1: "soil_moisture_0_to_1cm", soilMoisture1to3: "soil_moisture_1_to_3cm",
  soilMoisture3to9: "soil_moisture_3_to_9cm", soilMoisture9to27: "soil_moisture_9_to_27cm",
};

const at = (series: Series, key: string, i: number) => {
  const arr = series?.[key];
  return Array.isArray(arr) ? arr[i] ?? null : null;
};

/** Daily rows carrying the sun times that set each hour's night flag. */
export function openMeteoDailyRows(daily: Series = {}): WeatherRow[] {
  const time = Array.isArray(daily.time) ? daily.time : [];
  return time.map((t, i) => ({ time: t, sunrise: at(daily, "sunrise", i), sunset: at(daily, "sunset", i), rain: at(daily, "precipitation_sum", i) }));
}

/** Hourly rows, each marked dark or light from its day's sunrise and sunset. */
export function openMeteoHourlyRows(hourly: Series = {}, daily: Series = {}, utcOffsetSeconds: number | null = null): WeatherRow[] {
  const time = Array.isArray(hourly.time) ? hourly.time : [];
  const rows = time.map((t, i) => {
    const row: WeatherRow = { time: t };
    // With the place's offset, each hour also carries its real instant.
    if (typeof utcOffsetSeconds === "number" && Number.isFinite(utcOffsetSeconds)) {
      const ms = Date.parse(`${String(t)}:00Z`) - utcOffsetSeconds * 1000;
      if (Number.isFinite(ms)) row.epoch = ms;
    }
    for (const [name, key] of Object.entries(HOURLY)) row[name] = at(hourly, key, i);
    return row;
  });
  return markDarkHours(rows, openMeteoDailyRows(daily));
}
