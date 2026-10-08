import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { envelopeSchema, type Envelope } from "../envelope.ts";
import { ToolError } from "../errors.ts";
import { logEvent } from "../log.ts";
import { DAILY_PERIODS, PERIODS } from "../periods.ts";
import { WIND_UNITS } from "../units.ts";

export const windUnitInput = z.enum(WIND_UNITS).default("kmh").describe("Wind speed unit: kmh, mph, ms or kn.");
export const detailInput = z.enum(["compact", "full"]).default("compact")
  .describe("compact for everyday answers; full for technical analysis (more fields and rows).");

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const periodFields = <P extends readonly [string, ...string[]]>(periods: P) => ({
  period: z.enum(periods).optional()
    .describe("Named window, evaluated in the location's timezone. Daily periods end yesterday. Defaults to last_7d, or custom when dates are given."),
  start_date: isoDay.optional().describe("YYYY-MM-DD, for period=custom (from 1940-01-01)."),
  end_date: isoDay.optional().describe("YYYY-MM-DD, for period=custom."),
  year: z.number().int().min(1940).max(2100).optional().describe("For calendar_year (that year) or agricultural_year (the year it starts)."),
  years_ago: z.number().int().min(1).max(86).optional().describe("Move the whole window back N years: the equivalent period in a previous year."),
  agricultural_year_start_month: z.number().int().min(1).max(12).optional().describe("Month the agricultural year starts. Default 9 (September)."),
});

export const periodInput = periodFields(PERIODS);
export const dailyPeriodInput = periodFields(DAILY_PERIODS);

type Config<S extends z.ZodRawShape> = { title: string; description: string; input: S; data: z.ZodType };

/** Registers a read-only tool that returns the standard AceWeather envelope as structured JSON. */
export function readTool<S extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  config: Config<S>,
  run: (args: z.infer<z.ZodObject<S>>) => Promise<Envelope>,
): string {
  server.registerTool(name, {
    title: config.title,
    description: config.description,
    inputSchema: config.input,
    outputSchema: envelopeSchema(config.data),
    annotations: { title: config.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (async (args: z.infer<z.ZodObject<S>>) => {
    const started = Date.now();
    try {
      const envelope = { tool: name, generated_at: new Date().toISOString(), ...(await run(args)) };
      logEvent("tool_call", { tool: name, ok: true, ms: Date.now() - started });
      return { structuredContent: envelope, content: [{ type: "text", text: JSON.stringify(envelope) }] };
    } catch (error) {
      const known = error instanceof ToolError ? error : new ToolError("internal_error", "Unexpected server error.");
      logEvent("tool_call", { tool: name, ok: false, code: known.code, ms: Date.now() - started, detail: error instanceof Error ? error.message.slice(0, 200) : String(error) });
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code: known.code, message: known.message } }) }] };
    }
  }) as any);
  return name;
}
