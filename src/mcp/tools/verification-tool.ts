import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { locationOut } from "../envelope.ts";
import { locationInput, resolveLocation } from "../locations.ts";
import { withTimezone } from "../sources/forecast.ts";
import { VERIFY_MODELS } from "../sources/previous-runs.ts";
import { units, type WindUnit } from "../units.ts";
import { verificationDataSchema, verifyModels, type VerificationData } from "../verification.ts";
import { readTool, windUnitInput } from "./define.ts";

const nameOf = (id: string | null | undefined) => VERIFY_MODELS.find((m) => m.id === id)?.name.replace(/ \(.*\)$/, "") ?? id ?? "?";

function describe(locationName: string, data: VerificationData, windLabel: string): string {
  const lead = data.best[0];
  const parts: string[] = [];
  const isAceWeather = (id: string | null) => id === "best_match" || (id != null && id === data.aceweather_equivalent);
  const label = (id: string | null) => (isAceWeather(id) ? `${nameOf(id === "best_match" ? data.aceweather_equivalent ?? id : id)} (AceWeather's current forecast)` : nameOf(id));
  const line = (variable: string, best: VerificationData["best"][number]["temperature"], unit: string, reference: string) => {
    if (!best?.model) return;
    const tie = best.tie_with.length ? ` (tied with ${best.tie_with.map(label).join(", ")})` : "";
    const ace = isAceWeather(best.model) || best.tie_with.some(isAceWeather) ? "" : `; AceWeather's forecast ${best.aceweather_mae ?? "?"} ${unit}`;
    parts.push(`${variable}: ${label(best.model)} best, MAE ${best.mae} ${unit}${tie}${ace}, at ${reference}`);
  };
  const air = data.reference.air;
  const rain = data.reference.rain;
  if (lead && air) line("temperature", lead.temperature, "°C", `${air.name} (${air.distance_km} km)`);
  if (lead && air) line("wind speed", lead.wind_speed, windLabel, air.name);
  if (lead && rain) line("daily rainfall", lead.rainfall, "mm", `${rain.name} (${rain.distance_km} km)`);
  return `${locationName}, ${lead?.lead_day ?? "?"}-day-ahead forecasts over the last ${data.window.days} days: ${parts.length ? parts.join("; ") : "not enough matched data to rank models"}.`;
}

export function registerVerificationTool(server: McpServer): string[] {
  return [
    readTool(server, "get_forecast_verification", {
      title: "Forecast verification",
      description: "How accurate each forecast model has actually been near a location: archived 1-7 day forecasts from ECMWF IFS, GFS, ICON, Met Office UM and AceWeather's own blend scored against real measurements at the nearest METAR airport (temperature, wind) and Environment Agency rain gauge (daily rainfall), falling back to COSMOS-UK. Returns MAE, bias, wet/dry accuracy and the best model per variable and lead time. UK only.",
      input: {
        ...locationInput,
        days: z.number().int().min(3).max(28).default(14).describe("Days of history to score (3-28). Default 14."),
        lead_days: z.array(z.number().int().min(1).max(7)).min(1).max(4).default([1, 3, 5]).describe("Forecast lead times in days to score, e.g. [1, 3, 5]. Default [1, 3, 5]."),
        wind_unit: windUnitInput,
      },
      data: verificationDataSchema,
    }, async (args) => {
      const location = await withTimezone(await resolveLocation(args));
      const wind = args.wind_unit as WindUnit;
      const result = await verifyModels(location, { days: args.days, leads: args.lead_days, wind });
      return {
        summary: describe(location.name, result.data, units(wind).wind_speed),
        classification: "calculated",
        location: locationOut(location),
        units: { temperature: "°C", wind_speed: units(wind).wind_speed, precipitation: "mm per UTC day", mae: "mean absolute error", bias: "mean of forecast minus observed" },
        sources: result.sources,
        warnings: [...location.warnings, ...result.warnings],
        data: result.data,
      };
    }),
  ];
}
