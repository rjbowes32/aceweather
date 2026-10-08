import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LIMITS, SERVER_NAME, SERVER_VERSION } from "./config.ts";
import { registerForecastTools } from "./tools/forecast-tools.ts";
import { registerLocationTools } from "./tools/location-tools.ts";
import { registerModelTools } from "./tools/model-tools.ts";
import { registerObservedTools } from "./tools/observed-tools.ts";
import { registerRegionalTool } from "./tools/regional-tool.ts";

const INSTRUCTIONS = `AceWeather weather intelligence (read-only). Every result carries location, period, units, sources, a classification (model_current, model_recent, forecast, reanalysis, calculated, reference or mixed), completeness and warnings.
- Say whether figures are modelled, forecast or reanalysis; none are station or farm gauge readings.
- Repeat location warnings to the user; ambiguous place names are flagged, never silently swapped.
- Historical daily data ends yesterday and goes back to 1940; forecasts run 14 days; model comparison 7 days.
- Use search_locations or get_saved_location_groups when a place is unclear.`;

export function buildServer(): { server: McpServer; tools: string[] } {
  const server = new McpServer(
    { name: SERVER_NAME, title: "AceWeather", version: SERVER_VERSION },
    { instructions: INSTRUCTIONS, maxToolInputElements: LIMITS.maxToolInputElements },
  );
  const tools = [
    ...registerLocationTools(server),
    ...registerRegionalTool(server),
    ...registerObservedTools(server),
    ...registerForecastTools(server),
    ...registerModelTools(server),
  ];
  return { server, tools };
}
