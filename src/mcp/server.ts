import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LIMITS, SERVER_NAME, SERVER_VERSION } from "./config.ts";
import { registerForecastTools } from "./tools/forecast-tools.ts";
import { registerLocationTools } from "./tools/location-tools.ts";
import { registerModelTools } from "./tools/model-tools.ts";
import { registerObservedTools } from "./tools/observed-tools.ts";
import { registerRegionalTool } from "./tools/regional-tool.ts";
import { registerComparisonTools } from "./tools/comparison-tools.ts";
import { registerVerificationTool } from "./tools/verification-tool.ts";
import { registerLearnedTool } from "./tools/learned-tool.ts";

const INSTRUCTIONS = `AceWeather weather intelligence (read-only). Every result carries location, period, units, sources, a classification (observation, model_current, model_recent, forecast, reanalysis, calculated, reference or mixed), completeness and warnings.
- Say whether figures are observed, modelled, forecast or reanalysis. Only get_current_weather (data.observed) and get_nearby_observations carry real station readings; everything else is modelled.
- When get_current_weather returns preferred = "observation", quote the station value and name the station and its distance; the model value is for comparison.
- For the most accurate UK forecast use get_learned_forecast (models blended by their recent accuracy at nearby stations); say it is the learned forecast and quote the standard forecast only for comparison.
- To say which model to trust at a location, use get_forecast_verification (scores against real stations); name the reference stations, the window and any ties.
- Repeat location warnings to the user; ambiguous place names are flagged, never silently swapped.
- Historical daily data ends yesterday and goes back to 1940; forecasts run 14 days; model comparison 7 days.
- Use search_locations or get_saved_location_groups when a place is unclear.
- For equivalent-date historical baselines use get_historical_comparison; for Crop Dynamics newsletters use get_crop_notes_weather with the newsletter report_date.
- Comparisons use ERA5 only. Never present partial totals as a complete period or invent anomalies when reanalysis days are missing.`;

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
    ...registerVerificationTool(server),
    ...registerLearnedTool(server),
    ...registerComparisonTools(server),
  ];
  return { server, tools };
}
