/**
 * Server-side Met Office radar rendering: reprojects the 1 km UK rain-rate composite
 * (a transverse Mercator grid) onto a Web Mercator image and encodes it as a small
 * palette PNG, so browsers download ~tens of KB per frame instead of the HDF5 file
 * plus a 7 MB decoder.
 */
import { deflateSync } from "node:zlib";
import { DEG, latFromMercY, mercY, PALETTE, paletteIndex, RADAR_BOUNDS, RADAR_HEIGHT, RADAR_WIDTH } from "./radar-palette.ts";

export { PALETTE, RADAR_BOUNDS, RADAR_CORNERS, RADAR_HEIGHT, RADAR_WIDTH } from "./radar-palette.ts";

export type TmercParams = { lat0: number; lon0: number; k0: number; x0: number; y0: number; a: number; b: number };

const ELLIPSOIDS: Record<string, [number, number]> = {
  airy: [6377563.396, 6356256.909],
  WGS84: [6378137, 6356752.314245],
  GRS80: [6378137, 6356752.314140],
};

/** Parses the PROJ string the Met Office supplies, e.g. "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.999601 ...". */
export function parseTmerc(projdef: string): TmercParams {
  const parts = Object.fromEntries(projdef.trim().split(/\s+/).map((p) => p.replace(/^\+/, "").split("=") as [string, string]));
  if (parts.proj !== "tmerc") throw new Error(`Unsupported radar projection: ${parts.proj}`);
  const ellipsoid = ELLIPSOIDS[parts.ellps ?? "WGS84"];
  if (!ellipsoid) throw new Error(`Unsupported radar ellipsoid: ${parts.ellps}`);
  const num = (key: string, fallback: number) => (parts[key] == null ? fallback : Number(parts[key]));
  return { lat0: num("lat_0", 0), lon0: num("lon_0", 0), k0: num("k", num("k_0", 1)), x0: num("x_0", 0), y0: num("y_0", 0), a: ellipsoid[0], b: ellipsoid[1] };
}

/** Transverse Mercator forward projection (Ordnance Survey series), returns [easting, northing] in metres. */
export function tmercForward(p: TmercParams, lat: number, lon: number): [number, number] {
  const { a, b, k0 } = p;
  const phi = lat * DEG, phi0 = p.lat0 * DEG, dl = (lon - p.lon0) * DEG;
  const n = (a - b) / (a + b), n2 = n * n, n3 = n2 * n;
  const e2 = (a * a - b * b) / (a * a);
  const sin = Math.sin(phi), cos = Math.cos(phi), tan = Math.tan(phi), tan2 = tan * tan, tan4 = tan2 * tan2;
  const nu = (a * k0) / Math.sqrt(1 - e2 * sin * sin);
  const rho = (a * k0 * (1 - e2)) / Math.pow(1 - e2 * sin * sin, 1.5);
  const eta2 = nu / rho - 1;
  const dp = phi - phi0, sp = phi + phi0;
  const M = b * k0 * (
    (1 + n + 1.25 * n2 + 1.25 * n3) * dp
    - (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(dp) * Math.cos(sp)
    + ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * dp) * Math.cos(2 * sp)
    - (35 / 24) * n3 * Math.sin(3 * dp) * Math.cos(3 * sp)
  );
  const cos3 = cos * cos * cos, cos5 = cos3 * cos * cos;
  const I = M + p.y0;
  const II = (nu / 2) * sin * cos;
  const III = (nu / 24) * sin * cos3 * (5 - tan2 + 9 * eta2);
  const IIIA = (nu / 720) * sin * cos5 * (61 - 58 * tan2 + tan4);
  const IV = nu * cos;
  const V = (nu / 6) * cos3 * (nu / rho - tan2);
  const VI = (nu / 120) * cos5 * (5 - 18 * tan2 + tan4 + 14 * eta2 - 58 * tan2 * eta2);
  const dl2 = dl * dl;
  return [p.x0 + IV * dl + V * dl * dl2 + VI * dl * dl2 * dl2, I + II * dl2 + III * dl2 * dl2 + IIIA * dl2 * dl2 * dl2];
}

export type RadarGrid = { projdef: string; width: number; height: number; xscale: number; yscale: number; ulLat: number; ulLon: number };

/**
 * For every output pixel, the index of the source grid cell it samples (or -1 outside the grid).
 * Depends only on the grid geometry, so callers cache it between frames.
 */
export function buildLookup(grid: RadarGrid, width = RADAR_WIDTH, height = RADAR_HEIGHT): Int32Array {
  const p = parseTmerc(grid.projdef);
  const [ulX, ulY] = tmercForward(p, grid.ulLat, grid.ulLon);
  const lookup = new Int32Array(width * height);
  const y0 = mercY(RADAR_BOUNDS.north), y1 = mercY(RADAR_BOUNDS.south);
  for (let row = 0; row < height; row += 1) {
    const lat = latFromMercY(y0 + ((row + 0.5) / height) * (y1 - y0));
    for (let col = 0; col < width; col += 1) {
      const lon = RADAR_BOUNDS.west + ((col + 0.5) / width) * (RADAR_BOUNDS.east - RADAR_BOUNDS.west);
      const [x, y] = tmercForward(p, lat, lon);
      const gc = Math.floor((x - ulX) / grid.xscale);
      const gr = Math.floor((ulY - y) / grid.yscale);
      lookup[row * width + col] = gc >= 0 && gc < grid.width && gr >= 0 && gr < grid.height ? gr * grid.width + gc : -1;
    }
  }
  return lookup;
}

/** Colours a rain-rate grid through the lookup into one palette index per output pixel. */
export function renderIndices(values: ArrayLike<number>, lookup: Int32Array, nodata = -1): Uint8Array {
  const out = new Uint8Array(lookup.length);
  for (let i = 0; i < lookup.length; i += 1) {
    const src = lookup[i];
    out[i] = src < 0 ? 1 : paletteIndex(values[src], nodata);
  }
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Encodes 8-bit palette indices as an indexed-colour PNG with per-entry transparency. */
export function encodePalettePng(indices: Uint8Array, width: number, height: number, palette = PALETTE): Uint8Array {
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  header.set([8, 3, 0, 0, 0], 8);
  const plte = new Uint8Array(palette.length * 3);
  const trns = new Uint8Array(palette.length);
  palette.forEach(([r, g, b, alpha], i) => { plte.set([r, g, b], i * 3); trns[i] = alpha; });
  const raw = new Uint8Array((width + 1) * height);
  for (let row = 0; row < height; row += 1) raw.set(indices.subarray(row * width, (row + 1) * width), row * (width + 1) + 1);
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("PLTE", plte),
    chunk("tRNS", trns),
    chunk("IDAT", new Uint8Array(deflateSync(raw, { level: 9 }))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

/** Met Office frame keys and their observation times. */
export const RADAR_BUCKET = "https://met-office-radar-obs-data.s3.eu-west-2.amazonaws.com";
const KEY_SUFFIX = "_ODIM_ng_radar_rainrate_composite_1km_UK.h5";

export function frameKey(stamp: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const time = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(time);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
  return `radar/${m[1]}/${m[2]}/${m[3]}/${stamp}${KEY_SUFFIX}`;
}

export function stampFromKey(key: string): { stamp: string; time: number } | null {
  const m = /\/(\d{12})_ODIM_ng_radar_rainrate_composite_1km_UK\.h5$/.exec(key);
  if (!m) return null;
  const s = m[1];
  return { stamp: s, time: Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12)) };
}
