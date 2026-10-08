# AceWeather MCP — Phase 1 audit, diagnostics and plan

Audited 8 October 2026 against `master` @ `404ff33` and the live site.

## 1. What exists

**Deployment.** One Vercel project. Next.js 16 frontend (`src/app`) plus Python serverless functions (`api/*.py`, 30 s max). `server.py` is the local stand-in for the Python functions. No database. No server-side cache: every API response is `Cache-Control: no-store`. `middleware.ts` redirects apex → `www` for non-API pages.

**Data providers** (all real, all in use):

| Provider | Used for | Where |
|---|---|---|
| Open-Meteo Forecast (`best_match`) | current, hourly, 14-day daily | `weather_sources.py`, `src/lib/aceweather/open-meteo.ts` |
| Open-Meteo Historical (ERA5 / ERA5-Land, from 1940) | history, climate window, on-this-day | `weather_sources.py` |
| Open-Meteo multi-model (ECMWF IFS, GFS, ICON, UKMO) | model comparison panel | `src/lib/multi-model.ts` (browser only) |
| Open-Meteo ECMWF IFS 0.25° | one-hour "verification" reading in reports | `weather_sources.py` |
| Open-Meteo Air Quality | AQI | `weather_sources.py` |
| Open-Meteo geocoding + OpenStreetMap Nominatim fallback | place search, postcodes | `weather_sources.py` |
| Meteomatics (optional credentials) | provider panel | `weather_sources.py` |
| Met Office radar, NHC / JTWC | radar, tropical storms | `src/lib`, `api/tropical.py` |

**Endpoints.** `/api` (index), `/api/search`, `/api/weather` (full JSON, 6–7 upstream calls), `/api/report` (md/csv/json, `period=`), `/api/snapshot` (AppSheet, optional bearer), `/api/digest` (Crop Dynamics text: brief/short/full), `/api/cropdynamics` (JSON), `/api/atlas`, `/api/onthisday`, `/api/tropical`, `/api/providers`. There is **no `/api/crop-dynamics-report`**; the nearest is `/api/cropdynamics`.

**Calculations.**

| Calculation | Python (`agronomy.py`, server) | TypeScript (`src/lib/aceweather/agronomy.ts`, browser) |
|---|---|---|
| Spray window | wind/gust/rain/prob/temp hours, next 24 h | Delta-T, inversion, rain-fast, verdict, next window |
| Disease | fungal pressure, Septoria proxy, Smith-period proxy | Hutton criteria, leaf-wetness pressure, Septoria from wet days |
| Soil / access | field-access score | SMD water balance, workability, soil profile |
| Establishment | — | drilling thermometer (soil 6 cm vs crop thresholds) |
| Thermal time | — | GDD, base 6 °C fixed |
| Frost | — | grass-minimum estimate, next 6 nights |
| Operations | — | spray / travel / spread / cut matrix; `work-windows.ts` rain+gust windows |
| Periods | `periods.py` (13 named periods) | — |

All disease outputs are labelled heuristic proxies, not validated pathology models. No pest model (aphid, BYDV, CSFB) exists anywhere.

**Atlas** is not a model engine. `api/atlas.py` serves a hand-curated, dated snapshot (AHDB harvest, Environment Agency drought, Met Office climate, AHDB RL and forage) refreshed by commits, plus live 29-day rain from the Crop Dynamics summary. **There is no Atlas Scout** in the repository.

**Crop Dynamics** is configured in `lib.CANONICAL_REGION_SETS["cropdynamics"]` as 7 locations: Scotch Corner, **Boroughbridge**, Pocklington, **Alford / East Lindsey**, Sleaford, Longhirst, Berwick. Against the brief: **Darlington and West Lindsey are not configured**, Boroughbridge is configured but not in the brief, and the configured Alford point is labelled East Lindsey (West Lindsey is a different district). Left unchanged pending your decision.

## 2. `/api/digest` diagnostics (real requests, 14:44–14:50 UTC)

