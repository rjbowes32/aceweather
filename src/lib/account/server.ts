import { clientKey } from "../../mcp/auth.ts";
import { parseAccountData, type AccountData } from "./data.ts";
import { readSession, SESSION_COOKIE, SESSION_DAYS, signSession, type Session } from "./session.ts";
import { accountStore, authSecret, type Store } from "./store.ts";

export type Ctx = { store: Store; secret: string };

const NO_STORE = { "cache-control": "no-store" };

export const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

export const fail = (status: number, error: string) => reply({ error }, status);

/** Store and secret, or null when accounts are not set up on this deployment. */
export function context(): Ctx | null {
  const store = accountStore();
  const secret = authSecret();
  return store && secret ? { store, secret } : null;
}

/**
 * Writes take JSON only, from this site only: a cross-site form can't send application/json without a
 * preflight, and the Origin check covers browsers that send it.
 */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return null;
  const origin = request.headers.get("origin");
  if (origin && URL.parse(origin)?.host !== (request.headers.get("host") ?? new URL(request.url).host)) return null;
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

function cookie(request: Request, name: string): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

/**
 * The signed-in session, checked against the account record on every request: a deleted account signs out
 * every device at once, and a cookie from before the account was made again is not honoured.
 */
export async function sessionOf(request: Request, ctx: Ctx): Promise<Session | null> {
  const session = readSession(ctx.secret, cookie(request, SESSION_COOKIE));
  if (!session) return null;
  const raw = await ctx.store.get(keys.user(session.uid));
  if (!raw) return null;
  try {
    const createdAt = Date.parse((JSON.parse(raw) as { createdAt?: string }).createdAt ?? "");
    return Number.isFinite(createdAt) && session.iat >= createdAt ? session : null;
  } catch {
    return null;
  }
}

export const hasSessionCookie = (request: Request) => Boolean(cookie(request, SESSION_COOKIE));

const secure = () => (process.env.NODE_ENV === "production" ? "; Secure" : "");

export function sessionCookie(ctx: Ctx, uid: string, email: string): string {
  const iat = Date.now();
  const token = signSession(ctx.secret, { uid, email, iat, exp: iat + SESSION_DAYS * 86_400_000 });
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure()}`;
}

export const clearCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure()}`;

export const ipKey = (request: Request) => clientKey(request);

export const keys = {
  user: (uid: string) => `aw:user:${uid}`,
  data: (uid: string) => `aw:data:${uid}`,
  code: (uid: string) => `aw:code:${uid}`,
  tries: (uid: string) => `aw:tries:${uid}`,
  sendsEmail: (uid: string) => `aw:sends:${uid}`,
  sendsIp: (ip: string) => `aw:sends-ip:${ip}`,
};

export async function loadData(ctx: Ctx, uid: string): Promise<AccountData> {
  const raw = await ctx.store.get(keys.data(uid));
  if (!raw) return { saved: [], prefs: {}, updatedAt: null };
  try { return parseAccountData(JSON.parse(raw)); } catch { return { saved: [], prefs: {}, updatedAt: null }; }
}
