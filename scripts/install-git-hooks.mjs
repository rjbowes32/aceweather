#!/usr/bin/env node

// Points git at the repo's own hooks (.githooks/). Run by `npm install` (the
// `prepare` script). Silent where there is no git checkout (a Vercel build)
// and leaves an existing core.hooksPath alone.

import { execFileSync } from "node:child_process";

try {
  const current = execFileSync("git", ["config", "--get", "core.hooksPath"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (current === ".githooks") process.exit(0);
  if (current) {
    console.log(`git hooks: core.hooksPath is already "${current}"; left alone. The design pre-commit hook is in .githooks/.`);
    process.exit(0);
  }
} catch {
  // not set, or no git here: fall through
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "ignore" });
  console.log("git hooks: design pre-commit hook switched on (.githooks/pre-commit).");
} catch {
  // no git checkout; nothing to do
}
