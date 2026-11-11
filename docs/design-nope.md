# Design nope list

Things Rob has ruled out for AceWeather. One line each, newest at the bottom. Rows marked `seeded` were copied from `design.md` when this file was started (11 Nov 2026).

**To add one:** write a row with today's date and what you don't want, in your own words, and leave the last column empty.

**For agents:** read this before any UI work. An empty "Enforced by" cell is a job: do it in the same change. Either add a rule to `scripts/design-guard.mjs` with a breach and an approved case in `tests/design-guard.test.mjs` (so the self-test proves it fails), baselining old breaches rather than loosening the rule, or write `written rule` and add it to `design.md` when a machine can't check it.

| Logged | Nope | Enforced by |
|---|---|---|
| seeded | Hard-coded colours instead of `--awx-*` tokens | guard `rawColour` (CSS and TSX) |
| seeded | Component font stacks; any font but the Apple system stack | guard `offFont` |
| seeded | Loading Inter or another web font | guard `webFont` |
| seeded | One-off font sizes, corner radii and weights | guard `offFontSize`, `offRadius`, `offWeight` |
| seeded | Redefining a design token in a screen's CSS | guard `tokenOverride` |
| seeded | Inventing a token name nobody defines | guard `unknownToken` |
| seeded | `100vh` (runs under the phone's browser bar) | guard `viewportHeight` |
| seeded | Fixed values in inline styles | guard `inlineStyle` |
| seeded | Browser `alert` / `confirm` / `prompt` | guard `nativeDialog` |
| seeded | A second card, button, sheet or icon set built in a screen | guard component notes (`docs/design-components.md`) |
| seeded | Token values in `design.md` that don't match the CSS | guard token parity |
| seeded | Saturated filled badges or semantic card backgrounds | written rule (`design.md` › Visual Language) |
| seeded | Tap targets under 44 × 44 px | written rule; `--awx-control-height` is 44px |
| seeded | Explainer paragraphs and redundant subtitles on default screens | written rule (`design.md` › Content and copy) |
| seeded | Colour as the only sign of a status | written rule (`design.md` › Accessibility) |
| seeded | A second mobile UI, or a desktop grid leaking into mobile | written rule; golden screenshots at phone width |
| 2026-11-11 | Cards render at 12px because `card-tidy.css` overrides `--awx-radius`; the token says 28px | not enforced yet: Rob to decide 12px or 28px, then fix the token and drop the override |
