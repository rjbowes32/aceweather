// Live check of a deployed MCP endpoint with the official SDK client.
// Usage: node scripts/mcp-smoke.mjs https://aceweather.app/mcp [bearer-token]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const [url = "http://127.0.0.1:3000/mcp", token] = process.argv.slice(2);
const transport = new StreamableHTTPClientTransport(new URL(url), token ? { requestInit: { headers: { authorization: `Bearer ${token}` } } } : {});
const client = new Client({ name: "aceweather-smoke", version: "1.0.0" });

const CALLS = [
  ["search_locations", { query: "Pocklington" }],
  ["get_saved_location_groups", {}],
  ["get_current_weather", { place: "Pocklington" }],
  ["get_location_weather", { saved_location: "cropdynamics/sleaford" }],
  ["get_weather_history", { place: "Pocklington", period: "last_14d" }],
  ["get_weather_digest", { place: "Pocklington", period: "month_to_date", years_ago: 1 }],
  ["get_weather_history", { place: "Pocklington", period: "last_24h" }],
  ["get_regional_weather", { group: "cropdynamics", period: "last_7d", forecast_days: 3 }],
  ["get_hourly_forecast", { place: "Pocklington", hours: 12 }],
  ["get_daily_forecast", { place: "Pocklington", days: 7 }],
  ["get_extended_forecast", { place: "Pocklington" }],
  ["compare_forecast_models", { place: "Pocklington", days: 5 }],
  ["get_forecast_confidence", { place: "Pocklington", days: 5 }],
];

await client.connect(transport);
const { tools } = await client.listTools();
console.log(`connected to ${client.getServerVersion()?.name} ${client.getServerVersion()?.version}: ${tools.length} tools`);
let failures = 0;
for (const [name, args] of CALLS) {
  const started = Date.now();
  const result = await client.callTool({ name, arguments: args });
  const ms = Date.now() - started;
  if (result.isError) {
    failures++;
    console.log(`FAIL ${name} (${ms} ms): ${result.content?.[0]?.text}`);
  } else {
    const s = result.structuredContent;
    console.log(`ok   ${name} (${ms} ms) [${s.classification}] ${s.summary}${s.warnings.length ? `\n     warnings: ${s.warnings.join(" | ")}` : ""}`);
  }
}
await client.close();
process.exit(failures ? 1 : 0);
