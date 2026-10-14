import { RADAR_CORNERS } from "../../../lib/aceweather/radar-image.ts";
import { listFrames } from "../../../lib/aceweather/radar-server.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const CORS = { "access-control-allow-origin": "*" };

/** Latest Met Office radar frames (oldest first) and the map corners their images cover. */
export async function GET(): Promise<Response> {
  try {
    const frames = await listFrames();
    return Response.json(
      { source: "Met Office UK radar composite, CC BY-SA 4.0", corners: RADAR_CORNERS, frames },
      { headers: { ...CORS, "cache-control": "public, max-age=60, s-maxage=120, stale-while-revalidate=600" } },
    );
  } catch {
    return Response.json({ error: "Radar index unavailable" }, { status: 502, headers: { ...CORS, "cache-control": "no-store" } });
  }
}
