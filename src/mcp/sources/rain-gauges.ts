/**
 * Rain gauges for the daily learning job: Environment Agency (England, 15-minute, about four weeks online)
 * and SEPA (Scotland, hourly totals, long history). Parsing and selection only; the job does the fetching.
 */
import { distanceKm } from "../geo.ts";

export type GaugeCandidate = { id: string; name: string; network: "ea_rain" | "sepa_rain"; latitude: number; longitude: number; ref: string };

export const EA_STATIONS_URL = "https://environment.data.gov.uk/flood-monitoring/id/stations?parameter=rainfall&_limit=10000";
const SEPA = "https://timeseries.sepa.org.uk/KiWIS/KiWIS?service=kisters&type=queryServices&datasource=0&format=json";
export const SEPA_LIST_URL = `${SEPA}&request=getTimeseriesList&ts_name=Hour.Total&parametertype_name=Precip&returnfields=ts_id,station_name,station_no,station_latitude,station_longitude`;
export const sepaValuesUrl = (tsId: string, fromIso: string, toIso: string) => `${SEPA}&request=getTimeseriesValues&ts_id=${tsId}&from=${fromIso}&to=${toIso}&returnfields=Timestamp,Value`;

const coord = (v: unknown) => (v === "" || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function parseEaStations(body: any): GaugeCandidate[] {
  const out = new Map<string, GaugeCandidate>();
  for (const s of (body?.items ?? []) as any[]) {
    const ref = String(s.stationReference ?? s.notation ?? "");
    const latitude = coord(s.lat);
    const longitude = coord(s.long);
    if (!ref || latitude == null || longitude == null || /closed|suspended/i.test(JSON.stringify(s.status ?? ""))) continue;
    out.set(ref, { id: `ea:${ref}`, name: `EA rain gauge ${ref}${s.gridReference ? ` (${s.gridReference})` : ""}`, network: "ea_rain", latitude, longitude, ref });
  }
  return [...out.values()];
}

/** KiWIS answers a list as rows with a header row first: ts_id, station_name, station_no, latitude, longitude. */
export function parseSepaList(body: any): GaugeCandidate[] {
  const out = new Map<string, GaugeCandidate>();
  for (const [tsId, name, no, lat, lon] of ((Array.isArray(body) ? body.slice(1) : []) as any[][])) {
    const latitude = coord(lat);
    const longitude = coord(lon);
    if (!tsId || !no || latitude == null || longitude == null || out.has(String(no))) continue;
    out.set(String(no), { id: `sepa:${no}`, name: String(name ?? no), network: "sepa_rain", latitude, longitude, ref: String(tsId) });
  }
  return [...out.values()];
}

export function parseSepaValues(body: any): Array<{ time: string; value: number | null }> {
  return ((body?.[0]?.data ?? []) as any[]).map(([time, value]) => ({ time: String(time), value: typeof value === "number" ? value : null }));
}

/**
 * Gauges to learn from: those already tracked first (so their history is kept), then new ones at least
 * `spacingKm` from every chosen gauge, up to `max`, so the budget spreads across the country.
 */
export function selectGauges(candidates: GaugeCandidate[], tracked: Set<string>, max: number, spacingKm: number): GaugeCandidate[] {
  const chosen = candidates.filter((c) => tracked.has(c.id)).slice(0, max);
  // A fixed pseudo-random order, so England's many gauges do not crowd out Scotland's.
  for (const c of [...candidates].sort((a, b) => hash(a.id) - hash(b.id))) {
    if (chosen.length >= max) break;
    if (tracked.has(c.id) || chosen.some((g) => distanceKm(g.latitude, g.longitude, c.latitude, c.longitude) < spacingKm)) continue;
    chosen.push(c);
  }
  return chosen;
}

/** FNV-1a: a stable 32-bit hash of a string. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
