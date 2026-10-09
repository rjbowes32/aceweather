import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleMcpRequest } from "../../src/mcp/http.ts";
import { installFetch, rpc } from "./fixtures.mjs";

test("official SDK performs full stateless handshake, discovery and schema-validated execution", async () => {
  installFetch();
  const traffic = [];
  const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
    fetch: async (url, init) => {
      const request = new Request(url, init);
      const response = await handleMcpRequest(request);
      traffic.push({ method: request.method, body: request.method === "POST" ? JSON.parse(init.body) : null, status: response.status, headers: response.headers, text: await response.clone().text() });
      return response;
    },
  });
  const client = new Client({ name: "integration-test", version: "1" });
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion().version, "0.3.0");
    assert.equal(transport.sessionId, undefined);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 14);
    for (const [name, args] of [
      ["get_saved_location_groups", {}],
      ["get_location_weather", { saved_location: "cropdynamics/pocklington" }],
      ["get_daily_forecast", { saved_location: "cropdynamics/pocklington" }],
      ["get_weather_history", { saved_location: "cropdynamics/pocklington", period: "last_14d" }],
      ["get_crop_notes_weather", { report_date: "2026-10-09" }],
      ["get_historical_comparison", { saved_location: "cropdynamics/pocklington", report_date: "2026-10-09" }],
    ]) {
      const result = await client.callTool({ name, arguments: args });
      assert.equal(result.isError, undefined, name);
      assert.equal(result.structuredContent.tool, name);
    }
    const notification = traffic.find((t) => t.body?.method === "notifications/initialized");
    assert.equal(notification.status, 202);
    assert.equal(notification.text, "");
    assert.equal(traffic.find((t) => t.method === "GET").status, 405);
    assert.ok(traffic.filter((t) => t.body?.id).every((t) => t.headers.get("content-type").startsWith("application/json")));
  } finally { await client.close(); }
});

test("protocol versions negotiate and invalid version headers are rejected", async () => {
  installFetch();
  for (const protocolVersion of ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"]) {
    const { body, status } = await rpc(handleMcpRequest, "initialize", { protocolVersion, capabilities: {}, clientInfo: { name: "test", version: "1" } });
    assert.equal(status, 200);
    assert.equal(body.result.protocolVersion, protocolVersion);
  }
  const { status } = await rpc(handleMcpRequest, "tools/list", {}, { "mcp-protocol-version": "invalid" });
  assert.equal(status, 400);
});
