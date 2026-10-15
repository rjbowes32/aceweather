import { readFile } from "node:fs/promises";
import { z } from "zod";
import { cached } from "./cache.ts";
import { num, type Source } from "./envelope.ts";
import type { ResolvedLocation } from "./locations.ts";
import { inUk } from "./observations.ts";
import { addError, apply, fit, interpolateFits, type DayErrors, type Fit } from "./learning.ts";
import { asFit, chooseRainReference, chooseReference, type FitsFile } from "./learning-store.ts";
import calibration from "./rain-calibration.json" with { type: "json" };
import { learnedRain, RAIN_POOL_KM, rainLeadsEnabled, type RainFit } from "./rain-learning.ts";
import { features, predict } from "./rain-probability.ts";
import { fetchPreviousRuns, PREVIOUS_RUNS_SOURCE } from "./sources/previous-runs.ts";
import { FORECAST_SOURCE, withTimezone } from "./sources/forecast.ts";
import { MODEL_INFO } from "./sources/models.ts";
import { fetchJson } from "./upstream.ts";
import { convertWind, round, type WindUnit } from "./units.ts";
import { airObservations, referenceSchema, type AirObs } from "./verification.ts";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
export const LEARN_MODELS = ["ecmwf_ifs025", "gfs_seamless", "icon_seamless", "ukmo_seamless"];
/** ECMWF's AI model joins the blend from lead day 3: in the backtest it added 2-4% at days 3-5 and nothing at day 1. */
export const AI_MODEL = "ecmwf_aifs025_single";
export const AI_FROM_LEAD = 3;
/**
 * Day-7 archives have no Met Office or ICON forecasts (both stop at about seven days), so a day-7 fit covers
 * only three models and switching to it caused a visible jump. Hours beyond six days reuse the day-6 mix.
 */
export const MAX_FIT_LEAD = 6;
export const modelsFor = (lead: number) => (lead >= AI_FROM_LEAD ? [...LEARN_MODELS, AI_MODEL] : LEARN_MODELS);
const ALL_MODELS = [...LEARN_MODELS, AI_MODEL];
export const LEARN_LEADS = [1, 2, 3, 4, 5, 6, 7];
export const WINDOW_DAYS = 60;
export const MIN_TRAIN_DAYS = 20;
/** The blend's recent bias is a property of the station; only apply it to a location that resembles the station. */
const BIAS_MAX_DISTANCE_KM = 40;
const BIAS_MAX_HEIGHT_DIFF_M = 150;
/** Same reference search as the backtest: up to 80 km, never more than 250 m above or below the location. */
const SEARCH = { radiusKm: 80, maxHeightDiffM: 250, networks: ["ghcnh", "metar"] as Array<"metar" | "ghcnh">, minHours: 20 * 24 };
/** A quality-controlled citizen station within 15 km and 100 m is used only where no official station is close enough for bias correction. */
const CITIZEN_SEARCH = { radiusKm: 15, maxHeightDiffM: 100, officialKm: BIAS_MAX_DISTANCE_KM, officialHeightM: BIAS_MAX_HEIGHT_DIFF_M };

export const LEARNED_METHOD = [
  `Temperature and wind: the four models (ECMWF IFS, GFS, ICON, Met Office UM), plus ECMWF's AI model (AIFS) from day ${AI_FROM_LEAD}, weighted by their accuracy at the nearest reference station over the last ${WINDOW_DAYS} days (inverse mean squared error, fitted separately for each lead day 1-7), minus that blend's mean error over the same days.`,
  `Weights and bias are interpolated between neighbouring lead days so the forecast changes smoothly hour by hour; beyond day ${MAX_FIT_LEAD} the day-${MAX_FIT_LEAD} mix is used, because the Met Office and ICON models have no day-7 archive.`,
  `The bias step is applied only when the station is within ${BIAS_MAX_DISTANCE_KM} km and ${BIAS_MAX_HEIGHT_DIFF_M} m of the location; otherwise the weighted blend is used as is.`,
  `Rainfall: the equal-weight mean of the same models (four, plus AIFS from day ${AI_FROM_LEAD}). Where public rain gauges (Environment Agency, SEPA) lie within ${RAIN_POOL_KM} km, that mean is scaled by the ratio of observed to forecast rain at the gauges around them over the last ${WINDOW_DAYS} days, but only for lead days where this scaling has beaten the plain mean at gauges across the country over the last 30 days. The daily chance of rain is the calibrated chance of at least 1 mm (docs/mcp/RAIN-PROBABILITY.md).`,
  "Reference stations are Met Office stations (NOAA GHCNh archive), airport METARs or COSMOS-UK sites within 80 km and 250 m of height, ranked by distance plus 10 km per 100 m of height difference. Where no official station is within 40 km and 150 m, a quality-controlled Netatmo citizen station within 15 km and 100 m is used instead. Where none has 20 days of history, temperature and wind fall back to AceWeather's standard forecast.",
  "In a year-long backtest at 15 northern England locations the four-model version cut mean absolute error by about 17-20% for temperature, 22-26% for wind and 16-18% for daily rainfall; adding AIFS from day 3 improved days 3-5 by a further 2-4% (docs/mcp/LEARNING-BACKTEST.md).",
].join(" ");

