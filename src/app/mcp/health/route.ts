import { apiBase, apiHeaders, SERVER_NAME, SERVER_VERSION } from "@/mcp/config.ts";
import { buildServer } from "@/mcp/server.ts";

export const dynamic = "force-dynamic";

async function checkApi(): Promise<"ok" | "unreachable"> {
  try {
    const response = await fetch(`${apiBase()}/api/providers`, { headers: apiHeaders(), signal: AbortSignal.timeout(5000) });
    return response.ok ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}

export async function GET(request: Request): Promise<Response> {
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  const body = {
    status: "ok",
    server: SERVER_NAME,
    version: SERVER_VERSION,
    transport: "streamable-http (stateless, JSON responses)",
    endpoint: "/mcp",
    auth: process.env.ACEWEATHER_MCP_TOKEN ? "bearer" : "public",
    tools: buildServer().tools,
    time: new Date().toISOString(),
    ...(deep ? { checks: { aceweather_api: await checkApi() } } : {}),
  };
  const degraded = deep && body.checks?.aceweather_api !== "ok";
  return Response.json(degraded ? { ...body, status: "degraded" } : body, { status: degraded ? 503 : 200, headers: { "cache-control": "no-store" } });
}
