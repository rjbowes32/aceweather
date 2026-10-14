import { cached } from "../cache.ts";
import type { Source } from "../envelope.ts";
import { fetchJson, callUpstream } from "../upstream.ts";
import { num } from "./station-types.ts";

const LABEL = "Iowa Environmental Mesonet ASOS archive";
const LIST_URL = "https://mesonet.agron.iastate.edu/geojson/network/GB__ASOS.geojson";
const CSV_URL = "https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py";
const HOUR = 3600_000;
const MATCH_WINDOW_MS = 20 * 60_000;

export const IEM_SOURCE: Omit<Source, "retrieved_at" | "classification"> = {
  name: "Iowa Environmental Mesonet ASOS/METAR archive (Iowa State University)",
  url: "https://mesonet.agron.iastate.edu/request/download.phtml",
  notes: "Historical METAR reports for UK airports, freely available with attribution. Temperatures are whole degrees and wind is a 10-minute mean in knots at 10 m.",
};

export type IemStation = { id: string; name: string; latitude: number; longitude: number; elevation_m: number | null };

/** "LECONFIELD (AUT)" -> "Leconfield"; mixed-case names are kept. */
export function tidyName(raw: string): string {
  const base = raw.replace(/\s*\([^)]*\)\s*$/, "").trim();
  return base === base.toUpperCase() ? base.toLowerCase().replace(/(^|[\s/-])[a-z]/g, (c) => c.toUpperCase()) : base;
}

/** Active UK METAR stations (archive still open). */
export function iemStations(): Promise<IemStation[]> {
  return cached("iem:stations:GB", 24 * HOUR, async () => {
    const body = await fetchJson(LABEL, LIST_URL);
    return ((body?.features ?? []) as any[])
      .filter((f) => f?.id && f?.properties?.archive_end == null && f?.properties?.online !== false)
      .map((f) => ({
        id: String(f.id), name: tidyName(String(f.properties.sname ?? f.id)),
        longitude: Number(f.geometry?.coordinates?.[0]), latitude: Number(f.geometry?.coordinates?.[1]),
        elevation_m: num(f.properties.elevation),
      }))
      .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  });
}

/** Hour key "YYYY-MM-DDTHH:00" in UTC, the format Open-Meteo returns with timezone=UTC. */
export const hourKey = (ms: number) => new Date(ms).toISOString().slice(0, 13) + ":00";

export type HourlySeries = Map<string, number>;

/**
 * Hourly temperature (°C) and wind speed (km/h) for one station, each hour taking the report closest to
 * the top of the hour within 20 minutes (UK METARs are usually at :20 and :50).
 */
export function iemHistory(id: string, startDay: string, endDayExclusive: string): Promise<{ temperature_c: HourlySeries; wind_speed_kmh: HourlySeries; reports: number }> {
  const [y1, m1, d1] = startDay.split("-").map(Number);
  const [y2, m2, d2] = endDayExclusive.split("-").map(Number);
  const params = new URLSearchParams({
    station: id, year1: String(y1), month1: String(m1), day1: String(d1), year2: String(y2), month2: String(m2), day2: String(d2),
    tz: "Etc/UTC", format: "onlycomma", latlon: "no", elev: "no", missing: "null", trace: "null", direct: "no",
  });
  params.append("data", "tmpc");
  params.append("data", "sknt");
  params.append("report_type", "3");
  params.append("report_type", "4");
  return cached(`iem:history:${id}:${startDay}:${endDayExclusive}`, HOUR, () => callUpstream(LABEL, async (signal) => {
    const response = await fetch(`${CSV_URL}?${params}`, { signal });
    if (!response.ok) throw new Error(`${LABEL} ${response.status}`);
    return parseCsv(await response.text());
  }));
}

export function parseCsv(text: string): { temperature_c: HourlySeries; wind_speed_kmh: HourlySeries; reports: number } {
  const lines = text.trim().split(/\r?\n/);
  const header = (lines.shift() ?? "").split(",");
  const col = (name: string) => header.indexOf(name);
  const [iValid, iTemp, iWind] = [col("valid"), col("tmpc"), col("sknt")];
  const best = { temperature_c: new Map<string, [number, number]>(), wind_speed_kmh: new Map<string, [number, number]>() };
  let reports = 0;
  for (const line of lines) {
    const cells = line.split(",");
    const t = Date.parse(`${cells[iValid]?.replace(" ", "T")}:00Z`);
    if (!Number.isFinite(t)) continue;
    reports++;
    const hour = Math.round(t / HOUR) * HOUR;
    const dt = Math.abs(t - hour);
    if (dt > MATCH_WINDOW_MS) continue;
    const key = hourKey(hour);
    const put = (target: Map<string, [number, number]>, raw: string | undefined, factor: number) => {
      const v = Number(raw);
      if (raw == null || raw === "null" || raw === "" || !Number.isFinite(v)) return;
      const seen = target.get(key);
      if (!seen || dt < seen[1]) target.set(key, [v * factor, dt]);
    };
    put(best.temperature_c, cells[iTemp], 1);
    put(best.wind_speed_kmh, cells[iWind], 1.852);
  }
  const flat = (m: Map<string, [number, number]>) => new Map([...m].map(([k, [v]]) => [k, v]));
  return { temperature_c: flat(best.temperature_c), wind_speed_kmh: flat(best.wind_speed_kmh), reports };
}
