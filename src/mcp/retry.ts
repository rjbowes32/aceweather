/** Retry policy for the daily learning job's downloads (see BUG-LOG L-21 and L-24). */
export const RETRY = { attempts: 5, baseMs: 5_000, maxMs: 40_000, jitterMs: 1_000 };

/** Wait before retry number `attempt` (1-based): 5, 10, 20, 40, 40 s, plus up to 1 s of jitter. */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  return Math.min(RETRY.maxMs, RETRY.baseMs * 2 ** (attempt - 1)) + Math.floor(random() * RETRY.jitterMs);
}

/** Whether a response is worth retrying: network errors, 429, 5xx, or a 200 whose body failed validation. */
export function shouldRetry(status: number | null, bodyValid: boolean): boolean {
  if (status == null) return true;
  if (status === 429 || status >= 500) return true;
  return status >= 200 && status < 300 && !bodyValid;
}
