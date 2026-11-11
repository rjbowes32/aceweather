#!/usr/bin/env node

// AceWeather design guard (docs/design-guardrails.md).
//
// The build refuses off-design styling, whether or not the author read design.md:
//   1. design.md's token table equals src/app/design-tokens.css (spec = code);
//   2. every CSS and UI TS/TSX file is scanned for drift (raw colours, one-off
//      sizes, radii and weights, invented or overridden tokens, inline styles,
//      web fonts, 100vh, browser dialogs);
//   3. every component file has a line in docs/design-components.md;
//   4. old breaches are counted per file and rule in design-baseline.json and may
//      only go down. A new file has no allowance.
//
//   node scripts/design-guard.mjs              check (runs in npm run lint and npm run build)
//   node scripts/design-guard.mjs --update     lower the baseline after a clean-up (never raises it)
//   node scripts/design-guard.mjs --token-table  print design.md's token table from design-tokens.css

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export const TOKEN_FILE = "src/app/design-tokens.css";
export const TOKEN_HOMES = [TOKEN_FILE, "src/app/typography.css"];
export const SPEC_FILE = "design.md";
export const COMPONENT_DOC = "docs/design-components.md";
export const BASELINE_FILE = "design-baseline.json";
const SCAN_ROOTS = ["src/app", "src/components"];
const COMPONENT_ROOT = "src/components";

/** Type ramp in px (design.md › Tokens › Scales). Anything else is a one-off size. */
export const TYPE_SCALE = new Set([11, 12, 13, 15, 16, 18, 20, 24, 28]);
/** Corner radii in px. Cards and controls should use the radius tokens. */
export const RADIUS_SCALE = new Set([0, 4, 8, 12, 16, 20, 28, 999]);
/** Font weights. 300 is the light display numeral. */
export const WEIGHT_SCALE = new Set([300, 400, 500, 600, 700]);

export const RULES = {
  rawColour: "Raw colour. Use a token, var(--awx-*). A new colour goes in design-tokens.css and design.md's token table first.",
  offFont: "Font family. Use inherit or var(--site-font); no component font stacks (design.md › Shared Surface).",
  webFont: "Web font. AceWeather uses the Apple system stack only (design.md › Visual Language › Typography).",
  offFontSize: `Font size off the type ramp (${[...TYPE_SCALE].join(" / ")} px). Use a type token (var(--awx-type-*)) or a ramp size.`,
  offRadius: `Radius off the scale (${[...RADIUS_SCALE].filter((px) => px !== 999).join(" / ")} px, 50% or full). Prefer var(--awx-radius), var(--awx-radius-sm), var(--awx-control-radius) or var(--awx-pill).`,
  offWeight: `Font weight off the scale (${[...WEIGHT_SCALE].join(" / ")}).`,
  viewportHeight: "100vh runs under the phone's browser bar. Use 100dvh (design.md › Mobile).",
  tokenOverride: "A design token redefined outside design-tokens.css. Change the token there (and design.md), or use a new local --name that is not a design token.",
  unknownToken: "var(--awx-…) names a token that is not defined anywhere. Use an existing token, or add it to design-tokens.css and design.md first.",
  inlineStyle: "Inline style with fixed values. Use a class. An inline style is only for a value worked out at run time, or a CSS variable.",
  nativeDialog: "Browser alert / confirm / prompt. Use an in-app sheet or status line.",
};

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const withoutVarFallbacks = (text) => text.replace(/var\(\s*--[\w-]+\s*,[^()]*(?:\([^()]*\)[^()]*)*\)/g, "var()");
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])/gi;
const COLOUR_FN = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/gi;
const pxValues = (value) => (withoutVarFallbacks(value).replace(/var\([^)]*\)/g, "").match(/-?[\d.]+(?=px)/g) || []).map(Number);

export function cssVariables(css) {
  const found = new Map();
  for (const match of stripComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)) found.set(match[1], match[2].trim());
  return found;
}