const leadSchema = z.object({ lead_day: z.number(), training_days: z.number(), weights: z.record(z.string(), z.number()), bias: num }).nullable();

export const learnedDataSchema = z.object({
  learning_source: z.enum(["daily", "on_demand", "none"]),
  fits_generated_at: z.string().nullable(),
  learned_applied: z.object({ temperature: z.boolean(), wind_speed: z.boolean(), rainfall: z.boolean(), bias_correction: z.boolean() }),
  reference: referenceSchema.nullable(),
  /** The gauge whose pooled rainfall scaling is applied; null when rainfall is the plain model mean. */
  rain_reference: referenceSchema.nullable(),
  training: z.array(z.object({ lead_day: z.number(), temperature: leadSchema, wind_speed: leadSchema, rainfall: z.object({ scale: z.number(), training_days: z.number(), gauges: z.number() }).nullable() })),
  daily: z.array(z.object({
    date: z.string(), hours: z.number(), partial: z.boolean(), rain_chance_pct: num,
    temp_max_c: num, temp_min_c: num, wind_speed_max: num, precipitation_mm: num,
    standard: z.object({ temp_max_c: num, temp_min_c: num, wind_speed_max: num, precipitation_mm: num }),
  })),
  hourly: z.array(z.object({ time: z.string(), lead_day: z.number(), temperature_c: num, wind_speed: num, precipitation_mm: num, standard_temperature_c: num, standard_wind_speed: num, standard_precipitation_mm: num })).optional(),
  method: z.string(),
});

export type LearnedData = z.infer<typeof learnedDataSchema>;

type Fits = Map<number, { temperature: Fit | null; wind: Fit | null }>;


/**
 * Fit for an hour `position` days ahead (fractional), interpolated between the neighbouring lead days so the
 * learned forecast changes smoothly through each 24-hour boundary. Up to one day ahead uses the day-1 fit.
 */
export function fitForPosition(fits: Fits, position: number): { temperature: Fit | null; wind: Fit | null } {
  const p = Math.min(MAX_FIT_LEAD, Math.max(1, position));
  const lo = Math.floor(p);
  const hi = Math.min(MAX_FIT_LEAD, lo + 1);
  const frac = hi === lo ? 0 : p - lo;
  const a = fits.get(lo);
  const b = fits.get(hi);
  return {
    temperature: interpolateFits(a?.temperature ?? null, b?.temperature ?? null, frac),
    wind: interpolateFits(a?.wind ?? null, b?.wind ?? null, frac),
  };
}

const DAILY_FITS_MAX_AGE_MS = 72 * HOUR;

/**
 * The daily learning job's output (scripts/learning/daily.mjs): ACEWEATHER_LEARNED_FITS_URL in production,
 * or ACEWEATHER_LEARNED_FITS_FILE for a local file. Null when unset, unreadable or more than three days old.
 */
export function loadDailyFits(now = Date.now()): Promise<FitsFile | null> {
  const file = process.env.ACEWEATHER_LEARNED_FITS_FILE?.trim();
  const url = process.env.ACEWEATHER_LEARNED_FITS_URL?.trim();
  if (!file && !url) return Promise.resolve(null);
  return cached(`learned:daily-fits:${file ?? url}`, 30 * 60_000, async () => {
    try {
      const text = file ? await readFile(file, "utf8") : await (await fetch(url!, { signal: AbortSignal.timeout(10_000) })).text();
      const fits = JSON.parse(text) as FitsFile;
      return now - Date.parse(fits.generated_at) <= DAILY_FITS_MAX_AGE_MS && Array.isArray(fits.stations) ? fits : null;
    } catch {
      return null;
    }
  });
}

