# AceWeather Report API

AceWeather exposes a plain-text weather report endpoint for any searched or saved place.

Machine-readable discovery is also available at:

- `/api`
- `/openapi.json`
- `/llms.txt`

## Endpoint

`/api/report`

## Query Options

Use either:

- `?query=Pocklington`
- `?lat=53.9093&lon=-0.7810&timezone=Europe/London&label=Pocklington,%20England,%20United%20Kingdom`

## Examples

Current deployed site:

- `https://aceweather.vercel.app/api/report?query=Pocklington`
- `https://aceweather.vercel.app/api/report?lat=53.9093&lon=-0.7810&timezone=Europe/London&label=Pocklington,%20England,%20United%20Kingdom`

Local development:

- `http://127.0.0.1:8000/api/report?query=Pocklington`

## What It Returns

- Plain text weather report
- Current conditions
- Recent historical context
- Forecast guidance
- Air quality
- Agronomy summary

## Related Endpoint

If you need the JSON payload that powers the dashboard, use:

`/api/weather`

## Good LLM Prompt

If you are giving the site to an LLM or agent, a reliable instruction is:

`Open /api or /openapi.json first, then call /api/report for the place I ask about.`
