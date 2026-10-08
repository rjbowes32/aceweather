export const WIND_UNITS = ["kmh", "mph", "ms", "kn"] as const;
export type WindUnit = (typeof WIND_UNITS)[number];

const WIND_FACTORS: Record<WindUnit, number> = { kmh: 1, mph: 0.621371, ms: 1 / 3.6, kn: 0.539957 };
const WIND_LABELS: Record<WindUnit, string> = { kmh: "km/h", mph: "mph", ms: "m/s", kn: "kn" };

type Maybe = number | null | undefined;

export function round(value: Maybe, dp = 1): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

export const convertWind = (kmh: Maybe, unit: WindUnit) => round(kmh == null ? null : kmh * WIND_FACTORS[unit], 1);
export const secondsToHours = (seconds: Maybe) => round(seconds == null ? null : seconds / 3600, 1);

export function units(windUnit: WindUnit): Record<string, string> {
  return {
    temperature: "°C",
    precipitation: "mm",
    wind_speed: WIND_LABELS[windUnit],
    wind_direction: "degrees (direction wind blows from)",
    relative_humidity: "%",
    pressure: "hPa",
    cloud_cover: "%",
    precipitation_probability: "%",
    evapotranspiration: "mm (FAO-56 reference ET0)",
    sunshine: "hours",
    shortwave_radiation: "MJ/m²",
    soil_temperature: "°C",
    soil_moisture: "m³/m³",
  };
}
