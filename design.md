---
version: 2
name: AceWeather
last_updated: 2026-06-21
status: living design and implementation reference
primary_surface: mobile PWA
description: Calm, premium field-weather console for growers, farmers, agronomists, and field operators.
theme: dark-first with light parity
---

# AceWeather Design Reference

This is the living source of truth for AceWeather design, product behavior, and mobile UX direction. Update this file whenever the product structure, visual language, data model, or mobile rules change.

Future agents should read this before changing AceWeather UI. The goal is to avoid rediscovering the same context and to keep the app coherent as it evolves.

## Product Intent

AceWeather is a field-weather decision console, not a generic consumer forecast app. It should feel like a quiet, trustworthy instrument for someone deciding what to do outside: spray, travel, drill, irrigate, watch disease risk, check rain, or scan the next 14 days.

The product personality:

- Calm.
- Precise.
- Premium.
- Field-first.
- Honest about data sources and heuristic outputs.

The app should prioritize fast field decisions over decorative weather presentation. Beauty should come from typography, spacing, restraint, and useful hierarchy.

## Current Stack

- Framework: Next.js App Router.
- Runtime: React client-heavy app inside `src/components/aceweather-x`.
- Styling: plain CSS split between `src/app/aceweather-x.css` and `src/app/aceweather-x-cards.css`.
- PWA: manifest route, service-worker route, local install behavior, update bootstrap.
- Maps/radar: MapLibre GL plus RainViewer tiles.
- Forecast data: Open-Meteo client calls, no backend needed for the main forecast.
- Package scripts:
  - `npm run dev`
  - `npm run lint`
  - `npm run build`

Important files:

- `src/app/layout.tsx`: global metadata, viewport, fonts, PWA bootstrap, CSS imports.
- `src/app/page.tsx`: renders `AceWeatherApp`.
- `src/app/manifest.ts`: PWA manifest, icons, shortcuts, share/protocol handlers.
- `src/app/service-worker.js/route.ts`: generated service worker script.
- `src/components/pwa-bootstrap.tsx`: service worker registration, update checks, reload on controller change.
- `src/components/aceweather-x/app.tsx`: main AceWeather X shell, nav, state, search, settings sheet.
- `src/components/aceweather-x/cards.tsx`: Now, Rain, Outlook, Field, Seasonal, Sources cards.
- `src/components/aceweather-x/radar-card.tsx`: live RainViewer radar map and playback UI.
- `src/components/aceweather-x/ui.tsx`: shared UI primitives.
- `src/components/aceweather-x/icons.tsx`: inline icon set.
- `src/lib/aceweather/open-meteo.ts`: forecast, geocoding, seasonal archive access.
- `src/lib/aceweather/derive.ts`: transforms Open-Meteo payload into the view model.
- `src/lib/aceweather/agronomy.ts`: field/agronomy heuristic models.
- `src/lib/aceweather/radar.ts` and `src/lib/radar-frames.ts`: RainViewer frame helpers.
- `src/lib/aceweather/notify.ts`: rain alert and service-worker-backed notification helpers.
- `src/lib/store.ts`: local storage / IndexedDB migration support.

There is older/non-primary UI under `src/components/aceweather` and older CSS files. Treat `aceweather-x` as the active app unless the user explicitly asks about the legacy surface.

## What AceWeather Does

AceWeather currently provides:

- Location search using Open-Meteo geocoding.
- Default location: Bishopton, Stockton-on-Tees.
- Seed saved locations: Bishopton, Pocklington, York.
- Current conditions.
- Rest-of-day / next-hours trend.
- Sun and daylight.
- Rainfall totals and rain range chart.
- Live rainfall radar from RainViewer.
- 14-day forecast and selected-day hourly detail.
- Field guidance:
  - Spraying / Delta-T / inversion / rain-fast.
  - Disease pressure, including late blight Hutton-style risk and Septoria heuristic.
  - Soil and water balance.
  - Season and operations guidance.
- Seasonal climate context from Open-Meteo archive.
- Data source/freshness display.
- PWA install/offline/update behavior.
- Rain notifications when permission is granted.
- API/docs links in the mobile `More` sheet and source/docs surfaces for integrations.

