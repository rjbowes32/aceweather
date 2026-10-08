import { createHash, timingSafeEqual } from "node:crypto";

export type Access = { ok: true; client: string; scopes: string[] } | { ok: false };

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Public weather tools are open by default, like the public /api endpoints.
 * Set ACEWEATHER_MCP_TOKEN to require "Authorization: Bearer <token>" on every request.
 */
export function authorize(request: Request): Access {
  const expected = process.env.ACEWEATHER_MCP_TOKEN?.trim();
  if (!expected) return { ok: true, client: "public", scopes: ["weather:read"] };
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1]?.trim();
  if (token && timingSafeEqual(digest(token), digest(expected))) return { ok: true, client: "token", scopes: ["weather:read"] };
  return { ok: false };
}

export function clientKey(request: Request): string {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}
