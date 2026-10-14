# Daily learning job

Added 14 October 2026. Code: `scripts/learning/daily.mjs` (job), `src/mcp/learning-store.ts` (state, fits, scoring), `.github/workflows/learning-daily.yml` (schedule). Not deployed yet.

## What it does

Once a day, for every UK reference station:

1. **Observations.** Met Office stations come from one UK-wide MeteoGate query covering the last 25 hours, about 195 stations in a single response of about 1 MB. Airports come from the Iowa Environmental Mesonet METAR archive, and COSMOS-UK sites from their API. A new Met Office station is backfilled once from NOAA's GHCNh archive where it has a WMO id. Without one, it builds history from daily MeteoGate data and becomes usable after 20 days.
2. **Model errors.** It fetches each model's archived forecasts (Open-Meteo Previous Runs, lead days 1–7) for the last six days. It then recomputes each day's error sums per lead and model. The state keeps these daily error sums for 75 days, never raw history.
3. **Fits.** For each lead it builds weights and blend bias from the last 60 days, using `learning.ts`, the same maths as the backtest.
4. **Live scoring.** For each fully observed day it scores the learned forecast against the standard one. The learned forecast only uses fits from before that forecast's issue date. The pooled last-30-day result goes into `fits.json` and the daily history into `scores.json`.

`get_learned_forecast` reads `fits.json`, chooses the nearest representative station by the same rules as before (80 km, 250 m, 20 training days) and applies its weights instantly. If the file is missing or more than three days old, it falls back to learning on demand, which is slower.

## Dashboard

The dashboard loads its Open-Meteo forecast as before. In parallel it calls `GET /learned-forecast?lat=…&lon=…&tz=…` (`src/app/learned-forecast/route.ts`) and overlays the returned hourly temperature, wind and rain for the next seven days (`src/lib/aceweather/learned.ts`). Days containing learned hours get their max, min, rain total and peak wind recomputed. Feels-like temperature shifts with the air temperature, and a gust is never shown below the learned mean wind. Everything else stays as Open-Meteo's: current conditions, humidity, cloud, soil and rain probability. If the endpoint fails, the page simply keeps Open-Meteo's values. Responses are edge-cached for 15 minutes, and coordinates are rounded to about 1 km. The Data sources card names the reference station.

## Files

| File | Size (12 stations / about 220 UK-wide) | Used by |
|---|---|---|
| `state.json` (published gzipped) | 2 MB / about 35 MB | the job only |
| `fits.json` | 27 KB / about 500 KB | `get_learned_forecast` via `ACEWEATHER_LEARNED_FITS_URL` |
| `scores.json` | the last 120 days of pooled live scores | monthly review |

## Running it

```bash
node scripts/learning/daily.mjs --only-near scripts/backtest/sites.json --radius 25 --max-bootstrap 12
```

That is a local test on about 30 northern stations. With no options it covers the whole UK, backfilling up to 60 new stations per run, so the first full coverage takes about four daily runs. Point the forecast at the local output with `ACEWEATHER_LEARNED_FITS_FILE=.cache/learning/fits.json`.

To enable it in production:

1. Merge the workflow to the default branch. It runs at 05:30 UTC daily, or by hand from the Actions tab.
2. After the first run, set `ACEWEATHER_LEARNED_FITS_URL=https://github.com/rjbowes32/aceweather/releases/download/learning-data/fits.json` in Vercel.

## Cost and limits

- **Open-Meteo:** a daily update is one six-day archived-forecast request per station, about 9 of the API's call units each, so about 2,000 a day UK-wide. A backfill is about 45 units per station, capped by `--max-bootstrap`. Both stay within the free non-commercial allowance of 10,000 a day.
- **NOAA GHCNh:** each station's year file is downloaded only when that station is backfilled, never daily.
- **GitHub:** one job a day of 5–30 minutes, on public-repo Actions minutes. State is stored as release assets, which triggers no Vercel deploys.

## First local run (14 October 2026, 12 northern stations)

All 12 stations were backfilled in under a minute, and a normal daily update took 22 requests and 13 seconds. Out-of-sample over the last 30 days, using only data available when each forecast was issued:

| Lead | Temperature, learned vs standard | Wind, learned vs standard |
|---|---|---|
| 1 day | 0.82 vs 0.88 °C | 4.8 vs 6.0 km/h |
| 3 days | 1.04 vs 1.30 °C | 5.4 vs 7.1 km/h |
| 5 days | 1.40 vs 1.79 °C | 5.9 vs 7.7 km/h |
