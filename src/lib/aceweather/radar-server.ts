/** Fetching, decoding and listing Met Office radar frames on the server (Node runtime only). */
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import h5wasm from "h5wasm/node";
import {
  buildLookup,
  encodePalettePng,
  frameKey,
  RADAR_BUCKET,
  RADAR_HEIGHT,
  RADAR_WIDTH,
  renderIndices,
  stampFromKey,
  type RadarGrid,
} from "./radar-image.ts";

import { shouldRetry } from "../../mcp/retry.ts";

export const RADAR_FRAME_LIMIT = 12;
const RETRY_DELAYS_MS = [250, 750];

/**
 * S3 sometimes closes a reused connection mid-download ("other side closed"), so fetches are retried
 * quickly on network errors and 5xx before giving up.
 */
async function fetchWithRetry(url: string, fetcher: typeof fetch): Promise<Response> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetcher(url, { cache: "no-store" });
      if (!shouldRetry(response.status, true) || attempt >= RETRY_DELAYS_MS.length) return response;
    } catch (caught) {
      if (attempt >= RETRY_DELAYS_MS.length) throw caught;
    }
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
}

/** Downloads a whole object, retrying if the connection drops part-way through the body. */
async function downloadWithRetry(url: string, fetcher: typeof fetch): Promise<{ status: number; bytes: Uint8Array | null }> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetchWithRetry(url, fetcher);
    if (!response.ok) return { status: response.status, bytes: null };
    try {
      return { status: response.status, bytes: new Uint8Array(await response.arrayBuffer()) };
    } catch (caught) {
      if (attempt >= RETRY_DELAYS_MS.length) throw caught;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

type H5Node = { attrs: Record<string, { value: unknown }>; value?: unknown; shape?: number[] };
type H5File = { get: (path: string) => H5Node; close: () => void };

const lookups = new Map<string, Int32Array>();

function gridKey(grid: RadarGrid) {
  return [grid.projdef, grid.width, grid.height, grid.xscale, grid.yscale, grid.ulLat.toFixed(6), grid.ulLon.toFixed(6)].join("|");
}

function lookupFor(grid: RadarGrid) {
  const key = gridKey(grid);
  let lookup = lookups.get(key);
  if (!lookup) {
    lookup = buildLookup(grid);
    lookups.set(key, lookup);
  }
  return lookup;
}

let sequence = 0;

/** Decodes one ODIM HDF5 composite and returns its Web Mercator palette PNG. */
export async function renderFrameFromHdf5(bytes: Uint8Array): Promise<Uint8Array> {
  await h5wasm.ready;
  // The Node build of h5wasm reads the real filesystem, so the frame goes through the temp directory.
  const filename = join(tmpdir(), `aceweather-radar-${process.pid}-${(sequence += 1)}.h5`);
  let file: H5File | null = null;
  try {
    writeFileSync(filename, bytes);
    file = new h5wasm.File(filename, "r") as unknown as H5File;
    const where = file.get("where").attrs;
    const what = file.get("dataset1/data1/what").attrs;
    const data = file.get("dataset1/data1/data");
    const [height, width] = data.shape ?? [];
    const values = data.value as Float32Array | undefined;
    const gain = Number(what.gain?.value ?? 1);
    const offset = Number(what.offset?.value ?? 0);
    if (!values || !width || !height || values.length !== width * height) throw new Error("Radar frame had an unexpected grid");
    if (gain !== 1 || offset !== 0) for (let i = 0; i < values.length; i += 1) values[i] = values[i] * gain + offset;
    const grid: RadarGrid = {
      projdef: String(where.projdef?.value ?? ""),
      width: Number(where.xsize?.value ?? width),
      height: Number(where.ysize?.value ?? height),
      xscale: Number(where.xscale?.value),
      yscale: Number(where.yscale?.value),
      ulLat: Number(where.UL_lat?.value),
      ulLon: Number(where.UL_lon?.value),
    };
    if (grid.width !== width || grid.height !== height || !(grid.xscale > 0) || !(grid.yscale > 0)) throw new Error("Radar frame geometry was inconsistent");
    const nodata = Number(what.nodata?.value ?? -1);
    return encodePalettePng(renderIndices(values, lookupFor(grid), nodata), RADAR_WIDTH, RADAR_HEIGHT);
  } finally {
    file?.close();
    try { unlinkSync(filename); } catch { /* already removed */ }
  }
}

export class RadarFrameNotFound extends Error {}

export async function renderFrame(stamp: string, fetcher: typeof fetch = fetch): Promise<Uint8Array> {
  const key = frameKey(stamp);
  if (!key) throw new RadarFrameNotFound("Invalid radar frame");
  const { status, bytes } = await downloadWithRetry(`${RADAR_BUCKET}/${key}`, fetcher);
  if (status === 404 || status === 403) throw new RadarFrameNotFound("Radar frame not found");
  if (!bytes) throw new Error(`Met Office radar frame ${status}`);
  return renderFrameFromHdf5(bytes);
}

const dayPrefix = (time: number) => {
  const d = new Date(time);
  return `radar/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCDate()).padStart(2, "0")}/`;
};

async function listPrefix(prefix: string, fetcher: typeof fetch) {
  const response = await fetchWithRetry(`${RADAR_BUCKET}/?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`, fetcher);
  if (!response.ok) throw new Error(`Met Office radar index ${response.status}`);
  const xml = await response.text();
  return Array.from(xml.matchAll(/<Key>([^<]+)<\/Key>/g), (m) => m[1]);
}

/** The latest observed frames, oldest first. */
export async function listFrames(now = Date.now(), fetcher: typeof fetch = fetch, limit = RADAR_FRAME_LIMIT) {
  const keys = (await Promise.all([listPrefix(dayPrefix(now - 86_400_000), fetcher), listPrefix(dayPrefix(now), fetcher)])).flat();
  const frames = new Map<string, { stamp: string; time: number }>();
  for (const key of keys) {
    const frame = stampFromKey(key);
    if (frame && frame.time <= now) frames.set(frame.stamp, frame);
  }
  return [...frames.values()].sort((a, b) => a.time - b.time).slice(-limit);
}
