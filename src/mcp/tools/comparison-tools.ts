import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { comparisonDataSchema, loadComparison } from "../comparison.ts";
import { locationInput } from "../locations.ts";
import { readTool } from "./define.ts";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reportInput = {
  report_date: date.optional().describe("Newsletter/report date, YYYY-MM-DD. Defaults to today in the location timezone; history ends the previous day."),
  history_days: z.number().int().min(1).max(31).optional().describe("Previous complete calendar days (default 14)."),
};
export function registerComparisonTools(server: McpServer): string[] {
  return [
    readTool(server, "get_historical_comparison", {
      title: "Compare historical weather with previous years",
      description: "Use this for rainfall and air/soil temperature anomalies against equivalent calendar dates in the previous ten years, for a location or saved group. Explicit ERA5 reanalysis throughout; missing dates and incomplete baseline years are reported, full-period anomalies withheld when incomplete. Structured location/regional comparisons and newsletter rows.",
      input: { ...locationInput, group: z.string().regex(/^[a-z0-9-]+$/).optional().describe("Saved group instead of a single location."), ...reportInput, start_date: date.optional(), end_date: date.optional(), baseline_years: z.number().int().min(1).max(10).default(10) },
      data: comparisonDataSchema,
    }, loadComparison),
    readTool(server, "get_crop_notes_weather", {
      title: "Prepare Crop Dynamics Crop Notes weather tables",
      description: "Use this to prepare the weather section for Crop Dynamics Crop Notes dated a specified report_date. Compares the previous 14 complete days with equivalent dates over the previous ten years for Scotch Corner, Boroughbridge, Pocklington, Alford/East Lindsey, Sleaford, Longhirst and Berwick-upon-Tweed. Returns rainfall totals, maximum/minimum/mean 2 m air temperatures, mean 0–7 cm soil temperatures, regional and individual baselines/anomalies, missing data and structured newsletter rows. ERA5 only, with no forecast substitution.",
      input: reportInput, data: comparisonDataSchema,
    }, (args) => loadComparison({ ...args, group: "cropdynamics", baseline_years: 10 })),
  ];
}
