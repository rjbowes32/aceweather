import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LIMITS } from "../config.ts";
import { completenessSchema, num, type Completeness } from "../envelope.ts";
import { invalid, ToolError } from "../errors.ts";
import { loadHistory, type HistoryResult } from "../history.ts";
import { getSavedGroups, locationInput, resolveLocation, resolveSaved, type ResolvedLocation } from "../locations.ts";
import type { PeriodRequest } from "../periods.ts";
import { historySummarySchema, value } from "../rows.ts";
import { FORECAST_SOURCE, getForecast, withTimezone } from "../sources/forecast.ts";
import { round, units, type WindUnit } from "../units.ts";
import { dailyPeriodInput, readTool, windUnitInput } from "./define.ts";

const rankSchema = z.array(z.object({ rank: z.number(), name: z.string(), value: z.number() }));
const forecastSchema = z.object({ days: z.number(), precipitation_mm: num, temp_max_c: num, temp_min_c: num });
const rowSchema = z.object({
  id: z.string().nullable(), name: z.string(), latitude: num, longitude: num,
  summary: historySummarySchema.nullable(), completeness: completenessSchema.nullable(), forecast: forecastSchema.nullable(),
  warnings: z.array(z.string()), error: z.object({ code: z.string(), message: z.string() }).nullable(),
});

type Row = z.infer<typeof rowSchema>;
type Target = { id: string | null; label: string; resolve: () => Promise<ResolvedLocation> };

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function forecastTotals(location: ResolvedLocation, days: number) {
  const { raw } = await getForecast(location);
  const d = raw.daily ?? {};
  const start = Math.max(0, (d.time ?? []).indexOf(String(raw.current?.time ?? "").slice(0, 10)));
  const idx = Array.from({ length: Math.min(days, (d.time?.length ?? 0) - start) }, (_, k) => start + k);
  const pick = (key: string) => idx.map((i) => value(d, key, i)).filter((v): v is number => v != null);
  return {
    days: idx.length,
    precipitation_mm: pick("precipitation_sum").length ? round(pick("precipitation_sum").reduce((a, b) => a + b, 0)) : null,
    temp_max_c: pick("temperature_2m_max").length ? round(Math.max(...pick("temperature_2m_max"))) : null,
    temp_min_c: pick("temperature_2m_min").length ? round(Math.min(...pick("temperature_2m_min"))) : null,
  };
}

function rank(rows: Row[], pick: (row: Row) => number | null | undefined, descending: boolean) {
  return rows
    .map((row) => ({ name: row.name, value: pick(row) }))
    .filter((item): item is { name: string; value: number } => typeof item.value === "number")
    .sort((a, b) => (descending ? b.value - a.value : a.value - b.value))
    .map((item, index) => ({ rank: index + 1, ...item }));
}

