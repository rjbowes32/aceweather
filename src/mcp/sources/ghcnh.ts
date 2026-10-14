import { cached } from "../cache.ts";
import type { Source } from "../envelope.ts";
import { callUpstream } from "../upstream.ts";
import { hourKey, tidyName, type HourlySeries } from "./iem.ts";

const BASE = "https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly";
const LABEL = "NOAA GHCNh hourly station archive";
const HOUR = 3600_000;
const MATCH_WINDOW_MS = 20 * 60_000;
/** Accepted quality codes: blank, or legacy ISD codes for "passed" checks. Anything else is a failed or suspect value. */
const GOOD_QC = new Set(["", "0", "1", "4", "5", "9"]);

export const GHCNH_SOURCE: Omit<Source, "retrieved_at" | "classification"> = {
  name: "NOAA Global Historical Climatology Network hourly (GHCNh)",
  url: "https://www.ncei.noaa.gov/products/global-historical-climatology-network-hourly",
  notes: "Met Office synoptic and climate stations relayed through the WMO network, updated daily and about three days behind real time; 0.1 °C temperatures, wind at 10 m. Used for learning, not for current conditions. Non-US station data is for non-commercial use.",
};

export type GhcnhStation = { id: string; name: string; latitude: number; longitude: number; elevation_m: number | null; icao: string | null };

export function parseStationList(text: string): GhcnhStation[] {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift()!.split(",");
  const col = (n: string) => header.indexOf(n);
  const [iId, iLat, iLon, iElev, iName, iIcao, iIso] = ["GHCN_ID", "LATITUDE", "LONGITUDE", "ELEVATION", "NAME", "ICAO", "ISO_CODE"].map(col);
  return lines.map((l) => l.split(",")).filter((c) => c[iIso] === "GB").map((c) => ({
    id: c[iId], name: tidyName(c[iName].trim()), latitude: Number(c[iLat]), longitude: Number(c[iLon]),
    elevation_m: c[iElev] === "" ? null : Number(c[iElev]), icao: c[iIcao] || null,
  })).filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
}

/** UK stations in the GHCNh inventory (historical ones included; a missing year file means the station is closed). */
export function ghcnhStations(): Promise<GhcnhStation[]> {
  return cached("ghcnh:stations:GB", 24 * HOUR, () => callUpstream(LABEL, async (signal) => {
    const response = await fetch(`${BASE}/doc/ghcnh-station-list.csv`, { signal });
    if (!response.ok) throw new Error(`${LABEL} ${response.status}`);
    return parseStationList(await response.text());
  }));
}

export const ghcnhYearUrl = (id: string, year: number) => `${BASE}/access/by-year/${year}/psv/GHCNh_${id}_${year}.psv`;

/** Hourly temperature (°C) and 10 m wind (km/h), each hour taking the quality-passed report nearest the hour within 20 minutes. */
export function parsePsv(text: string): { temperature_c: HourlySeries; wind_speed_kmh: HourlySeries; reports: number } {
  const lines = text.split(/\r?\n/);
  const header = (lines.shift() ?? "").split("|");
  const col = (n: string) => header.indexOf(n);
  const [iDate, iT, iTq, iW, iWq] = ["DATE", "temperature", "temperature_Quality_Code", "wind_speed", "wind_speed_Quality_Code"].map(col);
  const best = { temperature_c: new Map<string, [number, number]>(), wind_speed_kmh: new Map<string, [number, number]>() };
  let reports = 0;
  for (const line of lines) {
    if (!line) continue;
    const c = line.split("|");
    const t = Date.parse(`${c[iDate]}Z`);
    if (!Number.isFinite(t)) continue;
    reports++;
    const hour = Math.round(t / HOUR) * HOUR;
    const dt = Math.abs(t - hour);
    if (dt > MATCH_WINDOW_MS) continue;
    const key = hourKey(hour);
    const put = (target: Map<string, [number, number]>, raw: string | undefined, qc: string | undefined, factor: number) => {
      if (raw == null || raw === "" || !GOOD_QC.has(qc ?? "")) return;
      const v = Number(raw);
      if (!Number.isFinite(v)) return;
      const seen = target.get(key);
      if (!seen || dt < seen[1]) target.set(key, [v * factor, dt]);
    };
    put(best.temperature_c, c[iT], c[iTq], 1);
    put(best.wind_speed_kmh, c[iW], c[iWq], 3.6);
  }
  const flat = (m: Map<string, [number, number]>) => new Map([...m].map(([k, [v]]) => [k, v]));
  return { temperature_c: flat(best.temperature_c), wind_speed_kmh: flat(best.wind_speed_kmh), reports };
}

/** Station history between two instants, fetching each calendar year's file (5-20 MB each, cached for six hours). */
export async function ghcnhHistory(id: string, startMs: number, endMs: number): Promise<{ temperature_c: HourlySeries; wind_speed_kmh: HourlySeries }> {
  const years: number[] = [];
  for (let y = new Date(startMs).getUTCFullYear(); y <= new Date(endMs).getUTCFullYear(); y++) years.push(y);
  // Year files are large, so this uses its own 30 s timeout rather than the default upstream budget.
  const parts = await Promise.all(years.map((y) => cached(`ghcnh:${id}:${y}`, 6 * HOUR, () => callUpstream(LABEL, async () => {
    const response = await fetch(ghcnhYearUrl(id, y), { signal: AbortSignal.timeout(30_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`${LABEL} ${response.status}`);
    return parsePsv(await response.text());
  }))));
  const inRange = (m: HourlySeries) => [...m].filter(([k]) => { const ms = Date.parse(`${k}:00Z`); return ms >= startMs && ms < endMs; });
  return {
    temperature_c: new Map(parts.flatMap((p) => (p ? inRange(p.temperature_c) : []))),
    wind_speed_kmh: new Map(parts.flatMap((p) => (p ? inRange(p.wind_speed_kmh) : []))),
  };
}
