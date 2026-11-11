import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

// The golden screens, frozen as pictures at phone and desktop width.
// A change to how one looks fails here until Rob has seen it and the pictures
// are re-taken (npm run test:visual:update).
//
// Everything that moves is pinned: the clock, the network (Open-Meteo and
// postcodes.io answers are replayed from recordings/, the learned forecast is
// left out so Open-Meteo's values show, anything else off the dev server is
// blocked), location permission and animation.

const here = path.dirname(fileURLToPath(import.meta.url));
const NOW = new Date("2026-11-11T10:00:00Z");
const RECORD = process.env.VISUAL_RECORD === "1";
const WEATHER_HOSTS = /^https:\/\/[\w.-]*(?:open-meteo\.com|postcodes\.io)\//;

async function pin(page, recording, theme) {
  await page.clock.setFixedTime(NOW);
  await page.addInitScript((value) => {
    try { localStorage.setItem("awx-theme", value); } catch { /* */ }
  }, theme);
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/learned-forecast")) return route.abort();
    const local = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    return local || (RECORD && WEATHER_HOSTS.test(url.href)) ? route.fallback() : route.abort();
  });
  await page.routeFromHAR(path.join(here, "recordings", `${recording}.har`), {
    url: WEATHER_HOSTS, update: RECORD, updateContent: "embed", updateMode: "minimal", notFound: "abort",
  });
}

async function settle(page) {
  // The dev server can still be compiling on the first visit, so allow it time.
  await expect(page.locator(".awx-feed")).toBeVisible({ timeout: 45_000 });
  // The forecast has landed once the status reads Live.
  await expect(page.locator(".awx-status:visible", { hasText: /^Live$/ }).first()).toBeVisible({ timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200); // replayed answers land over a few frames; let the last chart draw
}

const SCREENS = [
  { name: "overview", view: "all", themes: ["dark", "light"] },
  { name: "now", view: "now", themes: ["dark"] },
  { name: "rain", view: "rain", themes: ["dark"] },
  { name: "outlook", view: "outlook", themes: ["dark"] },
  { name: "field", view: "field", themes: ["dark"] },
];

for (const screen of SCREENS) {
  for (const theme of screen.themes) {
    test(`${screen.name} (${theme}) matches its golden picture`, async ({ page }) => {
      await pin(page, "weather", theme);
      await page.goto(screen.view === "all" ? "/" : `/?focus=${screen.view}`);
      await settle(page);
      await expect(page).toHaveScreenshot(`${screen.name}-${theme}.png`, { fullPage: true, mask: [page.locator("canvas, .maplibregl-map")], maskColor: "#808080" });
    });
  }
}
