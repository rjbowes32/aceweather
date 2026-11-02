# AceWeather weather engine (source of truth)

Pure TypeScript farm-weather decisions: spray window and inversion, Delta-T, field
workability, disease, frost, soil, GDD, drying and the ops matrix. No React, no
fetching, no app state, no dependencies.

- `sprayWindow.ts`, `weatherAgronomy.ts`, `weatherRows.ts`: ported unchanged in logic
  from AceAg `packages/core/src/weather` (main 41ce0ffd); only import extensions
  changed and `buildAccess` exported.
- `open-meteo-rows.ts`: turns a raw Open-Meteo payload into engine rows (night from sunrise/sunset).
- `ukmo-overlay.ts`: the Met Office 2 km UKV blend (from AceAg `openMeteoPayload.js`); finite numbers only.
- `london-time.ts`: window times in `Europe/London`, 24 h, today/tomorrow wording.
- `spray-runs.ts`: the 48 h bar as runs with a reason each, and the main limit.
- Switches: `LOW_DELTA_T_TONE` (go/warn, display only), `RAIN_ON_CANOPY_MM` / `RAIN_FAST_MM` (set equal once Rob picks one).
- Tests: `tests/weather-engine.test.mjs` (AceAg's suite) and `tests/aceweather-spraying.test.mjs`.

## Plan: AceAg imports this
1. Change rules here first, with a test; never in AceAg.
2. Publish this folder as a small package (e.g. `@aceweather/weather-engine`, GitHub
   Packages or a git dependency), versioned.
3. AceAg replaces `packages/core/src/weather` with a re-export of the package, runs its
   own tests, and deletes its copy.
4. Until then, any AceAg change to its copy must be ported back here.
Needs Rob's OK for packaging and for each repo change.
