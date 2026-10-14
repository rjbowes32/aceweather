import assert from "node:assert/strict";
import test from "node:test";
import { RETRY, retryDelayMs, shouldRetry } from "../../src/mcp/retry.ts";
import { inUk } from "../../src/mcp/observations.ts";

test("retries wait longer each time, capped at 40 s, with jitter (L-21)", () => {
  const noJitter = () => 0;
  assert.deepEqual([1, 2, 3, 4, 5].map((a) => retryDelayMs(a, noJitter)), [5000, 10000, 20000, 40000, 40000]);
  assert.equal(retryDelayMs(1, () => 0.999), 5999);
  assert.equal(RETRY.attempts, 5);
});

test("network errors, throttling, server errors and bad 200 bodies are retried; client errors are not (L-24)", () => {
  assert.equal(shouldRetry(null, false), true, "network error");
  assert.equal(shouldRetry(429, false), true);
  assert.equal(shouldRetry(503, false), true);
  assert.equal(shouldRetry(200, false), true, "Open-Meteo's 200 with an error message as the body");
  assert.equal(shouldRetry(200, true), false);
  assert.equal(shouldRetry(400, false), false);
  assert.equal(shouldRetry(403, false), false);
});

test("the learning area excludes the Channel Islands but keeps Scilly and the Isle of Man (L-22)", () => {
  assert.equal(inUk({ latitude: 49.2096, longitude: -2.1943 }, 0), false, "Jersey airport");
  assert.equal(inUk({ latitude: 49.4348, longitude: -2.6020 }, 0), false, "Guernsey airport");
  assert.equal(inUk({ latitude: 49.9133, longitude: -6.2916 }, 0), true, "St Mary's, Isles of Scilly");
  assert.equal(inUk({ latitude: 54.0833, longitude: -4.6333 }, 0), true, "Isle of Man");
  assert.equal(inUk({ latitude: 60.1500, longitude: -1.1500 }, 0), true, "Lerwick");
});
