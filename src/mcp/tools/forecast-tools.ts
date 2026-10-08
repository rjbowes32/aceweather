import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LIMITS } from "../config.ts";
import { locationOut, num, type Envelope } from "../envelope.ts";
import { locationInput, resolveLocation, type LocationInput, type ResolvedLocation } from "../locations.ts";
import { dailyForecastRow, dailyForecastRowSchema, gustsByDate, hourlyRow, hourlyRowSchema, type Detail } from "../rows.ts";
import { currentHourIndex, FORECAST_SOURCE, getForecast, withTimezone } from "../sources/forecast.ts";
import { round, units, type WindUnit } from "../units.ts";
import { detailInput, readTool, windUnitInput } from "./define.ts";

const ISSUE_NOTE = "best_match blends several model runs, so it has no single issue time; compare_forecast_models gives each model's run time.";
const totalsSchema = z.object({
  precipitation_total_mm: num, max_precipitation_probability_pct: num, temp_max_c: num, temp_min_c: num, wind_gust_max: num,
  first_rain: z.string().nullable(),
});

type Row = Record<string, any>;

function totals(rows: Row[], timeKey: "time" | "date", tempMax: string, tempMin: string, gust: string) {
  const pick = (key: string) => rows.map((r) => r[key]).filter((v): v is number => typeof v === "number");
  const sum = pick("precipitation_mm").reduce((a, b) => a + b, 0);
  return {
    precipitation_total_mm: pick("precipitation_mm").length ? round(sum) : null,
    max_precipitation_probability_pct: pick("precipitation_probability_pct").length ? Math.max(...pick("precipitation_probability_pct")) : null,
    temp_max_c: pick(tempMax).length ? Math.max(...pick(tempMax)) : null,
    temp_min_c: pick(tempMin).length ? Math.min(...pick(tempMin)) : null,
    wind_gust_max: pick(gust).length ? Math.max(...pick(gust)) : null,
    first_rain: rows.find((r) => typeof r.precipitation_mm === "number" && r.precipitation_mm >= 0.2)?.[timeKey] ?? null,
  };
}

async function loadForecast(args: LocationInput) {
  const location = await withTimezone(await resolveLocation(args));
  return { location, ...(await getForecast(location)) };
}

function dailyRows(raw: any, from: number, count: number, wind: WindUnit, detail: Detail): Row[] {
  const d = raw.daily ?? {};
  const today = Math.max(0, (d.time ?? []).indexOf(String(raw.current?.time ?? "").slice(0, 10)));
  const gusts = gustsByDate(raw.hourly ?? {});
  const start = today + from;
  return Array.from({ length: Math.max(0, Math.min(count, (d.time?.length ?? 0) - start)) }, (_, k) => ({
    ...dailyForecastRow(d, start + k, gusts, wind, detail),
    lead_time_days: from + k,
  }));
}

function envelope(location: ResolvedLocation, wind: WindUnit, retrieved_at: string, period: Envelope["period"], summary: string, warnings: string[], data: Record<string, unknown>): Envelope {
  return {
    summary,
    classification: "forecast",
    location: locationOut(location),
    period,
    units: units(wind),
    sources: [{ ...FORECAST_SOURCE, classification: "forecast", issued_at: null, retrieved_at, notes: ISSUE_NOTE }],
    warnings: [...location.warnings, ...warnings],
    data,
  };
}

const rainText = (t: { precipitation_total_mm: number | null; first_rain: string | null }) =>
  `${t.precipitation_total_mm ?? "?"} mm rain${t.first_rain ? ` (first from ${t.first_rain})` : ", none of note"}`;

