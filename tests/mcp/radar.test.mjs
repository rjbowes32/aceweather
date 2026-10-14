import assert from "node:assert/strict";
import test from "node:test";
import { inflateSync } from "node:zlib";
import {
  buildLookup,
  encodePalettePng,
  frameKey,
  parseTmerc,
  RADAR_HEIGHT,
  RADAR_WIDTH,
  renderIndices,
  stampFromKey,
  tmercForward,
} from "../../src/lib/aceweather/radar-image.ts";
import { nearestPaletteIndex, PALETTE, paletteIndex, radarPixel } from "../../src/lib/aceweather/radar-palette.ts";
import { listFrames } from "../../src/lib/aceweather/radar-server.ts";

const MET_OFFICE_PROJ = "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.999601 +x_0=400000 +y_0=-100000 +ellps=airy +units=m";
const GRID = { projdef: MET_OFFICE_PROJ, width: 1725, height: 2175, xscale: 1000, yscale: 1000, ulLat: 62.92071695962483, ulLon: -17.973932221553792 };

test("transverse Mercator matches the Ordnance Survey worked example to the millimetre", () => {
  const bng = parseTmerc("+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy");
  const [e, n] = tmercForward(bng, 52 + 39 / 60 + 27.2531 / 3600, 1 + 43 / 60 + 4.5177 / 3600);
  assert.ok(Math.abs(e - 651409.903) < 0.001 && Math.abs(n - 313177.27) < 0.001, `${e} ${n}`);
  assert.throws(() => parseTmerc("+proj=stere +ellps=airy"), /Unsupported/);
});

test("the Met Office corner coordinates land exactly on the 1725 × 2175 km grid", () => {
  const p = parseTmerc(MET_OFFICE_PROJ);
  const [ulx, uly] = tmercForward(p, GRID.ulLat, GRID.ulLon);
  const [lrx, lry] = tmercForward(p, 43.70087658067965, 9.415780820163617);
  assert.ok(Math.abs(lrx - ulx - 1_725_000) < 50 && Math.abs(uly - lry - 2_175_000) < 50);
});

test("reprojection samples the grid cell under each pixel: Stockton reads the cell that covers Stockton", () => {
  const lookup = buildLookup(GRID);
  assert.equal(lookup.length, RADAR_WIDTH * RADAR_HEIGHT);
  const [x, y] = radarPixel(54.57, -1.32);
  const cell = lookup[y * RADAR_WIDTH + x];
  const [e, n] = tmercForward(parseTmerc(MET_OFFICE_PROJ), 54.57, -1.32);
  const [ulx, uly] = tmercForward(parseTmerc(MET_OFFICE_PROJ), GRID.ulLat, GRID.ulLon);
  const expected = Math.floor((uly - n) / 1000) * GRID.width + Math.floor((e - ulx) / 1000);
  const [row, col] = [Math.floor(cell / GRID.width), cell % GRID.width];
  assert.ok(Math.abs(row - Math.floor(expected / GRID.width)) <= 1 && Math.abs(col - expected % GRID.width) <= 1);
});

