import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { locationOut } from "../envelope.ts";
import { learnedDataSchema, learnedForecast, prepareLocation } from "../learned.ts";
import { locationInput, resolveLocation } from "../locations.ts";
import { units, type WindUnit } from "../units.ts";
import { detailInput, readTool, windUnitInput } from "./define.ts";

export function registerLearnedTool(server: McpServer): string[] {
  return [
    readTool(server, "get_learned_forecast", {
      title: "Learned forecast",
      description: "AceWeather's learned forecast for the next 1-7 days: the four main models (plus ECMWF's AI model from day 3) blended by how accurate each has been at the nearest reference station (a Met Office station, airport or COSMOS-UK site within 80 km) over the last 60 days, with that blend's recent bias removed (temperature, wind) and an equal-weight model mean for rainfall. Each day also shows AceWeather's standard forecast for comparison, plus the station, weights and bias used. detail=full adds hourly rows. Learning needs UK station history; elsewhere temperature and wind fall back to the standard forecast.",
      input: { ...locationInput, days: z.number().int().min(1).max(7).default(7).describe("Days ahead (1-7). Default 7."), wind_unit: windUnitInput, detail: detailInput },
      data: learnedDataSchema,
    }, async (args) => {
      const location = await prepareLocation(await resolveLocation(args));
      const wind = args.wind_unit as WindUnit;
      const result = await learnedForecast(location, { days: args.days, wind, hourly: args.detail === "full" });
      const d = result.data;
      const next = d.daily.find((r) => !r.partial) ?? d.daily[0];
      const how = d.learned_applied.temperature
        ? `learned from ${d.reference?.name} (${d.reference?.distance_km} km)${d.learned_applied.bias_correction ? " with bias correction" : ""}`
        : "standard forecast for temperature and wind (no usable reference station), model mean for rainfall";
      const summary = next
        ? `${location.name}, ${next.date}: ${next.temp_max_c ?? "?"} / ${next.temp_min_c ?? "?"} °C, ${next.precipitation_mm ?? "?"} mm rain, wind up to ${next.wind_speed_max ?? "?"} ${units(wind).wind_speed} (standard forecast ${next.standard.temp_max_c ?? "?"} / ${next.standard.temp_min_c ?? "?"} °C, ${next.standard.precipitation_mm ?? "?"} mm). Next ${args.days} day(s): ${how}.`
        : `${location.name}: no forecast hours available.`;
      return {
        summary,
        classification: "forecast",
        location: locationOut(location),
        period: { period: `next_${args.days}d`, label: `Next ${args.days} days`, timezone: location.timezone, start: d.daily[0]?.date, end: d.daily.at(-1)?.date, days: d.daily.length },
        units: { ...units(wind), precipitation: "mm (daily rows: local-day total)" },
        sources: result.sources,
        warnings: [...location.warnings, ...result.warnings, "A forecast, not a guarantee: the learned blend was about a fifth more accurate than the standard forecast over the past year at northern England stations, and can still be wrong on any day."],
        data: d,
      };
    }),
  ];
}
