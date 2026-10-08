import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MODELS, spread, type MultiModelPayload } from "../../lib/multi-model.ts";
import { LIMITS } from "../config.ts";
import { localNow } from "../dates.ts";
import { locationOut, num, type Source } from "../envelope.ts";
import { locationInput, resolveLocation } from "../locations.ts";
import { withTimezone } from "../sources/forecast.ts";
import { getModelRun, getMultiModel, MODEL_INFO, type ModelRun } from "../sources/models.ts";
import { convertWind, round, units, type WindUnit } from "../units.ts";
import { readTool, windUnitInput } from "./define.ts";

const VARIABLES = { temp_max_c: "temperature_2m_max", temp_min_c: "temperature_2m_min", precipitation_mm: "precipitation_sum", wind_speed_max: "wind_speed_10m_max" } as const;
type Variable = keyof typeof VARIABLES;
const LEVELS = ["low", "medium", "high"] as const;
type Level = (typeof LEVELS)[number];

export const CONFIDENCE_METHOD = "Agreement between four deterministic models (ECMWF IFS, GFS, ICON, UKMO). Temperature: largest max/min spread <= 2 °C high, <= 4 °C medium, else low. Rain: models agreeing on wet (>= 1 mm) or dry - all agree and spread <= 5 mm high, >= 75% agree medium, else low; fewer than 3 models is low. Wind: spread of daily max <= 10 km/h high, <= 20 km/h medium, else low. Overall is the lowest of the three. This is not an ensemble probability.";

const statSchema = z.object({ min: num, max: num, spread: num, models: z.number() });
const modelDaySchema = z.object({ date: z.string(), temp_max_c: num, temp_min_c: num, precipitation_mm: num, wind_speed_max: num });

function window(payload: MultiModelPayload, timezone: string, days: number) {
  const time = payload.models[0]?.daily.time ?? [];
  const today = localNow(timezone).day;
  const start = Math.max(0, time.indexOf(today));
  return Array.from({ length: Math.max(0, Math.min(days, time.length - start)) }, (_, k) => start + k);
}

function modelValue(payload: MultiModelPayload, model: number, variable: Variable, i: number, wind: WindUnit): number | null {
  const v = payload.models[model].daily[VARIABLES[variable]][i];
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return variable === "wind_speed_max" ? convertWind(v, wind) : round(v);
}

function stat(values: Array<number | null>) {
  const known = values.filter((v): v is number => v != null);
  return { min: known.length ? Math.min(...known) : null, max: known.length ? Math.max(...known) : null, spread: round(spread(known)), models: known.length };
}

async function load(args: z.infer<z.ZodObject<typeof locationInput>> & { days: number }) {
  const location = await withTimezone(await resolveLocation(args));
  const [payload, runs] = await Promise.all([getMultiModel(location), Promise.all(MODELS.map((m) => getModelRun(m.id)))]);
  const retrieved_at = new Date(payload.fetchedAt).toISOString();
  const sources: Source[] = MODELS.map((m, k) => ({
    name: "Open-Meteo Forecast API", classification: "forecast", model: MODEL_INFO[m.id].name, issued_at: runs[k].initialised_at,
    retrieved_at, url: "https://open-meteo.com/en/docs", notes: "issued_at is the latest initialisation of the model's global component.",
  }));
  return { location, payload, runs, sources, idx: window(payload, location.timezone, args.days) };
}

const lowest = (levels: Level[]): Level => LEVELS[Math.min(...levels.map((l) => LEVELS.indexOf(l)))];

function confidenceFor(payload: MultiModelPayload, i: number) {
  const values = (variable: Variable) => payload.models.map((_, m) => modelValue(payload, m, variable, i, "kmh"));
  const tempSpread = Math.max(stat(values("temp_max_c")).spread ?? Infinity, stat(values("temp_min_c")).spread ?? Infinity);
  const rain = values("precipitation_mm").filter((v): v is number => v != null);
  const wet = rain.filter((v) => v >= 1).length;
  const agreement = rain.length ? Math.max(wet, rain.length - wet) / rain.length : 0;
  const rainSpread = stat(rain).spread ?? 0;
  const windSpread = stat(values("wind_speed_max")).spread ?? Infinity;
  const temperature: Level = tempSpread <= 2 ? "high" : tempSpread <= 4 ? "medium" : "low";
  const precipitation: Level = rain.length < 3 ? "low" : agreement === 1 && rainSpread <= 5 ? "high" : agreement >= 0.75 ? "medium" : "low";
  const windLevel: Level = windSpread <= 10 ? "high" : windSpread <= 20 ? "medium" : "low";
  return {
    overall: lowest([temperature, precipitation, windLevel]),
    temperature: { confidence: temperature, spread_c: Number.isFinite(tempSpread) ? round(tempSpread) : null },
    precipitation: { confidence: precipitation, models_wet: wet, models_available: rain.length, spread_mm: round(rainSpread) },
    wind: { confidence: windLevel, spread_kmh: Number.isFinite(windSpread) ? round(windSpread) : null },
  };
}

