import { z } from "zod";
import { cached } from "./cache.ts";
import { num, type Source } from "./envelope.ts";
import { ToolError } from "./errors.ts";
import { distanceKm } from "./geo.ts";
import type { ResolvedLocation } from "./locations.ts";
import { inUk } from "./observations.ts";
import { COSMOS_SOURCE, cosmosHistory, sites as cosmosSites } from "./sources/cosmos.ts";
import { EA_SOURCE, gaugeHistory, gauges } from "./sources/ea-rainfall.ts";
import { hourKey, IEM_SOURCE, iemHistory, iemStations, type HourlySeries } from "./sources/iem.ts";
import { GHCNH_SOURCE, ghcnhHistory, ghcnhStations } from "./sources/ghcnh.ts";
import { fetchPreviousRuns, PREVIOUS_RUNS_SOURCE, VERIFY_MODELS, type PreviousRuns } from "./sources/previous-runs.ts";
import { convertWind, round, type WindUnit } from "./units.ts";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
export const AIR_RADIUS_KM = 60;
export const RAIN_RADIUS_KM = 40;
export const MIN_HOURS = 48;
export const MIN_DAYS = 5;
export const WET_DAY_MM = 1;
const EA_READINGS_PER_DAY = 96;
const COSMOS_READINGS_PER_DAY = 48;
const COMPLETE_DAY_FRACTION = 0.95;

export const VERIFICATION_METHOD = [
  "Each model's archived forecast (Open-Meteo Previous Runs: the run issued N days before the verified hour) is taken at the reference station's own coordinates and elevation and compared with what the station measured.",
  "Temperature and wind speed: every hour with a METAR within 20 minutes of the hour; mean absolute error (MAE) and bias (forecast minus observed).",
  `Rainfall: complete UTC days only (at least ${Math.round(COMPLETE_DAY_FRACTION * 100)}% of gauge intervals); MAE and bias of daily totals, and how often the model got wet (>= ${WET_DAY_MM} mm) versus dry right.`,
  "All models are scored on exactly the same hours and days. The best model is the lowest MAE; a difference under 0.1 °C, 0.5 km/h or 0.1 mm is reported as a tie.",
  `Scores need at least ${MIN_HOURS} hours or ${MIN_DAYS} days; a few weeks at one station is a snapshot, not a climatology.`,
].join(" ");

const continuousSchema = z.object({ n: z.number(), mae: num, bias: num }).nullable();
const rainSchema = z.object({
  n_days: z.number(), mae_mm: num, bias_mm: num, forecast_total_mm: num, observed_total_mm: num,
  wet_day_accuracy_pct: num, hits: z.number(), misses: z.number(), false_alarms: z.number(), correct_dry: z.number(),
}).nullable();

export const scoreSchema = z.object({
  model: z.string(), model_name: z.string(), lead_day: z.number(),
  temperature: continuousSchema, wind_speed: continuousSchema, rainfall: rainSchema,
});

const bestSchema = z.object({ model: z.string().nullable(), tie_with: z.array(z.string()), mae: num, aceweather_mae: num }).nullable();

export const referenceSchema = z.object({
  id: z.string(), name: z.string(), network: z.string(), latitude: z.number(), longitude: z.number(),
  elevation_m: num, distance_km: z.number(), measures: z.array(z.string()),
});

export const verificationDataSchema = z.object({
  window: z.object({ start: z.string(), end: z.string(), days: z.number() }),
  lead_days: z.array(z.number()),
  reference: z.object({ air: referenceSchema.nullable(), rain: referenceSchema.nullable() }),
  aceweather_equivalent: z.string().nullable(),
  scores: z.array(scoreSchema),
  best: z.array(z.object({ lead_day: z.number(), temperature: bestSchema, wind_speed: bestSchema, rainfall: bestSchema })),
  method: z.string(),
});

export type VerificationData = z.infer<typeof verificationDataSchema>;
type Reference = z.infer<typeof referenceSchema>;
type Score = z.infer<typeof scoreSchema>;

export type VerificationResult = { data: VerificationData; sources: Source[]; warnings: string[] };

export type AirObs = { reference: Reference; temperature: HourlySeries; wind: HourlySeries | null; source: Omit<Source, "retrieved_at" | "classification">; warnings: string[] };
type RainObs = { reference: Reference; days: Map<string, number>; source: Omit<Source, "retrieved_at" | "classification">; warnings: string[] };

