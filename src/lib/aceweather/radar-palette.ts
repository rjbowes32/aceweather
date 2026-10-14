/** Radar image geometry and colours shared by the server renderer and the browser. */

/** Geographic extent of the rendered image: UK, Ireland and nearby seas. */
export const RADAR_BOUNDS = { west: -12, east: 5, south: 48.5, north: 61.5 } as const;
/** Output width in pixels; about 1 km per pixel at 55°N, matching the source grid. */
export const RADAR_WIDTH = 1100;

export const DEG = Math.PI / 180;
export const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
export const latFromMercY = (y: number) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / DEG;

export const RADAR_HEIGHT = Math.round(
  (RADAR_WIDTH * (mercY(RADAR_BOUNDS.north) - mercY(RADAR_BOUNDS.south))) / ((RADAR_BOUNDS.east - RADAR_BOUNDS.west) * DEG),
);

/** Image corners for a MapLibre image source: top-left, top-right, bottom-right, bottom-left. */
export const RADAR_CORNERS: [[number, number], [number, number], [number, number], [number, number]] = [
  [RADAR_BOUNDS.west, RADAR_BOUNDS.north],
  [RADAR_BOUNDS.east, RADAR_BOUNDS.north],
  [RADAR_BOUNDS.east, RADAR_BOUNDS.south],
  [RADAR_BOUNDS.west, RADAR_BOUNDS.south],
];

/** Rain-rate bands in mm/h with their colours; index 0 is "no rain", index 1 is "no radar coverage". */
export const RAIN_BANDS = [0.05, 0.5, 1, 2, 4, 8, 16, 32] as const;
export const PALETTE: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0, 0],
  [128, 136, 150, 46],
  [110, 160, 255, 115],
  [73, 130, 238, 155],
  [65, 190, 225, 185],
  [77, 211, 158, 205],
  [238, 202, 91, 220],
  [239, 153, 74, 232],
  [232, 104, 119, 242],
  [194, 91, 220, 250],
];

/** Palette index for a rain rate; nodata (negative) means outside radar coverage. */
export function paletteIndex(rate: number, nodata = -1): number {
  if (!Number.isFinite(rate) || rate === nodata || rate < 0) return 1;
  if (rate <= RAIN_BANDS[0]) return 0;
  for (let band = RAIN_BANDS.length - 1; band >= 1; band -= 1) if (rate >= RAIN_BANDS[band]) return band + 2;
  return 2;
}

export type RadarBand = { label: string; rain: boolean };

/** What each palette entry means, for reading the rate back at a point. */
export const PALETTE_BANDS: RadarBand[] = [
  { label: "Dry", rain: false },
  { label: "No radar", rain: false },
  { label: "Light rain", rain: true },
  { label: "Light rain", rain: true },
  { label: "Moderate rain", rain: true },
  { label: "Moderate rain", rain: true },
  { label: "Heavy rain", rain: true },
  { label: "Heavy rain", rain: true },
  { label: "Very heavy rain", rain: true },
  { label: "Very heavy rain", rain: true },
];

/** Pixel position of a point in the rendered radar image, or null outside it. */
export function radarPixel(lat: number, lon: number, width = RADAR_WIDTH, height = RADAR_HEIGHT): [number, number] | null {
  const { west, east, south, north } = RADAR_BOUNDS;
  if (lon < west || lon > east || lat < south || lat > north) return null;
  const x = Math.floor(((lon - west) / (east - west)) * width);
  const y = Math.floor(((mercY(north) - mercY(lat)) / (mercY(north) - mercY(south))) * height);
  return [Math.min(width - 1, x), Math.min(height - 1, y)];
}

/** Nearest palette entry to an RGBA sample read back from a canvas. */
export function nearestPaletteIndex(r: number, g: number, b: number, a: number): number {
  if (a < 20) return 0;
  let best = 0, bestDistance = Infinity;
  PALETTE.forEach(([pr, pg, pb, pa], i) => {
    if (pa === 0) return;
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2 + 4 * (pa - a) ** 2;
    if (d < bestDistance) { bestDistance = d; best = i; }
  });
  return best;
}
