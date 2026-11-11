import { defineConfig, devices } from "@playwright/test";

// Golden screenshots (docs/design-guardrails.md, guardrail 5).
// Pictures only compare on the machine that took them: fonts render differently elsewhere.
const PORT = 3210;

export default defineConfig({
  testDir: "e2e/visual",
  outputDir: "test-results/visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}-{projectName}{ext}",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"]],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled", caret: "hide" } },
  // localhost, not 127.0.0.1: Next's dev server treats the other as cross-origin and won't hydrate.
  use: { baseURL: `http://localhost:${PORT}`, colorScheme: "dark", reducedMotion: "reduce", timezoneId: "Europe/London", locale: "en-GB" },
  projects: [
    { name: "phone", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_TELEMETRY_DISABLED: "1" },
  },
});