const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/** Rainfall totals for complete UTC days. A reading stamped at time t covers the interval ending at t, so day D is (D 00:00, D+1 00:00]. */
export function dailyTotals(readings: Array<{ time: string; value: number | null }>, perDay: number): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const r of readings) {
    if (r.value == null) continue;
    const t = Date.parse(r.time);
    if (!Number.isFinite(t)) continue;
    const day = dayOf(t - 1);
    const s = sums.get(day) ?? { total: 0, count: 0 };
    s.total += r.value;
    s.count++;
    sums.set(day, s);
  }
  const out = new Map<string, number>();
  for (const [day, s] of sums) if (s.count >= perDay * COMPLETE_DAY_FRACTION) out.set(day, Math.round(s.total * 10) / 10);
  return out;
}

/** Forecast daily totals over the same (D 00:00, D+1 00:00] window from hourly precipitation (each value covers the preceding hour). */
function forecastDaily(time: string[], values: Array<number | null>): Map<string, number | null> {
  const out = new Map<string, { total: number; count: number }>();
  time.forEach((t, i) => {
    const ms = Date.parse(`${t}:00Z`);
    const day = dayOf(ms - 1);
    const s = out.get(day) ?? { total: 0, count: 0 };
    const v = values[i];
    if (typeof v === "number" && Number.isFinite(v)) {
      s.total += v;
      s.count++;
    }
    out.set(day, s);
  });
  return new Map([...out].map(([day, s]) => [day, s.count === 24 ? s.total : null]));
}

export type AirSearch = {
  radiusKm: number;
  maxHeightDiffM: number | null;
  /** Station networks to try besides COSMOS-UK. GHCNh lags about three days, so it suits learning, not recent verification. */
  networks?: Array<"metar" | "ghcnh">;
  minHours?: number;
};

const heightOk = (location: ResolvedLocation, elevation: number | null, max: number | null) =>
  max == null || elevation == null || location.elevation_m == null || Math.abs(elevation - location.elevation_m) <= max;

type Candidate = { id: string; name: string; network: "metar" | "ghcnh"; latitude: number; longitude: number; elevation_m: number | null; distance_km: number };

/** Distance plus 10 km per 100 m of height difference when ranking by height; plain distance otherwise. */
const rank = (location: ResolvedLocation, search: AirSearch) => (c: Candidate) =>
  c.distance_km + (search.maxHeightDiffM != null && c.elevation_m != null && location.elevation_m != null ? Math.abs(c.elevation_m - location.elevation_m) / 10 : 0);

export async function airObservations(location: ResolvedLocation, startMs: number, endMs: number, search: AirSearch = { radiusKm: AIR_RADIUS_KM, maxHeightDiffM: null }): Promise<AirObs | null> {
  const networks = search.networks ?? ["metar"];
  const minHours = search.minHours ?? MIN_HOURS;
  const near = (s: { latitude: number; longitude: number }) => distanceKm(location.latitude, location.longitude, s.latitude, s.longitude);
  const metars: Candidate[] = networks.includes("metar")
    ? (await iemStations().catch(() => [])).map((s) => ({ ...s, network: "metar" as const, distance_km: near(s) })) : [];
  // WMO (UKM…) and ICAO-indexed (UKI…) ids carry hourly reports; the other GHCNh UK ids are climate sites without hourly files.
  const ghcnh: Candidate[] = networks.includes("ghcnh")
    ? (await ghcnhStations().catch(() => [])).filter((s) => /^UK[MI]/.test(s.id)).map((s) => ({ id: s.id, name: s.name, network: "ghcnh" as const, latitude: s.latitude, longitude: s.longitude, elevation_m: s.elevation_m, distance_km: near(s) })) : [];
  // The same site can be both an airport METAR and a GHCNh synoptic station; keep the GHCNh one (0.1 °C rather than whole degrees).
  const unique = [...ghcnh, ...metars.filter((m) => !ghcnh.some((g) => distanceKm(g.latitude, g.longitude, m.latitude, m.longitude) < 2))];
  const ranked = unique
    .filter((s) => s.distance_km <= search.radiusKm && heightOk(location, s.elevation_m, search.maxHeightDiffM))
    .sort((a, b) => rank(location, search)(a) - rank(location, search)(b));
  // Some listed stations are closed or sparse; a 404 or a small file is quick, so try several before giving up.
  for (const s of ranked.slice(0, 8)) {
    const history = s.network === "metar"
      ? await iemHistory(s.id, dayOf(startMs), dayOf(endMs + DAY)).catch(() => null)
      : await ghcnhHistory(s.id, startMs, endMs).catch(() => null);
    if (!history || history.temperature_c.size < minHours) continue;
    return {
      reference: { id: s.id, name: s.name, network: s.network, latitude: s.latitude, longitude: s.longitude, elevation_m: s.elevation_m, distance_km: round(s.distance_km) ?? 0, measures: ["temperature", "wind_speed"] },
      temperature: history.temperature_c, wind: history.wind_speed_kmh.size >= minHours ? history.wind_speed_kmh : null,
      source: s.network === "metar" ? IEM_SOURCE : GHCNH_SOURCE, warnings: [],
    };
  }
  const site = await nearestCosmos(location, search.radiusKm);
  if (!site || !heightOk(location, site.elevation_m, search.maxHeightDiffM)) return null;
  const history = await cosmosHistory(site.id, startMs, endMs).catch(() => null);
  if (!history) return null;
  const temperature: HourlySeries = new Map();
  history.times.forEach((t, i) => {
    const ms = Date.parse(t);
    const v = history.ta[i];
    if (ms % HOUR === 0 && typeof v === "number") temperature.set(hourKey(ms), v);
  });
  if (temperature.size < MIN_HOURS) return null;
  return {
    reference: { ...site, network: "cosmos_uk", measures: ["temperature"] },
    temperature, wind: null, source: COSMOS_SOURCE,
    warnings: [`No METAR station within ${search.radiusKm} km; temperature uses a COSMOS-UK research site. Its anemometer is below the standard 10 m, so wind speed is not used.`],
  };
}

