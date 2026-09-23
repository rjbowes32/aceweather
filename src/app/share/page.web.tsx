import { redirect } from "next/navigation";

import { parseIncomingShare } from "@/lib/incoming";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

async function resolveByQuery(query: string, origin: string): Promise<{ lat: number; lon: number; name?: string; tz?: string } | null> {
  try {
    const res = await fetch(`${origin}/api/search?query=${encodeURIComponent(query)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = await res.json();
    const top = (body.results ?? [])[0];
    if (!top || typeof top.latitude !== "number" || typeof top.longitude !== "number") return null;
    return {
      lat: top.latitude,
      lon: top.longitude,
      name: [top.name, top.admin1, top.country].filter(Boolean).join(", "),
      tz: top.timezone,
    };
  } catch {
    return null;
  }
}

export default async function SharePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const parsed = parseIncomingShare({
    title: first(params.title) ?? null,
    text: first(params.text) ?? null,
    url: first(params.url) ?? null,
  });

  const targetParams = new URLSearchParams();
  if (parsed.kind === "coords") {
    targetParams.set("lat", parsed.lat.toString());
    targetParams.set("lon", parsed.lon.toString());
    targetParams.set("source", "share");
  } else if (parsed.kind === "query") {
    const origin = process.env.ACEWEATHER_PUBLIC_BASE_URL?.replace(/\/$/, "") || "http://127.0.0.1:3000";
    const resolved = await resolveByQuery(parsed.query, origin);
    if (resolved) {
      targetParams.set("lat", resolved.lat.toString());
      targetParams.set("lon", resolved.lon.toString());
      if (resolved.name) targetParams.set("name", resolved.name);
      if (resolved.tz) targetParams.set("tz", resolved.tz);
      targetParams.set("source", "share");
    } else {
      targetParams.set("q", parsed.query);
      targetParams.set("source", "share");
    }
  }

  const search = targetParams.toString();
  redirect(search ? `/?${search}` : "/");
}