export function registerForecastTools(server: McpServer): string[] {
  return [
    readTool(server, "get_hourly_forecast", {
      title: "Hourly forecast",
      description: `Hour-by-hour forecast from the current hour for up to ${LIMITS.maxHourlyRows} hours: temperature, rain and its probability, wind, gusts and direction (detail=full adds humidity, cloud, pressure, ET0 and soil). Hourly rain is the total for the preceding hour.`,
      input: { ...locationInput, hours: z.number().int().min(1).max(LIMITS.maxHourlyRows).default(48), wind_unit: windUnitInput, detail: detailInput },
      data: z.object({ totals: totalsSchema, rows: z.array(hourlyRowSchema) }),
    }, async (args) => {
      const { location, raw, retrieved_at } = await loadForecast(args);
      const wind = args.wind_unit as WindUnit;
      const h = raw.hourly ?? {};
      const start = currentHourIndex(h.time ?? [], String(raw.current?.time ?? ""));
      const count = Math.max(0, Math.min(args.hours, (h.time?.length ?? 0) - start));
      const rows: Row[] = Array.from({ length: count }, (_, k) => hourlyRow(h, start + k, wind, args.detail as Detail));
      const t = totals(rows, "time", "temperature_c", "temperature_c", "wind_gust");
      return envelope(location, wind, retrieved_at,
        { period: `next_${count}h`, label: `Next ${count} hours`, timezone: location.timezone, start: rows[0]?.time, end: rows.at(-1)?.time, hours: count },
        `${location.name}, next ${count} h: ${rainText(t)}, ${t.temp_min_c ?? "?"} to ${t.temp_max_c ?? "?"} °C, gusts to ${t.wind_gust_max ?? "?"} ${units(wind).wind_speed}.`,
        count < args.hours ? [`Only ${count} forecast hours are available.`] : [],
        { totals: t, rows });
    }),

    readTool(server, "get_daily_forecast", {
      title: "Daily forecast",
      description: `Day-by-day forecast from today for up to ${LIMITS.maxForecastDays} days: max/min temperature, rain and probability, wind and gusts, weather type (detail=full adds wind direction, UV, sunrise and sunset).`,
      input: { ...locationInput, days: z.number().int().min(1).max(LIMITS.maxForecastDays).default(7), wind_unit: windUnitInput, detail: detailInput },
      data: z.object({ totals: totalsSchema, rows: z.array(dailyForecastRowSchema) }),
    }, async (args) => {
      const { location, raw, retrieved_at } = await loadForecast(args);
      const wind = args.wind_unit as WindUnit;
      const rows = dailyRows(raw, 0, args.days, wind, args.detail as Detail);
      const t = totals(rows, "date", "temp_max_c", "temp_min_c", "wind_gust_max");
      return envelope(location, wind, retrieved_at,
        { period: `next_${rows.length}d`, label: `Next ${rows.length} days`, timezone: location.timezone, start: rows[0]?.date, end: rows.at(-1)?.date, days: rows.length },
        `${location.name}, next ${rows.length} days: ${rainText(t)}, temperatures ${t.temp_min_c ?? "?"} to ${t.temp_max_c ?? "?"} °C.`,
        rows.length > 7 ? ["Days beyond 7 have lower skill; use get_forecast_confidence for days 1-7."] : [],
        { totals: t, rows });
    }),

    readTool(server, "get_extended_forecast", {
      title: "Extended forecast (week 2)",
      description: "Days 8-14 of the forecast with lead times and week-2 totals. Skill is limited at this range; treat it as an outlook. Nothing beyond 14 days is available from AceWeather's current providers.",
      input: { ...locationInput, wind_unit: windUnitInput, detail: detailInput },
      data: z.object({ totals: totalsSchema, rows: z.array(dailyForecastRowSchema), available_through: z.string().nullable() }),
    }, async (args) => {
      const { location, raw, retrieved_at } = await loadForecast(args);
      const wind = args.wind_unit as WindUnit;
      const rows = dailyRows(raw, 7, 7, wind, args.detail as Detail);
      const t = totals(rows, "date", "temp_max_c", "temp_min_c", "wind_gust_max");
      return envelope(location, wind, retrieved_at,
        { period: "days_8_14", label: "Forecast days 8-14", timezone: location.timezone, start: rows[0]?.date, end: rows.at(-1)?.date, days: rows.length },
        `${location.name}, week 2 outlook (${rows[0]?.date ?? "?"} to ${rows.at(-1)?.date ?? "?"}): ${t.precipitation_total_mm ?? "?"} mm rain, ${t.temp_min_c ?? "?"} to ${t.temp_max_c ?? "?"} °C. Low-skill range.`,
        ["Days 8-14 are an outlook with limited skill; amounts and timing will change.", "No forecast beyond 14 days is available."],
        { totals: t, rows, available_through: rows.at(-1)?.date ?? null });
    }),
  ];
}
