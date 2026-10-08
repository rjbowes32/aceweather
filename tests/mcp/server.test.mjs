import assert from "node:assert/strict";
import test from "node:test";
import { callTool, installFetch, rpc } from "./fixtures.mjs";
import { handleMcpRequest } from "../../src/mcp/http.ts";
import { rateLimit } from "../../src/mcp/rate-limit.ts";

const EXPECTED_TOOLS = [
  "search_locations", "get_saved_location_groups", "get_location_weather", "get_regional_weather",
  "get_current_weather", "get_weather_history", "get_weather_digest",
  "get_hourly_forecast", "get_daily_forecast", "get_extended_forecast", "compare_forecast_models", "get_forecast_confidence",
];

test("initialize advertises tools and usage instructions", async () => {
  installFetch();
  const { status, body } = await rpc(handleMcpRequest, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  assert.equal(status, 200);
  assert.equal(body.result.serverInfo.name, "aceweather");
  assert.ok(body.result.capabilities.tools);
  assert.match(body.result.instructions, /never silently swapped/);
});

test("tools/list exposes every Phase 2 tool as read-only with input and output schemas", async () => {
  installFetch();
  const { body } = await rpc(handleMcpRequest, "tools/list");
  const tools = body.result.tools;
  assert.deepEqual(tools.map((t) => t.name), EXPECTED_TOOLS);
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true, tool.name);
    assert.equal(tool.annotations.destructiveHint, false, tool.name);
    assert.equal(tool.inputSchema.type, "object", tool.name);
    assert.equal(tool.outputSchema.type, "object", tool.name);
    assert.ok(tool.outputSchema.required.includes("classification"), tool.name);
  }
});

test("no farm or field data tool is exposed", async () => {
  installFetch();
  const { body } = await rpc(handleMcpRequest, "tools/list");
  assert.equal(body.result.tools.some((t) => /farm|field/.test(t.name)), false);
  const missing = await callTool(handleMcpRequest, "get_field_weather", { field_id: "abc" });
  assert.equal(missing.result.isError, true);
});

test("input validation rejects bad coordinates, oversized requests and mixed location modes", async () => {
  installFetch();
  const cases = [
    ["get_current_weather", { latitude: 120, longitude: 0 }, /latitude/i],
    ["get_hourly_forecast", { place: "Pocklington", hours: 500 }, /hours/i],
    ["get_daily_forecast", { place: "Pocklington", days: 30 }, /days/i],
    ["get_weather_history", { place: "Pocklington", period: "last_decade" }, /period/i],
    ["get_weather_history", { place: "Pocklington", start_date: "2026/01/01", end_date: "2026-01-02" }, /start_date/i],
    ["search_locations", { query: "x" }, /query/i],
    ["get_current_weather", { saved_location: "../etc" }, /saved_location/i],
  ];
  for (const [name, args, pattern] of cases) {
    const { result } = await callTool(handleMcpRequest, name, args);
    assert.equal(result.isError, true, name);
    assert.match(result.content[0].text, pattern, name);
  }
  const mixed = await callTool(handleMcpRequest, "get_current_weather", { place: "Pocklington", latitude: 53, longitude: -1 });
  assert.equal(mixed.error.error.code, "invalid_input");
  const half = await callTool(handleMcpRequest, "get_current_weather", { latitude: 53 });
  assert.match(half.error.error.message, /together/);
  const tz = await callTool(handleMcpRequest, "get_current_weather", { place: "Pocklington", timezone: "Mars/Olympus" });
  assert.match(tz.error.error.message, /Unknown timezone/);
});

test("abusive date ranges are refused before any archive call", async () => {
  const calls = installFetch();
  const { error } = await callTool(handleMcpRequest, "get_weather_history", { latitude: 53.9, longitude: -0.78, timezone: "Europe/London", start_date: "1990-01-01", end_date: "2020-12-31" });
  assert.equal(error.error.code, "invalid_input");
  assert.equal(calls.some((url) => url.host === "archive-api.open-meteo.com"), false);
});

test("an optional bearer token locks the endpoint", async () => {
  installFetch();
  process.env.ACEWEATHER_MCP_TOKEN = "s3cret-token";
  try {
    const anonymous = await rpc(handleMcpRequest, "tools/list");
    assert.equal(anonymous.status, 401);
    assert.match(anonymous.headers.get("www-authenticate"), /Bearer/);
    const wrong = await rpc(handleMcpRequest, "tools/list", {}, { authorization: "Bearer nope" });
    assert.equal(wrong.status, 401);
    const right = await rpc(handleMcpRequest, "tools/list", {}, { authorization: "Bearer s3cret-token" });
    assert.equal(right.status, 200);
  } finally {
    delete process.env.ACEWEATHER_MCP_TOKEN;
  }
});

test("HTTP surface: CORS preflight, GET refused, bad JSON and oversized bodies", async () => {
  installFetch();
  const preflight = await handleMcpRequest(new Request("http://localhost/mcp", { method: "OPTIONS" }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
  const get = await handleMcpRequest(new Request("http://localhost/mcp"));
  assert.equal(get.status, 405);
  const post = (body) => handleMcpRequest(new Request("http://localhost/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body }));
  assert.equal((await post("{not json")).status, 400);
  assert.equal((await post(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(70_000) } }))).status, 413);
});

test("rate limiting returns 429 with Retry-After once a client exceeds its budget", async () => {
  installFetch();
  process.env.ACEWEATHER_MCP_RATE_LIMIT_PER_MIN = "3";
  try {
    const headers = { "x-forwarded-for": "203.0.113.9" };
    for (let i = 0; i < 3; i++) assert.equal((await rpc(handleMcpRequest, "tools/list", {}, headers)).status, 200);
    const limited = await rpc(handleMcpRequest, "tools/list", {}, headers);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) >= 1);
    assert.equal((await rpc(handleMcpRequest, "tools/list", {}, { "x-forwarded-for": "198.51.100.1" })).status, 200);
  } finally {
    delete process.env.ACEWEATHER_MCP_RATE_LIMIT_PER_MIN;
  }
});

test("the sliding window frees capacity after a minute", () => {
  const t0 = 1_000_000;
  assert.equal(rateLimit("window-test", t0, 1).ok, true);
  assert.equal(rateLimit("window-test", t0 + 59_000, 1).ok, false);
  assert.equal(rateLimit("window-test", t0 + 60_001, 1).ok, true);
});
