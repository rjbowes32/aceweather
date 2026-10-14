import { cached } from "../cache.ts";
import type { Source } from "../envelope.ts";
import { bboxAround } from "../geo.ts";
import type { ResolvedLocation } from "../locations.ts";
import { fetchJson } from "../upstream.ts";
import { lastIndex, num, tailSum, type NetworkId, type RawObservation, type SourceResult } from "./station-types.ts";

const BASE = "https://api.meteogate.eu/eu-eumetnet-surface-observations/collections/observations";
const LABEL = "MeteoGate E-SOH observations";
const TTL = 10 * 60_000;
const STATION_TTL = 6 * 3600_000;
const CURRENT_WINDOW_H = 3;
const RAIN_WINDOW_H = 25;

export const ESOH_SOURCE: Omit<Source, "retrieved_at" | "classification"> = {
  name: "MeteoGate E-SOH (EUMETNET national met service observations)",
  url: "https://api.meteogate.eu/eu-eumetnet-surface-observations",
  notes: "Licence CC BY 4.0. UK stations are Met Office synoptic and automatic sites relayed via the GTS, typically 30-60 minutes behind real time.",
};

const STANDARD_NAMES = [
  "air_temperature", "dew_point_temperature", "relative_humidity", "air_pressure_at_mean_sea_level",
  "wind_speed", "wind_speed_of_gust", "wind_from_direction", "precipitation_amount",
];

type Coverage = {
  "metocean:wigosId"?: string;
  domain: { axes: { x: { values: number[] }; y: { values: number[] }; t: { values: string[] } } };
  ranges: Record<string, { values: Array<number | null> }>;
};

const isoHoursAgo = (now: number, hours: number) => new Date(Math.floor(now / 3600_000) * 3600_000 - hours * 3600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
const coordKey = (l: ResolvedLocation, radiusKm: number) => `${l.latitude.toFixed(2)},${l.longitude.toFixed(2)},${radiusKm}`;

function radiusUrl(location: ResolvedLocation, radiusKm: number, sinceIso: string, names: string[]): string {
  const params = new URLSearchParams({
    coords: `POINT(${location.longitude} ${location.latitude})`,
    within: String(radiusKm), "within-units": "Kilometers",
    datetime: `${sinceIso}/..`, standard_name: names.join(","),
  });
  return `${BASE}/radius?${params}`;
}

function stationNames(location: ResolvedLocation, radiusKm: number): Promise<Map<string, string>> {
  const b = bboxAround(location.latitude, location.longitude, radiusKm);
  const url = `${BASE}/locations?bbox=${[b.west, b.south, b.east, b.north].map((v) => v.toFixed(3)).join(",")}`;
  return cached(`esoh:names:${coordKey(location, radiusKm)}`, STATION_TTL, async () => {
    const body = await fetchJson(LABEL, url);
    const names = new Map<string, string>();
    for (const f of body?.features ?? []) if (f?.id && f?.properties?.name) names.set(String(f.id), titleCase(String(f.properties.name)));
    return names;
  });
}

/** GTS station names arrive upper-case, underscored and cut at 20 characters ("HULL,_EAST_PARK_AUTO"). */
function titleCase(raw: string): string {
  return raw.replace(/_/g, " ").replace(/,\s*/g, ", ").replace(/\s+Auto.*$/i, "").replace(/\s+[A-Z]{1,3}$/, "").toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\bMrsc\b/, "MRSC").trim();
}

/** Parameter keys look like "air_temperature:1.2:point:PT0S" (standard_name:level:method:period). */
function pick(ranges: Record<string, { values: Array<number | null> }>, standardName: string, prefer: string[] = []): { key: string; values: Array<number | null> } | null {
  const keys = Object.keys(ranges).filter((k) => k.split(":")[0] === standardName);
  if (!keys.length) return null;
  for (const suffix of prefer) {
    const hit = keys.find((k) => k.endsWith(suffix));
    if (hit) return { key: hit, values: ranges[hit].values };
  }
  return { key: keys[0], values: ranges[keys[0]].values };
}

function network(wigosId: string): { network: NetworkId; label: string } {
  if (/^0-20000-0-03\d{3}$/.test(wigosId)) return { network: "metoffice_synop", label: "Met Office synoptic station" };
  if (/^0-20000-0-99\d{3}$/.test(wigosId)) return { network: "metoffice_aws", label: "Met Office automatic station" };
  if (/^0-826-/.test(wigosId)) return { network: "metoffice_synop", label: "Met Office station" };
  return { network: "esoh_station", label: "National met service station" };
}

/** E-SOH returns one coverage per (station, time axis), so a station's parameters can be spread over several coverages. */
function groupById(coverages: Coverage[]): Map<string, Coverage[]> {
  const out = new Map<string, Coverage[]>();
  for (const c of coverages) {
    const id = c["metocean:wigosId"];
    if (!id) continue;
    out.set(id, [...(out.get(id) ?? []), c]);
  }
  return out;
}

/** The coverage holding a given parameter series, searched across a station's coverages. */
function findSeries(coverages: Coverage[], standardName: string, suffix: string): Array<number | null> | null {
  for (const c of coverages) {
    const key = Object.keys(c.ranges ?? {}).find((k) => k.split(":")[0] === standardName && k.endsWith(suffix));
    if (key) return c.ranges[key].values;
  }
  return null;
}