export function registerModelTools(server: McpServer): string[] {
  const days = z.number().int().min(1).max(LIMITS.maxModelDays).default(5);
  return [
    readTool(server, "compare_forecast_models", {
      title: "Compare forecast models",
      description: "Side-by-side daily forecasts from ECMWF IFS 0.25°, GFS, ICON and UKMO for up to 7 days, with each model's latest run time and the per-day spread between models.",
      input: { ...locationInput, days, wind_unit: windUnitInput },
      data: z.object({
        models: z.array(z.object({ id: z.string(), name: z.string(), run: z.object({ initialised_at: z.string().nullable(), available_at: z.string().nullable() }), days: z.array(modelDaySchema) })),
        spread: z.array(z.object({ date: z.string(), temp_max_c: statSchema, temp_min_c: statSchema, precipitation_mm: statSchema, wind_speed_max: statSchema })),
      }),
    }, async (args) => {
      const wind = args.wind_unit as WindUnit;
      const { location, payload, runs, sources, idx } = await load(args);
      const time = payload.models[0]?.daily.time ?? [];
      const row = (m: number, i: number) => ({
        date: time[i],
        ...Object.fromEntries((Object.keys(VARIABLES) as Variable[]).map((v) => [v, modelValue(payload, m, v, i, wind)])),
      }) as z.infer<typeof modelDaySchema>;
      const spreads = idx.map((i) => ({
        date: time[i],
        ...Object.fromEntries((Object.keys(VARIABLES) as Variable[]).map((v) => [v, stat(payload.models.map((_, m) => modelValue(payload, m, v, i, wind)))])),
      })) as Array<{ date: string } & Record<Variable, ReturnType<typeof stat>>>;
      const rain = spreads.map((s) => s.precipitation_mm);
      return {
        summary: `${location.name}, ${idx.length} days from ${time[idx[0]] ?? "?"}: model rain totals for the period range ${round(rain.reduce((a, s) => a + (s.min ?? 0), 0))}-${round(rain.reduce((a, s) => a + (s.max ?? 0), 0))} mm across ${MODELS.length} models.`,
        classification: "forecast",
        location: locationOut(location),
        period: { period: `next_${idx.length}d`, label: `Next ${idx.length} days`, timezone: location.timezone, start: time[idx[0]], end: time[idx.at(-1) ?? 0], days: idx.length },
        units: units(wind),
        sources,
        warnings: [...location.warnings, ...(runs.some((r: ModelRun) => !r.initialised_at) ? ["Some model run times are unavailable."] : [])],
        data: {
          models: payload.models.map((m, k) => ({ id: m.id, name: MODEL_INFO[m.id].name, run: runs[k], days: idx.map((i) => row(k, i)) })),
          spread: spreads,
        },
      };
    }),

    readTool(server, "get_forecast_confidence", {
      title: "Forecast confidence",
      description: "Day-by-day confidence (high/medium/low) for temperature, rain and wind over the next 1-7 days, from agreement between four forecast models. Explains the method; it is not an ensemble probability.",
      input: { ...locationInput, days },
      data: z.object({
        method: z.string(),
        days: z.array(z.object({
          date: z.string(), lead_time_days: z.number(), overall: z.enum(LEVELS),
          temperature: z.object({ confidence: z.enum(LEVELS), spread_c: num }),
          precipitation: z.object({ confidence: z.enum(LEVELS), models_wet: z.number(), models_available: z.number(), spread_mm: num }),
          wind: z.object({ confidence: z.enum(LEVELS), spread_kmh: num }),
        })),
      }),
    }, async (args) => {
      const { location, payload, sources, idx } = await load(args);
      const time = payload.models[0]?.daily.time ?? [];
      const today = localNow(location.timezone).day;
      const rows = idx.map((i) => ({ date: time[i], lead_time_days: Math.round((Date.parse(time[i]) - Date.parse(today)) / 86_400_000), ...confidenceFor(payload, i) }));
      const low = rows.filter((r) => r.overall === "low").map((r) => r.date);
      return {
        summary: `${location.name}: ${rows.map((r) => `${r.date} ${r.overall}`).join(", ")}.${low.length ? ` Treat ${low.join(", ")} with caution.` : ""}`,
        classification: "calculated",
        location: locationOut(location),
        period: { period: `next_${rows.length}d`, label: `Next ${rows.length} days`, timezone: location.timezone, start: rows[0]?.date, end: rows.at(-1)?.date, days: rows.length },
        units: { spread_c: "°C", spread_mm: "mm", spread_kmh: "km/h" },
        sources,
        warnings: location.warnings,
        data: { method: CONFIDENCE_METHOD, days: rows },
      };
    }),
  ];
}
