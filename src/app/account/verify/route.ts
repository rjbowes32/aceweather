import { context, fail, keys, loadData, readJson, reply, sessionCookie } from "@/lib/account/server";
import { accountId, CODE_ATTEMPTS, CODE_MINUTES, hashCode, normaliseEmail, sameHash } from "@/lib/account/session";

export const dynamic = "force-dynamic";

/** Checks the code and starts a 30-day session. Five wrong tries spend the code. */
export async function POST(request: Request) {
  const ctx = context();
  if (!ctx) return fail(503, "Sign-in isn't available right now");
  const body = await readJson(request);
  const email = normaliseEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code.replace(/\s+/g, "") : "";
  if (!email || !/^\d{6}$/.test(code)) return fail(400, "Enter the six-digit code");
  const uid = accountId(email);
  try {
    const expected = await ctx.store.get(keys.code(uid));
    if (!expected) return fail(400, "That code has expired. Ask for a new one");
    if ((await ctx.store.incr(keys.tries(uid), CODE_MINUTES * 60)) > CODE_ATTEMPTS) {
      await ctx.store.del(keys.code(uid));
      return fail(400, "Too many tries. Ask for a new code");
    }
    if (!sameHash(expected, hashCode(ctx.secret, email, code))) return fail(400, "That code isn't right");
    await ctx.store.del(keys.code(uid));
    await ctx.store.del(keys.tries(uid));
    if (!(await ctx.store.get(keys.user(uid)))) {
      await ctx.store.set(keys.user(uid), JSON.stringify({ email, createdAt: new Date().toISOString() }));
    }
    const data = await loadData(ctx, uid);
    return reply({ email, data }, 200, { "set-cookie": sessionCookie(ctx, uid, email) });
  } catch (error) {
    console.error("[account] verify", error);
    return fail(502, "Couldn't sign in. Try again");
  }
}
