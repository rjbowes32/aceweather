# Native app playbook — AceWeather first, then AceAg

AceWeather is the practice run for putting AceAg in the App Store and Play
Store. Each step records what changed, why, and what the same step means for
AceAg.

## The idea in one picture

```
website code ──npm run build:native──► plain files (out/)
                                           │  Capacitor copies them into
                                           ├──► Android app  (android/)
                                           └──► iOS app      (ios/)

On the phone the pages run from the app itself. Data still comes from the internet:
  weather  → Open-Meteo (direct, as on the website)
  Atlas    → https://www.aceweather.app/api/atlas
```

**The app is the website's files, carried on the phone.** Nothing is hosted
for the app. So anything that needs a server either stays website-only, or
the app asks the live website for it.

### Words you'll meet

| Word | Meaning |
| --- | --- |
| Capacitor | The wrapper. Makes a real Android/iOS app whose screen is a browser window showing our files. |
| Native project | The `android/` and `ios/` folders. Real Android Studio and Xcode projects. Committed, because icons, permissions and store settings are edited there. |
| Origin | The address a page believes it is at. Website: `https://www.aceweather.app`. Android app: `https://localhost`. iOS app: `capacitor://localhost`. |
| CORS | Browser rule: a page may only read another origin's data if that server says yes. |
| APK | An Android app file you can install directly for testing. The store upload is a different format (AAB) — step 3. |

## Step 1 — the app can be built ✅

| # | Problem | What we did | Where | AceAg equivalent |
| --- | --- | --- | --- | --- |
| 1 | Next.js normally needs a server; the app has none. | Added an app build mode. `npm run build:native` makes plain files in `out/` (Next's "static export"), then copies them into both apps. | `next.config.mjs`, `package.json` | **Not needed.** Vite already builds plain files (`apps/ace-tool/dist`). AceWeather-only work. |
| 2 | Some pages only work with a server: `/version` (update check), `/share` (share-to-app), and the aceweather.app → www redirect. | Renamed them `*.web.ts(x)`. The website build includes them; the app build leaves them out. | `src/app/version/route.web.ts`, `src/app/share/page.web.tsx`, `middleware.web.ts` | `share.html` and the Vercel rewrites stay website-only. People opening a shared link use a browser — fine. |
| 3 | The app asked for `/api/atlas`. On the phone that means the phone itself, where there is no API. | One helper, `apiUrl()`, adds the live address in the app build. | `src/lib/api-base.ts` | **Same problem.** `/api/chat`, `/api/models`, `/api/nvz-lookup`, `/api/fetch-feeds` are asked for without an address, and `apiUrl()` exists only inside `AceToolDesktopHeader.jsx`. Needs one shared helper used everywhere. Supabase calls already use the full address. |
| 4 | The live API refused the app (CORS). | The API now says yes to the app's origins — and only those, so other websites can't borrow it. | `helpers.py`, `server.py`, `tests/test_cors.py` | Mostly done already: the root `api/*.mjs` functions and Supabase edge functions allow every origin (`*`). Check `api/threesixtyag.mjs`, which sets none. |
| 5 | Inside the app, any address without a file extension opens the home page (Capacitor's rule). A plain link to `/atlas` would show Weather. | The Atlas link now uses Next's `<Link>`, which swaps the page without reloading. | `src/components/aceweather-x/app.tsx` | **Already safe.** AceAg addresses are `#/…`, so the page is always `index.html`. Keep it that way — don't move to path addresses. |
| 6 | Need the wrapper itself. | Installed Capacitor 8 and generated `android/` and `ios/`. App ID `app.aceweather`. | `capacitor.config.ts`, `android/`, `ios/` | Same commands in `apps/ace-tool` with `webDir: "dist"`. The retired `apps/ace-mobile` used `app.aceag.mobile` — decide the final ID before AceAg's first upload. |
| 7 | Building Android needs Android Studio and its SDK. | GitHub builds the test app on every push that touches the app. | `.github/workflows/android.yml` | Same workflow, pointed at `apps/ace-tool`. |

The website is unchanged: its build still has `/share`, `/version` and the
redirect.

### Try it on an Android phone

1. GitHub → `aceweather` → **Actions** → **Android app** → latest green run.
2. **Artifacts** → `aceweather-android-debug` → download and unzip → `app-debug.apk`.
3. Get the file onto the phone (email, Drive), open it, and allow "install
   unknown apps" when asked.

Expect Weather and Atlas to load. Known gaps, fixed in step 2: location may
be refused, rain alerts won't fire, and the website's offline cache and
"update available" check are still switched on.

Optional, on a computer with Android Studio: `npm run build:native`, then
`npx cap open android`, then press Run.

## Before the first store upload

- **App ID** (`app.aceweather`) is permanent once uploaded to either store.
- **Accounts:** Apple Developer Program (£79/year). Google Play ($25 once);
  new personal accounts must run a closed test with 12 testers for 14 days
  before going public — start this early.
- **iOS builds** need a Mac with Xcode, or a cloud Mac (GitHub has macOS
  runners). Signing needs your Apple certificates — step 3.

## Next steps

- **Step 2 — behave like an app.** Switch off the website's offline cache and
  update check inside the app, ask for location properly, rain alerts as
  phone notifications, keep content clear of the notch, native share sheet.
- **Step 3 — store prep.** Icons and launch screen, privacy policy, store
  listings and screenshots, TestFlight and Play internal testing.

## AceAg checklist (collected so far)

- [ ] One shared `apiUrl()` for every `/api/*` call.
- [ ] Confirm CORS on `api/threesixtyag.mjs`.
- [ ] Keep `#/…` addresses.
- [ ] `share.html` and other public pages stay website-only.
- [ ] Android build workflow for `apps/ace-tool`.
- [ ] Choose the final app ID.
- [ ] Step 2: switch off `sw.js` / `share-sw.js` inside the app; test the
      PowerSync on-device database inside the app's browser window.
