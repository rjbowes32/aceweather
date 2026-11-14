/**
 * Tiny key-value store for accounts: Upstash Redis over its REST API (no client library), set up through the
 * Vercel Marketplace, which provides KV_REST_API_URL and KV_REST_API_TOKEN. Outside production, with neither set,
 * an in-memory map stands in so sign-in can be tried locally.
 */
export type Store = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Increments a counter, starting its expiry on the first increment. */
  incr(key: string, ttlSeconds: number): Promise<number>;
};

function redisStore(url: string, token: string): Store {
  async function run(command: Array<string | number>): Promise<unknown> {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { result?: unknown; error?: string } | null;
    if (!res.ok || !json || json.error) throw new Error(`store: ${json?.error ?? res.status}`);
    return json.result;
  }
  return {
    async get(key) { const v = await run(["GET", key]); return typeof v === "string" ? v : null; },
    async set(key, value, ttl) { await run(ttl ? ["SET", key, value, "EX", ttl] : ["SET", key, value]); },
    async del(key) { await run(["DEL", key]); },
    async incr(key, ttl) {
      const n = Number(await run(["INCR", key]));
      if (n === 1) await run(["EXPIRE", key, ttl]);
      return n;
    },
  };
}

function memoryStore(): Store {
  const g = globalThis as typeof globalThis & { __awxAccountStore?: Map<string, { v: string; exp: number }> };
  const map = (g.__awxAccountStore ??= new Map());
  const live = (key: string) => {
    const row = map.get(key);
    if (row && row.exp && row.exp < Date.now()) { map.delete(key); return undefined; }
    return row;
  };
  return {
    async get(key) { return live(key)?.v ?? null; },
    async set(key, v, ttl) { map.set(key, { v, exp: ttl ? Date.now() + ttl * 1000 : 0 }); },
    async del(key) { map.delete(key); },
    async incr(key, ttl) {
      const row = live(key);
      const n = (row ? Number(row.v) : 0) + 1;
      map.set(key, { v: String(n), exp: row?.exp || Date.now() + ttl * 1000 });
      return n;
    },
  };
}

/** Null when accounts are not set up (production without a store or secret). */
export function accountStore(): Store | null {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL)?.trim();
  const token = (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)?.trim();
  if (url && token) return redisStore(url, token);
  return process.env.NODE_ENV === "production" ? null : memoryStore();
}

/** AUTH_SECRET signs sessions and codes; a fixed value stands in outside production. */
export function authSecret(): string | null {
  const secret = process.env.AUTH_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  return process.env.NODE_ENV === "production" ? null : "aceweather-local-development-secret-not-for-production";
}