const NETWORK_SOURCE: Record<string, Omit<Source, "retrieved_at" | "classification">> = {
  metoffice: { name: "Met Office stations via MeteoGate E-SOH and NOAA GHCNh", url: "https://api.meteogate.eu/eu-eumetnet-surface-observations" },
  metar: { name: "Airport METARs (Iowa Environmental Mesonet archive)", url: "https://mesonet.agron.iastate.edu/request/download.phtml" },
  cosmos_uk: { name: "COSMOS-UK (UK Centre for Ecology & Hydrology)", url: "https://cosmos-api.ceh.ac.uk" },
  ea_rain: { name: "Environment Agency rain gauges", url: "https://environment.data.gov.uk/flood-monitoring/doc/rainfall" },
  sepa_rain: { name: "SEPA rain gauges", url: "https://timeseries.sepa.org.uk" },
  netatmo: { name: "Netatmo citizen weather stations (quality-controlled, learning only)", url: "https://weathermap.netatmo.com" },
};

/** Per-lead fits from the last WINDOW_DAYS complete UTC days at the reference station. */
async function trainFits(air: AirObs, now: number): Promise<Fits> {
  const today = Math.floor(now / DAY) * DAY;
  const variables = air.wind ? (["temperature_2m", "wind_speed_10m"] as const) : (["temperature_2m"] as const);
  const runs = await fetchPreviousRuns(air.reference, WINDOW_DAYS + 2, LEARN_LEADS, [...variables], ALL_MODELS);
  const fits: Fits = new Map();
  for (const lead of LEARN_LEADS) {
    const fitVariable = (variable: "temperature_2m" | "wind_speed_10m", obs: Map<string, number> | null): Fit | null => {
      if (!obs) return null;
      const byDay = new Map<string, Record<string, DayErrors | undefined>>();
      runs.time.forEach((t, i) => {
        const ms = Date.parse(`${t}:00Z`);
        if (ms >= today || today - ms > WINDOW_DAYS * DAY) return;
        const o = obs.get(t);
        if (o == null) return;
        const day = t.slice(0, 10);
        const errors = byDay.get(day) ?? {};
        for (const m of modelsFor(lead)) {
          const f = runs.series(variable, lead, m)[i];
          if (typeof f === "number") errors[m] = addError(errors[m], f - o);
        }
        byDay.set(day, errors);
      });
      return fit([...byDay.values()], modelsFor(lead), MIN_TRAIN_DAYS);
    };
    fits.set(lead, { temperature: fitVariable("temperature_2m", air.temperature), wind: fitVariable("wind_speed_10m", air.wind) });
  }
  return fits;
}

type Hourly = { time: string[]; get: (variable: string, model: string) => Array<number | null> };