export function registerRegionalTool(server: McpServer): string[] {
  return [readTool(server, "get_regional_weather", {
    title: "Compare locations across a region",
    description: `Compare weather across up to ${LIMITS.maxLocations} locations, or a saved group such as 'cropdynamics', over one historical period, with optional forecast totals. Returns per-location summaries, rankings and data completeness. Failed locations are reported, not dropped.`,
    input: {
      locations: z.array(z.object(locationInput)).min(1).max(LIMITS.maxLocations).optional().describe("Each item uses the same location fields as other tools."),
      group: z.string().regex(/^[a-z0-9-]+$/).optional().describe("Saved group id, e.g. 'cropdynamics'."),
      ...dailyPeriodInput,
      forecast_days: z.number().int().min(0).max(7).default(0).describe("Also total the next N forecast days (0-7)."),
      wind_unit: windUnitInput,
    },
    data: z.object({
      group: z.string().nullable(),
      locations: z.array(rowSchema),
      rankings: z.object({ precipitation_desc: rankSchema, temp_max_desc: rankSchema, temp_min_asc: rankSchema }),
      regional: z.object({ mean_precipitation_mm: num, locations_ok: z.number(), locations_failed: z.number() }),
    }),
  }, async (args) => {
    if (!args.locations === !args.group) throw invalid("Provide either locations or group, not both.");
    const wind = args.wind_unit as WindUnit;
    let targets: Target[];
    if (args.group) {
      const group = (await getSavedGroups()).find((g) => g.id === args.group);
      if (!group) throw new ToolError("not_found", `No saved group '${args.group}'.`);
      targets = group.locations.map((l) => ({ id: `${group.id}/${l.slug}`, label: l.label, resolve: () => resolveSaved(`${group.id}/${l.slug}`) }));
    } else {
      targets = (args.locations ?? []).map((input) => ({ id: null, label: input.place ?? input.saved_location ?? `${input.latitude}, ${input.longitude}`, resolve: () => resolveLocation(input) }));
    }
    const request: PeriodRequest = args;
    const results = await mapLimit(targets, LIMITS.locationConcurrency, async (target) => {
      try {
        const location = await withTimezone(await target.resolve());
        const [history, forecast] = await Promise.all([
          loadHistory(location, request, wind, "compact"),
          args.forecast_days ? forecastTotals(location, args.forecast_days) : Promise.resolve(null),
        ]);
        return { history, row: { id: target.id, name: location.name, latitude: location.latitude, longitude: location.longitude, summary: history.summary as Row["summary"], completeness: history.completeness, forecast, warnings: [...location.warnings, ...history.warnings], error: null } };
      } catch (error) {
        const known = error instanceof ToolError ? error : new ToolError("internal_error", "Unexpected server error.");
        return { history: null as HistoryResult | null, row: { id: target.id, name: target.label, latitude: null, longitude: null, summary: null, completeness: null, forecast: null, warnings: [], error: { code: known.code, message: known.message } } };
      }
    });
    const ok = results.filter((r) => r.history);
    if (!ok.length) throw new ToolError(results[0].row.error?.code as never, results[0].row.error?.message ?? "No location could be loaded.");
    const rows = results.map((r) => r.row);
    const first = ok[0].history as HistoryResult;
    const warnings = ok.some((r) => r.history?.period.start !== first.period.start || r.history?.period.end !== first.period.end)
      ? ["Locations resolved to different date windows because their timezones differ."] : [];
    const precip = rows.map((r) => r.summary?.precipitation_total_mm).filter((v): v is number => typeof v === "number");
    const completeness = ok.reduce<Completeness>((total, r) => {
      const c = (r.history as HistoryResult).completeness;
      const expected = total.expected + c.expected;
      const available = total.available + c.available;
      return { expected, available, missing: expected - available, percent: round((available / expected) * 100, 1) as number };
    }, { expected: 0, available: 0, missing: 0, percent: 0 });
    const wettest = rank(rows, (r) => r.summary?.precipitation_total_mm, true)[0];
    const failed = rows.filter((r) => r.error);
    if (failed.length) warnings.push(`${failed.length} location(s) failed: ${failed.map((r) => `${r.name} (${r.error?.code})`).join(", ")}.`);
    return {
      summary: `${first.period.label}: ${ok.length} location(s)${wettest ? `, wettest ${wettest.name} with ${wettest.value} mm` : ""}${precip.length ? `, regional mean ${round(precip.reduce((a, b) => a + b, 0) / precip.length)} mm` : ""}.`,
      classification: args.forecast_days ? "mixed" : "reanalysis",
      period: { ...first.period, timezone: first.period.timezone },
      units: units(wind),
      sources: args.forecast_days ? [...first.sources, { ...FORECAST_SOURCE, classification: "forecast", retrieved_at: new Date().toISOString() }] : first.sources,
      completeness,
      warnings,
      data: {
        group: args.group ?? null,
        locations: rows,
        rankings: {
          precipitation_desc: rank(rows, (r) => r.summary?.precipitation_total_mm, true),
          temp_max_desc: rank(rows, (r) => r.summary?.temp_max?.value, true),
          temp_min_asc: rank(rows, (r) => r.summary?.temp_min?.value, false),
        },
        regional: { mean_precipitation_mm: precip.length ? round(precip.reduce((a, b) => a + b, 0) / precip.length) : null, locations_ok: ok.length, locations_failed: failed.length },
      },
    };
  })];
}