test("rain rates map to the agreed bands, and nodata means no radar coverage", () => {
  assert.deepEqual([-1, 0, 0.05, 0.3, 0.5, 1, 3, 5, 10, 20, 50].map((r) => paletteIndex(r)), [1, 0, 0, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(paletteIndex(Number.NaN), 1);
  const out = renderIndices(new Float32Array([0, 2, -1]), new Int32Array([0, 1, 2, -1]));
  assert.deepEqual([...out], [0, 5, 1, 1]);
});

test("palette PNGs are valid and round-trip their indices", () => {
  const indices = new Uint8Array([0, 1, 2, 9, 5, 0]);
  const png = encodePalettePng(indices, 3, 2);
  assert.deepEqual([...png.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = {};
  for (let i = 8; i < png.length;) {
    const len = new DataView(png.buffer, png.byteOffset + i).getUint32(0);
    const type = String.fromCharCode(...png.slice(i + 4, i + 8));
    chunks[type] = (chunks[type] ?? []).concat([png.slice(i + 8, i + 8 + len)]);
    i += 12 + len;
  }
  assert.equal(chunks.PLTE[0].length, PALETTE.length * 3);
  assert.equal(chunks.tRNS[0][0], 0, "index 0 (no rain) is transparent");
  const raw = inflateSync(chunks.IDAT[0]);
  assert.deepEqual([...raw], [0, 0, 1, 2, 0, 9, 5, 0]);
});

test("frame stamps only ever build Met Office radar keys", () => {
  assert.equal(frameKey("202610141515"), "radar/2026/10/14/202610141515_ODIM_ng_radar_rainrate_composite_1km_UK.h5");
  for (const bad of ["20261014151", "2026101415150", "202613011200", "202602301200", "202610142460", "../../etc/pass", "2026101415a5"]) assert.equal(frameKey(bad), null, bad);
  assert.deepEqual(stampFromKey("radar/2026/10/14/202610141515_ODIM_ng_radar_rainrate_composite_1km_UK.h5"), { stamp: "202610141515", time: Date.UTC(2026, 9, 14, 15, 15) });
  assert.equal(stampFromKey("radar/2026/10/14/202610141515_other_product.h5"), null);
});

test("reading a colour back from the image finds its band, even after alpha rounding", () => {
  PALETTE.forEach(([r, g, b, a], i) => { if (a) assert.equal(nearestPaletteIndex(r + 1, g - 1, b, a), i); });
  assert.equal(nearestPaletteIndex(0, 0, 0, 0), 0);
  assert.equal(radarPixel(40, 0), null);
});

test("the frame list keeps the latest radar composites across midnight and ignores other products", async () => {
  const key = (s) => `radar/${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)}/${s}_ODIM_ng_radar_rainrate_composite_1km_UK.h5`;
  const lists = {
    "radar/2026/10/13/": ["202610132330", "202610132345"].map(key),
    "radar/2026/10/14/": [...["202610140000", "202610140015", "202610140030"].map(key), "radar/2026/10/14/202610140030_other.h5"],
  };
  const fetcher = async (url) => {
    const prefix = decodeURIComponent(new URL(url).searchParams.get("prefix"));
    return new Response(`<ListBucketResult>${(lists[prefix] ?? []).map((k) => `<Contents><Key>${k}</Key></Contents>`).join("")}</ListBucketResult>`);
  };
  const frames = await listFrames(Date.UTC(2026, 9, 14, 0, 40), fetcher, 4);
  assert.deepEqual(frames.map((f) => f.stamp), ["202610132345", "202610140000", "202610140015", "202610140030"]);
});

test("a dropped S3 connection is retried rather than failing the frame", async () => {
  const { renderFrame } = await import("../../src/lib/aceweather/radar-server.ts");
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed");
    return new Response("not found", { status: 404 });
  };
  await assert.rejects(renderFrame("202610141515", fetcher, Date.UTC(2026, 9, 14, 16)), /not found/);
  assert.equal(calls, 2);
});

test("only recent frames are rendered, so the archive cannot be walked at our expense", async () => {
  const { renderFrame } = await import("../../src/lib/aceweather/radar-server.ts");
  let calls = 0;
  const fetcher = async () => { calls += 1; return new Response("", { status: 404 }); };
  const now = Date.UTC(2026, 9, 14, 16);
  await assert.rejects(renderFrame("202610111515", fetcher, now), /recent window/);
  await assert.rejects(renderFrame("202610150000", fetcher, now), /recent window/);
  assert.equal(calls, 0, "rejected before contacting S3");
});

test("a refresh moves to the newest frame unless the user paused on an earlier one", async () => {
  const { frameIndexAfterRefresh, formatRadarAge } = await import("../../src/lib/aceweather/met-office-radar.ts");
  const f = (s) => ({ stamp: s, time: 0 });
  const before = ["1300", "1315", "1330", "1345"].map(f);
  const after = ["1315", "1330", "1345", "1400"].map(f);
  assert.equal(frameIndexAfterRefresh(null, after, null, true), 3);
  assert.equal(frameIndexAfterRefresh(before, after, "1345", false), 3, "on the latest frame: follow the new latest");
  assert.equal(frameIndexAfterRefresh(before, after, "1315", true), 3, "playing: follow the new latest");
  assert.equal(frameIndexAfterRefresh(before, after, "1315", false), 0, "paused on an earlier frame: stay on it");
  assert.equal(frameIndexAfterRefresh(before, after, "1300", false), 3, "paused frame dropped off the list: go to latest");
  assert.equal(formatRadarAge(0, 60_000), "just now");
  assert.equal(formatRadarAge(0, 12 * 60_000), "12 min ago");
  assert.equal(formatRadarAge(0, 125 * 60_000), "2 h 5 min ago");
  assert.equal(formatRadarAge(0, 120 * 60_000), "2 h ago");
});
