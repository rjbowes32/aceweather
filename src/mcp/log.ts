export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  if (process.env.ACEWEATHER_MCP_LOG === "off") return;
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: "aceweather-mcp", event, ...fields }));
}
