import { isTimezone } from "../../mcp/dates.ts";
import { learnedForecast, prepareLocation } from "../../mcp/learned.ts";
import { resolveLocation } from "../../mcp/locations.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const localHour = (utc: string, timezone: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(`${utc}:00Z`)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:00`;
};

/**
 * The dashboard's learned forecast: hourly temperature, wind and rain for the next 7 days, keyed by local time
 * in the requested time zone so the client can overlay them on its Open-Meteo forecast.
 * GET /learned-forecast?lat=54.60&lon=-3.13&tz=Europe/London
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const tzParam = url.searchParams.get("tz") ?? "";
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "lat and lon are required" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const timezone = isTimezone(tzParam) ? tzParam : "Europe/London";
  try {
    // About 1 km precision keeps the edge cache effective without changing the forecast.
    const location = await prepareLocation(await resolveLocation({ latitude: Math.round(lat * 100) / 100, longitude: Math.round(lon * 100) / 100 }));
    const result = await learnedForecast(location, { days: 7, wind: "kmh", hourly: true });
    const d = result.data;
    return Response.json({
      learning_source: d.learning_source,
      fits_generated_at: d.fits_generated_at,
      applied: d.learned_applied,
      reference: d.reference ? { name: d.reference.name, network: d.reference.network, distance_km: d.reference.distance_km } : null,
      timezone,
      daily: d.daily.map((r) => ({ date: r.date, rain_chance_pct: r.rain_chance_pct })),
      hourly: (d.hourly ?? []).map((h) => ({ time: localHour(h.time, timezone), temperature_c: h.temperature_c, wind_speed_kmh: h.wind_speed, precipitation_mm: h.precipitation_mm })),
    }, { headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=900" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "learned forecast unavailable" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
