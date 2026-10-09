// Official SDK verification + JSON artifact for newsletter authoring.
// Usage: node scripts/mcp-crop-notes.mjs <mcp-url> <report-date> [output.json]
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const [url = "http://127.0.0.1:3000/mcp", report_date = "2026-10-09", output] = process.argv.slice(2);
const client = new Client({ name: "aceweather-crop-notes-check", version: "1.0.0" });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));
  const { tools } = await client.listTools();
  assert.ok(tools.some((t) => t.name === "get_crop_notes_weather"), "Crop Notes tool must be discoverable");
  const started = Date.now();
  const result = await client.callTool({ name: "get_crop_notes_weather", arguments: { report_date } });
  assert.ok(!result.isError, result.content?.[0]?.text);
  const data = result.structuredContent;
  assert.equal(data.data.locations.length, 7);
  assert.equal(data.data.baseline_years.length, 10);
  assert.equal(data.data.newsletter_rows.length, 40);
  assert.equal(data.data.model, "era5");
  assert.deepEqual(data.data.soil_depth_cm, [0, 7]);
  console.log(JSON.stringify({ server: client.getServerVersion(), elapsed_ms: Date.now() - started, tools: tools.length, summary: data.summary, completeness: data.completeness, regional: data.data.regional.comparison, warnings: data.warnings }, null, 2));
  // Exercise the generic comparison through the same discovered schemas.
  const single = await client.callTool({ name: "get_historical_comparison", arguments: { saved_location: "cropdynamics/pocklington", report_date } });
  assert.ok(!single.isError, single.content?.[0]?.text);
  assert.equal(single.structuredContent.data.locations.length, 1);
  if (output) await writeFile(output, `${JSON.stringify(data, null, 2)}\n`);
} finally { await client.close(); }
