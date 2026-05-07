# AceWeather Report API

AceWeather exposes a plain-text weather report endpoint for any searched or saved place.

For agent workflows that need a standard regional bundle from one unlocked URL, use:

- `https://aceweather.app/api/digest?set=cropdynamics`

That Crop Dynamics bundle is intentionally slim. It returns, for each region:

- observed rainfall for the last 7 days
- observed temperature highs and lows for the last 7 days
- forecast rainfall for the next 7 days
- forecast temperature highs and lows for the next 7 days

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
- `https://aceweather.app/api/digest?set=cropdynamics`

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

`https://aceweather.app/api/digest?set=cropdynamics`

This is the fixed LLM-friendly bundle endpoint. It is shorter than the full report flow and is meant to reduce timeouts.

## Related Endpoint

If you need the JSON payload that powers the dashboard, use:

`/api/weather`

## Crop Dynamics Set

The canonical Crop Dynamics regional URLs are:

- `https://aceweather.app/api/report?query=Pocklington`
- `https://aceweather.app/api/report?query=Boroughbridge`
- `https://aceweather.app/api/report?query=Sleaford`
- `https://aceweather.app/api/report?query=Scotch%20Corner`
- `https://aceweather.app/api/report?query=Longhirst`
- `https://aceweather.app/api/report?query=Berwick-upon-Tweed`

If a fetcher requires exact URLs to appear in a previous response before it can call them, fetching `https://aceweather.app/api`, `https://aceweather.app/api/digest?set=cropdynamics`, or the AceWeather homepage first will expose the whole set.

## Good LLM Prompt

If you are giving the site to an LLM or agent, a reliable instruction is:

`Open https://aceweather.app/api or https://aceweather.app/openapi.json first, then call https://aceweather.app/api/report for the place I ask about.`
