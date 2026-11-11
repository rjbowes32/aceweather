// Self-test for the design guard (docs/design-guardrails.md, guardrail 7).
// Every rule must fail on its breach and pass on the approved way, and the guard
// as a whole must fail when a breach is planted in a copy of the real tree.

import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BASELINE_FILE, RULES, checkComponentNotes, checkTokenParity, compareCounts, runGuard, scanCss, scanTs, tokenOverrides,
} from "../scripts/design-guard.mjs";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

// One breach and one approved form per rule. A rule missing here fails the last test.
const CSS_CASES = {
  rawColour: [".a { color: #ff0000; }", ".a { color: var(--awx-risk); border-color: var(--x, #fff); }"],
  offFont: [".a { font-family: Inter, sans-serif; }", ".a { font-family: inherit; }"],
  webFont: ["@font-face { font-family: X; src: url(x.woff2); }", ".a { font-weight: 500; }"],
  offFontSize: [".a { font-size: 14.5px; }", ".a { font-size: 15px; } .b { font-size: var(--awx-type-label); }"],
  offRadius: [".a { border-radius: 10px; }", ".a { border-radius: 12px; } .b { border-radius: var(--awx-radius); } .c { border-radius: 50%; }"],
  offWeight: [".a { font-weight: 650; }", ".a { font-weight: 600; }"],
  viewportHeight: [".a { min-height: 100vh; }", ".a { min-height: 100dvh; }"],
};
const TS_CASES = {
  rawColour: ['export const c = "#2f6cf0";', 'export const c = "var(--awx-accent)";'],
  offFont: ['export const s = { fontFamily: "Inter" };', 'export const s = { fontFamily: "inherit" };'],
  webFont: ['import { Inter } from "next/font/google";', 'import { useState } from "react";'],
  inlineStyle: ["export const A = () => <div style={{ height: 300 }} />;", "export const A = ({ h }: { h: number }) => <div style={{ width: `${h}%`, \"--awx-x\": h }} />;"],
  nativeDialog: ['export const go = () => window.confirm("Sure?");', "export const go = () => setOpen(true);"],
};

for (const [rule, [breach, approved]] of Object.entries(CSS_CASES)) {
  test(`CSS ${rule}: fails on the breach, passes the approved way`, () => {
    assert.ok((scanCss("src/app/x.css", breach)[rule] || 0) > 0, `${rule} missed: ${breach}`);
    assert.equal(scanCss("src/app/x.css", approved)[rule] || 0, 0, `${rule} flagged: ${approved}`);
  });
}

for (const [rule, [breach, approved]] of Object.entries(TS_CASES)) {
  test(`TSX ${rule}: fails on the breach, passes the approved way`, () => {
    assert.ok((scanTs("src/components/x.tsx", breach)[rule] || 0) > 0, `${rule} missed: ${breach}`);
    assert.equal(scanTs("src/components/x.tsx", approved)[rule] || 0, 0, `${rule} flagged: ${approved}`);
  });
}

test("raw colours are allowed in the token file only", () => {
  assert.equal(scanCss("src/app/design-tokens.css", ":root { --awx-bg: #0d1727; }").rawColour || 0, 0);
  assert.ok(scanCss("src/app/card-tidy.css", ":root { --awx-bg: #0d1727; }").rawColour > 0);
});

test("tokenOverride: a design token redefined outside the token file", () => {
  const tokens = new Set(["--awx-radius"]);
  assert.equal(tokenOverrides(".awx { --awx-radius: 12px; }", tokens), 1);
  assert.equal(tokenOverrides(".awx { --awx-cal-edge: transparent; }", tokens), 0);
});

test("token parity: design.md must equal design-tokens.css", () => {
  const spec = read("design.md");
  const tokens = read("src/app/design-tokens.css");
  assert.deepEqual(checkTokenParity(spec, tokens), []);
  const changed = tokens.replace("--awx-bg: #0d1727", "--awx-bg: #000000");
  assert.match(checkTokenParity(spec, changed).join("\n"), /--awx-bg default/);
  const added = tokens.replace(":root {", ":root {\n  --awx-new-thing: 3px;");
  assert.match(checkTokenParity(spec, added).join("\n"), /--awx-new-thing/);
});

test("component notes: a new component file without a row fails", () => {
  const doc = read("docs/design-components.md");
  assert.deepEqual(checkComponentNotes(["src/components/aceweather-x/ui.tsx"], doc), []);
  assert.equal(checkComponentNotes(["src/components/aceweather-x/toast.tsx"], doc).length, 1);
});

test("allowances: more than allowed fails, fewer asks for the baseline to come down, a new file has none", () => {
  const baseline = { "a.css": { rawColour: 2 } };
  assert.equal(compareCounts({ "a.css": { rawColour: 3 } }, baseline).errors.length, 1);
  assert.equal(compareCounts({ "a.css": { rawColour: 1 } }, baseline).stale.length, 1);
  assert.equal(compareCounts({ "b.css": { rawColour: 1 } }, baseline).errors.length, 1);
});

function treeCopy() {
  const dir = mkdtempSync(join(tmpdir(), "awx-design-guard-"));
  for (const path of ["src", "docs", "design.md", BASELINE_FILE]) cpSync(join(root, path), join(dir, path), { recursive: true });
  return dir;
}

test("the real tree passes, and a planted breach in a copy of it fails", () => {
  assert.deepEqual(runGuard(root).errors, [], "the guard should pass on the committed tree");
  const dir = treeCopy();
  try {
    writeFileSync(join(dir, "src/app/planted.css"), ".x { color: #123456; border-radius: 10px; }\n");
    writeFileSync(join(dir, "src/components/aceweather-x/planted.tsx"), "export const P = () => <div style={{ height: 3 }} />;\n");
    const errors = runGuard(dir).errors.join("\n");
    assert.match(errors, /planted\.css: rawColour/);
    assert.match(errors, /planted\.css: offRadius/);
    assert.match(errors, /planted\.tsx: inlineStyle/);
    assert.match(errors, /planted\.tsx is not in docs\/design-components\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--update never raises an allowance", () => {
  const dir = treeCopy();
  try {
    const before = readFileSync(join(dir, BASELINE_FILE), "utf8");
    writeFileSync(join(dir, "src/app/aceweather-x.css"), `${readFileSync(join(dir, "src/app/aceweather-x.css"), "utf8")}\n.x { color: #123456; }\n`);
    const result = runGuard(dir, { update: true });
    assert.ok(result.errors.some((line) => /only lowers/.test(line)));
    assert.equal(readFileSync(join(dir, BASELINE_FILE), "utf8"), before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every rule has a self-test case", () => {
  const covered = new Set([...Object.keys(CSS_CASES), ...Object.keys(TS_CASES), "tokenOverride", "unknownToken"]);
  for (const rule of Object.keys(RULES)) assert.ok(covered.has(rule), `${rule} has no breach in tests/design-guard.test.mjs`);
});

test("unknownToken: a var(--awx-…) nobody defines fails", () => {
  const dir = treeCopy();
  try {
    writeFileSync(join(dir, "src/app/ui-tidy.css"), `${readFileSync(join(dir, "src/app/ui-tidy.css"), "utf8")}\n.x { color: var(--awx-made-up); }\n`);
    assert.match(runGuard(dir).errors.join("\n"), /ui-tidy\.css: unknownToken/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
