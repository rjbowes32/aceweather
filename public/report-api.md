# AceWeather Report API

AceWeather exposes a plain-text weather report endpoint for any searched or saved place.

For agent workflows that need a standard regional bundle from one unlocked URL, use:

- `https://aceweather.app/api/cropdynamics`
- `https://aceweather.app/api/digest?set=cropdynamics`
- `https://aceweather.app/api/digest?set=cropdynamics&history_days=29`
- `https://aceweather.app/api/digest?set=cropdynamics&history_days=29&format=short`

That Crop Dynamics bundle is intentionally slim. It returns, for each region:

- JSON via `/api/cropdynamics`: location, date range, rain mm, high C, low C
- observed rainfall for the requested historical window, defaulting to the last 7 days
- observed temperature highs and lows for the requested historical window
- forecast rainfall for the next 7 days
- forecast temperature highs and lows for the next 7 days

Use `format=short` for a faster historical-only summary table without forecast or daily rows.

Machine-readable discovery is also available at:

- `/api`
- `/openapi.json`
- `/llms.txt`

## Endpoint

`https://aceweather.app/api/report`

## Query Options

Use either:

- `?query=Pocklington`
- `?lat=53.9093&lon=-0.7810&timezone=Europe/London&label=Pocklington,%20England,%20United%20Kingdom`

## Examples

Current deployed site:

- `https://aceweather.app/api/report?query=Pocklington`
- `https://aceweather.app/api/report?lat=53.9093&lon=-0.7810&timezone=Europe/London&label=Pocklington,%20England,%20United%20Kingdom`
- `https://aceweather.app/api/cropdynamics`
- `https://aceweather.app/api/digest?set=cropdynamics`
- `https://aceweather.app/api/digest?set=cropdynamics&history_days=29`
- `https://aceweather.app/api/digest?set=cropdynamics&history_days=29&format=short`

Local development:

- `http://127.0.0.1:8000/api/report?query=Pocklington`

## What It Returns

- Plain text weather report
- Current conditions
- Recent historical context
- Forecast guidance
- Air quality
- Agronomy summary

## Crop Dynamics Bundle

`https://aceweather.app/api/cropdynamics`

This is the fastest JSON endpoint for LLM or browser-fetch tools. It defaults to the last 29 historical days ending yesterday and returns one compact `locations` array.

`https://aceweather.app/api/digest?set=cropdynamics`

This is the fixed LLM-friendly bundle endpoint. It is shorter than the full report flow and is meant to reduce timeouts.

Add `history_days=<days>` to change how many historical days are pulled back from the current day. Historical observations end yesterday, so on 4 June 2026, `history_days=29` covers 6 May through 3 June.

Add `format=short` for the fastest LLM-friendly regional comparison. It returns one table with location, date range, rain in mm, high C, and low C.

## Related Endpoint

If you need the JSON payload that powers the dashboard, use:

`/api/weather`

If you need a compact AppSheet-friendly JSON webhook response, use:

`/api/snapshot`

## Crop Dynamics Set

The canonical Crop Dynamics regional URLs are:

- `https://aceweather.app/api/report?query=Scotch%20Corner`
- `https://aceweather.app/api/report?query=Boroughbridge`
- `https://aceweather.app/api/report?query=Pocklington`
- `https://aceweather.app/api/report?query=Alford%2C%20Lincolnshire`
- `https://aceweather.app/api/report?query=Sleaford`
- `https://aceweather.app/api/report?query=Longhirst%2C%20Northumberland%2C%20England`
- `https://aceweather.app/api/report?query=Berwick-upon-Tweed`

## AppSheet Snapshot Endpoint

`https://aceweather.app/api/snapshot`

Use either:

- `GET https://aceweather.app/api/snapshot?query=Pocklington`
- `POST https://aceweather.app/api/snapshot` with a JSON body such as `{"query":"Pocklington","station":"demo-station-1"}`

The response is compact JSON intended for webhook return values, including fields such as:

- `temp_avg`
- `precip_mm`
- `humidity`
- `snapshot_time`
- `today_high_c`
- `today_low_c`
- `current_temp_c`
- `history_7d_precip_mm`
- `forecast_7d_precip_mm`

If a fetcher requires exact URLs to appear in a previous response before it can call them, fetching `https://aceweather.app/api`, `https://aceweather.app/api/digest?set=cropdynamics`, or the AceWeather homepage first will expose the whole set.

## Good LLM Prompt

If you are giving the site to an LLM or agent, a reliable instruction is:

`Open https://aceweather.app/api or https://aceweather.app/openapi.json first, then call https://aceweather.app/api/report for the place I ask about.`