function liveForecast(location: ResolvedLocation, days: number): Promise<Hourly> {
  const params = new URLSearchParams({
    latitude: location.latitude.toFixed(4), longitude: location.longitude.toFixed(4),
    hourly: "temperature_2m,wind_speed_10m,precipitation", models: ["best_match", ...ALL_MODELS].join(","),
    forecast_days: String(days + 1), timezone: "UTC", wind_speed_unit: "kmh",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  return cached(`learned-live:${url}`, 15 * 60_000, async () => {
    const body = await fetchJson("Open-Meteo multi-model forecast", url);
    const h = body?.hourly ?? {};
    return { time: (h.time ?? []) as string[], get: (variable, model) => (h[`${variable}_${model}`] ?? []) as Array<number | null> };
  });
}

export const RAIN_CHANCE_THRESHOLD_MM = 1;
type RainCalibration = { leads: Record<string, { models: string[]; thresholds: Record<string, { weights: number[]; climatology: { uk: number } }> }> };
const RAIN_CAL = calibration as unknown as RainCalibration;

/**
 * Calibrated chance (0-100) of at least 1 mm on each local date, today to seven days ahead, from each model's
 * full-day total (docs/mcp/RAIN-PROBABILITY.md). Today uses the day-1 calibration. A date where any of the
 * lead's models lacks a full day is left out rather than guessed.
 */
export function rainChances(live: { time: string[]; get: (variable: string, model: string) => Array<number | null> }, timezone: string, now: number): Map<string, number> {
  const today = localDate(now, timezone);
  const totals = new Map<string, Map<string, { sum: number; hours: number }>>();
  const models = [...new Set(Object.values(RAIN_CAL.leads).flatMap((l) => l.models))];
  live.time.forEach((t, i) => {
    // Each hourly value is the total for the hour ending at its timestamp, so it belongs to the date an hour earlier.
    const date = localDate(Date.parse(`${t}:00Z`) - HOUR, timezone);
    for (const m of models) {
      const v = live.get("precipitation", m)[i];
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const byModel = totals.get(date) ?? new Map();
      const s = byModel.get(m) ?? { sum: 0, hours: 0 };
      s.sum += v; s.hours++;
      byModel.set(m, s);
      totals.set(date, byModel);
    }
  });
  const out = new Map<string, number>();
  for (const [date, byModel] of totals) {
    const lead = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
    if (lead < 0 || lead > 7) continue;
    const cal = RAIN_CAL.leads[String(Math.max(1, lead))];
    const t = cal?.thresholds[String(RAIN_CHANCE_THRESHOLD_MM)];
    if (!cal || !t) continue;
    const dayTotals = cal.models.map((m) => byModel.get(m));
    if (dayTotals.some((x) => !x || x.hours < 23)) continue;
    out.set(date, Math.round(100 * predict(t.weights, features(dayTotals.map((x) => x!.sum), RAIN_CHANCE_THRESHOLD_MM, t.climatology.uk))));
  }
  return out;
}

const localDate = (ms: number, timezone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export type LearnedResult = { data: LearnedData; sources: Source[]; warnings: string[] };

export function learnedForecast(location: ResolvedLocation, options: { days: number; wind: WindUnit; hourly: boolean; now?: number }): Promise<LearnedResult> {
  const now = options.now ?? Date.now();
  const key = `learned:${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}:${location.timezone}:${options.days}:${options.wind}:${options.hourly}:${Math.floor(now / (15 * 60_000))}`;
  return cached(key, 15 * 60_000, async () => {
    const warnings: string[] = [];
    const today = Math.floor(now / DAY) * DAY;
    let reference: LearnedData["reference"] = null;
    let fits: Fits = new Map();
    let learningSource: LearnedData["learning_source"] = "none";
    let fitsGeneratedAt: string | null = null;
    let rainFits = new Map<number, RainFit>();
    let rainReference: LearnedData["rain_reference"] = null;
    const learningSources: Source[] = [];
    const retrievedAt = new Date(now).toISOString();
    if (inUk(location, 0)) {
      const daily = await loadDailyFits(now);
      const pick = daily ? chooseReference(daily, location, { radiusKm: SEARCH.radiusKm, maxHeightDiffM: SEARCH.maxHeightDiffM, minDays: MIN_TRAIN_DAYS, citizen: CITIZEN_SEARCH }) : null;
      if (daily && pick) {
        const m = pick.station.meta;
        reference = { id: m.id, name: m.name, network: m.network, latitude: m.latitude, longitude: m.longitude, elevation_m: m.elevation_m, distance_km: round(pick.distance_km) ?? 0, measures: pick.station.leads["1"]?.w ? ["temperature", "wind_speed"] : ["temperature"] };
        fits = new Map(LEARN_LEADS.map((l) => {
          const lf = pick.station.leads[String(l)];
          return [l, { temperature: lf?.t ? asFit(lf.t) : null, wind: lf?.w ? asFit(lf.w) : null }];
        }));
        learningSource = "daily";
        fitsGeneratedAt = daily.generated_at;
        learningSources.push(
          { name: "AceWeather daily learning job", classification: "calculated", retrieved_at: retrievedAt, issued_at: daily.generated_at, notes: `Model weights and bias per station from the last ${daily.window_days} days of archived forecasts (Open-Meteo Previous Runs) against station observations, refreshed daily.` },
          { ...(NETWORK_SOURCE[m.network] ?? { name: m.network }), classification: "observation", retrieved_at: retrievedAt },
        );
      } else {
        const air: AirObs | null = await airObservations(location, today - WINDOW_DAYS * DAY, today, SEARCH).catch(() => null);
        if (air) {
          reference = air.reference;
          fits = await cached(`learned-fits:${air.reference.id}:${today}`, 6 * HOUR, () => trainFits(air, now)).catch(() => new Map());
          learningSource = "on_demand";
          warnings.push(...air.warnings);
          learningSources.push({ ...PREVIOUS_RUNS_SOURCE, classification: "forecast", retrieved_at: retrievedAt, notes: "Archived forecasts used to learn each model's recent accuracy at the reference station." }, { ...air.source, classification: "observation", retrieved_at: retrievedAt });
        } else {
          warnings.push("No reference station with enough recent history; temperature and wind use AceWeather's standard forecast.");
        }
      }
      const rainPick = daily ? chooseRainReference(daily, location, RAIN_POOL_KM) : null;
      if (daily && rainPick) {
        const enabled = rainLeadsEnabled(daily.recent_scores.rainfall);
        rainFits = new Map(LEARN_LEADS.filter((l) => enabled.has(l) && rainPick.station.leads[String(l)]?.r).map((l) => [l, rainPick.station.leads[String(l)].r!]));
        const m = rainPick.station.meta;
        if (rainFits.size) {
          rainReference = { id: m.id, name: m.name, network: m.network, latitude: m.latitude, longitude: m.longitude, elevation_m: m.elevation_m, distance_km: round(rainPick.distance_km) ?? 0, measures: ["rainfall"] };
          learningSources.push({ ...(NETWORK_SOURCE[m.network] ?? { name: m.network }), classification: "observation", retrieved_at: retrievedAt, notes: `Rainfall scaling pooled over gauges within ${RAIN_POOL_KM} km of ${m.name}.` });
        }
      }
    } else {
      warnings.push("Learning needs UK station history; outside the UK temperature and wind use AceWeather's standard forecast.");
    }
    const heightDiff = reference && reference.elevation_m != null && location.elevation_m != null ? Math.abs(reference.elevation_m - location.elevation_m) : null;
    const biasOk = Boolean(reference && reference.distance_km <= BIAS_MAX_DISTANCE_KM && (heightDiff == null || heightDiff <= BIAS_MAX_HEIGHT_DIFF_M));
    if (reference && !biasOk) warnings.push(`The reference station is ${reference.distance_km} km away${heightDiff != null ? ` and ${Math.round(heightDiff)} m different in height` : ""}, so model weights are applied but not its bias correction.`);

    const live = await liveForecast(location, options.days);
    const endMs = Math.floor(now / HOUR) * HOUR + options.days * DAY;
    const hourly: NonNullable<LearnedData["hourly"]> = [];
    const usedFit = { temperature: false, wind: false };
    live.time.forEach((t, i) => {
      const ms = Date.parse(`${t}:00Z`);
      if (ms < Math.floor(now / HOUR) * HOUR || ms >= endMs) return;
      const position = (ms - now) / DAY;
      const lead = Math.min(7, Math.max(1, Math.ceil(position)));
      const models = modelsFor(lead);
      const standard = (variable: string) => live.get(variable, "best_match")[i];
      const f = fitForPosition(fits, position);
      const strategy = biasOk ? "weighted_bias" : "weighted";
      const blend = (fitted: Fit, variable: string) => {
        const names = Object.keys(fitted.weights);
        return apply(strategy, fitted, Object.fromEntries(names.map((m) => [m, live.get(variable, m)[i]])), standard(variable), names);
      };
      const temp = f.temperature ? blend(f.temperature, "temperature_2m") : standard("temperature_2m");
      const windRaw = f.wind ? blend(f.wind, "wind_speed_10m") : standard("wind_speed_10m");
      if (f.temperature) usedFit.temperature = true;
      if (f.wind) usedFit.wind = true;
      const rain = learnedRain(rainFits.get(Math.min(MAX_FIT_LEAD, lead)) ?? null, models.map((m) => live.get("precipitation", m)[i])) ?? standard("precipitation");
      hourly.push({
        time: t, lead_day: lead,
        temperature_c: finite(temp) ? round(temp) : null,
        wind_speed: finite(windRaw) ? convertWind(Math.max(0, windRaw), options.wind) : null,
        precipitation_mm: finite(rain) ? Math.round(rain * 100) / 100 : null,
        standard_temperature_c: finite(standard("temperature_2m")) ? round(standard("temperature_2m")) : null,
        standard_wind_speed: finite(standard("wind_speed_10m")) ? convertWind(standard("wind_speed_10m"), options.wind) : null,
        standard_precipitation_mm: finite(standard("precipitation")) ? standard("precipitation") : null,
      });
    });

    const byDate = new Map<string, typeof hourly>();
    for (const row of hourly) {
      const date = localDate(Date.parse(`${row.time}:00Z`), location.timezone);
      byDate.set(date, [...(byDate.get(date) ?? []), row]);
    }
    const agg = (rows: typeof hourly, key: keyof (typeof hourly)[number], how: "max" | "min" | "sum") => {
      const v = rows.map((r) => r[key]).filter(finite);
      if (!v.length) return null;
      return how === "sum" ? round(v.reduce((a, b) => a + b, 0)) : round(how === "max" ? Math.max(...v) : Math.min(...v));
    };
    const chances = rainChances(live, location.timezone, now);
    const daily = [...byDate].map(([date, rows]) => ({
      date, hours: rows.length, partial: rows.length < 23, rain_chance_pct: chances.get(date) ?? null,
      temp_max_c: agg(rows, "temperature_c", "max"), temp_min_c: agg(rows, "temperature_c", "min"),
      wind_speed_max: agg(rows, "wind_speed", "max"), precipitation_mm: agg(rows, "precipitation_mm", "sum"),
      standard: {
        temp_max_c: agg(rows, "standard_temperature_c", "max"), temp_min_c: agg(rows, "standard_temperature_c", "min"),
        wind_speed_max: agg(rows, "standard_wind_speed", "max"), precipitation_mm: agg(rows, "standard_precipitation_mm", "sum"),
      },
    }));
    const lead = (fitted: Fit | null | undefined, leadDay: number) => fitted ? {
      lead_day: leadDay, training_days: fitted.trainingDays,
      weights: Object.fromEntries(Object.entries(fitted.weights).map(([m, w]) => [m, Math.round(w * 1000) / 1000])),
      bias: biasOk ? round(fitted.blendBias, 2) : null,
    } : null;
    const sources: Source[] = [
      { ...FORECAST_SOURCE, model: `multi-model: ${LEARN_MODELS.map((m) => MODEL_INFO[m as keyof typeof MODEL_INFO].name).join(", ")}, plus ECMWF AIFS from day ${AI_FROM_LEAD}; standard forecast is best_match`, classification: "forecast", retrieved_at: retrievedAt },
      ...learningSources,
    ];
    return {
      data: {
        learning_source: learningSource,
        fits_generated_at: fitsGeneratedAt,
        learned_applied: { temperature: usedFit.temperature, wind_speed: usedFit.wind, rainfall: true, bias_correction: biasOk && (usedFit.temperature || usedFit.wind) },
        reference,
        rain_reference: rainReference,
        training: LEARN_LEADS.map((l) => {
          const r = rainFits.get(Math.min(MAX_FIT_LEAD, l));
          return { lead_day: l, temperature: lead(fits.get(l)?.temperature, l), wind_speed: lead(fits.get(l)?.wind, l), rainfall: r ? { scale: r.scale, training_days: r.days, gauges: r.gauges } : null };
        }),
        daily,
        ...(options.hourly ? { hourly } : {}),
        method: LEARNED_METHOD,
      },
      sources,
      warnings,
    };
  });
}

/**
 * UK coordinates need only a time zone and an elevation, so skip the full dashboard forecast that
 * withTimezone() downloads for them (several seconds) and ask the elevation API instead.
 */
export async function prepareLocation(location: ResolvedLocation): Promise<ResolvedLocation> {
  if (location.timezone !== "auto" || !inUk(location, 0)) return withTimezone(location);
  const key = `${location.latitude.toFixed(4)},${location.longitude.toFixed(4)}`;
  const elevation = await cached(`elevation:${key}`, 24 * HOUR, () =>
    fetchJson("Open-Meteo elevation", `https://api.open-meteo.com/v1/elevation?latitude=${location.latitude.toFixed(4)}&longitude=${location.longitude.toFixed(4)}`)
      .then((body) => (typeof body?.elevation?.[0] === "number" ? body.elevation[0] : null))).catch(() => null);
  return { ...location, timezone: "Europe/London", elevation_m: location.elevation_m ?? elevation };
}