async function nearestCosmos(location: ResolvedLocation, radiusKm: number): Promise<Omit<Reference, "network" | "measures"> | null> {
  const all = await cosmosSites().catch(() => new Map());
  let best: Omit<Reference, "network" | "measures"> | null = null;
  for (const [id, s] of all) {
    if (s.latitude == null || s.longitude == null) continue;
    const d = distanceKm(location.latitude, location.longitude, s.latitude, s.longitude);
    if (d <= radiusKm && (!best || d < best.distance_km)) best = { id, name: s.label, latitude: s.latitude, longitude: s.longitude, elevation_m: s.altitude, distance_km: round(d) ?? 0 };
  }
  return best;
}

async function rainObservations(location: ResolvedLocation, startMs: number, endMs: number): Promise<RainObs | null> {
  const nearest = (await gauges(location, RAIN_RADIUS_KM).catch(() => [])).filter((g) => g.distance_km <= RAIN_RADIUS_KM).slice(0, 3);
  for (const g of nearest) {
    const readings = await gaugeHistory(g.id, startMs).catch(() => null);
    if (!readings) continue;
    const days = dailyTotals(readings.filter((r) => Date.parse(r.time) <= endMs), EA_READINGS_PER_DAY);
    if (days.size < MIN_DAYS) continue;
    return {
      reference: { id: g.id, name: `Rain gauge ${g.id}${g.grid ? ` (${g.grid})` : ""}`, network: "ea_rain_gauge", latitude: g.latitude, longitude: g.longitude, elevation_m: null, distance_km: round(g.distance_km) ?? 0, measures: ["rainfall"] },
      days, source: EA_SOURCE, warnings: [],
    };
  }
  const site = await nearestCosmos(location, AIR_RADIUS_KM);
  if (!site) return null;
  const history = await cosmosHistory(site.id, startMs, endMs).catch(() => null);
  if (!history) return null;
  const days = dailyTotals(history.times.map((time, i) => ({ time, value: history.precip[i] })), COSMOS_READINGS_PER_DAY);
  if (days.size < MIN_DAYS) return null;
  return {
    reference: { ...site, network: "cosmos_uk", measures: ["rainfall"] },
    days, source: COSMOS_SOURCE, warnings: [`No usable Environment Agency gauge within ${RAIN_RADIUS_KM} km; rainfall is verified against a COSMOS-UK research site.`],
  };
}

