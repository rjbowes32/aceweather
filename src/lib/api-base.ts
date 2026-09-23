// The website calls its own API ("/api/..."). The phone app has no API of its
// own, so its build sets NEXT_PUBLIC_ACEWEATHER_API_BASE to the live site.
const API_BASE = process.env.NEXT_PUBLIC_ACEWEATHER_API_BASE ?? "";

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
