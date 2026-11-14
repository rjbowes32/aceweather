import { clearCookie, reply } from "@/lib/account/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return reply({ ok: true }, 200, { "set-cookie": clearCookie() });
}
