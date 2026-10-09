import { z } from "zod";
import { LIMITS } from "./config.ts";
import { addDays, daysInclusive, isIsoDate, localNow, shiftYears } from "./dates.ts";
import { num, type Envelope } from "./envelope.ts";
import { invalid, ToolError } from "./errors.ts";
import { getSavedGroups, resolveLocation, resolveSaved, type LocationInput, type ResolvedLocation } from "./locations.ts";
import { value, type Series } from "./rows.ts";
import { COMPARISON_SOURCE, getComparisonArchive } from "./sources/archive.ts";
import { withTimezone } from "./sources/forecast.ts";
import { round } from "./units.ts";
import { mapLimit } from "./tools/regional-tool.ts";

const METRICS = {
  rainfall_total_mm: { field: "rain_sum", operation: "sum" },
  air_temp_max_c: { field: "temperature_2m_max", operation: "max" },
  air_temp_min_c: { field: "temperature_2m_min", operation: "min" },
  air_temp_mean_c: { field: "temperature_2m_mean", operation: "mean" },
  soil_temp_mean_0_7cm_c: { field: "soil_temperature_0_to_7cm_mean", operation: "mean" },
} as const;
type Metric = keyof typeof METRICS;
const keys = Object.keys(METRICS) as Metric[];
const metricSchema = z.object({ value: num, complete: z.boolean(), available_days: z.number(), expected_days: z.number(), missing_dates: z.array(z.string()) });
const metricsSchema = z.object(Object.fromEntries(keys.map((k) => [k, metricSchema])) as Record<Metric, typeof metricSchema>);
const errorSchema = z.object({ code: z.string(), message: z.string() }).nullable();
const periodResultSchema = z.object({ year: z.number(), start: z.string(), end: z.string(), metrics: metricsSchema, error: errorSchema });
const comparisonMetricSchema = z.object({ current: num, baseline_mean: num, baseline_years_available: z.number(), anomaly: num, anomaly_percent: num, comparable: z.boolean() });
const comparisonSchema = z.object(Object.fromEntries(keys.map((k) => [k, comparisonMetricSchema])) as Record<Metric, typeof comparisonMetricSchema>);
export const comparisonDataSchema = z.object({
  group: z.string().nullable(), report_date: z.string().nullable(), model: z.literal("era5"), soil_depth_cm: z.tuple([z.literal(0), z.literal(7)]),
  baseline_years: z.array(z.number()), definitions: z.record(z.string(), z.string()),
  locations: z.array(z.object({ id: z.string().nullable(), name: z.string(), latitude: z.number(), longitude: z.number(), current: periodResultSchema, baseline: z.array(periodResultSchema), comparison: comparisonSchema })),
  regional: z.object({ current: metricsSchema, baseline: z.array(periodResultSchema), comparison: comparisonSchema }),
  newsletter_rows: z.array(z.object({ location: z.string(), metric: z.string(), unit: z.string(), current: num, baseline_mean: num, baseline_years_available: z.number(), anomaly: num, anomaly_percent: num, complete: z.boolean() })),
});
type Metrics = z.infer<typeof metricsSchema>;
type PeriodResult = z.infer<typeof periodResultSchema>;
export type ComparisonRequest = LocationInput & { group?: string; report_date?: string; history_days?: number; baseline_years?: number; start_date?: string; end_date?: string };

function summarize(daily: Series, start: string, end: string): Metrics {
  const dates = Array.from({ length: daysInclusive(start, end) }, (_, i) => addDays(start, i));
  const indices = new Map((daily.time ?? []).map((d, i) => [d, i]));
  return Object.fromEntries(keys.map((key) => {
    const { field, operation } = METRICS[key];
    const samples = dates.map((d) => indices.has(d) ? value(daily, field, indices.get(d)!) : null);
    const known = samples.filter((v): v is number => v !== null);
    const total = known.reduce((a, b) => a + b, 0);
    const result = !known.length ? null : operation === "sum" ? total : operation === "max" ? Math.max(...known) : operation === "min" ? Math.min(...known) : total / known.length;
    return [key, { value: result, complete: known.length === dates.length, available_days: known.length, expected_days: dates.length, missing_dates: dates.filter((_, i) => samples[i] === null) }];
  })) as Metrics;
}

