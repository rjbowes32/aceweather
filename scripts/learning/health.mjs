// Health check after the daily learning job. Writes health.json and health.md next to fits.json.
// Usage: node scripts/learning/health.mjs [--out DIR]   (exit code is always 0; the workflow reads health.json,
// and publishes only when its `publish` is true)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BLOCKING_CHECKS, checkHealth, healthMarkdown } from "../../src/mcp/learning-health.ts";

const outIndex = process.argv.indexOf("--out");
const OUT = outIndex > 0 ? process.argv[outIndex + 1] : ".cache/learning";
const read = (name) => (existsSync(join(OUT, name)) ? JSON.parse(readFileSync(join(OUT, name), "utf8")) : null);
const fits = read("fits.json");
const history = read("scores.json") ?? [];
const run = read("run.json");
const runUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
const problems = checkHealth(fits, history, run);
const publish = !problems.some((p) => BLOCKING_CHECKS.includes(p.check));
writeFileSync(join(OUT, "health.json"), JSON.stringify({ date: new Date().toISOString(), ok: problems.length === 0, publish, problems }, null, 1));
writeFileSync(join(OUT, "health.md"), healthMarkdown(problems, fits, run, runUrl));
console.log(problems.length ? problems.map((p) => `${p.severity} ${p.check}: ${p.message}`).join("\n") : "All checks passed.");
