#!/usr/bin/env node
// Builds the static web bundle (out/) for the Capacitor native shell.
//
// Next.js `output: "export"` cannot include server-only pieces, so this script
// temporarily stashes them, runs the export build with CAPACITOR_BUILD=1, and
// restores them afterwards (even on failure):
//   - middleware.ts                  (apex→www redirect; server-only)
//   - src/app/version                (force-dynamic route)
//   - src/app/service-worker.js      (SW served from a route; not used natively)
//   - src/app/share                  (PWA share-target; server-rendered)
//
// Usage: npm run build:capacitor

import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stashDir = path.join(root, ".capacitor-stash");

const SERVER_ONLY = [
  "middleware.ts",
  "src/app/version",
  "src/app/service-worker.js",
  "src/app/share",
];

const stashed = [];

function stash() {
  mkdirSync(stashDir, { recursive: true });
  for (const rel of SERVER_ONLY) {
    const from = path.join(root, rel);
    if (!existsSync(from)) continue;
    const to = path.join(stashDir, rel.replaceAll("/", "__"));
    renameSync(from, to);
    stashed.push([to, from]);
  }
}

function restore() {
  for (const [from, to] of stashed) {
    renameSync(from, to);
  }
  stashed.length = 0;
  rmSync(stashDir, { recursive: true, force: true });
}

stash();
let status = 1;
try {
  const result = spawnSync("npx", ["next", "build"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      CAPACITOR_BUILD: "1",
      NEXT_PUBLIC_ACEWEATHER_API_BASE:
        process.env.NEXT_PUBLIC_ACEWEATHER_API_BASE || "https://www.aceweather.app",
    },
  });
  status = result.status ?? 1;
} finally {
  restore();
}

if (status === 0) {
  console.log("\nCapacitor web bundle ready in out/ — next: npx cap sync ios");
}
process.exit(status);
