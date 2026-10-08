import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { currentBlock, currentSchema } from "../current.ts";
import { locationOut } from "../envelope.ts";
import { hourlySummarySchema, loadHistory, type HistoryResult } from "../history.ts";
import { locationInput, resolveLocation } from "../locations.ts";
import {
  DEFINITIONS, historyRowSchema, historySummarySchema, hourlyRowSchema, monthRowSchema, type Detail,
} from "../rows.ts";
import { FORECAST_SOURCE, getForecast, withTimezone } from "../sources/forecast.ts";
import { units, type WindUnit } from "../units.ts";
import { detailInput, periodInput, readTool, windUnitInput } from "./define.ts";

const summarySchema = z.union([historySummarySchema, hourlySummarySchema]);
const definitionsSchema = z.record(z.string(), z.string());

function describeHistory(name: string, h: HistoryResult): string {
  const s = h.summary as Record<string, any>;
  const rain = s.precipitation_total_mm == null ? "rainfall unavailable" : `${s.precipitation_total_mm} mm rain`;
  const high = s.temp_max ? `high ${s.temp_max.value} °C` : null;
  const low = s.temp_min ? `low ${s.temp_min.value} °C` : null;
  const days = h.granularity === "hour" ? "" : `, ${s.rain_days} rain day(s)`;
  return `${name}, ${h.period.label}: ${rain}${days}${[high, low].filter(Boolean).length ? `, ${[high, low].filter(Boolean).join(", ")}` : ""}. Data ${h.completeness.percent}% complete (${h.classification}).`;
}

export function registerObservedTools(server: McpServer): string[] {
  return [
    readTool(server, "get_current_weather", {
      title: "Current weather",
      description: "Current temperature, humidity, rainfall, wind, pressure, cloud, visibility and UV for a location. Values are the forecast model's current-hour analysis for the grid point (classification model_current), not a station observation.",
      input: { ...locationInput, wind_unit: windUnitInput },
      data: z.object({ current: currentSchema }),
    }, async (args) => {
      const location = await withTimezone(await resolveLocation(args));
      const wind = args.wind_unit as WindUnit;
      const { raw, retrieved_at } = await getForecast(location);
      const current = currentBlock(raw, wind);
      return {
        summary: `${location.name} at ${current.valid_at ?? "now"} (${location.timezone}): ${current.temperature_c ?? "?"} °C, ${current.condition ?? "condition unknown"}, wind ${current.wind_speed ?? "?"} gusting ${current.wind_gust ?? "?"} ${units(wind).wind_speed}, humidity ${current.relative_humidity_pct ?? "?"}%. Modelled, not measured.`,
        classification: "model_current",
        location: locationOut(location),
        units: units(wind),
        sources: [{ ...FORECAST_SOURCE, classification: "model_current", retrieved_at, notes: "Current-hour model values (15-minute resolution where available)." }],
        warnings: [...location.warnings, "Modelled grid-point conditions; local station readings can differ, especially for rainfall and wind."],
        data: { current },
      };
    }),

    readTool(server, "get_weather_history", {
      title: "Weather history",
      description: "Historical weather for a location over a named or custom period: daily rows (or monthly rows for long periods) plus totals, extremes, rain days, frost days and dry/wet spells. Daily periods use the ERA5 reanalysis archive back to 1940 and end yesterday; today/last_24h/48h/72h use the model's recent hours. Up to 730 days per call.",
      input: { ...locationInput, ...periodInput, wind_unit: windUnitInput, detail: detailInput },
      data: z.object({
        granularity: z.enum(["day", "month", "hour"]),
        summary: summarySchema,
        rows: z.array(z.union([historyRowSchema, monthRowSchema, hourlyRowSchema])),
        definitions: definitionsSchema,
      }),
    }, async (args) => {
      const location = await withTimezone(await resolveLocation(args));
      const wind = args.wind_unit as WindUnit;
      const history = await loadHistory(location, args, wind, args.detail as Detail);
      return {
        summary: describeHistory(location.name, history),
        classification: history.classification,
        location: locationOut(location),
        period: history.period,
        units: units(wind),
        sources: history.sources,
        completeness: history.completeness,
        warnings: [...location.warnings, ...history.warnings],
        data: { granularity: history.granularity, summary: history.summary, rows: history.rows, definitions: DEFINITIONS },
      };
    }),

    readTool(server, "get_weather_digest", {
      title: "Weather digest",
      description: "Compact summary of what the weather did over a period at one location (no daily rows): rainfall, rain days, temperature extremes, frost days, gusts, humidity, evapotranspiration, sunshine, soil and dry/wet spells, with a one-paragraph summary.",
      input: { ...locationInput, ...periodInput, wind_unit: windUnitInput },
      data: z.object({ summary: summarySchema, definitions: definitionsSchema }),
    }, async (args) => {
      const location = await withTimezone(await resolveLocation(args));
      const wind = args.wind_unit as WindUnit;
      const history = await loadHistory(location, args, wind, "compact");
      return {
        summary: describeHistory(location.name, history),
        classification: history.classification,
        location: locationOut(location),
        period: history.period,
        units: units(wind),
        sources: history.sources,
        completeness: history.completeness,
        warnings: [...location.warnings, ...history.warnings],
        data: { summary: history.summary, definitions: DEFINITIONS },
      };
    }),
  ];
}
