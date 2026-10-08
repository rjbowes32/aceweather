import { LIMITS } from "./config.ts";
import { ToolError } from "./errors.ts";
import { logEvent } from "./log.ts";

class UpstreamHttpError extends Error {
  status: number;

  constructor(status: number, reason: string) {
    super(reason);
    this.status = status;
  }
}

function statusOf(error: unknown): number | null {
  if (error instanceof UpstreamHttpError) return error.status;
  const match = error instanceof Error ? /\b(\d{3})$/.exec(error.message) : null;
  return match ? Number(match[1]) : null;
}

function toToolError(label: string, error: unknown): ToolError {
  if (error instanceof ToolError) return error;
  const name = error instanceof Error ? error.name : "";
  const status = statusOf(error);
  logEvent("upstream_error", { upstream: label, status, name, reason: error instanceof Error ? error.message.slice(0, 200) : String(error) });
  if (name === "TimeoutError" || name === "AbortError") return new ToolError("upstream_timeout", `${label} did not respond in time. Try again shortly.`);
  if (status === 429) return new ToolError("upstream_rate_limited", `${label} request limit reached. Try again later.`);
  if (status === 404) return new ToolError("not_found", `${label} has no data for this request.`);
  if (status !== null && status >= 400 && status < 500) return new ToolError("upstream_unavailable", `${label} rejected the request.`);
  return new ToolError("upstream_unavailable", `${label} is temporarily unavailable.`);
}

/** Runs an upstream call with a timeout and maps every failure to a client-safe ToolError. */
export async function callUpstream<T>(label: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  try {
    return await run(AbortSignal.timeout(LIMITS.upstreamTimeoutMs));
  } catch (error) {
    throw toToolError(label, error);
  }
}

export function fetchJson(label: string, url: string, headers: Record<string, string> = {}): Promise<any> {
  return callUpstream(label, async (signal) => {
    const response = await fetch(url, { headers, signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new UpstreamHttpError(response.status, String(body?.reason ?? body?.message ?? response.statusText));
    return body;
  });
}
