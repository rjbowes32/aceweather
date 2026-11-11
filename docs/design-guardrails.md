# Design guardrails

The build refuses off-design styling, so a model that never reads `design.md` still can't ship it. `design.md` is the spec; this page is what enforces it and how to work with it. The same seven guardrails as AceAg, fitted to AceWeather's plain CSS and `--awx-*` tokens.

## What is enforced

| # | Guardrail | What it stops | Where |
|---|---|---|---|
| 1 | **Token lock** | `design.md`'s token table and `src/app/design-tokens.css` disagreeing. A token added, removed or changed in one place and not the other fails | `scripts/design-guard.mjs` (token parity) |
| 2 | **Design guard** (11 rules) | Raw colours, component font stacks, web fonts, one-off font sizes, radii and weights, a design token redefined in a screen's CSS, an invented `var(--awx-…)`, `100vh`, fixed inline styles, browser `alert`/`confirm`/`prompt` | `scripts/design-guard.mjs`; runs in `npm run lint` **and** `npm run build`, so Vercel won't deploy drift |
| 3 | **Component lock** | A new component file nobody has approved | `docs/design-components.md`; the guard fails on a `.tsx` under `src/components/` without a row |
| 4 | **Agent rules** | — | `CLAUDE.md` and `AGENTS.md` point at `design.md`, this page, the component list and the nope list |
| 5 | **Screenshots** | Overview (dark and light), Now, Rain, Outlook and Field looking different at phone (390px) or desktop (1440px) width | `npm run test:visual` (`e2e/visual/`) |
| 6 | **Nope list** | Each thing Rob rules out becomes a rule or a test | `docs/design-nope.md` |
| 7 | **No bypass** | `npm run verify` runs all of it. `npm run verify:self-test` plants a breach for every rule and fails if any rule stops catching it. A pre-commit hook runs lint, the guard and (for UI files) the screenshots. Allowances may only shrink | `.githooks/pre-commit`, `tests/design-guard.test.mjs` |

## Old breaches: counted, and only allowed to go down

189 breaches existed when the guard went in (11 Nov 2026). They are counted per file and per rule in `design-baseline.json`. The effect:

- A file can't get worse: one more breach than its allowance fails.
- **A new file has no allowance.** It must be clean from its first line.
- When someone fixes a breach, the guard says the allowance is stale and gives the command to lower it (`node scripts/design-guard.mjs --update`). `--update` refuses to raise anything, and the guard fails if a rule's total is higher than on master.
- Raw colours stay where CSS variables can't reach: MapLibre paint, the web manifest and `<meta theme-color>`. They're counted, not exempt.

## When the guard stops you

Read the message: it names what to use instead.

| Message | Do this |
|---|---|
| `rawColour` | A token: `var(--awx-text)`, `var(--awx-muted)`, `var(--awx-risk)`… New colours go in `design-tokens.css` and `design.md` first |
| `offFontSize` | A ramp size (11, 12, 13, 15, 16, 18, 20, 24, 28) or `var(--awx-type-label / -heading / -value)` |
| `offRadius` | `var(--awx-radius)`, `var(--awx-radius-sm)`, `var(--awx-control-radius)`, `var(--awx-pill)` or a scale value |
| `offWeight` | 300, 400, 500, 600 or 700 |
| `tokenOverride` | Change the token in `design-tokens.css` (and `design.md`), or use a local name that isn't a design token |
| `unknownToken` | Use a token that exists, or add it to both files first |
| `inlineStyle` | A class. Inline styles are for values worked out at run time, or a CSS variable |
| `… is not in docs/design-components.md` | Look in that list for something to reuse. A new component needs a row and Rob's OK |
| `… baseline allows N` | Good news, you fixed something: run `node scripts/design-guard.mjs --update` |

Never fix a failure by loosening a rule, widening a scale or raising an allowance. If a rule is wrong for a real case, say so to Rob.

## Adding or changing a token

1. Change `src/app/design-tokens.css`.
2. Change the matching row in `design.md` › Tokens (`node scripts/design-guard.mjs --token-table` prints the whole table from the CSS).
3. `npm run lint`.

## Changing a golden screen

`npm run test:visual` fails when a golden screen looks different. If the change is wanted: look at the before/after pictures Playwright writes to `test-results/visual/`, get Rob's OK, then `npm run test:visual:update` and commit the new pictures with the change.

The pictures only compare on the machine that took them (fonts render differently elsewhere), so they're taken and checked on Rob's Mac. The clock is pinned to 11 Nov 2026 10:00, location is the default (Bishopton), the learned forecast is left out, and Open-Meteo and postcodes.io answers are replayed from `e2e/visual/recordings/`. To refresh the recording: `VISUAL_RECORD=1 npm run test:visual:update`, then `npm run test:visual:update` once more so the pictures come from the replay.

## Commands

```bash
npm run lint                 # ESLint, then the design guard
npm run design:guard         # the guard on its own
npm run verify:self-test     # every rule still fails on its breach
npm run test:visual          # golden screenshots (about 30 seconds)
npm run verify               # all of the above, the tests and a production build
```

The pre-commit hook switches on at the next `npm install` (it sets git's `core.hooksPath` to `.githooks`). `SKIP_VISUAL=1` skips its screenshot step, and `git commit --no-verify` skips the hook entirely, so the hook is a fast warning. The gates are `npm run verify` before a merge and the design guard inside `npm run build`, which Vercel runs on every deploy.

## Known limits

- The guard reads source text. A value built at run time (`"border-radius:" + n + "px"`) isn't seen.
- "Saturated badges", "44px tap targets", "no explainer paragraphs" and "colour is never the only status" can't be checked by a machine. They're written rules in `design.md`; the golden screenshots catch them only on the golden screens.
- Radar, Seasonal and Sources have no golden picture (the radar map needs live tiles).
- `card-tidy.css` overrides `--awx-radius` to 12px, so cards don't match the 28px token. Logged in `docs/design-nope.md` for Rob to decide.