## Data Sources

Primary forecast data:

- Source: Open-Meteo forecast API.
- Location: `src/lib/aceweather/open-meteo.ts`.
- Main request includes:
  - current: temperature, feels-like, humidity, dew point, pressure, cloud cover, wind, gust, direction, precipitation, visibility, UV, weather code, day/night.
  - hourly: temperature, apparent temperature, precipitation, precipitation probability, wind, gust, direction, cloud cover, humidity, pressure, ET0, soil temperature, soil moisture.
  - daily: max/min temperature, precipitation sum, precipitation probability, max wind, dominant wind direction, weather code, sunrise, sunset, UV max.
  - `past_days=7`, `forecast_days=14`.

Location search:

- Source: Open-Meteo geocoding API.
- Minimum useful query length: 2 characters.
- Results map to `AwLocation` with name, region, country, lat/lon, elevation, timezone.

Seasonal context:

- Source: Open-Meteo archive API.
- Compares current month-to-date rainfall against same-day-of-month prior-year averages.
- Uses recent forecast/past-days data to fill archive lag.

Radar:

- Source: RainViewer public weather maps API and tile server.
- Open-Meteo does not provide radar.
- Map base: CARTO raster tiles through MapLibre.
- Current radar UI cross-fades RainViewer frames, supports play/pause, previous/next, range input, and frame chips.

Notifications:

- Rain alert support relies on browser notification permission and service worker readiness.
- The service worker stores selected location in runtime cache and can check near-term rainfall.

## Derived Models And Honesty Rules

AceWeather derives planning signals from raw weather data. These outputs are decision support, not agronomic instructions.

Always label or describe the following as heuristic:

- Spray window.
- Delta-T and inversion risk.
- Rain-fast timing.
- Field workability / travel.
- Soil moisture deficit.
- Disease pressure.
- Septoria risk.
- Hutton-style late-blight periods.
- Operations matrix.
- Grass frost estimate.

Do not overstate precision. Use phrases like:

- "heuristic"
- "planning support"
- "estimate"
- "compare against local gauge"
- "follow product label"
- "validate against local pathology services"

## Current Navigation Model

Desktop nav:

- `Overview`
- `Now`
- `Rain`
- `Radar`
- `Field`
- `Outlook`
- `Seasonal`

Mobile nav currently shows:

- `Overview`
- `Now`
- `Rain`
- `Radar`
- `Field`
- `More`

Mobile `More` contains:

- `Outlook`
- `Seasonal`
- `Sources`
- API/docs links

Do not add more permanent bottom-nav items without re-testing 360px width. Six bottom items is already the upper comfort limit.

## Current Card Sections

Overview view displays the full stack:

- Conditions now.
- Today / hour by hour.
- Sun and daylight.
- Rainfall.
- Rainfall radar.
- 14-day outlook.
- Spraying.
- Disease pressure.
- Soil and water.
- Season and operations.
- Seasonal context.
- Data sources.

Filtered views show subsets:

- `Now`: Conditions, trend, sun/daylight.
- `Rain`: Rainfall.
- `Radar`: Rainfall radar.
- `Field`: Spraying, disease, soil/water, season/operations.
- `Outlook`: 14-day outlook.
- `Seasonal`: Seasonal context.

The card pattern is:

1. Header: kicker, meta line, small semantic tick on the right.
2. Body: a concise default summary.
3. Footer: `Details` disclosure on the left, quiet note on the right.
4. Detail: dense/methodology content hidden by default.

This "minimal by default, depth on demand" rhythm is mandatory.

## Visual Language

AceWeather is near-monochrome, dark-first, with one main interactive accent.

Core dark tokens:

- `--awx-bg`: `#0a0b0d`
- `--awx-surface`: `#101216`
- `--awx-surface-2`: `#15181d`
- `--awx-surface-3`: `#1c2026`
- `--awx-line`: low-opacity hairline divider.
- `--awx-line-2`: stronger control border.
- `--awx-text`: primary text.
- `--awx-muted`: secondary text.
- `--awx-faint`: tertiary text.
- `--awx-accent`: calm blue interactive accent.
- `--awx-accent-weak`: soft active background.
- `--awx-accent-line`: active/focus border.

