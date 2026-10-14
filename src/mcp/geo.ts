const EARTH_RADIUS_KM = 6371;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km. */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Bounding box that contains a circle of the given radius (clamped to valid ranges). */
export function bboxAround(latitude: number, longitude: number, km: number): { south: number; west: number; north: number; east: number } {
  const dLat = (km / EARTH_RADIUS_KM) * (180 / Math.PI);
  const dLon = dLat / Math.max(0.05, Math.cos(rad(latitude)));
  return {
    south: Math.max(-90, latitude - dLat), north: Math.min(90, latitude + dLat),
    west: Math.max(-180, longitude - dLon), east: Math.min(180, longitude + dLon),
  };
}

/** Relative humidity (%) from air and dew point temperatures (Magnus formula). */
export function relativeHumidity(temperatureC: number, dewPointC: number): number {
  const e = (t: number) => Math.exp((17.625 * t) / (243.04 + t));
  return Math.min(100, Math.max(0, (100 * e(dewPointC)) / e(temperatureC)));
}
