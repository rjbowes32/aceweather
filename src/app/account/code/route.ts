import { context, fail, ipKey, keys, readJson, reply } from "@/lib/account/server";
import { sendCode } from "@/lib/account/mail";
import { accountId, CODE_MINUTES, hashCode, newCode, normaliseEmail } from "@/lib/account/session";

export const dynamic = "force-dynamic";

const HOUR = 3600;

/** Emails a six-digit sign-in code. Signing in with a new address creates the account. */
export async function POST(request: Request) {
  const ctx = context();
  if (!ctx) return fail(503, "Sign-in isn't available right now");
  const body = await readJson(request);
  const email = normaliseEmail(body?.email);
  if (!email) return fail(400, "Enter a valid email address");
  const uid = accountId(email);
  try {
    if ((await ctx.store.incr(keys.sendsIp(ipKey(request)), HOUR)) > 20) return fail(429, "Too many codes asked for. Try again later");
    if ((await ctx.store.incr(keys.sendsEmail(uid), HOUR)) > 5) return fail(429, "Too many codes sent to this address. Try again in an hour");
    const code = newCode();
    await ctx.store.set(keys.code(uid), hashCode(ctx.secret, email, code), CODE_MINUTES * 60);
    await ctx.store.del(keys.tries(uid));
    await sendCode(email, code);
  } catch (error) {
    console.error("[account] code", error);
    return fail(502, "Couldn't send the code. Try again");
  }
  return reply({ ok: true });
}
