# Daily learning job

Added 14 October 2026. Code: `scripts/learning/daily.mjs` (job), `src/mcp/learning-store.ts` (state, fits, scoring), `.github/workflows/learning-daily.yml` (schedule). Not deployed yet. Rain gauges and citizen stations added 15 October 2026: `src/mcp/rain-learning.ts`, `src/mcp/citizen-qc.ts`, `src/mcp/sources/rain-gauges.ts`, `src/mcp/sources/netatmo.ts`, `scripts/learning/netatmo.mjs`.

## What it does

Once a day, for every UK reference station, public rain gauge and tracked citizen station:

1. **Observations.** Met Office stations come from one UK-wide MeteoGate query covering the last 25 hours, about 195 stations in a single response of about 1 MB. Airports come from the Iowa Environmental Mesonet METAR archive, and COSMOS-UK sites from their API. A new Met Office station is backfilled once from NOAA's GHCNh archive where it has a WMO id. Without one, it builds history from daily MeteoGate data and becomes usable after 20 days.
   Only stations inside the learned forecast's UK area are processed, so the Channel Islands airports in the Iowa archive's UK list are skipped. A download is tried up to five times, with waits growing from 5 to 40 seconds.
   Rain gauges come from the Environment Agency (England, 15-minute readings, about four weeks online, so a new gauge is backfilled with 27 days) and SEPA (Scotland, hourly totals, backfilled with 62 days). Up to 500 gauges are used, at least 12 km apart, chosen in a fixed pseudo-random order so England's thousand gauges do not crowd out Scotland's. Only complete UTC days count. Rain is learned for lead days 1–6: a fit needs every model, and there is no Met Office or ICON archive at day 7, so the forecast reuses day 6 there and the job does not download day-7 rain.
   Citizen stations are described under [Citizen stations](#citizen-stations-netatmo).
2. **Model errors.** It fetches each model's archived forecasts (Open-Meteo Previous Runs, lead days 1–7) for the last six days. It then recomputes each day's error sums per lead and model. The state keeps these daily error sums for 75 days, never raw history.
   For rain gauges it stores, per day and lead, the observed total and each model's error in its daily total.
3. **Fits.** For each lead it builds weights and blend bias from the last 60 days, using `learning.ts`, the same maths as the backtest. A gauge's rainfall fit (`rain-learning.ts`) pools every eligible gauge within 25 km, because one gauge on a showery day says little: the scale is the observed rain over the equal-weight model mean's rain on the same days, kept between 0.67 and 1.5.
4. **Live scoring.** For each fully observed day it scores the learned forecast against the standard one. The learned forecast only uses fits from before that forecast's issue date. Rainfall is scored three ways at every gauge-day: the scaled mean, the plain model mean (what the forecast showed before) and the standard forecast. The pooled last-30-day result at official stations and gauges goes into `fits.json` and the daily history into `scores.json`.

`get_learned_forecast` reads `fits.json`, chooses the nearest representative station by the same rules as before (80 km, 250 m, 20 training days) and applies its weights instantly. If the file is missing or more than three days old, it falls back to learning on demand, which is slower.

Rainfall stays the plain model mean unless two things hold: a gauge with a fit is within 25 km, and over the last 30 days the scaled mean beat the plain mean by at least 2% at that lead day, on at least 1,000 gauge-days across the country. The switch is per lead day and automatic in both directions, so the scaling only reaches the forecast once the live scores show it helps. The backtest found the plain mean the best rainfall strategy with one gauge per site; pooling many gauges is the new test.

## Dashboard

The dashboard loads its Open-Meteo forecast as before. In parallel it calls `GET /learned-forecast?lat=…&lon=…&tz=…` (`src/app/learned-forecast/route.ts`) and overlays the returned hourly temperature, wind and rain for the next seven days (`src/lib/aceweather/learned.ts`). Days containing learned hours get their max, min, rain total and peak wind recomputed. Feels-like temperature shifts with the air temperature, and a gust is never shown below the learned mean wind. Gauge-scaled rainfall reaches the dashboard the same way. Everything else stays as Open-Meteo's: current conditions, humidity, cloud, soil and rain probability. If the endpoint fails, the page simply keeps Open-Meteo's values. Responses are edge-cached for 15 minutes, and coordinates are rounded to about 1 km. The Data sources card names the reference station.

## Health checks

After each run, `scripts/learning/health.mjs` checks the output. Errors:

- the weights file is missing or more than 26 hours old;
- the number of fitted stations drops below 80% of the last week's best;
- more than 10% of stations fail.

Warnings:

- more than five requests give up after retries;
- Netatmo is configured but its stations could not be updated (usually an expired refresh token);
- over the last 30 days, the learned forecast is more than 2% worse than the standard forecast for temperature or wind at any lead day, once there are at least 500 scored hours (rainfall has its own gate, above);
- a station's bias jumps between neighbouring lead days by more than 1.5 °C or 4 km/h plus 20% of the bias.

Any problem opens a GitHub issue labelled `learning-health`, or comments on the open one. The issue closes automatically when every check passes. If the job itself crashes, the same issue records the failed run. Results are also published as `health.json` and `run.json` on the release. Confirmed bugs go in [BUG-LOG.md](BUG-LOG.md).

## Files

| File | Size (12 stations / about 220 UK-wide) | Used by |
|---|---|---|
| `state.json` (published gzipped) | 2 MB / about 35 MB, plus about 40 MB for 500 gauges (gzip shrinks it about fourfold); stations no longer discovered age out and are removed once empty | the job only |
| `netatmo.enc` | a few KB | the job only: AES-256-GCM sealed citizen station registry and OAuth refresh token |
| `fits.json` | 27 KB / about 500 KB | `get_learned_forecast` via `ACEWEATHER_LEARNED_FITS_URL` |
| `scores.json` | the last 120 days of pooled live scores | monthly review |

## Running it

```bash
node scripts/learning/daily.mjs --only-near scripts/backtest/sites.json --radius 25 --max-bootstrap 12
```

That is a local test on about 30 northern stations. With no options it covers the whole UK, backfilling up to 60 new reference stations per run, so the first full coverage takes about four daily runs. New rain gauges are cheap to backfill, so they are not counted against that limit and are all backfilled as far as the Open-Meteo allowance goes, usually in the first one or two runs. `--max-gauges` and `--max-netatmo` change the limits.

A test run on GitHub: run the workflow by hand with **dry_run** ticked. It learns near the 40 UK backtest sites only, uploads `fits.json`, `run.json` and `health.json` as a workflow artifact, publishes nothing and never touches Netatmo. Point the forecast at the local output with `ACEWEATHER_LEARNED_FITS_FILE=.cache/learning/fits.json`.

To enable it in production:

1. Merge the workflow to the default branch. It runs at 05:30 UTC daily, or by hand from the Actions tab.
2. After the first run, set `ACEWEATHER_LEARNED_FITS_URL=https://github.com/rjbowes32/aceweather/releases/download/learning-data/fits.json` in Vercel.

## Citizen stations (Netatmo)

Netatmo's public weather map has thousands of UK stations. The job uses them for learning only, where the official networks leave gaps, and never republishes their readings.

- **Where.** Grid points about 28 km apart that are more than 25 km from an official temperature station or 12 km from a public rain gauge. For up to 100 such points a run, it asks for the public stations nearby and tracks the nearest one with an outdoor thermometer (and a rain gauge, where the gap is in rainfall). At most 150 stations; a point with none is retried after 90 days.
- **What.** Each day, the last two days of raw temperature (matched to the hour within 20 minutes, −30 to 45 °C) and rain (complete UTC days only). There is no backfill: a station needs 20 days before it has fits.
- **Quality control** (`citizen-qc.ts`). Siting is unknown, and a thermometer in the sun or a blocked gauge would teach the forecast its own error. Temperature fits are exported only when the station's lead-1 bias is within 2.5 °C and its day-to-day scatter around the models (the standard deviation of the best model's hourly error once its mean is removed, over the window) is no more than 1.3 times the official stations' median, about 1.0 °C in October 2026. That is judged from the same 20 days a fit needs, so a good station is used as soon as it has a fit. Rain days are pooled only when observed over forecast rain is between 0.5 and 2 over the window and no more than a quarter of days the models put at 5 mm or more read zero. A station still without exported fits after 45 days, or silent for two weeks, is dropped and not picked again.
- **Use.** A citizen thermometer is chosen as the reference only within 15 km and 100 m, and only where no official station is within 40 km and 150 m, which is where bias correction would otherwise be off. Citizen stations never count towards the live scores.
- **Privacy.** Public files (`state.json`, `fits.json`) carry an HMAC of the device id and a position rounded to 0.01°. Device ids and the rotating refresh token live only in `netatmo.enc`, sealed with `NETATMO_STATE_KEY`, and it is uploaded even when the run fails so a rotated token is never lost.