| Check | Result |
|---|---|
| `GET /api/digest` (apex and www) | 200 `text/plain`, 4.8–6.6 s, served by the Python function (`x-matched-path: /api/digest`) |
| `format=short` | 200 in 1.0–1.7 s |
| `mode=full` | 200 in **20.3 s** (27 KB) — two-thirds of the 30 s function limit |
| User agents: Chrome, python-urllib, ChatGPT-User, GPTBot, ClaudeBot, Claude-User, empty | all 200, identical bodies |
| `HEAD` | 200 |
| Bot protection | none: `server: Vercel`, no Cloudflare headers or challenge pages |
| Authentication | none required |
| CORS | no `Access-Control-*` headers; `OPTIONS` → **501** |
| Redirects | `/api/*` stays on apex, but `/api` (index), `/llms.txt`, `/openapi.json`, `/robots.txt` and `/mcp` → **307 to www** |
| `robots.txt` | apex 307 → www **404** (HTML) |
| Bad input | 400 JSON (`set=nope`, `history_days=9999`) |
| Unknown `/api/*` path | 404 `DNS_HOSTNAME_RESOLVED_PRIVATE`: `next.config.mjs` rewrites unmatched `/api/*` to `127.0.0.1:8000` in production |
| Upstream failure | **crash**: handlers call `lib._log`, which did not exist. Any Open-Meteo error or timeout became an unhandled `AttributeError` (Vercel 500) instead of the intended 502 JSON. Reproduced with a mocked Open-Meteo 429. Affects digest, report, weather, cropdynamics, search, snapshot |
| Upstream quota | Open-Meteo returned `429 Daily API request limit exceeded` to this test environment's shared IP. A brief digest makes 14 upstream calls, a full digest 42, and nothing is cached |

Two connection resets seen during testing came from this session's own egress proxy (its relay log), not from aceweather.app.

**Conclusion.** The digest is reachable by automated clients; nothing blocks bots. Failures come from (1) Open-Meteo throttling or slowness turning into a 500 crash — **fixed**; (2) 5–7 s brief and 20 s full responses exceeding short fetcher budgets; (3) fetchers that will not follow redirects, or need the URL in prior context, failing on apex `/api`, `/llms.txt`, `/openapi.json` — **fixed** in `middleware.ts`; (4) browser clients blocked by missing CORS (unchanged for `/api`; `/mcp` sends CORS). MCP does not fix (1)–(2) on its own; caching does.

**Done since:** successful digest, cropdynamics and report responses now send `Cache-Control: public, s-maxage=600, stale-while-revalidate=600`, so Vercel's edge answers repeats for 10 minutes (at most 20 minutes old). Errors stay `no-store`.

**Still recommended:** stop the production `/api/*` catch-all rewrite (`if (!process.env.VERCEL)`); add a `robots.txt`.

**Licensing:** Open-Meteo's free API is for non-commercial use. AceWeather is a personal project, so the free tier fits.

## 3. Architecture

```
ChatGPT · Claude · Claude Code · Cursor · MCP Inspector
   │  POST https://aceweather.app/mcp   Streamable HTTP, stateless, JSON responses
   ▼
Next.js route  src/app/mcp/route.ts  (Node, same Vercel project, 30 s max)
   │  src/mcp/http.ts: CORS · optional bearer · per-client rate limit · 64 KB body cap · JSON logs
   │  src/mcp/server.ts: McpServer + read-only tools (src/mcp/tools/*)
   │  src/mcp/cache.ts: per-instance TTL cache + in-flight de-duplication
   ├─▶ AceWeather Python API (same deployment): /api/search, /api/groups
   │      (later: /api/cropdynamics, /api/digest, /api/atlas — reused, not rebuilt)
   └─▶ Open-Meteo via the dashboard's own TS clients
          fetchForecast (open-meteo.ts) · fetchMultiModel (multi-model.ts) · archive · model run metadata
```

