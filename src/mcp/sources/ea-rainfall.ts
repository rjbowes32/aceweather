import { cached } from "../cache.ts";
import type { Source } from "../envelope.ts";
import { distanceKm } from "../geo.ts";
import type { ResolvedLocation } from "../locations.ts";
import { fetchJson } from "../upstream.ts";
import { num, type RawObservation, type SourceResult } from "./station-types.ts";

const BASE = "https://environment.data.gov.uk/flood-monitoring";
const LABEL = "Environment Agency rainfall";
const TTL = 10 * 60_000;
const STATIONS_TTL = 6 * 3600_000;
const MAX_GAUGES = 3;
const INTERVAL_MS = 15 * 60_000;

export const EA_SOURCE: Omit<Source, "retrieved_at" | "classification"> = {
  name: "Environment Agency real-time rainfall API",
  url: "https://environment.data.gov.uk/flood-monitoring/doc/rainfall",
  notes: "Open Government Licence v3. 15-minute tipping-bucket totals from about 1,000 gauges in England; some gauges report within the hour, others once or twice a day.",
};

export type Gauge = { id: string; latitude: number; longitude: number; grid: string | null; distance_km: number };

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

export function gauges(location: ResolvedLocation, radiusKm: number): Promise<Gauge[]> {
  const url = `${BASE}/id/stations?parameter=rainfall&lat=${location.latitude.toFixed(4)}&long=${location.longitude.toFixed(4)}&dist=${Math.round(radiusKm)}`;
  return cached(`ea:gauges:${location.latitude.toFixed(2)},${location.longitude.toFixed(2)},${radiusKm}`, STATIONS_TTL, async () => {
    const body = await fetchJson(LABEL, url);
    const seen = new Set<string>();
    const out: Gauge[] = [];
    for (const s of body?.items ?? []) {
      const lat = num(s.lat);
      const lon = num(s.long);
      const id = String(s.stationReference ?? s.notation ?? "");
      if (!id || lat == null || lon == null) continue;
      const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id, latitude: lat, longitude: lon, grid: s.gridReference ? String(s.gridReference) : null, distance_km: distanceKm(location.latitude, location.longitude, lat, lon) });
    }
    return out.sort((a, b) => a.distance_km - b.distance_km);
  });
}

async function readings(g: Gauge, now: number): Promise<RawObservation | null> {
  const since = iso(Math.floor((now - 24 * 3600_000) / INTERVAL_MS) * INTERVAL_MS);
  const body = await fetchJson(LABEL, `${BASE}/id/stations/${encodeURIComponent(g.id)}/readings?parameter=rainfall&_sorted&since=${since}`);
  const rows = ((body?.items ?? []) as any[])
    .map((r) => ({ time: String(r.dateTime ?? ""), value: num(r.value), measure: String(r.measure ?? "") }))
    .filter((r) => r.time && r.value != null);
  if (!rows.length) return null;
  const measure = rows[0].measure;
  const series = rows.filter((r) => r.measure === measure).sort((a, b) => (a.time < b.time ? -1 : 1));
  const latest = series[series.length - 1];
  const latestMs = Date.parse(latest.time);
  const sum = (hours: number) => {
    const cutoff = latestMs - hours * 3600_000;
    const slice = series.filter((r) => Date.parse(r.time) > cutoff);
    return { total: Math.round(slice.reduce((a, r) => a + (r.value as number), 0) * 10) / 10, available: slice.length, expected: hours * 4 };
  };
  const day = sum(24);
  const hour = sum(1);
  const complete = day.available >= day.expected * 0.9;
  const notes: string[] = [];
  if (!complete) notes.push(`24 h rainfall incomplete (${day.available}/${day.expected} fifteen-minute readings)`);
  else if (day.available < day.expected) notes.push(`24 h rainfall total from ${day.available}/${day.expected} fifteen-minute readings`);
  return {
    id: g.id, name: `Rain gauge ${g.id}${g.grid ? ` (${g.grid})` : ""}`, network: "ea_rain_gauge", network_label: "Environment Agency rain gauge", tier: "official_gauge",
    latitude: g.latitude, longitude: g.longitude, elevation_m: null, observed_at: latest.time,
    values: {
      precipitation_1h_mm: hour.available === hour.expected ? hour.total : null,
      precipitation_24h_mm: complete ? day.total : null,
    },
    notes,
  };
}

/** The nearest Environment Agency rain gauges with their 1 h and 24 h totals ending at each gauge's latest reading. */
export function fetchEaRainfall(location: ResolvedLocation, radiusKm: number, now = Date.now()): Promise<SourceResult> {
  return cached(`ea:${location.latitude.toFixed(2)},${location.longitude.toFixed(2)},${radiusKm}`, TTL, async () => {
    const nearest = (await gauges(location, radiusKm)).slice(0, MAX_GAUGES);
    const results = await Promise.all(nearest.map((g) => readings(g, now).catch(() => null)));
    return {
      stations: results.filter((s): s is RawObservation => s != null),
      source: { ...EA_SOURCE, classification: "observation", retrieved_at: new Date(now).toISOString() },
    };
  });
}

/** All 15-minute readings for one gauge since an instant (the API keeps about four weeks), oldest first. */
export function gaugeHistory(id: string, sinceMs: number): Promise<Array<{ time: string; value: number }>> {
  const since = iso(Math.floor(sinceMs / INTERVAL_MS) * INTERVAL_MS);
  return cached(`ea:history:${id}:${since}`, 3600_000, async () => {
    return historyRows(await fetchJson(LABEL, gaugeHistoryUrl(id, since)));
  });
}

export const gaugeHistoryUrl = (id: string, since: string) => `${BASE}/id/stations/${encodeURIComponent(id)}/readings?parameter=rainfall&_sorted&_limit=10000&since=${since}`;

/** Readings of the station's first rainfall measure, oldest first. */
export function historyRows(body: any): Array<{ time: string; value: number }> {
  const rows = ((body?.items ?? []) as any[])
    .map((r) => ({ time: String(r.dateTime ?? ""), value: num(r.value), measure: String(r.measure ?? "") }))
    .filter((r): r is { time: string; value: number; measure: string } => Boolean(r.time) && r.value != null);
  const measure = rows[0]?.measure;
  return rows.filter((r) => r.measure === measure).map(({ time, value }) => ({ time, value })).sort((a, b) => (a.time < b.time ? -1 : 1));
}
