import { MAX_DATA_BYTES, parseAccountData } from "@/lib/account/data";
import { clearCookie, context, fail, hasSessionCookie, keys, loadData, readJson, reply, sessionOf } from "@/lib/account/server";

export const dynamic = "force-dynamic";

/** Who is signed in and their synced places and settings. `enabled` is false when accounts aren't set up here. */
export async function GET(request: Request) {
  const ctx = context();
  if (!ctx) return reply({ enabled: false, email: null });
  try {
    const session = await sessionOf(request, ctx);
    // A cookie that no longer works (expired, or its account was deleted) is cleared.
    if (!session) return reply({ enabled: true, email: null }, 200, hasSessionCookie(request) ? { "set-cookie": clearCookie() } : {});
    return reply({ enabled: true, email: session.email, data: await loadData(ctx, session.uid) });
  } catch (error) {
    console.error("[account] load", error);
    return fail(502, "Couldn't load your account");
  }
}

/** Replaces the synced places and settings. */
export async function PUT(request: Request) {
  const ctx = context();
  if (!ctx) return fail(503, "Sign-in isn't available right now");
  const session = await sessionOf(request, ctx).catch(() => null);
  if (!session) return fail(401, "Signed out");
  const body = await readJson(request);
  if (!body) return fail(400, "Bad request");
  const data = { ...parseAccountData(body), updatedAt: new Date().toISOString() };
  const json = JSON.stringify(data);
  if (json.length > MAX_DATA_BYTES) return fail(413, "Too much to save");
  try {
    await ctx.store.set(keys.data(session.uid), json);
    return reply({ ok: true, updatedAt: data.updatedAt });
  } catch (error) {
    console.error("[account] save", error);
    return fail(502, "Couldn't save");
  }
}

/** Deletes the account and everything synced to it, and signs out. */
export async function DELETE(request: Request) {
  const ctx = context();
  if (!ctx) return fail(503, "Sign-in isn't available right now");
  const session = await sessionOf(request, ctx).catch(() => null);
  if (!session) return fail(401, "Signed out");
  if (!(await readJson(request))) return fail(400, "Bad request");
  try {
    await ctx.store.del(keys.data(session.uid));
    await ctx.store.del(keys.user(session.uid));
    return reply({ ok: true }, 200, { "set-cookie": clearCookie() });
  } catch (error) {
    console.error("[account] delete", error);
    return fail(502, "Couldn't delete the account");
  }
}
