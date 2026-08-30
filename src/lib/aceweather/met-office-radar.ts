const RADAR_BUCKET = "https://met-office-radar-obs-data.s3.eu-west-2.amazonaws.com";
const FRAME_LIMIT = 8;

export type MetOfficeRadarFrame = {
  key: string;
  time: number;
};

function prefixFor(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `radar/${year}/${month}/${day}/`;
}

function frameTime(key: string) {
  const match = key.match(/\/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})_ODIM_/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}

async function listPrefix(prefix: string, signal?: AbortSignal) {
  const url = `${RADAR_BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`;
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`Met Office radar index ${response.status}`);
  const xml = await response.text();
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Met Office radar index was invalid");
  return Array.from(document.querySelectorAll("Contents > Key"), (node) => node.textContent ?? "")
    .filter((key) => key.endsWith("_ODIM_ng_radar_rainrate_composite_1km_UK.h5"));
}

export async function fetchMetOfficeRadarFrames(signal?: AbortSignal): Promise<MetOfficeRadarFrame[]> {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const keys = (await Promise.all([
    listPrefix(prefixFor(yesterday), signal),
    listPrefix(prefixFor(today), signal),
  ])).flat();

  return keys
    .map((key) => ({ key, time: frameTime(key) }))
    .filter((frame): frame is MetOfficeRadarFrame => frame.time != null)
    .sort((a, b) => a.time - b.time)
    .slice(-FRAME_LIMIT);
}

export function metOfficeRadarUrl(frame: MetOfficeRadarFrame) {
  return `${RADAR_BUCKET}/${frame.key}`;
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
