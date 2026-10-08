import { z } from "zod";
import { dirToCompass, weatherCondition } from "../lib/aceweather/format.ts";
import { value, type Series } from "./rows.ts";
import { convertWind, round, type WindUnit } from "./units.ts";

const n = z.number().nullable();

export const currentSchema = z.object({
  valid_at: z.string().nullable(), interval_minutes: n,
  temperature_c: n, apparent_temperature_c: n, relative_humidity_pct: n, dew_point_c: n, pressure_hpa: n,
  cloud_cover_pct: n, wind_speed: n, wind_gust: n, wind_direction_deg: n, wind_direction_compass: z.string().nullable(),
  precipitation_mm: n, visibility_km: n, uv_index: n, condition: z.string().nullable(), is_day: z.boolean().nullable(),
  today: z.object({ temp_max_c: n, temp_min_c: n, precipitation_mm: n, precipitation_probability_pct: n }),
});

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Modelled "current" conditions from the forecast payload (not a station reading). */
export function currentBlock(raw: any, wind: WindUnit): z.infer<typeof currentSchema> {
  const c = raw.current ?? {};
  const d: Series = raw.daily ?? {};
  const day = (d.time ?? []).indexOf(String(c.time ?? "").slice(0, 10));
  const code = num(c.weather_code);
  const direction = num(c.wind_direction_10m);
  return {
    valid_at: c.time ?? null,
    interval_minutes: num(c.interval) == null ? null : (c.interval as number) / 60,
    temperature_c: round(num(c.temperature_2m)),
    apparent_temperature_c: round(num(c.apparent_temperature)),
    relative_humidity_pct: num(c.relative_humidity_2m),
    dew_point_c: round(num(c.dew_point_2m)),
    pressure_hpa: round(num(c.pressure_msl)),
    cloud_cover_pct: num(c.cloud_cover),
    wind_speed: convertWind(num(c.wind_speed_10m), wind),
    wind_gust: convertWind(num(c.wind_gusts_10m), wind),
    wind_direction_deg: direction,
    wind_direction_compass: direction == null ? null : dirToCompass(direction),
    precipitation_mm: round(num(c.precipitation)),
    visibility_km: num(c.visibility) == null ? null : round((c.visibility as number) / 1000),
    uv_index: round(num(c.uv_index)),
    condition: code == null ? null : weatherCondition(code, num(c.is_day) ?? 1).label,
    is_day: num(c.is_day) == null ? null : c.is_day === 1,
    today: {
      temp_max_c: day < 0 ? null : round(value(d, "temperature_2m_max", day)),
      temp_min_c: day < 0 ? null : round(value(d, "temperature_2m_min", day)),
      precipitation_mm: day < 0 ? null : round(value(d, "precipitation_sum", day)),
      precipitation_probability_pct: day < 0 ? null : value(d, "precipitation_probability_max", day),
    },
  };
}
