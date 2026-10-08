import { rateLimitPerMinute } from "./config.ts";

const WINDOW_MS = 60_000;
const MAX_KEYS = 10_000;
const hits = new Map<string, number[]>();

/** Sliding one-minute window per client, per server instance. Edge-wide limits belong in the Vercel firewall. */
export function rateLimit(key: string, now = Date.now(), limit = rateLimitPerMinute()): { ok: boolean; retryAfterSeconds: number } {
  const recent = (hits.get(key) ?? []).filter((t) => t > now - WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  hits.delete(key);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value as string);
  return { ok: true, retryAfterSeconds: 0 };
}

export function resetRateLimits(): void {
  hits.clear();
}
