# AceWeather — rules for agents

## Before any UI work

1. Read `design.md` (the spec) and `docs/design-guardrails.md` (what the build enforces).
2. Read `docs/design-nope.md`. An empty "Enforced by" cell is a job: do it in the same change.
3. Compose, don't create. Use what's in `docs/design-components.md`. A new component file needs a row there and Rob's OK.
4. Colours, sizes, radii and weights come from the `--awx-*` tokens in `src/app/design-tokens.css`. A new token goes in that file and in `design.md`'s token table together.

## Before you finish

- `npm run lint` runs ESLint and the design guard. It must pass.
- If you touched `src/app/*.css` or `src/components/`, run `npm run test:visual`. A changed golden picture needs Rob to see it before `npm run test:visual:update`.
- Never loosen a rule, widen a scale, raise an allowance in `design-baseline.json`, or skip the hook to get a change through. If a rule is wrong for a real case, say so.