Semantic colors:

- `sun`: temperature, sun, UV, heat.
- `warn`: marginal/watch.
- `go`: good/live/settled.
- `risk`: severe/hold/disease/frost risk.
- `cool`: frost/cold/snow.
- `violet`: pressure/anomaly/seasonal.

Use semantic colors sparingly:

- small dots.
- thin meter fills.
- single value text.
- small accents.

Do not use saturated filled badges or semantic card backgrounds.

Typography:

- Current font: Inter via `next/font/google`.
- Display numerals should be light, elegant, and tabular.
- All changing figures should use tabular numerals.
- Kicker labels are tiny uppercase, tracked, and faint.
- Body copy should be sentence case and calm.
- Avoid decorative mono except where displaying API/code paths.

Layout:

- Desktop: rail, feed, sidebar.
- Tablet: collapsed rail.
- Mobile: single feed, sticky top bar, bottom nav.
- Cards separate with hairline dividers, not big shadows.
- Cards should feel like instrument panels, not marketing tiles.

Brand:

- Current in-app brand mark is the `AW` mark with weather glyphs.
- Header top row currently shows brand mark, location, live status, settings.
- On mobile, avoid duplicating the location/live state in multiple headers.

## Mobile Is The Primary Surface

Treat mobile as the main product surface. Desktop can be richer, but mobile must be faster and cleaner.

Mobile goals:

- One-handed operation.
- Glanceable first screen.
- No accidental horizontal page scroll.
- No hidden primary sections.
- No tap target smaller than 44 by 44 CSS pixels.
- No desktop grid leaking into mobile.
- Sticky chrome should help, not consume the product.
- Essential weather decision should be visible without scrolling forever.

Hard mobile rules:

- Minimum touch target: 44px by 44px for any button, icon button, link, range/step control, disclosure, or map control.
- Bottom nav items can remain 6-wide only if labels stay legible and all important sections are reachable.
- Search must not permanently consume prime vertical space on every tab if it is not the primary task.
- Settings must be settings; developer/API docs should not dominate the mobile settings sheet.
- Calendar/outlook must be redesigned for mobile as a day strip/list, not a desktop 7-column calendar with blank placeholders.
- Radar controls must be thumb-sized; MapLibre zoom controls need mobile overrides or should be hidden/replaced.
- Any fixed bottom nav must have enough content padding so the last card/action is never obscured.
- Respect safe areas with `env(safe-area-inset-bottom)` and `env(safe-area-inset-top)` where relevant.
- The app must behave cleanly after deploy/update in PWA mode. Stale service-worker/client mismatches are a real UX bug.

## Mobile Audit - 2026-06-21

Audit target:

- Local app: `http://localhost:3001`
- Viewports: `360x740`, `390x844`, `430x932`
- Browser automation: Playwright

Passes:

- No full-page horizontal overflow detected.
- Duplicate mobile location/live header was fixed.
- Bottom nav targets are large enough at about 60px by 63px.
- Field view is the strongest mobile view: clear, decisive, scannable.
- Visual design is coherent and premium.

Problems found before the mobile update:

- P0: Service-worker/PWA reliability needs attention. During testing, dev logs showed a hydration mismatch where stale client markup appeared to conflict with current server HTML. This is likely service-worker or dev-cache related, but it is serious for a PWA.
- P1: Many controls are under 44px:
  - settings icon button around 38px by 38px.
  - `Load` search button around 40px by 32px.
  - disclosure buttons around 31px high.
  - rain range buttons around 26px high.
  - radar play around 42px by 38px.
  - radar step buttons around 36px by 36px.
  - MapLibre zoom controls around 29px by 29px.
- P1: The first mobile screen is visually handsome but too heavy. Header plus always-visible search plus huge Now card pushes utility down.
- P1: Outlook is the weakest mobile screen. The 7-column calendar keeps desktop behavior, includes empty placeholder tiles, and squeezes useful day cards.
- P1: Mobile cannot directly navigate to Seasonal.
- P2: Search consumes prime space on every tab. It should probably become a compact location/search trigger.
- P2: Settings sheet is overloaded with API/docs links. Split settings from developer/docs.
- P2: Radar is close but controls and frame chips need a mobile-first pass.