function regional(periods: PeriodResult[]): PeriodResult {
  const first = periods[0];
  const metrics = Object.fromEntries(keys.map((key) => {
    const all = periods.map((p) => p.metrics[key]);
    const complete = all.every((m) => m.complete);
    const known = all.map((m) => m.value).filter((v): v is number => v !== null);
    // Preserve the fixed seven-location population: never average only the successful subset.
    const result = known.length !== all.length ? null : key === "air_temp_max_c" ? Math.max(...known) : key === "air_temp_min_c" ? Math.min(...known) : known.reduce((a, b) => a + b, 0) / known.length;
    return [key, { value: result, complete, available_days: all.reduce((n, m) => n + m.available_days, 0), expected_days: all.reduce((n, m) => n + m.expected_days, 0), missing_dates: [...new Set(all.flatMap((m) => m.missing_dates))] }];
  })) as Metrics;
  return { year: first.year, start: first.start, end: first.end, metrics, error: periods.find((p) => p.error)?.error ?? null };
}

function compare(current: Metrics, baseline: PeriodResult[], requested: number) {
  return Object.fromEntries(keys.map((key) => {
    const known = baseline.filter((p) => p.metrics[key].complete && p.metrics[key].expected_days === current[key].expected_days).map((p) => p.metrics[key].value as number);
    const mean = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
    const comparable = current[key].complete && known.length === requested;
    const anomaly = comparable && mean !== null ? (current[key].value as number) - mean : null;
    return [key, { current: round(current[key].value, 2), baseline_mean: round(mean, 2), baseline_years_available: known.length, anomaly: round(anomaly, 2), anomaly_percent: key === "rainfall_total_mm" && anomaly !== null && mean !== null && mean !== 0 ? round(anomaly / mean * 100, 1) : null, comparable }];
  })) as z.infer<typeof comparisonSchema>;
}
const roundedMetrics = (metrics: Metrics): Metrics => Object.fromEntries(keys.map((k) => [k, { ...metrics[k], value: round(metrics[k].value, 2) }])) as Metrics;
const roundedPeriod = (p: PeriodResult): PeriodResult => ({ ...p, metrics: roundedMetrics(p.metrics) });

