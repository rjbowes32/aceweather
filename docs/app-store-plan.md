# AceWeather — App Store Plan

_Last updated: 2026-07-12. Working branch: `capacitor-ios`._

## Decisions (Rob, 2026-07-12)

- **Wrapper strategy:** Capacitor iOS shell around the existing web app (static export).
- **Business model:** free, hobby/personal — no monetisation. Revisit data licensing if that changes.
- **Apple Developer Program:** enrol as **individual** ($99/yr). Not yet enrolled.
- **Machines:** code anywhere; iOS builds only on the Mac (Xcode required — **not yet installed**; only Command Line Tools present).

## Audit summary (2026-07-12)

Full audit was done in-session; key facts:

- Active UI is `src/components/aceweather-x/` only. `src/components/aceweather/` (~3,500 LOC v2 tree) + `aceweather-v2-synoptic.tsx` are **dead code** — nothing imports them. Several CSS files in `src/app/` are also unreferenced.
- Client calls Open-Meteo (forecast/geocode/archive) and RainViewer **directly**; CARTO basemap tiles for radar. The active app makes **zero same-origin `/api` calls** (`fetchTropical` is only used by the dead v2 tree). Python `api/*.py` on Vercel serves reports/snapshot/docs endpoints — public, no rate limiting; `/api/snapshot` auth is **open unless `ACEWEATHER_WEBHOOK_TOKEN` is set in Vercel**.
- No secrets in repo. No analytics, no accounts, no server-side user data. Geolocation used heavily (GPS follow); notifications are web-push/periodic-sync based (won't work in the native shell — needs Capacitor local notifications).
- No privacy policy or terms anywhere. No tests. Strict TS neutralised by `@ts-nocheck` in all shipping files.

## What's done (this branch)

- `npm run build:capacitor` → static bundle in `out/` via `scripts/build-capacitor.mjs` (stashes server-only pieces: `middleware.ts`, `src/app/version`, `src/app/service-worker.js`, `src/app/share`; restores after build; sets `NEXT_PUBLIC_ACEWEATHER_API_BASE=https://www.aceweather.app`).
- `next.config.mjs`: `CAPACITOR_BUILD=1` → `output: "export"` + unoptimized images; normal web build unchanged (verified).
- `manifest.ts` marked `force-static` (needed for export; no web effect).
- `src/lib/tropical.ts` honours `NEXT_PUBLIC_ACEWEATHER_API_BASE`.
- `pwa-bootstrap.tsx` skips service-worker registration when `Capacitor.isNativePlatform()`.
- `npx cap add ios` done — Capacitor **8**, Swift Package Manager (no CocoaPods needed). Native project in `ios/`.
- `Info.plist`: `NSLocationWhenInUseUsageDescription` set.
- `capacitor.config.ts`: appId `app.aceweather` (change before first App Store Connect upload if a different bundle ID is preferred), webDir `out`.

Workflow: `npm run build:capacitor && npx cap sync ios && npx cap open ios`.

## TODO — ordered

1. **Install Xcode** (App Store, ~12 GB) on the Mac; then `sudo xcode-select -s /Applications/Xcode.app`, open `ios/App/App.xcodeproj`, run on Simulator. First real verify of the shell.
2. **Enrol Apple Developer Program** (individual) — needed for device testing/TestFlight; there's approval lead time.
3. **Privacy policy + terms** — host at aceweather.app (e.g. `/privacy`), required for submission. Content: location → Open-Meteo/RainViewer/CARTO (IP + coords), all prefs stored on-device, no accounts/tracking.
4. **Native rain alerts** — replace web Notification/periodic-sync path (`src/lib/aceweather/notify.ts` is v2-tree; check what aceweather-x actually uses) with `@capacitor/local-notifications` + a foreground/background refresh strategy.
5. **Guideline 4.2 defence** — home-screen widget (WidgetKit, current conditions / rain next 2h) is the strongest move; also haptics, proper launch screen, app icon set.
6. **Geolocation via `@capacitor/geolocation`** if WKWebView geolocation permission UX proves clunky (test on device first — may be fine as-is).
7. **Hygiene before ship:** delete dead v2 tree + unused CSS; set `ACEWEATHER_WEBHOOK_TOKEN` in Vercel; consider basic rate limiting on `api/*.py`.
8. **Attribution screen** in-app: Open-Meteo (CC-BY 4.0), RainViewer, CARTO/OpenStreetMap, NOAA/NHC. (Free-hobby use of free tiers is defensible but attribution is required regardless.)
9. **Store assets:** 1024 px icon (SVG sources in `public/icons/`), 6.9"/6.5" screenshots, description/keywords/subtitle/support URL.
10. **TestFlight** → submit. Budget one rejection round (4.2 is the risk).

## Licensing notes (free/hobby path)

- **Open-Meteo:** free for non-commercial; attribution required (CC-BY). Fine for a free hobby app; paid plan (~€29/mo) if it ever becomes commercial/business-linked.
- **RainViewer:** free tier with attribution; re-check current terms before launch.
- **CARTO basemaps:** free basemaps are for non-commercial use; acceptable now, swap if commercial (e.g. Protomaps/self-hosted or MapTiler paid).
- **Nominatim/BigDataCloud:** only referenced from the dead v2 tree — removed when v2 is deleted.