Recommended mobile sequence:

1. Fix PWA/service-worker update behavior and disable/no-op service-worker registration in dev/test contexts where appropriate.
2. Enforce 44px touch targets across header, search, card disclosures, segmented controls, radar controls, and map controls.
3. Redesign mobile Outlook as a selected-day summary plus horizontal day strip/list. Remove mobile empty calendar placeholders.
4. Replace persistent search field with compact location/search affordance:
   - top bar shows location and status.
   - tap location/search opens a search sheet.
   - search sheet handles suggestions and saved locations.
5. Add `More` or a revised mobile nav so Seasonal and Docs are reachable.
6. Split Settings and Docs:
   - Settings: theme, temperature unit, wind unit, rain alerts, location, share.
   - Docs/API: separate `More` section or collapsible developer panel.
7. Tighten the Now card on mobile:
   - retain temperature and verdict.
   - reduce hero height.
   - show the two most useful actions/signals in the first viewport.

Implemented mobile update - 2026-06-21:

- Mobile top bar now has a single location trigger plus compact live status; the always-visible composer/search row is hidden on mobile.
- Tapping the location opens a dedicated location sheet with search, geocoding suggestions, saved places, and "Use my location".
- Mobile bottom nav is `Overview`, `Now`, `Rain`, `Radar`, `Field`, `More`.
- `More` exposes `Outlook`, `Seasonal`, `Sources`, and API/docs links.
- Settings sheet is now settings/actions only: theme, units, wind unit, rain alerts, location, share.
- Interactive controls in the mobile shell/cards are 44px minimum after verification at 390px.
- Mobile Outlook uses a horizontal day strip and hides desktop weekday/empty placeholder tiles.
- Radar play, step, timeline range, frame chips, and MapLibre controls are thumb-sized.
- Mobile Now card is tightened with less sky/hero vertical footprint.
- PWA bootstrap unregisters old service workers and clears AceWeather static caches in development so local mobile testing is not polluted by stale clients.

Verification after the update:

- `npm run lint`: passed with 8 existing warnings outside this pass.
- `npm run build`: passed.
- Playwright viewports: `360x740`, `390x844`, `430x932`.
- Follow-up 390px tap-target scan: no visible interactive target below 44px, no root horizontal overflow, no console errors.

## Current Mobile Baseline

Top bar:

- Height target: 56px to 64px including safe area.
- Contains compact brand mark, location trigger, status, and settings.
- Location is tappable and opens the search/location sheet.
- Status is compact: dot plus `Live`, `Fetching`, or `Offline`.

Search:

- Do not show a full search input on every tab by default.
- Use the search/location sheet:
  - focus input on open.
  - show saved locations first.
  - show geocoding suggestions as the user types.
  - close on selection.
  - keep tap targets 44px.

Bottom nav:

- Must expose all primary tasks.
- Current model:
  - Overview
  - Now
  - Rain
  - Radar
  - Field
  - More
- `More` contains Outlook, Seasonal, Sources, and Docs/API.
- Keep this model unless a future mobile audit proves there is a better six-item structure.

Overview:

- Should be a quick command center, not a full document.
- Consider shorter summary cards or a "Today at a glance" block before the full cards.
- If full stack remains, each card must have a tight mobile default state.

Now:

- Current Now visual language is good.
- Reduce vertical footprint on small phones.
- Keep the sky panel, but do not let it push core metrics below the fold unnecessarily.

Rain:

- Rain chart is generally clean.
- Range segmented controls need 44px height.
- When rain is 0, avoid wasting too much chart height on empty space.

Radar:

- Map should remain visually inspectable.
- Map controls should be mobile-sized or replaced with custom controls.
- Playback controls should be 44px minimum.
- Frame chips should scroll cleanly and not look truncated.
- Attribution must remain readable but not dominate the map.

Field:

- Current mobile Field direction is good.
- Keep decisive verdicts (`Go`, `Hold`, `Caution`) prominent.
- Rows are readable and useful.
- Details controls need larger tap height.

Outlook:

- Do not use the desktop calendar grid on mobile.
- Mobile behavior:
  - lead summary remains above the forecast days.
  - horizontal day strip with compact day buttons.
  - selected-day hourly detail below.
  - no blank weekday placeholders.
  - no important content under bottom nav.

Settings:

- Settings sheet should have a clear hierarchy and should not open in an awkward partially-scrolled state.
- Basic controls first.
- Developer/API docs live in `More`, not Settings.
- Close button 44px minimum.
- Escape key behavior is nice for desktop automation but not a mobile requirement; tap outside and close button must work.

## PWA And Update Rules

PWA behavior is part of UX. If the app updates badly, users experience it as a broken mobile app.

Current pieces:

- `manifest.ts`: standalone display, icons, shortcuts, share target, protocol handlers.
- `service-worker.js/route.ts`: app shell, static cache, data cache, RainViewer/CARTO tile caching, notifications.
- `pwa-bootstrap.tsx`: registers service worker, checks for updates, posts skip-waiting message, reloads on controller change.

Rules:

- Do not let a stale service worker serve old client chunks against new server HTML.
- In dev, service-worker behavior can poison UI testing. Prefer unregistering/blocking in dev or making registration robust when service workers are unavailable.
- Build/version cache names must change per deploy. `NEXT_PUBLIC_BUILD_ID` fallback is `dev`; production should not rely on a stable `dev` build id.
- Service-worker update messaging should be deliberate and visible enough to avoid mysterious reloads.
- Test PWA updates after major UI shell changes.

## Accessibility Rules

- All controls need accessible names.
- Icon-only buttons need `aria-label`.
- `aria-pressed` is appropriate for segmented/range toggles and nav buttons.
- Live status should be meaningful but not noisy.
- Modal/sheet should use `role="dialog"` and ideally trap focus when open.
- Keep contrast high in both dark and light modes.
- Do not rely on color alone for risk state; pair with labels like `Hold`, `Go`, `Risk`, `Observed`.

## Content And Copy Rules

Voice:

- Short.
- Specific.
- Operational.
- Calm.

Good examples:

- `Hold - Temperature inversion risk`
- `Next spray window 06:00-11:00`
- `0 mm next 24h`
- `Observed 06:45 - Open-Meteo`
- `RainViewer - observed frames`

Avoid:

- Hype.
- Marketing language.
- Vague weather app copy.
- Long explanations in default card views.
- Unlabeled heuristics.

Use Details for methodology and caveats.

## Current Known Design Debt

Keep this list current.

- Mobile sheets use `role="dialog"` but do not yet trap focus or restore focus to the opener.
- Overview can still become long on small phones; consider a compact "Today at a glance" block before the full card stack.
- PWA update behavior is hardened in dev, but production update flow still needs a deliberate deploy/update test with a real build id.
- Docs/API links are now reachable through `More`; future passes may want a tighter developer-docs presentation.
- Some older files and CSS remain in the repo; do not treat legacy UI as the active design unless asked.
- README still references older Python API flow; the active Next/PWA direction may need documentation cleanup separately.

## Implementation Guardrails

When changing AceWeather:

- Prefer current `aceweather-x` patterns over inventing a new UI system.
- Keep changes scoped.
- Use CSS variables; avoid hard-coded colors.
- Preserve light-mode parity if touching color variables.
- For mobile, test at least:
  - 360x740
  - 390x844
  - 430x932
- Check:
  - no horizontal page overflow.
  - no overlapped text.
  - no obscured bottom content.
  - 44px touch targets.
  - settings/search sheets.
  - bottom nav.
  - radar map and controls.
  - Outlook.
- Run:
  - `npm run lint`
  - `npm run build`

## Suggested Next Mobile Work

The next major mobile pass should be:

1. Add focus trap and focus-return behavior to mobile sheets.
2. Build a compact `Today at a glance` overview block if user testing still shows too much scrolling.
3. Run a real PWA production update drill and confirm no stale client/server mismatch.
4. Tighten the `More` docs/API presentation if it feels too heavy on smaller screens.
5. Clean up legacy README/API documentation so it matches the active Next/PWA product.

This order keeps the fixed mobile IA stable while improving polish, accessibility, and release reliability.
