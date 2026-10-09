# MCP investigation and verification — 9 October 2026

Repository: `rjbowes32/aceweather`, cloned into the requested Mac folder;
starting revision `feb6479` (master). No production deployment or plugin update
was performed during this investigation.

## Finding about the reported connectivity failure

**No MCP connectivity defect was reproduced on the current production server.**
The supplied failure describes a ChatGPT conversation whose tool registry lacked
AceWeather, rather than a failing weather-tool call. That report and the tests
below place the likely remaining issue at conversation/plugin attachment or
host-side discovery. Its exact underlying cause is **unconfirmed**: this session
cannot inspect the failing conversation's tool registration logs.

Production is MCP server 0.2.0; plugin package 1.0.0 is a separate version number.
The private USER-scoped plugin's actual package was read through Plugin Creator.
Both `mcp.json` and `.mcp.json` point at `https://aceweather.app/mcp` with
`streamable-http`, with no credentials. Its skill correctly instructs use of
discovered tools. No erroneous connection configuration or invented tool name
was found in the package. The prior failing response mentioned
`get_historical_weather`; the actual advertised name is `get_weather_history`.

The installed AceWeather tools **are** present in this Codex conversation.
`get_saved_location_groups` and `get_location_weather` both executed successfully
through that installed connection. This does **not** verify tool availability in
the user's affected ChatGPT conversation.

## Architecture and protocol checks

- Next.js `/mcp` delegates to `src/mcp/http.ts` and the official MCP SDK's
  WebStandard Streamable HTTP transport. Every POST builds a fresh stateless
  server; responses are JSON rather than SSE. No session header is issued.
- Public no-auth mode works in production. Optional static bearer mode exists
  for server-to-server usage; it is not an OAuth implementation.
- Python `/api/groups` and `/api/search` supply saved groups and location search.
  Forecasts reuse the dashboard service. History uses the shared archive adapter.
  Existing REST digest/report implementations remain in Python.
- Middleware exempts machine paths from the apex-to-www redirect. Live apex MCP
  initialization and www health requests returned directly, without redirects.
- POST initialization: **200**, `application/json`, protocol `2025-06-18`, tool
  capability and usage instructions present.
- POST `notifications/initialized`: **202**, empty body.
- GET `/mcp`: **405**, valid when no unsolicited SSE stream is offered.
  DELETE is likewise unsupported for the stateless endpoint.
- CORS permits POST/OPTIONS, authorization/content/accept/protocol/session headers
  and exposes MCP headers. OPTIONS returns 204 in automated tests. No CORS change
  was needed for server-to-server MCP traffic.
- Official SDK automated tests negotiate 2024-11-05, 2025-03-26, 2025-06-18 and
  2025-11-25; invalid protocol headers are rejected with 400. JSON-RPC IDs,
  content types, initialization notifications and stateless operation are exercised
  by the standard client. Existing tests cover auth, malformed JSON, oversized
  bodies, rate limits and upstream failures.

## Corrections made

The server was missing equivalent-date historical comparison and Crop Notes tools.
Server 0.3.0 adds `get_historical_comparison` and `get_crop_notes_weather` without
changing the existing 12 tool names or their behaviour. Server instructions now
identify those use cases and prohibit inventing missing-period anomalies.

Comparisons explicitly select **ERA5** for every year. They return liquid-rainfall
totals, period maximum/minimum and mean 2 m air temperatures, and mean soil
layer temperatures at 0–7 cm. Results include all seven Crop Dynamics locations,
regional statistics, individual baseline years, per-metric missing dates,
baseline counts, anomalies and 40 structured newsletter rows. They handle zero
rain baselines, incomplete years, leap years, invalid/future dates, upstream
outages and mismatched/oversized selectors. Regional means preserve the fixed
location population; failed data is not silently removed.

The archive adapter batches seven coordinate pairs per year: 11 requests rather
than 77. Existing caching and safe upstream errors are reused. Concurrency is
bounded to four; repeated comparisons reuse the cache. The existing MCP route's
maximum duration increases from 30 to 60 seconds to accommodate bounded upstream
calls. There is no new service, database, deployment infrastructure or UI change.

## Passed checks

| Check | Result |
| --- | --- |
| `npm run test:mcp` | **43 Node tests passed**, plus **4 Python API error tests passed** |
| Python discovery of `test_*.py` | **6 tests passed** |
| Production official SDK smoke | initialization + discovery of **12 tools**, **13 calls passed** (history is called twice) |
| Built local official SDK smoke | initialization + discovery of **14 tools**, existing **13 calls passed** with live upstream data |
| Local new-tool SDK verification | both new tools discovered and called successfully with live ERA5 data; output validated against advertised schemas |
| Production REST digest | **200**, `text/plain; charset=utf-8`, seven-location 14-day table |
| Local Python REST digest | **200**, same seven-location table and date window |
| www production deep MCP health | **200**, public auth, Python API `ok` |
| `npm run build` | production build and TypeScript check passed |
| ESLint on new comparison modules/scripts/tests and archive adapter | passed |
| `git diff --check` | passed |

The broader existing Node suite has **17 passes and 2 Atlas contract failures**:
“accepts a valid atlas.v1 payload” and “accepts an explicitly unavailable rain
layer”. Both failures were reproduced from an untouched `git archive HEAD`
checkout; they predate this change. Atlas/UI code was not changed.

## Requested Crop Notes result and data limit

`get_crop_notes_weather {"report_date":"2026-10-09"}` was executed over local
HTTP using the built app, the official SDK and live Open-Meteo data. It selects
**25 September–8 October 2026**, with those dates in **2016–2025** as baseline.
All ten baseline years were complete. Current ERA5 measurements were unavailable
for **4–8 October 2026** at all seven points. The live response had 5,215 of
5,390 expected location/period/metric/day measurements (96.75%).

The current regional liquid-rainfall average was **7.01 mm for the available nine
days only**, against a **46.59 mm full 14-day ten-year baseline**. These figures
must not be used to calculate a full-period anomaly. The tool correctly returned
null for those anomalies and `comparable: false`, retaining every missing date.

This lag is documented by the provider: ERA5 updates with a five-day delay.
[Open-Meteo historical API](https://open-meteo.com/en/docs/historical-weather-api)
recommends explicit ERA5/ERA5-Land for consistency over multiple years. Reanalysis
cannot provide complete 8 October measurements on 9 October from that source.
No forecast/IFS substitution or fabricated values were added to hide the gap.

## Remaining verification

The code changes are local and reviewable; production still advertises 12 tools.
After deploying via the existing Vercel workflow, run both SDK scripts against
the deployment and verify 14 tools. Then select the installed plugin in a fresh
ChatGPT conversation and successfully call the new tools there.
[OpenAI testing guidance](https://developers.openai.com/plugins/deploy/connect-chatgpt)
distinguishes endpoint tests from installed-plugin evaluation. The intermittent
conversation-level failure remains unresolved until reproduced and verified there.