To switch it on:

1. Create an app at [dev.netatmo.com](https://dev.netatmo.com/apps) and accept Netatmo's terms (check they cover this use; Netatmo asks commercial users to contact partnerships@netatmo.com).
2. On the app page, use the token generator with the `read_station` scope and copy the refresh token.
3. Add repository secrets `NETATMO_CLIENT_ID`, `NETATMO_CLIENT_SECRET`, `NETATMO_REFRESH_TOKEN` and `NETATMO_STATE_KEY` (any long random string; changing it starts a new registry).

If Netatmo later rejects the stored token, the health check warns; generate a new refresh token and update `NETATMO_REFRESH_TOKEN`.

## Cost and limits

- **Open-Meteo:** a daily update is one six-day archived-forecast request per station, about 9 of the API's call units each (about 3.6 for a rain gauge, which asks for rainfall at days 1–6 only), so about 2,000 a day for the reference stations, 1,800 for 500 gauges and 1,300 for 150 citizen stations. A backfill is about 45 units per reference station, capped by `--max-bootstrap`, and about 7 per Environment Agency gauge or 16 per SEPA gauge. The job counts units: it pauses when the next request would pass 550 in a minute or 4,500 in an hour (the free limits are 600 and 5,000) and stops starting backfills after 8,000 in a run (the daily limit is 10,000).
- **Environment Agency and SEPA:** one gauge list each, then one request per gauge per run.
- **Netatmo:** at most 450 requests per run, under its 500 an hour per user.
- **NOAA GHCNh:** each station's year file is downloaded only when that station is backfilled, never daily.
- **GitHub:** one job a day of 30–120 minutes (with every source on, a run passes the Open-Meteo hourly limit and waits once; the timeout is three hours), on public-repo Actions minutes. State is stored as release assets, which triggers no Vercel deploys.

## First local run (14 October 2026, 12 northern stations)

All 12 stations were backfilled in under a minute, and a normal daily update took 22 requests and 13 seconds. Out-of-sample over the last 30 days, using only data available when each forecast was issued:

| Lead | Temperature, learned vs standard | Wind, learned vs standard |
|---|---|---|
| 1 day | 0.82 vs 0.88 °C | 4.8 vs 6.0 km/h |
| 3 days | 1.04 vs 1.30 °C | 5.4 vs 7.1 km/h |
| 5 days | 1.40 vs 1.79 °C | 5.9 vs 7.7 km/h |
