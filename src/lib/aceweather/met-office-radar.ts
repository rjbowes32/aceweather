/** Browser client for AceWeather's radar routes, which serve ready-to-draw Met Office frames. */
import type { RADAR_CORNERS } from "./radar-palette";

const LIVE_ORIGIN = "https://www.aceweather.app";

export type MetOfficeRadarFrame = { stamp: string; time: number };
export type RadarIndex = { frames: MetOfficeRadarFrame[]; corners: typeof RADAR_CORNERS };

/** Same-origin on the web; the live site when running from a bundled copy (for example the iOS app). */
function radarOrigin() {
  if (typeof window === "undefined") return "";
  return /^https?:$/.test(window.location.protocol) ? "" : LIVE_ORIGIN;
}

export async function fetchMetOfficeRadarFrames(signal?: AbortSignal): Promise<RadarIndex> {
  const response = await fetch(`${radarOrigin()}/radar/frames`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`Radar index ${response.status}`);
  const body = (await response.json()) as Partial<RadarIndex>;
  if (!Array.isArray(body.frames) || !Array.isArray(body.corners) || body.corners.length !== 4) throw new Error("Radar index was invalid");
  return { frames: body.frames.filter((f) => typeof f?.stamp === "string" && Number.isFinite(f?.time)), corners: body.corners };
}

export function metOfficeRadarUrl(frame: MetOfficeRadarFrame) {
  return `${radarOrigin()}/radar/frame/${frame.stamp}`;
}

export function formatRadarFrameTime(frame: MetOfficeRadarFrame, timezone = "Europe/London") {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: timezone === "auto" ? undefined : timezone,
    }).format(frame.time);
  } catch {
    return new Date(frame.time).toISOString().slice(11, 16);
  }
}

/** "Just now", "12 min ago", "2 h 5 min ago". */
export function formatRadarAge(time: number, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min ago` : `${hours} h ago`;
}

/**
 * Which frame to show after the frame list refreshes: the newest one, unless the user has paused on an
 * earlier frame that is still in the list, in which case they stay on it.
 */
export function frameIndexAfterRefresh(previous: MetOfficeRadarFrame[] | null, next: MetOfficeRadarFrame[], viewing: string | null, playing: boolean): number {
  const latest = Math.max(0, next.length - 1);
  if (!previous || playing || !viewing || viewing === previous.at(-1)?.stamp) return latest;
  const keep = next.findIndex((f) => f.stamp === viewing);
  return keep >= 0 ? keep : latest;
}