**Endpoint: `https://aceweather.app/mcp`.** Same project and deploy, no DNS or certificate work, same origin as `/api`. A subdomain adds a domain and host routing for no security gain while the tools are public. `/mcp` is exempt from the apex → www redirect (MCP clients do not reliably follow redirects on POST). `www.aceweather.app/mcp` also works.

**Why TypeScript calls Open-Meteo directly for forecasts and history.** Those Python helpers are thin fetches; the TS dashboard already has the same clients (`fetchForecast`, `fetchMultiModel`) and Phase 4 will reuse `buildAgronomy` from the same payload, so MCP results match the dashboard. Composite products with Python-only logic (search fallback, groups, Crop Dynamics, digest, Atlas) are called over HTTP so that logic stays in one place.

**Security model.** Read-only tools only. Public weather tools are open, like the public `/api`. `ACEWEATHER_MCP_TOKEN` can lock the endpoint to a bearer token. No farm or field data is held or served.

## 4. Tool inventory

| Tool | Phase | Status | Backed by |
|---|---|---|---|
| search_locations | 2 | **done** | `/api/search`, saved groups |
| get_saved_location_groups | 2 | **done** | `/api/groups` (new, reads `CANONICAL_REGION_SETS`) |
| get_location_weather | 2 | **done** | forecast + archive |
| get_regional_weather | 2 | **done** | archive (+ forecast totals), up to 12 locations or a group |
| get_current_weather | 2 | **done** | forecast `current` (model) |
| get_weather_history | 2 | **done** | archive daily (1940→yesterday) or recent model hours |
| get_weather_digest | 2 | **done** | archive summary |
| get_hourly_forecast / get_daily_forecast | 2 | **done** | forecast (14 days) |
| get_extended_forecast | 2 | **done** | forecast days 8–14 (nothing beyond 14 exists) |
| compare_forecast_models | 2 | **done** | `fetchMultiModel` + model run metadata |
| get_forecast_confidence | 2 | **done** | inter-model agreement (stated method) |
| get_historical_comparison, get_weather_anomalies, get_weather_records | 3 | planned | archive; 5/10/20/30-year windows reported as actually available |
| get_soil_conditions, get_drilling_conditions, get_spray_windows, get_fungal_disease_pressure, get_growing_degree_days, get_water_balance, get_frost_risk, get_harvest_conditions, get_weather_operation_windows | 4 | planned | `agronomy.ts` / `agronomy.py` / `work-windows.ts` as they are |
| get_pest_weather_risk | 4 | **needs a decision** | no pest model exists; only raw weather indicators could be offered |
| get_atlas_report, get_atlas_insights, get_atlas_weather_drivers, compare_atlas_periods, get_atlas_capabilities | 5 | planned | `/api/atlas` (curated snapshot) — capabilities will say there are no Atlas disease/pest models and no Scout |
| get_crop_dynamics_weather, get_crop_notes_weather, compare_crop_dynamics_seasons | 5 | planned | `/api/cropdynamics`, `/api/digest` unchanged |
| get_field_weather | — | dropped | not needed; pass the field's coordinates to any tool |

## 5. Plan

1. **Phase 3 — historical intelligence.** Comparison against prior years and multi-year means from the archive; anomalies vs those means; records/extremes over the available span. Verify: fixtures with known means; a 30-year request over 10 years of data reports 10.
2. **Phase 4 — agronomy.** Wrap the existing calculations without changing thresholds; each result carries method, inputs (measured vs modelled), limitations; GDD base made a parameter. Verify: parity tests against the dashboard functions on the same payload.
3. **Phase 5 — Atlas and Crop Dynamics.** Call the Python endpoints; `/api/digest` untouched. Verify: existing digest and Atlas tests plus MCP output for the group.
4. **Deploy and verify (done 8 Oct 2026).** Live at `https://aceweather.app/mcp`; `node scripts/mcp-smoke.mjs https://aceweather.app/mcp` passes 13/13; connected in Claude. Optional: a Vercel firewall rate-limit rule on `/mcp`.

AceAg integration (Phase 6) is dropped: AceWeather stays standalone.
