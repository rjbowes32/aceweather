import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authorize, clientKey } from "./auth.ts";
import { LIMITS } from "./config.ts";
import { logEvent } from "./log.ts";
import { rateLimit } from "./rate-limit.ts";
import { buildServer } from "./server.ts";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
  "access-control-max-age": "86400",
};

function rpcError(status: number, code: number, message: string, headers: Record<string, string> = {}): Response {
  return Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status, headers: { ...CORS, "cache-control": "no-store", ...headers } });
}

function describeRpc(body: unknown): string[] {
  return (Array.isArray(body) ? body : [body]).map((message: any) =>
    message?.method === "tools/call" ? `tools/call:${message?.params?.name}` : String(message?.method ?? "response"));
}

/** Stateless Streamable HTTP endpoint: every POST gets a fresh server and a JSON response. */
export async function handleMcpRequest(request: Request): Promise<Response> {
  const started = Date.now();
  const client = clientKey(request);
  const log = (status: number, extra: Record<string, unknown> = {}) =>
    logEvent("http_request", { method: request.method, status, client, ms: Date.now() - started, ...extra });

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") {
    log(405);
    return rpcError(405, -32000, "Method not allowed. This server is stateless: send JSON-RPC with POST.", { allow: "POST, OPTIONS" });
  }
  const access = authorize(request);
  if (!access.ok) {
    log(401);
    return rpcError(401, -32001, "Unauthorized. Send Authorization: Bearer <token>.", { "www-authenticate": 'Bearer realm="aceweather-mcp"' });
  }
  const limit = rateLimit(`${access.client}:${client}`);
  if (!limit.ok) {
    log(429);
    return rpcError(429, -32002, `Rate limit exceeded. Retry in ${limit.retryAfterSeconds} s.`, { "retry-after": String(limit.retryAfterSeconds) });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > LIMITS.maxBodyBytes) {
    log(413);
    return rpcError(413, -32600, `Request body exceeds ${LIMITS.maxBodyBytes} bytes.`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    log(400);
    return rpcError(400, -32700, "Parse error: body must be JSON-RPC 2.0.");
  }

  const { server } = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, {
      parsedBody: body,
      authInfo: { token: access.client, clientId: access.client, scopes: access.scopes },
    });
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
    headers.set("cache-control", "no-store");
    log(response.status, { rpc: describeRpc(body) });
    return new Response(await response.text(), { status: response.status, headers });
  } catch (error) {
    log(500, { rpc: describeRpc(body), detail: error instanceof Error ? error.message.slice(0, 200) : String(error) });
    return rpcError(500, -32603, "Internal server error.");
  } finally {
    await server.close();
  }
}