function scoreContinuous(runs: PreviousRuns, obs: HourlySeries, variable: "temperature_2m" | "wind_speed_10m", lead: number) {
  // Same hours for every model: the hour must be observed and forecast by all of them.
  const hours: number[] = [];
  runs.time.forEach((t, i) => {
    if (!obs.has(t)) return;
    if (VERIFY_MODELS.every((m) => typeof runs.series(variable, lead, m.id)[i] === "number")) hours.push(i);
  });
  type Continuous = { n: number; mae: number | null; bias: number | null } | null;
  return new Map<string, Continuous>(VERIFY_MODELS.map((m): [string, Continuous] => {
    if (hours.length < MIN_HOURS) return [m.id, hours.length ? { n: hours.length, mae: null, bias: null } : null];
    const errors = hours.map((i) => (runs.series(variable, lead, m.id)[i] as number) - (obs.get(runs.time[i]) as number));
    return [m.id, { n: hours.length, mae: mean(errors.map(Math.abs)), bias: mean(errors) }];
  }));
}

function scoreRain(runs: PreviousRuns, obs: Map<string, number>, lead: number) {
  const daily = new Map(VERIFY_MODELS.map((m) => [m.id, forecastDaily(runs.time, runs.series("precipitation", lead, m.id))]));
  const days = [...obs.keys()].filter((d) => VERIFY_MODELS.every((m) => typeof daily.get(m.id)?.get(d) === "number")).sort();
  return new Map(VERIFY_MODELS.map((m) => {
    if (!days.length) return [m.id, null] as const;
    let hits = 0; let misses = 0; let falseAlarms = 0; let correctDry = 0;
    const errors: number[] = [];
    let forecastTotal = 0; let observedTotal = 0;
    for (const d of days) {
      const f = daily.get(m.id)!.get(d) as number;
      const o = obs.get(d) as number;
      errors.push(f - o);
      forecastTotal += f;
      observedTotal += o;
      const fw = f >= WET_DAY_MM; const ow = o >= WET_DAY_MM;
      if (fw && ow) hits++; else if (!fw && ow) misses++; else if (fw && !ow) falseAlarms++; else correctDry++;
    }
    const enough = days.length >= MIN_DAYS;
    return [m.id, {
      n_days: days.length,
      mae_mm: enough ? round(mean(errors.map(Math.abs))) : null, bias_mm: enough ? round(mean(errors)) : null,
      forecast_total_mm: round(forecastTotal), observed_total_mm: round(observedTotal),
      wet_day_accuracy_pct: enough ? Math.round(((hits + correctDry) / days.length) * 100) : null,
      hits, misses, false_alarms: falseAlarms, correct_dry: correctDry,
    }] as const;
  }));
}

/** The named model whose archived forecasts are identical to best_match at every scored hour, if any (in the UK Open-Meteo serves the Met Office UM). */
function equivalentModel(runs: PreviousRuns | null, variable: "temperature_2m" | "precipitation", leads: number[]): string | null {
  if (!runs) return null;
  for (const m of VERIFY_MODELS) {
    if (m.id === "best_match") continue;
    let compared = 0;
    const same = leads.every((lead) => {
      const a = runs.series(variable, lead, "best_match");
      const b = runs.series(variable, lead, m.id);
      return a.every((v, i) => {
        if (typeof v !== "number" || typeof b[i] !== "number") return v == null && b[i] == null;
        compared++;
        return Math.abs(v - (b[i] as number)) < 1e-6;
      });
    });
    if (same && compared > 0) return m.id;
  }
  return null;
}

function pickBest(scores: Score[], lead: number, value: (s: Score) => number | null | undefined, tie: number, equivalent: string | null) {
  // When best_match is just another model, rank the named model once rather than twice.
  const ranked = scores.filter((s) => s.lead_day === lead && value(s) != null && !(equivalent && s.model === "best_match"))
    .sort((a, b) => (value(a) as number) - (value(b) as number));
  if (!ranked.length) return null;
  const top = value(ranked[0]) as number;
  const tied = ranked.slice(1).filter((s) => (value(s) as number) - top < tie).map((s) => s.model);
  const aceweather = scores.find((s) => s.lead_day === lead && s.model === "best_match");
  return { model: ranked[0].model, tie_with: tied, mae: value(ranked[0]) ?? null, aceweather_mae: aceweather ? value(aceweather) ?? null : null };
}

export type VerifyOptions = { days: number; leads: number[]; wind: WindUnit; now?: number };

