export type Storm = {
  id: string;
  name: string;
  basin?: string;
  agency: "NHC" | "JTWC";
  classification?: string;
  category: string;
  winds_kt: number | null;
  winds_kph: number | null;
  pressure_mb: number | null;
  lat: number | null;
  lon: number | null;
  movement_dir?: string | null;
  movement_speed_kt?: number | string | null;
  advisory_number?: string | null;
  advisory_time?: string | null;
  url?: string | null;
};

export type SourceStatus = { ok: boolean; error?: string };

export type TropicalPayload = {
  fetchedAt: string;
  sources: { nhc: SourceStatus; jtwc: SourceStatus };
  count: number;
  storms: Storm[];
};

export async function fetchTropical(signal?: AbortSignal): Promise<TropicalPayload> {
  const response = await fetch("/api/tropical", { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`tropical ${response.status}`);
  return response.json();
}

export function categoryTone(category: string): "td" | "ts" | "hu1" | "hu2" | "hu3" | "hu4" | "hu5" | "unknown" {
  if (category === "TD") return "td";
  if (category === "TS") return "ts";
  if (category === "HU1") return "hu1";
  if (category === "HU2") return "hu2";
  if (category === "HU3") return "hu3";
  if (category === "HU4") return "hu4";
  if (category === "HU5") return "hu5";
  return "unknown";
}

export function basinLabel(basin?: string | null): string {
  switch (basin) {
    case "AL": return "Atlantic";
    case "EP": return "E Pacific";
    case "CP": return "C Pacific";
    case "W": return "W Pacific";
    case "B": return "Bay of Bengal";
    case "A": return "Arabian Sea";
    case "S": return "S Indian";
    case "P": return "S Pacific";
    default: return basin || "—";
  }
}
