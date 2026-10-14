# Forecast verification

Added 13 October 2026, MCP server 0.4.0. Tool: `get_forecast_verification`. Code: `src/mcp/verification.ts`, sources in `src/mcp/sources/iem.ts` and `src/mcp/sources/previous-runs.ts`.

## Why

AceWeather shows Open-Meteo's `best_match` forecast. Until now nothing measured whether that was the right choice for a given farm. This tool scores every model against what nearby stations actually recorded, which is the evidence needed to pick or weight models per location.

## Method

1. **Reference stations.** Temperature and wind use the nearest open METAR airport within 60 km (Iowa Environmental Mesonet archive; COSMOS-UK fallback for temperature only, because its anemometer is below 10 m). Rainfall uses the nearest Environment Agency gauge within 40 km with at least five complete days (COSMOS-UK fallback).
2. **Forecasts.** Open-Meteo's Previous Runs API returns what each model forecast 1–7 days before each hour. The tool requests it at the station's own coordinates and elevation, so grid height and distance from the farm do not distort the scores.
3. **Matching.** Temperature and wind: each hour with a METAR within 20 minutes of the hour. Rainfall: complete UTC days only (at least 95 % of gauge intervals), with day D running from 00:00 to 24:00 UTC because gauge readings and model precipitation both cover the interval ending at their timestamp. All models are scored on exactly the same hours and days.
4. **Scores.** Mean absolute error (MAE) and bias (forecast minus observed); for rain also hits, misses, false alarms and wet/dry accuracy at 1 mm. The best model has the lowest MAE. Differences under 0.1 °C, 0.5 km/h or 0.1 mm are reported as ties. Scores need at least 48 hours or 5 days.
5. **AceWeather's own forecast.** If `best_match` is identical to one model at every hour, the tool says so (`aceweather_equivalent`) and ranks it once under that model.

Results are cached for an hour. A call makes two Previous Runs requests (one per reference point), one METAR history request and one gauge history request.

## First results (28 days to 13 October 2026, seven Crop Dynamics locations)

In the UK, AceWeather's forecast is identical to the Met Office UM at every hour and lead time: `best_match` is not a blend here.

| Variable and lead | Best model (sites won out of 7) | AceWeather's forecast |
|---|---|---|
| Temperature, 1 day | ICON 4, ECMWF 2, Met Office 1 (mostly ties within 0.1 °C) | Tied best or within about 0.1 °C |
| Temperature, 3 days | ECMWF 6, ICON 1 | 0.1–0.3 °C worse than ECMWF |
| Temperature, 5 days | ECMWF 7 | 0.1–0.6 °C worse than ECMWF |
| Daily rainfall, 1 day | ECMWF 5, GFS 2 | About twice ECMWF's error at four sites, three times at Alford |
| Wind speed, 3–5 days | ICON or ECMWF at most sites | Up to about 2 km/h worse |

Caveats: one autumn month at one station per variable is a snapshot, METAR temperatures are whole degrees, and rainfall is a single gauge. Rerun before acting, and keep collecting before changing the forecast AceWeather shows.

## Year-long backtest

The 28-day snapshot above raised the question of whether AceWeather should learn per-location model weights. That question is answered with a year of data in [LEARNING-BACKTEST.md](LEARNING-BACKTEST.md): fifteen locations across northern England, replayed day by day with no look-ahead. The learning maths is in `src/mcp/learning.ts`; the backtest is `scripts/backtest/` (`download.mjs`, `run.mjs`, `report.mjs`; downloads are cached in `.cache/backtest/`, which git ignores).

The same backtest was then repeated UK-wide, at 40 locations across England, Wales, Scotland and Northern Ireland, with Met Office stations from NOAA's GHCNh archive as references and the live model set. The results are in [LEARNING-BACKTEST-UK.md](LEARNING-BACKTEST-UK.md). Run it with `BACKTEST_SITES=sites-uk.json BACKTEST_EXTRA_MODELS=ecmwf_aifs025_single`.

## Next steps

- Rerun monthly to see whether the ECMWF advantage beyond day 2 holds across seasons.
- If it does, switch AceWeather's day 3+ forecast to ECMWF (or weight models by recent per-location error), and add a running bias correction from the same scores.
- Add Open-Meteo ensemble members for real rain probabilities, verified the same way.
