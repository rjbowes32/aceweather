/**
 * Signed session cookie and sign-in codes. No session table: the cookie carries the account id and expiry,
 * signed with AUTH_SECRET. Rotating AUTH_SECRET signs everyone out.
 */
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "awx_session";
export const SESSION_DAYS = 30;
export const CODE_MINUTES = 10;
export const CODE_ATTEMPTS = 5;

export type Session = { uid: string; email: string; exp: number };

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString();
const hmac = (secret: string, value: string) => createHmac("sha256", secret).update(value).digest("base64url");

export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** Stable account id for an email address; the address itself is only kept in the user record. */
export const accountId = (email: string) => createHash("sha256").update(`aceweather:${email}`).digest("hex").slice(0, 32);

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export const hashCode = (secret: string, email: string, code: string) => hmac(secret, `code:${email}:${code}`);

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function signSession(secret: string, session: Session): string {
  const body = b64(JSON.stringify(session));
  return `${body}.${hmac(secret, body)}`;
}

export function readSession(secret: string, token: string | undefined, now = Date.now()): Session | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !sameHash(sig, hmac(secret, body))) return null;
  try {
    const s = JSON.parse(unb64(body)) as Partial<Session>;
    if (typeof s.uid !== "string" || typeof s.email !== "string" || typeof s.exp !== "number" || s.exp <= now) return null;
    return { uid: s.uid, email: s.email, exp: s.exp };
  } catch {
    return null;
  }
}