/** Token values from design-tokens.css: default (dark, desktop), light theme, phone (≤700px). */
export function tokenSets(tokensCss) {
  const css = stripComments(tokensCss);
  const block = (pattern) => { const match = pattern.exec(css); return match ? cssVariables(match[1]) : new Map(); };
  return {
    base: block(/^:root\s*\{([\s\S]*?)\n\}/m),
    phone: block(/@media[^{]*max-width:\s*700px[^{]*\{\s*:root\s*\{([\s\S]*?)\}\s*\}/),
    light: block(/\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/),
  };
}

export function scanCss(file, source) {
  const css = stripComments(source);
  const tokenHome = TOKEN_HOMES.includes(file);
  const counts = {};
  const add = (rule, n = 1) => { if (n) counts[rule] = (counts[rule] || 0) + n; };
  const declarations = [...css.matchAll(/([\w-]+)\s*:\s*([^;{}]+)(?=[;}])/g)].map((match) => [match[1].toLowerCase(), match[2].trim()]);

  if (!tokenHome) {
    const plain = withoutVarFallbacks(css);
    add("rawColour", (plain.match(HEX) || []).length + (plain.match(COLOUR_FN) || []).length);
  }
  add("webFont", (css.match(/@font-face|@import\s+url\([^)]*fonts?\.|fonts\.googleapis/gi) || []).length);
  for (const [property, value] of declarations) {
    if (property === "font-family" && !tokenHome && !/^(?:var\(--|inherit\b)/.test(value)) add("offFont");
    if (property === "font-size" && pxValues(value).some((px) => !TYPE_SCALE.has(px))) add("offFontSize");
    if (/^border(?:-[a-z]+)*-radius$/.test(property) && pxValues(value).some((px) => !RADIUS_SCALE.has(Math.abs(px)))) add("offRadius");
    if (property === "font-weight" && /^\d+$/.test(value) && !WEIGHT_SCALE.has(Number(value))) add("offWeight");
    if (/(?:^|[\s(,])100vh\b/.test(value)) add("viewportHeight");
  }
  return counts;
}

/** Design tokens redefined outside the token file. */
export function tokenOverrides(source, designTokens) {
  return [...stripComments(source).matchAll(/(--[\w-]+)\s*:/g)].filter((match) => designTokens.has(match[1])).length;
}

export function usedAwxTokens(source) {
  return [...source.matchAll(/var\(\s*(--awx-[\w-]+)/g)].map((match) => match[1]);
}

const TEXT_NODE = new Set([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral, ts.SyntaxKind.TemplateHead, ts.SyntaxKind.TemplateMiddle, ts.SyntaxKind.TemplateTail]);
const isFixed = (node) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isNumericLiteral(node)
  || (ts.isPrefixUnaryExpression(node) && ts.isNumericLiteral(node.operand)));
const propertyKey = (property) => {
  const name = property.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return null;
};

export function scanTs(file, source) {
  const counts = {};
  const add = (rule, n = 1) => { if (n) counts[rule] = (counts[rule] || 0) + n; };
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (TEXT_NODE.has(node.kind)) {
      const text = withoutVarFallbacks(node.text ?? "");
      add("rawColour", (text.match(HEX) || []).length + (text.match(COLOUR_FN) || []).length);
      if (/fonts\.googleapis|fonts\.gstatic/.test(text)) add("webFont");
      for (const match of text.matchAll(/font-family\s*:\s*([^;"}]+)/gi)) if (!/^\s*(?:var\(--|inherit)/.test(match[1])) add("offFont");
    }
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith("next/font")) add("webFont");
    if (ts.isJsxAttribute(node) && node.name.getText(sf) === "style" && node.initializer && ts.isJsxExpression(node.initializer)
      && node.initializer.expression && ts.isObjectLiteralExpression(node.initializer.expression)) {
      const fixed = node.initializer.expression.properties.filter((property) => ts.isPropertyAssignment(property)
        && !String(propertyKey(property) ?? "").startsWith("--") && isFixed(property.initializer));
      if (fixed.length) add("inlineStyle");
    }
    if (ts.isPropertyAssignment(node) && propertyKey(node) === "fontFamily" && isFixed(node.initializer)
      && !/^\s*(?:var\(--|inherit)/.test(node.initializer.text ?? "")) add("offFont");
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text
        : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && /^(?:window|globalThis|self)$/.test(callee.expression.text) ? callee.name.text : null;
      if (name && /^(?:alert|confirm|prompt)$/.test(name)) add("nativeDialog");
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return counts;
}

function files(directory, test, found = []) {
  if (!existsSync(directory)) return found;
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) { if (!/^(?:node_modules|\.next|out)$/.test(entry)) files(path, test, found); }
    else if (test(entry)) found.push(path);
  }
  return found;
}

/** Parse design.md's checked token table: | `--awx-x` | default | light | phone | use |. */
export function specTokens(designMd) {
  const rows = new Map();
  for (const line of designMd.split("\n")) {
    const match = /^\|\s*`(--[\w-]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/.exec(line);
    if (!match) continue;
    const cell = (value) => { const text = value.trim().replace(/^`|`$/g, ""); return text === "" || text === "—" ? null : text; };
    rows.set(match[1], { base: cell(match[2]), light: cell(match[3]), phone: cell(match[4]) });
  }
  return rows;
}

const same = (a, b) => String(a ?? "").replace(/\s+/g, " ").trim().toLowerCase() === String(b ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export function checkTokenParity(designMd, tokensCss) {
  const errors = [];
  const spec = specTokens(designMd);
  const { base, light, phone } = tokenSets(tokensCss);
  if (!spec.size) return [`${SPEC_FILE} has no token table (rows like | \`--awx-bg\` | … |). Print one with: node scripts/design-guard.mjs --token-table`];
  const names = new Set([...base.keys(), ...light.keys(), ...phone.keys()]);
  for (const name of names) {
    const row = spec.get(name);
    if (!row) { errors.push(`${TOKEN_FILE} defines ${name} but ${SPEC_FILE}'s token table has no row for it`); continue; }
    for (const [column, values] of [["default", base], ["light", light], ["phone", phone]]) {
      const key = column === "default" ? "base" : column;
      const code = values.get(name) ?? null;
      if (!same(code, row[key])) errors.push(`${name} ${column}: ${SPEC_FILE} says ${row[key] ?? "—"}, ${TOKEN_FILE} says ${code ?? "—"}`);
    }
  }
  for (const name of spec.keys()) if (!names.has(name)) errors.push(`${SPEC_FILE}'s token table lists ${name}, which ${TOKEN_FILE} does not define`);
  return errors;
}

export function tokenTable(tokensCss) {
  const { base, light, phone } = tokenSets(tokensCss);
  const names = [...new Set([...base.keys(), ...light.keys(), ...phone.keys()])];
  const cell = (value) => (value == null ? "—" : `\`${value}\``);
  return ["| Token | Default (dark, desktop) | Light | Phone (≤700px) | Use |", "|---|---|---|---|---|",
    ...names.map((name) => `| \`${name}\` | ${cell(base.get(name))} | ${cell(light.get(name))} | ${cell(phone.get(name))} |  |`)].join("\n");
}

export function checkComponentNotes(componentFiles, doc) {
  return componentFiles
    .filter((file) => !doc.includes(`\`${basename(file)}\``))
    .map((file) => `${file} is not in ${COMPONENT_DOC}. Check the list for something to reuse first; a new component needs a line there (what it is for, why nothing existing fits) and Rob's OK.`);
}

export function compareCounts(current, baseline) {
  const errors = [];
  const stale = [];
  const fileNames = new Set([...Object.keys(current), ...Object.keys(baseline)]);
  for (const file of fileNames) {
    const rules = new Set([...Object.keys(current[file] || {}), ...Object.keys(baseline[file] || {})]);
    for (const rule of rules) {
      const count = current[file]?.[rule] || 0;
      const allowed = baseline[file]?.[rule] || 0;
      if (count > allowed) errors.push(`${file}: ${rule} ${count} (allowed ${allowed}). ${RULES[rule] ?? ""}`);
      else if (count < allowed) stale.push(`${file}: ${rule} is now ${count}, ${BASELINE_FILE} allows ${allowed}`);
    }
  }
  return { errors, stale };
}

export const totals = (map) => {
  const sum = {};
  for (const counts of Object.values(map)) for (const [rule, n] of Object.entries(counts)) sum[rule] = (sum[rule] || 0) + n;
  return sum;
};

export function scanTree(root) {
  const rel = (path) => relative(root, path).replace(/\\/g, "/");
  const read = (path) => readFileSync(path, "utf8");
  const tokensCss = existsSync(join(root, TOKEN_FILE)) ? read(join(root, TOKEN_FILE)) : "";
  const designTokens = new Set([...cssVariables(tokensCss).keys()]);
  const cssPaths = SCAN_ROOTS.flatMap((dir) => files(join(root, dir), (name) => name.endsWith(".css")));
  const tsPaths = SCAN_ROOTS.flatMap((dir) => files(join(root, dir), (name) => /\.tsx?$/.test(name) && !/\.test\.|\.d\.ts$/.test(name)));

  // Every --name defined in CSS, or set from script, counts as defined.
  const defined = new Set();
  const sources = new Map();
  for (const path of [...cssPaths, ...tsPaths]) {
    const source = read(path);
    sources.set(path, source);
    if (path.endsWith(".css")) for (const name of cssVariables(source).keys()) defined.add(name);
    else for (const match of source.matchAll(/["'`](--[\w-]+)["'`]/g)) defined.add(match[1]);
  }

  const current = {};
  for (const [path, source] of sources) {
    const file = rel(path);
    const counts = path.endsWith(".css") ? scanCss(file, source) : scanTs(file, source);
    if (path.endsWith(".css") && !TOKEN_HOMES.includes(file)) {
      const overrides = tokenOverrides(source, designTokens);
      if (overrides) counts.tokenOverride = overrides;
    }
    const unknown = usedAwxTokens(source).filter((name) => !defined.has(name)).length;
    if (unknown) counts.unknownToken = unknown;
    const kept = Object.fromEntries(Object.entries(counts).filter(([, n]) => n > 0));
    if (Object.keys(kept).length) current[file] = kept;
  }
  const componentFiles = files(join(root, COMPONENT_ROOT), (name) => name.endsWith(".tsx") && !/\.test\./.test(name)).map(rel);
  return { current, tokensCss, componentFiles };
}

function atMergeBase(root, path) {
  for (const ref of ["origin/master", "master"]) {
    try {
      const base = execFileSync("git", ["merge-base", "HEAD", ref], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      return execFileSync("git", ["show", `${base}:${path}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch { /* try the next ref; a shallow CI clone has no merge base */ }
  }
  return null;
}

export function runGuard(root, { update = false } = {}) {
  const errors = [];
  const read = (path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : "");
  const { current, tokensCss, componentFiles } = scanTree(root);

  errors.push(...checkTokenParity(read(SPEC_FILE), tokensCss));
  errors.push(...checkComponentNotes(componentFiles, read(COMPONENT_DOC)));

  const baselinePath = join(root, BASELINE_FILE);
  const hasBaseline = existsSync(baselinePath);
  const baseline = hasBaseline ? JSON.parse(readFileSync(baselinePath, "utf8")) : {};
  const { errors: countErrors, stale } = compareCounts(current, baseline);
  const messages = [];

  if (update) {
    if (countErrors.length && hasBaseline) {
      errors.push(...countErrors, "--update only lowers the baseline. Fix the breaches above; an allowance is never raised.");
    } else {
      writeFileSync(baselinePath, `${JSON.stringify(Object.fromEntries(Object.entries(current).sort()), null, 2)}\n`);
      messages.push(`Updated ${BASELINE_FILE}`);
    }
  } else {
    errors.push(...countErrors);
    if (stale.length) errors.push(...stale.map((line) => `${line}. Lock in the improvement: node scripts/design-guard.mjs --update`));
  }

  const before = atMergeBase(root, BASELINE_FILE);
  if (before) {
    const was = totals(JSON.parse(before));
    const now = totals(update ? current : baseline);
    for (const rule of Object.keys(RULES)) {
      if ((now[rule] || 0) > (was[rule] || 0)) errors.push(`${BASELINE_FILE}: ${rule} total rose from ${was[rule] || 0} to ${now[rule]}. Allowances may only go down.`);
    }
  }
  return { errors, messages, current };
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const rootArg = args.indexOf("--root");
  const target = rootArg >= 0 ? resolve(args[rootArg + 1]) : root;
  if (args.includes("--token-table")) {
    console.log(tokenTable(readFileSync(join(target, TOKEN_FILE), "utf8")));
    return;
  }
  const { errors, messages } = runGuard(target, { update: args.includes("--update") });
  for (const line of messages) console.log(line);
  if (errors.length) {
    console.error(`DESIGN_GUARD_FAILED (${errors.length})\n- ${errors.join("\n- ")}\n\nWhat each rule means and how to fix it: docs/design-guardrails.md`);
    process.exit(1);
  }
  console.log("DESIGN_GUARD_OK token-parity component-notes baseline");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
