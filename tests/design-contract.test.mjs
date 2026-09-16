import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
test("shared styles load after legacy CSS", () => {
  const layout = read("src/app/layout.tsx");
  const files = ["aceweather-x.css", "aceweather-x-cards.css", "typography.css", "design-tokens.css", "shared-surfaces.css"];
  files.forEach((file, i) => { assert.ok(layout.includes(file)); if (i) assert.ok(layout.indexOf(file) > layout.indexOf(files[i - 1])); });
});
test("shared card heading matches the real Card markup", () => {
  assert.match(read("src/components/aceweather-x/ui.tsx"), /className="awx-kicker"/);
  assert.match(read("src/app/shared-surfaces.css"), /\.awx-card-head \.awx-kicker/);
});
test("Outlook remains in primary mobile navigation", () => {
  const nav = read("src/components/aceweather-x/app.tsx").split("const MOBILE_NAV:")[1].split(";")[0];
  assert.match(nav, /\["outlook", "Outlook"\]/);
});
test("site font aliases and Atlas surfaces share tokens", () => {
  assert.match(read("src/app/typography.css"), /--awx-font-ui: var\(--site-font\)/);
  assert.match(read("src/app/atlas/atlas.module.css"), /border-radius: var\(--awx-radius\)/);
  assert.match(read("src/app/atlas/atlas.module.css"), /background: var\(--awx-surface\)/);
});

test("mobile density preserves tap targets and navigation clearance", () => {
  const tokens = read("src/app/design-tokens.css");
  assert.match(tokens, /--awx-control-height: 44px/);
  assert.match(tokens, /--awx-card-padding: 14px/);
  const shared = read("src/app/shared-surfaces.css");
  assert.match(shared, /\.awx \{ box-sizing: border-box; \}/);
  assert.match(read("src/app/aceweather-x.css"), /padding-bottom: calc\(98px \+ env\(safe-area-inset-bottom\)\)/);
});