/** Scores every model against the nearest reference stations over the last `days` complete-ish days. */
export function verifyModels(location: ResolvedLocation, options: VerifyOptions): Promise<VerificationResult> {
  if (!inUk(location, 0)) throw new ToolError("invalid_input", "Forecast verification currently covers the UK only (it needs UK METAR history and rain gauges).");
  const now = options.now ?? Date.now();
  const endMs = Math.floor(now / HOUR) * HOUR - HOUR;
  const startMs = Math.floor((now - options.days * DAY) / DAY) * DAY;
  const leads = [...new Set(options.leads)].sort((a, b) => a - b);
  const key = `verify:${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}:${options.days}:${leads.join(",")}:${options.wind}:${dayOf(endMs)}T${new Date(endMs).getUTCHours()}`;
  return cached(key, HOUR, async () => {
    const [air, rain] = await Promise.all([airObservations(location, startMs, endMs), rainObservations(location, startMs, endMs)]);
    if (!air && !rain) throw new ToolError("not_found", `No reference station with enough history within ${AIR_RADIUS_KM} km (METAR or COSMOS-UK) or ${RAIN_RADIUS_KM} km (Environment Agency gauge).`);
    const pastDays = Math.ceil((now - startMs) / DAY) + 1;
    const [airRuns, rainRuns] = await Promise.all([
      air ? fetchPreviousRuns(air.reference, pastDays, leads, air.wind ? ["temperature_2m", "wind_speed_10m"] : ["temperature_2m"]) : null,
      rain ? fetchPreviousRuns(rain.reference, pastDays, leads, ["precipitation"]) : null,
    ]);
    const scores: Score[] = [];
    for (const lead of leads) {
      const temperature = air && airRuns ? scoreContinuous(airRuns, air.temperature, "temperature_2m", lead) : null;
      const wind = air?.wind && airRuns ? scoreContinuous(airRuns, air.wind, "wind_speed_10m", lead) : null;
      const rainfall = rain && rainRuns ? scoreRain(rainRuns, rain.days, lead) : null;
      for (const m of VERIFY_MODELS) {
        const t = temperature?.get(m.id) ?? null;
        const w = wind?.get(m.id) ?? null;
        scores.push({
          model: m.id, model_name: m.name, lead_day: lead,
          temperature: t ? { n: t.n, mae: round(t.mae, 2), bias: round(t.bias, 2) } : null,
          wind_speed: w ? { n: w.n, mae: convertWind(w.mae, options.wind), bias: convertWind(w.bias, options.wind) } : null,
          rainfall: rainfall?.get(m.id) ?? null,
        });
      }
    }
    const equivalent = equivalentModel(airRuns, "temperature_2m", leads) ?? (airRuns ? null : equivalentModel(rainRuns, "precipitation", leads));
    const windTie = convertWind(0.5, options.wind) ?? 0.5;
    const best = leads.map((lead) => ({
      lead_day: lead,
      temperature: pickBest(scores, lead, (s) => s.temperature?.mae, 0.1, equivalent),
      wind_speed: pickBest(scores, lead, (s) => s.wind_speed?.mae, windTie, equivalent),
      rainfall: pickBest(scores, lead, (s) => s.rainfall?.mae_mm, 0.1, equivalent),
    }));
    const retrieved_at = new Date(now).toISOString();
    const sources: Source[] = [
      { ...PREVIOUS_RUNS_SOURCE, classification: "forecast", retrieved_at },
      ...(air ? [{ ...air.source, classification: "observation" as const, retrieved_at }] : []),
      ...(rain && rain.source !== air?.source ? [{ ...rain.source, classification: "observation" as const, retrieved_at }] : []),
    ];
    const warnings = [
      ...(air?.warnings ?? []), ...(rain?.warnings ?? []),
      ...(!air ? [`No METAR or COSMOS-UK station within ${AIR_RADIUS_KM} km; temperature and wind are not scored.`] : []),
      ...(!rain ? ["No rain gauge with enough complete days nearby; rainfall is not scored."] : []),
      ...(air?.reference.network === "metar" ? ["METAR temperatures are whole degrees, which adds roughly 0.25 °C to every model's MAE equally; rankings are unaffected."] : []),
      ...(equivalent ? [`AceWeather's forecast (Open-Meteo best_match) is identical to ${VERIFY_MODELS.find((m) => m.id === equivalent)?.name} here, so it is ranked once under that model.`] : []),
      "Scores describe the reference stations, which can be tens of kilometres from the location, over a short window.",
    ];
    return {
      data: {
        window: { start: new Date(startMs).toISOString().replace(".000", ""), end: new Date(endMs).toISOString().replace(".000", ""), days: options.days },
        lead_days: leads,
        aceweather_equivalent: equivalent,
        reference: { air: air?.reference ?? null, rain: rain?.reference ?? null },
        scores, best, method: VERIFICATION_METHOD,
      },
      sources, warnings,
    };
  });
}
