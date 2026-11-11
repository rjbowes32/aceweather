# AceWeather — rules for agents

The design rules for every agent (Claude, Codex, Cursor and others) are in `CLAUDE.md`. In short: read `design.md`, `docs/design-guardrails.md` and `docs/design-nope.md` before UI work; compose from `docs/design-components.md`; use the `--awx-*` tokens; `npm run lint` (which includes the design guard) must pass; golden screenshots (`npm run test:visual`) change only with Rob's OK; never loosen a rule or raise an allowance.
