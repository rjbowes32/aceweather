# AceWeather MCP server

Remote, read-only [Model Context Protocol](https://modelcontextprotocol.io) server for AceWeather.

- Endpoint: `https://aceweather.app/mcp` (Streamable HTTP, stateless, JSON responses)
- Health: `https://aceweather.app/mcp/health` (`?deep=1` also checks the Python API)
- Code: `src/mcp/`, route `src/app/mcp/route.ts`; audit and plan: [AUDIT.md](AUDIT.md)

## Tools

Every tool is read-only and returns one JSON envelope (also sent as text for clients that ignore structured content):

| Field | Meaning |
|---|---|
| `summary` | one human-readable sentence |
| `classification` | `model_current`, `model_recent`, `forecast`, `reanalysis`, `calculated`, `reference` or `mixed` |
| `location` | name, coordinates, timezone, elevation and how it was resolved (`geocoded`, `coordinates`, `saved_location`; alternatives when ambiguous) |
| `period` | label, start/end (local dates) or hours, timezone, `years_ago` |
| `units` | units for every value |
| `sources` | provider, model, issue time where published, retrieval time, notes |
| `completeness` | expected / available / missing (and which dates) |
| `warnings` | anything the reader must know: ambiguity, modelled values, clamping, gaps |
| `data` | the tool's values |

**Location fields** (one of): `place` (town, village, UK postcode, region, or `"lat,lon"`), `latitude` + `longitude`, `saved_location` (`group/slug`, e.g. `cropdynamics/pocklington`). Optional `timezone` (IANA); defaults to the location's own.

**Period fields** (history tools): `period` — `today`, `last_24h`, `last_48h`, `last_72h`, `yesterday`, `last_7d`, `last_14d`, `last_21d`, `last_30d`, `last_90d`, `last_365d`, `this_week`, `last_week`, `last_month`, `month_to_date`, `season_to_date` (meteorological), `year_to_date`, `calendar_year`, `agricultural_year`, `custom`; `start_date`/`end_date` (YYYY-MM-DD); `year`; `years_ago` (the same window N years earlier); `agricultural_year_start_month` (default 9). Dates are the location's local calendar. Daily history ends yesterday, starts no earlier than 1940-01-01, and covers at most 730 days per call.

**Common options:** `wind_unit` (`kmh` default, `mph`, `ms`, `kn`); `detail` (`compact` default, `full`).

| Tool | Parameters | Returns |
|---|---|---|
| `search_locations` | `query`, `limit` (1–10) | candidates (name, admin1, country, coordinates, timezone, feature code, source) and matching saved locations |
| `get_saved_location_groups` | `group?` | groups and their locations with ids and coordinates |
| `get_location_weather` | location, `wind_unit`, `detail` | modelled current conditions, next 7 days, last 7 days summary |
| `get_regional_weather` | `locations[]` (≤12) **or** `group`, period, `forecast_days` (0–7), `wind_unit` | per-location summaries, rankings, regional mean; failed locations reported |
| `get_current_weather` | location, `wind_unit` | current temperature, feels-like, humidity, dew point, pressure, cloud, wind, gust, direction, rain, visibility, UV, today's max/min/rain |
| `get_weather_history` | location, period, `wind_unit`, `detail` | daily rows (monthly beyond 31 days, or 366 with `full`) or hourly rows, plus summary |
| `get_weather_digest` | location, period, `wind_unit` | summary only: rain total, rain/wet days, wettest day, max/min, mean, frost days, max gust, humidity, ET0, sunshine, radiation, soil temperature and moisture, longest dry/wet spell |
| `get_hourly_forecast` | location, `hours` (1–168), `wind_unit`, `detail` | hourly rows from the current hour, totals, first rain |
| `get_daily_forecast` | location, `days` (1–14), `wind_unit`, `detail` | daily rows, totals |
| `get_extended_forecast` | location, `wind_unit`, `detail` | days 8–14 with lead times |
| `compare_forecast_models` | location, `days` (1–7), `wind_unit` | ECMWF IFS, GFS, ICON, UKMO daily values, run times, per-day spread |
| `get_forecast_confidence` | location, `days` (1–7) | high/medium/low for temperature, rain, wind and overall, with the method |
| `get_historical_comparison` | location **or** `group`; `report_date`, `history_days` (1–31, default 14) **or** `start_date`/`end_date`; `baseline_years` (1–10, default 10) | ERA5 calendar-period statistics, per-metric completeness, yearly baselines, anomalies, regional comparisons and newsletter rows |
| `get_crop_notes_weather` | `report_date`, `history_days` (1–31, default 14) | the same comparison for all seven Crop Dynamics saved locations over the previous ten years |

Definitions used in summaries: rain day ≥ 0.2 mm; wet day ≥ 1 mm; dry spell = consecutive days < 0.2 mm; wet spell = consecutive days ≥ 1 mm; air frost = minimum < 0 °C. A missing day ends a spell and is never counted as zero rain.

### Example responses

`get_current_weather {"place": "Pocklington"}` (location and units trimmed):

```json
{
  "tool": "get_current_weather",
  "summary": "Pocklington, England, United Kingdom at 2026-10-08T16:00 (Europe/London): 13.6 °C, Overcast, wind 13.7 gusting 25.6 km/h, humidity 48%. Modelled, not measured.",
  "classification": "model_current",
  "location": { "name": "Pocklington, England, United Kingdom", "latitude": 53.93335, "longitude": -0.78106, "timezone": "Europe/London", "elevation_m": 37,
                "resolution": { "method": "geocoded", "query": "Pocklington", "ambiguous": false, "feature_code": "PPLA3" } },
  "sources": [{ "name": "Open-Meteo Forecast API", "model": "best_match (seamless blend of national and global models)", "classification": "model_current", "retrieved_at": "2026-10-08T15:10:07.216Z" }],
  "warnings": ["Modelled grid-point conditions; local station readings can differ, especially for rainfall and wind."],
  "data": { "current": { "valid_at": "2026-10-08T16:00", "interval_minutes": 15, "temperature_c": 13.6, "apparent_temperature_c": 9.9,
    "relative_humidity_pct": 48, "dew_point_c": 2.8, "pressure_hpa": 1019.6, "cloud_cover_pct": 81, "wind_speed": 13.7, "wind_gust": 25.6,
    "wind_direction_deg": 292, "wind_direction_compass": "WNW", "precipitation_mm": 0, "visibility_km": 47.8, "uv_index": 0.3,
    "condition": "Overcast", "is_day": true,
    "today": { "temp_max_c": 13.6, "temp_min_c": 4.3, "precipitation_mm": 3.1, "precipitation_probability_pct": 100 } } }
}
```

`get_weather_digest {"saved_location": "cropdynamics/sleaford", "period": "last_30d"}`:

```json
{
  "summary": "Sleaford, England, United Kingdom, Last 30 days (2026-09-08 to 2026-10-07): 40.3 mm rain, 16 rain day(s), high 24.6 °C, low 6.6 °C. Data 100% complete (reanalysis).",
  "classification": "reanalysis",
  "period": { "period": "last_30d", "start": "2026-09-08", "end": "2026-10-07", "days": 30, "timezone": "Europe/London", "years_ago": 0 },
  "sources": [{ "name": "Open-Meteo Historical Weather API", "model": "ERA5 / ERA5-Land reanalysis, with ECMWF IFS analysis for the most recent days",
                "notes": "Gridded reanalysis (about 9-25 km), not a station or farm rain gauge.", "classification": "reanalysis" }],
  "completeness": { "expected": 30, "available": 30, "missing": 0, "percent": 100 },
  "data": { "summary": { "precipitation_total_mm": 40.3, "rain_days": 16, "wet_days": 9, "wettest_day": { "value": 13.3, "date": "2026-10-07" },
    "temp_max": { "value": 24.6, "date": "2026-09-22" }, "temp_min": { "value": 6.6, "date": "2026-10-04" }, "temp_mean_c": 16,
    "air_frost_days": 0, "wind_gust_max": { "value": 64.4, "date": "2026-09-19" }, "relative_humidity_mean_pct": 74, "et0_total_mm": 73.6,
    "sunshine_total_h": 266, "soil_temp_mean_0_7cm_c": 16.6, "soil_moisture_latest_0_7cm": { "value": 0.337, "date": "2026-10-07" },
    "longest_dry_spell_days": 5, "longest_wet_spell_days": 2 } }
}
```

Errors come back as tool errors: `{"error": {"code": "invalid_input" | "not_found" | "upstream_timeout" | "upstream_rate_limited" | "upstream_unavailable" | "internal_error", "message": "..."}}`. Messages never include upstream URLs, secrets or stack traces.

## Authentication

- **Default: public.** The tools serve the same public weather data as `/api`, so no sign-in is needed. This is what ChatGPT's and Claude's "no authentication" connector option expects.
- **Locked mode:** set `ACEWEATHER_MCP_TOKEN` in Vercel. Every request then needs `Authorization: Bearer <token>`. Use it for server-to-server clients; ChatGPT and Claude connectors support only no-auth or OAuth, so they cannot use it.
- No farm or field data is held or served; a field is just a `latitude` + `longitude`.

## Deployment

Nothing extra to provision: `/mcp` ships with the Next.js app on the existing Vercel project.

1. Push the branch; Vercel builds a preview.
2. `node scripts/mcp-smoke.mjs https://<preview-host>/mcp` (previews behind Deployment Protection need a bypass token; see Vercel docs).
3. Merge. Production serves `https://aceweather.app/mcp` and `https://www.aceweather.app/mcp`.
4. Recommended: a Vercel Firewall rate-limit rule on `/mcp` (for example 120 requests/min per IP). The built-in limiter is per instance.

| Variable | Default | Purpose |
|---|---|---|
| `ACEWEATHER_MCP_TOKEN` | unset (public) | require a bearer token |
| `ACEWEATHER_MCP_RATE_LIMIT_PER_MIN` | `60` | per-client requests per minute, per instance |
| `ACEWEATHER_API_BASE` | production domain on Vercel, else `ACEWEATHER_API_PROXY_TARGET` or `http://127.0.0.1:8000` | where `/api/search` and `/api/groups` are called |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | unset | sent to protected preview deployments |
| `ACEWEATHER_MCP_LOG` | on | `off` silences JSON logs (tests) |

Local: `python server.py` and `npx next dev`, then `node scripts/mcp-smoke.mjs http://127.0.0.1:3000/mcp`.

Tests: `node --test tests/mcp/*.test.mjs` (fake upstreams; covers discovery, validation, location resolution, periods, timezones, units, missing data, labelling, auth, rate limits, failures, large and group requests) and `python3 -m unittest tests.test_api_errors`.

## Connecting ChatGPT

Requires a ChatGPT plan with developer mode / custom connectors.

1. Settings → Apps & Connectors → Advanced settings → turn on **Developer mode**.
2. Create a connector: name `AceWeather`, MCP server URL `https://aceweather.app/mcp`, authentication **No authentication**.
3. In a chat, enable AceWeather from the tools menu and ask a weather question.

Menu names change; OpenAI's help page "Connectors in ChatGPT" has the current steps.

## Connecting other clients

- **Claude (web/desktop):** Settings → Connectors → Add custom connector → `https://aceweather.app/mcp`.
- **Claude Code:** `claude mcp add --transport http aceweather https://aceweather.app/mcp`
- **Cursor / VS Code:** in `mcp.json`: `{"servers": {"aceweather": {"type": "http", "url": "https://aceweather.app/mcp"}}}`
- **MCP Inspector:** `npx @modelcontextprotocol/inspector`, transport Streamable HTTP, URL as above.
- **Any SDK client:** see `scripts/mcp-smoke.mjs`. With locked mode, add `Authorization: Bearer <token>`.

## Example questions

- "What's the weather doing at Pocklington right now?"
- "How much rain fell in Sleaford over the last 30 days, and how many rain days?"
- "Compare rainfall across the Crop Dynamics locations for the past fortnight and give me the next 3 days too."
- "Was this September wetter than September last year at YO42 2AB?" (history with `years_ago: 1`)
- "Hourly wind and gusts for 53.93, -0.78 tomorrow morning in mph."
- "Do the models agree on rain this weekend near Alford, Lincolnshire?"
- "What's the week-2 outlook for Berwick?"

## Provenance and limitations

- **Current** values are the forecast model's current-hour analysis at the grid point (`model_current`), not a station reading.
- **Recent hours** (`today`, `last_24h/48h/72h`) are the model's recent hindcast (`model_recent`).
- **Daily history** is ERA5 / ERA5-Land reanalysis via Open-Meteo (`reanalysis`): gridded at roughly 9–25 km, smooths local showers, and is not a rain gauge. The latest one or two days can lag; missing days are listed and excluded from totals.
- **Forecasts** use Open-Meteo `best_match`, which blends models and has no single issue time; `compare_forecast_models` gives each model's run time. Skill falls with lead time; days 8–14 are an outlook and nothing beyond 14 days is offered.
- **Confidence** is agreement between four deterministic models with the thresholds stated in each response; it is not an ensemble probability.
- **Named regions** resolve to a single point; use `get_regional_weather` with several locations for area-wide figures.
- Results are weather information, not agronomic advice, diagnoses or product recommendations.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Client says the server redirected or returned HTML | Use `/mcp` on a deployment that includes this change (older deployments redirect apex `/mcp` to `www`). |
| HTTP 405 | Only `POST` is served (stateless; no SSE stream on `GET`). |
| HTTP 401 | `ACEWEATHER_MCP_TOKEN` is set; send `Authorization: Bearer <token>`. |
| HTTP 429 | Per-client limit; wait for `Retry-After`. |
| `upstream_rate_limited` | Open-Meteo quota reached for the deployment's IP; retry later or move to a paid Open-Meteo key. |
| `upstream_timeout` | An upstream took over 10 s; retry. Repeats within 15 min (forecast) or 1 h (archive) hit the cache. |
| `not_found` for a place | Try a more specific name, a postcode or coordinates; `search_locations` shows candidates. |
| Wrong place picked | Check `warnings` and `location.resolution.candidates`; pass coordinates or a saved location. |
| Saved locations missing | `/mcp/health?deep=1` must report `aceweather_api: ok`; check `ACEWEATHER_API_BASE`. |
| Logs | Vercel function logs: one JSON line per request (`http_request`) and per tool call (`tool_call`, `upstream_error`), with a hashed client id. |

## Crop Notes and historical comparisons (MCP server 0.3.0)

Call `get_crop_notes_weather {"report_date":"2026-10-09"}` for the requested
newsletter. It selects **25 September–8 October 2026** and those same calendar
dates in **2016–2025**, independently of when the report is regenerated.
A future report date is refused. Historical custom windows end before today;
comparison windows are limited to 31 days and baseline years to ten.

The tools reuse saved groups from `/api/groups`, the existing archive adapter,
cache, upstream error handling, timezone/date utilities and MCP envelope. No UI
or existing Python REST endpoint changes are required. There are eleven batched
archive requests for the default seven-location report (one per year), with at
most four in flight. The MCP route allows 60 seconds for those bounded requests.

The comparison pins `models=era5` throughout. Source documentation:
[Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api).
Air temperatures are at 2 m. Soil temperatures are the mean over the **0–7 cm
layer**, not a reading at a single depth. Rainfall is `rain_sum`, excluding snow.
Each current/yearly metric contains `value`, `complete`, `available_days`,
`expected_days` and every `missing_dates` entry. Missing data is never zero-filled
or replaced with IFS/forecast data. The recent archive can lag by five days or more.

A baseline is the mean of the preceding N complete, equal-length calendar-period
statistics, with the number of usable years reported separately for every metric.
It is not a 30-year climate normal. February 29 is clamped in non-leap years;
unequal window lengths are disclosed and excluded from anomalies. Full-period
anomalies require a complete current metric and all N usable baseline years.
Absolute anomalies are current minus baseline; rain percentage anomalies divide
by the baseline and are null when it is zero. Calculations precede rounding.

Regional rainfall, mean air and mean soil temperatures are equal-weight averages
across all requested locations. Regional maximum/minimum temperatures are the
extremes across those locations. A missing location is never silently dropped.
`newsletter_rows` gives five metrics per location plus five regional rows, with
`current`, `baseline_mean`, `baseline_years_available`, `anomaly`,
`anomaly_percent`, units and a `complete` flag. Incomplete current values represent
available days only; do not publish them as the full requested period.

Verify an updated deployment and save newsletter data:

```sh
node scripts/mcp-crop-notes.mjs https://<updated-host>/mcp 2026-10-09 /tmp/crop-notes.json
```

## Tool availability in ChatGPT

A registered/enabled plugin does not establish that an individual conversation
received its MCP tools. Test the exact endpoint with the official SDK first:

```sh
node scripts/mcp-smoke.mjs https://aceweather.app/mcp
```

GET 405 is permitted by the
[Streamable HTTP specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
when the server does not offer an unsolicited SSE stream. POST initialization,
`notifications/initialized` (202, no body), `tools/list` and `tools/call` are the
relevant tests. Do not change a working stateless transport merely to make GET
return 200. Session IDs are optional and this server does not issue one.

Use the exact discovered names: the historical tool is `get_weather_history`,
not `get_historical_weather`. For the private plugin, select `@aceweather` in a
new conversation and execute an actual tool call; registration alone is not a
verification. See [OpenAI connection testing guidance](https://developers.openai.com/plugins/deploy/connect-chatgpt).
If tools remain absent despite successful endpoint tests, capture the affected
conversation, plugin version and failure time for host-side investigation.
Do not report the affected ChatGPT integration as fixed until that conversation
can discover and call the tools. See [VERIFICATION.md](VERIFICATION.md) for this audit.
