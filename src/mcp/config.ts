export const SERVER_NAME = "aceweather";
export const SERVER_VERSION = "0.3.0";

export const LIMITS = {
  earliestDate: "1940-01-01",
  maxHistoryDays: 730,
  maxDailyRows: 366,
  maxHourlyRows: 168,
  maxForecastDays: 14,
  maxModelDays: 7,
  maxLocations: 12,
  locationConcurrency: 4,
  maxBodyBytes: 64 * 1024,
  maxToolInputElements: 200,
  upstreamTimeoutMs: 10_000,
};

function intEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const rateLimitPerMinute = () => intEnv("ACEWEATHER_MCP_RATE_LIMIT_PER_MIN", 60);

/** Where the AceWeather Python API (/api/*) lives for this deployment. */
export function apiBase(): string {
  const env = process.env;
  const base = env.ACEWEATHER_API_BASE
    || (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
    || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "")
    || env.ACEWEATHER_API_PROXY_TARGET
    || "http://127.0.0.1:8000";
  return base.replace(/\/+$/, "");
}

export function apiHeaders(): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return secret ? { "x-vercel-protection-bypass": secret } : {};
}