export async function loadComparison(args: ComparisonRequest): Promise<Envelope> {
  const hasLocation = args.place !== undefined || args.saved_location !== undefined || args.latitude !== undefined || args.longitude !== undefined;
  if (!!args.group === hasLocation) throw invalid("Provide either group or exactly one location selector.");
  let locations: ResolvedLocation[];
  if (args.group) {
    const group = (await getSavedGroups()).find((g) => g.id === args.group);
    if (!group) throw new ToolError("not_found", `No saved group '${args.group}'.`);
    if (!group.locations.length || group.locations.length > LIMITS.maxLocations) throw invalid(`Groups must contain 1–${LIMITS.maxLocations} locations.`);
    locations = await Promise.all(group.locations.map((l) => resolveSaved(`${group.id}/${l.slug}`)));
  } else locations = [await withTimezone(await resolveLocation(args))];
  if (locations.some((l) => l.timezone !== locations[0].timezone)) throw invalid("Comparison locations must share a timezone.");
  const today = localNow(locations[0].timezone).day;
  const custom = args.start_date !== undefined || args.end_date !== undefined;
  if (custom && (args.report_date !== undefined || args.history_days !== undefined)) throw invalid("Use start_date/end_date or report_date/history_days, not both.");
  if (args.report_date && (!isIsoDate(args.report_date) || args.report_date > today)) throw invalid("report_date must be a valid date no later than today.");
  const reportDate = args.report_date ?? today;
  const end = custom ? args.end_date : addDays(reportDate, -1);
  const start = custom ? args.start_date : addDays(end!, -(args.history_days ?? 14) + 1);
  if (!start || !end || !isIsoDate(start) || !isIsoDate(end) || start > end || end >= today) throw invalid("Provide a valid, complete historical date range ending before today.");
  if (daysInclusive(start, end) > 31) throw invalid("Comparisons support at most 31 complete calendar days.");
  const years = args.baseline_years ?? 10;
  if (shiftYears(start, years) < LIMITS.earliestDate) throw invalid("Every baseline period must start on or after 1940-01-01.");
  const windows = Array.from({ length: years + 1 }, (_, ago) => ({ year: Number(shiftYears(start, ago).slice(0, 4)), start: shiftYears(start, ago), end: shiftYears(end, ago) }));
  const warnings = [...locations.flatMap((l) => l.warnings), COMPARISON_SOURCE.notes];
  if (windows.some((w) => daysInclusive(w.start, w.end) !== daysInclusive(start, end))) warnings.push("Leap-day dates are clamped to February 28 in non-leap years; period lengths differ and are listed explicitly.");
  const sources = new Map<string, string>();
  const results = await mapLimit(windows, LIMITS.locationConcurrency, async (window): Promise<PeriodResult[]> => {
    try {
      const archives = await getComparisonArchive(locations, window.start, window.end);
      return archives.map((archive) => {
        sources.set(archive.retrieved_at, archive.retrieved_at);
        return { ...window, metrics: summarize(archive.daily, window.start, window.end), error: null };
      });
    } catch (error) {
      const known = error instanceof ToolError ? error : new ToolError("upstream_unavailable", "ERA5 archive returned an invalid response.");
      warnings.push(`${window.start} to ${window.end}: ${known.message}`);
      return locations.map(() => ({ ...window, metrics: summarize({ time: [] }, window.start, window.end), error: { code: known.code, message: known.message } }));
    }
  });
  if (results.every((r) => r.every((p) => p.error))) throw new ToolError("upstream_unavailable", "No ERA5 comparison period could be loaded.");
  const byLocation = locations.map((location, i) => {
    const current = results[0][i];
    const baseline = results.slice(1).map((r) => r[i]);
    return { id: location.resolution.method === "saved_location" ? location.resolution.query! : null, name: location.name, latitude: location.latitude, longitude: location.longitude, current: roundedPeriod(current), baseline: baseline.map(roundedPeriod), comparison: compare(current.metrics, baseline, years) };
  });
  const regionalPeriods = results.map(regional);
  const regionalComparison = compare(regionalPeriods[0].metrics, regionalPeriods.slice(1), years);
  const expected = results.flat().reduce((n, p) => n + keys.reduce((m, k) => m + p.metrics[k].expected_days, 0), 0);
  const available = results.flat().reduce((n, p) => n + keys.reduce((m, k) => m + p.metrics[k].available_days, 0), 0);
  if (available < expected) warnings.push("Missing measurements are listed per metric and period. Partial current values cover available days only. Baseline means exclude incomplete years; anomalies require a complete current period and every requested baseline year.");
  const newsletter_rows = [...byLocation.map((l) => ({ name: l.name, comparison: l.comparison })), { name: "Regional", comparison: regionalComparison }].flatMap(({ name, comparison }) => keys.map((key) => ({ location: name, metric: key, unit: key === "rainfall_total_mm" ? "mm" : "°C", current: comparison[key].current, baseline_mean: comparison[key].baseline_mean, baseline_years_available: comparison[key].baseline_years_available, anomaly: comparison[key].anomaly, anomaly_percent: comparison[key].anomaly_percent, complete: comparison[key].comparable })));
  return {
    summary: `${args.group ?? locations[0].name}: ${start} to ${end}, compared with equivalent calendar dates in the previous ${years} years (ERA5). ${available < expected ? "Incomplete reanalysis: inspect missing dates before publishing; full-period anomalies withheld where incomplete." : "All requested measurements available."}`,
    classification: "calculated",
    period: { period: "custom", label: "Historical calendar-period comparison", timezone: locations[0].timezone, start, end, days: daysInclusive(start, end) },
    units: Object.fromEntries(keys.map((k) => [k, k === "rainfall_total_mm" ? "mm" : "°C"])),
    sources: [{ ...COMPARISON_SOURCE, classification: "reanalysis", retrieved_at: [...sources.keys()].sort().at(-1) ?? new Date().toISOString() }],
    completeness: { expected, available, missing: expected - available, percent: available === expected ? 100 : Math.min(99.99, round(available / expected * 100, 2)!), note: "Counts are location × period × metric × day measurements, including all baseline years." },
    warnings,
    data: { group: args.group ?? null, report_date: custom ? null : reportDate, model: "era5", soil_depth_cm: [0, 7], baseline_years: windows.slice(1).map((w) => w.year),
      definitions: { rainfall: "Sum of rain_sum (liquid rainfall), excluding snowfall; partial totals are never extrapolated.", air_temperature: "At 2 m: period maximum of daily maxima, period minimum of daily minima, mean of daily means.", soil_temperature: "Mean of daily mean temperatures in the 0–7 cm layer; not a point-depth measurement.", regional: "Rainfall and mean air/soil temperatures: equal-weight mean across all requested locations. Maximum/minimum: extremes across those locations. Values require at least some data at every location; complete requires every day at every location.", baseline: "Arithmetic mean of complete equivalent-calendar period statistics in the previous N years, excluding the report year. Incomplete years are excluded and counted; this is not a standard 30-year climate normal.", anomalies: "Current minus baseline mean, calculated before rounding. Rainfall percentage = 100 × difference / baseline; null for zero baseline. Withheld unless all requested years and the current period are complete." },
      locations: byLocation, regional: { current: roundedMetrics(regionalPeriods[0].metrics), baseline: regionalPeriods.slice(1).map(roundedPeriod), comparison: regionalComparison }, newsletter_rows },
  };
}
