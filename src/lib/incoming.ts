export type ParsedIncoming =
  | { kind: "coords"; lat: number; lon: number; label?: string }
  | { kind: "query"; query: string }
  | { kind: "empty" };

const LAT_LON_RE = /(-?\d{1,2}(?:\.\d+)?)\s*[,°N]\s*(-?\d{1,3}(?:\.\d+)?)/i;
const GMAPS_AT_RE = /[@!]q?(-?\d{1,2}\.\d+)[,!](-?\d{1,3}\.\d+)/;
const GEO_URI_RE = /^geo:(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/i;

function clampLatLon(lat: number, lon: number): { lat: number; lon: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lon < -180 || lon > 180) return null;
  return { lat, lon };
}

function tryParseGoogleMaps(value: string): { lat: number; lon: number } | null {
  try {
    const url = new URL(value);
    if (!/google\.[^/]+\/maps/.test(url.hostname + url.pathname)) return null;
    const queryParam = url.searchParams.get("q") || url.searchParams.get("ll");
    if (queryParam) {
      const m = queryParam.match(/(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/);
      if (m) {
        const c = clampLatLon(parseFloat(m[1]), parseFloat(m[2]));
        if (c) return c;
      }
    }
    const at = value.match(GMAPS_AT_RE);
    if (at) {
      const c = clampLatLon(parseFloat(at[1]), parseFloat(at[2]));
      if (c) return c;
    }
    return null;
  } catch {
    return null;
  }
}

function tryParseGeoUri(value: string): { lat: number; lon: number } | null {
  const m = value.match(GEO_URI_RE);
  if (!m) return null;
  return clampLatLon(parseFloat(m[1]), parseFloat(m[2]));
}

function tryParseBareCoords(value: string): { lat: number; lon: number } | null {
  const m = value.match(LAT_LON_RE);
  if (!m) return null;
  return clampLatLon(parseFloat(m[1]), parseFloat(m[2]));
}

export function parseIncomingShare(input: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}): ParsedIncoming {
  const candidates = [input.url, input.text, input.title].filter(Boolean) as string[];
  if (candidates.length === 0) return { kind: "empty" };

  for (const raw of candidates) {
    const trimmed = raw.trim();
    const geo = tryParseGeoUri(trimmed);
    if (geo) return { kind: "coords", lat: geo.lat, lon: geo.lon };
    if (/^https?:/i.test(trimmed)) {
      const gmaps = tryParseGoogleMaps(trimmed);
      if (gmaps) return { kind: "coords", lat: gmaps.lat, lon: gmaps.lon };
    }
    const bare = tryParseBareCoords(trimmed);
    if (bare) return { kind: "coords", lat: bare.lat, lon: bare.lon };
  }

  const textCandidate = (input.text || input.title || "").trim();
  if (textCandidate.length >= 2 && !/^https?:/i.test(textCandidate)) {
    return { kind: "query", query: textCandidate.slice(0, 120) };
  }
  return { kind: "empty" };
}
