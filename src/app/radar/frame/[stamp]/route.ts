import { RadarFrameNotFound, renderFrame } from "../../../../lib/aceweather/radar-server.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

const CORS = { "access-control-allow-origin": "*" };

/**
 * One observed radar frame as a Web Mercator palette PNG. Frames never change once published,
 * so the CDN keeps each one for a year and the server decodes it once.
 * GET /radar/frame/202610141515
 */
export async function GET(_request: Request, context: { params: Promise<{ stamp: string }> }): Promise<Response> {
  const { stamp } = await context.params;
  try {
    const png = await renderFrame(stamp.replace(/\.png$/, ""));
    return new Response(png as BodyInit, {
      headers: { ...CORS, "content-type": "image/png", "cache-control": "public, max-age=86400, s-maxage=31536000, immutable" },
    });
  } catch (caught) {
    const missing = caught instanceof RadarFrameNotFound;
    if (!missing) console.error("radar frame", stamp, caught);
    return Response.json({ error: missing ? "Radar frame not found" : "Radar frame unavailable" }, { status: missing ? 404 : 502, headers: { ...CORS, "cache-control": missing ? "public, max-age=60" : "no-store" } });
  }
}
