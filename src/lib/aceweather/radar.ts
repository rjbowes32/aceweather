/* RainViewer weather-maps frame index.
   Docs: https://www.rainviewer.com/api/weather-maps-api.html
   Radar is not an Open-Meteo product; RainViewer is the free radar source. */

export type RainViewerFrame = { time: number; path: string };
export type RainViewerIndex = {
  host: string;
  generated: number;
  past: RainViewerFrame[];
  nowcast: RainViewerFrame[];
};

const ENDPOINT = "https://api.rainviewer.com/public/weather-maps.json";
const COLOR_SCHEME = 4; // universal blue→green→red
const TILE_SIZE = 256;
const SMOOTH = 1;
const SNOW = 1;

export async function fetchRainViewerIndex(signal?: AbortSignal): Promise<RainViewerIndex> {
  const r = await fetch(ENDPOINT, { signal, cache: "no-store" });
  if (!r.ok) throw new Error(`RainViewer ${r.status}`);
  const body = (await r.json()) as {
    host: string; generated: number;
    radar?: { past?: RainViewerFrame[]; nowcast?: RainViewerFrame[] };
  };
  return {
    host: body.host,
    generated: body.generated,
    past: (body.radar?.past ?? []).map((f) => ({ time: f.time, path: f.path })),
    nowcast: (body.radar?.nowcast ?? []).map((f) => ({ time: f.time, path: f.path })),
  };
}

export function radarTileUrl(index: RainViewerIndex, frame: RainViewerFrame): string {
  return `${index.host}${frame.path}/${TILE_SIZE}/{z}/{x}/{y}/${COLOR_SCHEME}/${SMOOTH}_${SNOW}.png`;
}

export function allFrames(index: RainViewerIndex): RainViewerFrame[] {
  return [...index.past, ...index.nowcast];
}

export function isForecastFrame(index: RainViewerIndex, frame: RainViewerFrame): boolean {
  return index.nowcast.includes(frame);
}

export function formatFrameTime(frame: RainViewerFrame, tz?: string): string {
  const date = new Date(frame.time * 1000);
  try {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  } catch {
    return date.toISOString().slice(11, 16);
  }
}