/** Rainfall over the last 24 h from a window of hourly (PT1H) or 10-minute (PT10M) amounts. */
function rain24(coverages: Coverage[]): { value: number | null; note: string | null } {
  const hourly = findSeries(coverages, "precipitation_amount", ":sum:PT1H");
  const tenMin = findSeries(coverages, "precipitation_amount", ":point:PT10M");
  const series = hourly ? { values: hourly, expected: 24 } : tenMin ? { values: tenMin, expected: 144 } : null;
  if (!series) return { value: null, note: null };
  const { sum, available } = tailSum(series.values, series.expected);
  if (available < series.expected * 0.9) return { value: null, note: available ? `24 h rainfall incomplete (${available}/${series.expected} intervals)` : null };
  return { value: Math.round(sum * 10) / 10, note: available < series.expected ? `24 h rainfall total from ${available}/${series.expected} intervals` : null };
}

/** Merges a station's coverages onto the time axis that carries air temperature (or the latest axis otherwise). */
function mergeCoverages(coverages: Coverage[]): Coverage | null {
  const usable = coverages.filter((c) => c.domain?.axes?.t?.values?.length && c.ranges);
  if (!usable.length) return null;
  const withTemp = usable.filter((c) => Object.keys(c.ranges).some((k) => k.startsWith("air_temperature:")));
  const pool = withTemp.length ? withTemp : usable;
  const base = pool.reduce((best, c) => (c.domain.axes.t.values.at(-1)! > best.domain.axes.t.values.at(-1)! ? c : best));
  const times = base.domain.axes.t.values;
  const ranges: Record<string, { values: Array<number | null> }> = { ...base.ranges };
  for (const c of usable) {
    if (c === base) continue;
    const index = new Map(c.domain.axes.t.values.map((time, i) => [time, i]));
    for (const [key, series] of Object.entries(c.ranges)) {
      if (ranges[key]) continue;
      ranges[key] = { values: times.map((time) => (index.has(time) ? series.values[index.get(time)!] ?? null : null)) };
    }
  }
  return { ...base, ranges };
}

function parse(coverages: Coverage[], names: Map<string, string>, rain: Coverage[]): RawObservation | null {
  const coverage = mergeCoverages(coverages);
  if (!coverage) return null;
  const id = coverage["metocean:wigosId"];
  const t = coverage.domain.axes.t.values;
  const x = coverage.domain.axes.x?.values?.[0];
  const y = coverage.domain.axes.y?.values?.[0];
  if (!id || !t.length || x == null || y == null) return null;
  const r = coverage.ranges;
  const temp = pick(r, "air_temperature");
  const anchor = temp ? lastIndex(temp.values) : -1;
  const i = anchor >= 0 ? anchor : Math.max(...Object.values(r).map((s) => lastIndex(s.values)));
  if (i < 0) return null;
  const at = (p: ReturnType<typeof pick>) => (p ? num(p.values[i]) : null);
  const kmh = (ms: number | null) => (ms == null ? null : ms * 3.6);
  const oneHourRain = pick(r, "precipitation_amount", [":sum:PT1H"]);
  const tenMinRain = pick(r, "precipitation_amount", [":point:PT10M"]);
  const rain1h = oneHourRain?.key.endsWith("PT1H") ? at(oneHourRain) : tenMinRain?.key.endsWith("PT10M") ? (() => {
    const { sum, available } = tailSum(tenMinRain.values.slice(0, i + 1), 6);
    return available === 6 ? sum : null;
  })() : null;
  const r24 = rain24(rain);
  const net = network(id);
  return {
    id, name: names.get(id) ?? id, network: net.network, network_label: net.label, tier: "official",
    latitude: y, longitude: x, elevation_m: null, observed_at: t[i],
    values: {
      temperature_c: at(temp),
      dew_point_c: at(pick(r, "dew_point_temperature")),
      relative_humidity_pct: at(pick(r, "relative_humidity")),
      pressure_msl_hpa: at(pick(r, "air_pressure_at_mean_sea_level")),
      wind_speed_kmh: kmh(at(pick(r, "wind_speed", [":point:PT10M"]))),
      wind_gust_kmh: kmh(at(pick(r, "wind_speed_of_gust", [":point:PT1H", ":point:PT10M"]))),
      wind_direction_deg: at(pick(r, "wind_from_direction", [":point:PT10M"])),
      precipitation_1h_mm: rain1h,
      precipitation_24h_mm: r24.value,
    },
    notes: r24.note ? [r24.note] : [],
  };
}

/** Stations within the radius with their latest reading in the last 3 hours, plus 24 h rainfall. */
export function fetchEsoh(location: ResolvedLocation, radiusKm: number, now = Date.now()): Promise<SourceResult> {
  return cached(`esoh:${coordKey(location, radiusKm)}`, TTL, async () => {
    const [current, rain, names] = await Promise.all([
      fetchJson(LABEL, radiusUrl(location, radiusKm, isoHoursAgo(now, CURRENT_WINDOW_H), STANDARD_NAMES)),
      fetchJson(LABEL, radiusUrl(location, radiusKm, isoHoursAgo(now, RAIN_WINDOW_H), ["precipitation_amount"])).catch(() => null),
      stationNames(location, radiusKm).catch(() => new Map<string, string>()),
    ]);
    const rainById = groupById((rain?.coverages ?? []) as Coverage[]);
    const stations = [...groupById((current?.coverages ?? []) as Coverage[])]
      .map(([id, group]) => parse(group, names, rainById.get(id) ?? []))
      .filter((s): s is RawObservation => s != null);
    return { stations, source: { ...ESOH_SOURCE, classification: "observation", retrieved_at: new Date(now).toISOString() } };
  });
}
