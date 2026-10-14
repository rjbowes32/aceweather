# Learning backtest: does a per-location learned forecast beat AceWeather today?

Generated 2026-10-13 by `scripts/backtest/`. Scored period 2025-10-01 to 2026-09-17; training data from 2025-08-01. 15 locations (15 in England), lead times of 1, 3, 5 days.

## Method

Each day in the scored period, every strategy is built using only the 60 days before it, then scored on that day against what the reference station measured. Nothing ever sees the day it is scored on. All strategies and models are scored on exactly the same hours (temperature, wind) or days (rainfall). Archived forecasts come from Open-Meteo's Previous Runs API at each reference station's own coordinates and elevation. Observations come from Met Office stations (NOAA GHCNh archive) and METAR airports (Iowa Environmental Mesonet archive), COSMOS-UK sites for temperature where neither is close, and rain gauges: Environment Agency (England), SEPA (Scotland) and COSMOS-UK elsewhere, complete UTC days only.

| Strategy | What it does |
|---|---|
| current | AceWeather today (Open-Meteo best_match) |
| current bias | AceWeather today minus its own recent bias |
| mean | Equal-weight mean of the four models |
| best recent | Whichever model had the lowest recent error |
| weighted | Models weighted by recent accuracy (inverse MSE) |
| weighted bias | Weighted by recent accuracy, minus the blend's recent bias |

Rainfall uses the weighted blend without a bias shift and never goes below zero. Training for a forecast at lead L stops the day before that forecast would have been issued (L days before the scored day), so no strategy uses observations that were not yet available.

## Headline

| Variable | Lead | Median MAE today | Median MAE learned | Median change | Locations better / worse | Independent stations better / worse |
|---|---|---|---|---|---|---|
| Temperature (°C) | 1 day | 0.90 | 0.71 | 17% | 14 / 0 | 9 / 0 |
| Temperature (°C) | 3 day | 1.19 | 0.95 | 20% | 14 / 0 | 9 / 0 |
| Temperature (°C) | 5 day | 1.67 | 1.35 | 19% | 14 / 0 | 9 / 0 |
| Wind speed (km/h) | 1 day | 4.38 | 3.58 | 22% | 15 / 0 | 8 / 0 |
| Wind speed (km/h) | 3 day | 5.59 | 4.45 | 26% | 15 / 0 | 8 / 0 |
| Wind speed (km/h) | 5 day | 7.70 | 5.90 | 23% | 15 / 0 | 8 / 0 |
| Daily rainfall (mm) | 1 day | 1.74 | 1.47 | 18% | 14 / 1 | 14 / 1 |
| Daily rainfall (mm) | 3 day | 2.11 | 1.73 | 16% | 15 / 0 | 15 / 0 |
| Daily rainfall (mm) | 5 day | 2.62 | 2.26 | 18% | 15 / 0 | 15 / 0 |

A positive change means the learned forecast has a lower error than today's forecast. Some locations share a temperature or wind reference station, so the independent-station column is the stricter count.

## All strategies (median MAE across sites)

| Variable | Lead | current | current bias | Met Office | ECMWF | ICON | GFS | mean | best recent | weighted | weighted bias |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Temperature | 1 | 0.90 | 0.86 | 0.90 | 0.87 | 0.85 | 1.14 | 0.82 | 0.85 | 0.80 | **0.71** |
| Temperature | 3 | 1.19 | 1.15 | 1.19 | 1.10 | 1.12 | 1.40 | 1.03 | 1.13 | 1.02 | **0.95** |
| Temperature | 5 | 1.67 | 1.66 | 1.67 | 1.51 | 1.71 | 1.84 | 1.42 | 1.53 | 1.41 | **1.35** |
| Wind speed | 1 | 4.38 | 4.17 | 4.38 | 4.21 | 4.87 | 4.91 | 3.92 | 4.21 | 3.86 | **3.58** |
| Wind speed | 3 | 5.59 | 5.14 | 5.59 | 5.14 | 5.89 | 5.92 | 4.93 | 5.14 | 4.92 | **4.45** |
| Wind speed | 5 | 7.70 | 6.99 | 7.70 | 6.85 | 7.95 | 7.81 | 6.43 | 6.99 | 6.43 | **5.90** |
| Daily rainfall | 1 | 1.74 | 1.74 | 1.74 | 1.85 | 1.76 | 1.68 | **1.42** | 1.77 | 1.47 | 1.47 |
| Daily rainfall | 3 | 2.11 | 2.11 | 2.11 | 2.25 | 1.94 | 2.12 | **1.71** | 2.02 | 1.73 | 1.73 |
| Daily rainfall | 5 | 2.62 | 2.62 | 2.62 | 2.72 | 2.67 | 2.31 | **2.25** | 2.55 | 2.26 | 2.26 |

## By location

### Temperature (°C, MAE today → learned)

| Location | Area | Reference | 1 day | 3 day | 5 day |
|---|---|---|---|---|---|
| Berwick-upon-Tweed | north-east coast | BOULMER (46 km, METAR) | 0.92 → 0.78 (15%) | 1.12 → 0.96 (14%) | 1.49 → 1.28 (14%) |
| Longhirst | Northumberland coastal plain | Cockle Park (4 km, COSMOS-UK) | 0.90 → 0.69 (23%) | 1.14 → 0.91 (20%) | 1.60 → 1.29 (19%) |
| Hexham | Tyne valley | Newcastle (27 km, METAR) | 0.99 → 0.83 (16%) | 1.30 → 1.07 (18%) | 1.75 → 1.46 (16%) |
| Alston | North Pennines upland | Spadeadam (28 km, METAR) | 0.89 → 0.71 (21%) | 1.19 → 0.95 (20%) | 1.66 → 1.35 (19%) |
| Carlisle | Solway and lower Eden | none in range | – | – | – |
| Penrith | Eden valley | Spadeadam (45 km, METAR) | 0.89 → 0.71 (21%) | 1.19 → 0.95 (20%) | 1.66 → 1.35 (19%) |
| Keswick | Lake District fells | Spadeadam (62 km, METAR) | 0.89 → 0.71 (21%) | 1.19 → 0.95 (20%) | 1.66 → 1.35 (19%) |
| Seascale | west Cumbrian coast | Blackpool (75 km, METAR) | 0.83 → 0.71 (15%) | 1.19 → 0.91 (23%) | 1.63 → 1.27 (22%) |
| Kendal | south Cumbria | Gisburn Forest (41 km, COSMOS-UK) | 0.78 → 0.65 (17%) | 1.10 → 0.86 (21%) | 1.68 → 1.29 (23%) |
| Garstang | Fylde and Lancashire plain | Blackpool (22 km, METAR) | 0.83 → 0.71 (15%) | 1.19 → 0.91 (23%) | 1.63 → 1.27 (22%) |
| Settle | Yorkshire Dales | Gisburn Forest (9 km, COSMOS-UK) | 0.78 → 0.65 (17%) | 1.10 → 0.86 (21%) | 1.68 → 1.29 (23%) |
| Scotch Corner | Tees lowland | Teesside (17 km, METAR) | 0.94 → 0.78 (17%) | 1.22 → 1.03 (16%) | 1.71 → 1.40 (18%) |
| Boroughbridge | Vale of York | Topcliffe (13 km, METAR) | 1.07 → 0.91 (15%) | 1.39 → 1.15 (17%) | 1.87 → 1.53 (18%) |
| Pocklington | Wolds edge | LECONFIELD (AUT) (24 km, METAR) | 0.94 → 0.78 (17%) | 1.24 → 1.04 (16%) | 1.71 → 1.40 (18%) |
| Driffield | Yorkshire Wolds | LECONFIELD (AUT) (14 km, METAR) | 0.94 → 0.78 (17%) | 1.24 → 1.04 (16%) | 1.71 → 1.40 (18%) |

### Wind speed (km/h, MAE today → learned)

| Location | Area | Reference | 1 day | 3 day | 5 day |
|---|---|---|---|---|---|
| Berwick-upon-Tweed | north-east coast | BOULMER (46 km, METAR) | 4.94 → 4.03 (19%) | 7.38 → 5.06 (31%) | 9.07 → 6.44 (29%) |
| Longhirst | Northumberland coastal plain | Newcastle (16 km, METAR) | 4.25 → 3.63 (15%) | 5.89 → 4.29 (27%) | 7.44 → 5.45 (27%) |
| Hexham | Tyne valley | Newcastle (27 km, METAR) | 4.25 → 3.63 (15%) | 5.89 → 4.29 (27%) | 7.44 → 5.45 (27%) |
| Alston | North Pennines upland | Spadeadam (28 km, METAR) | 5.13 → 3.58 (30%) | 6.06 → 4.45 (26%) | 7.70 → 5.90 (23%) |
| Carlisle | Solway and lower Eden | Spadeadam (30 km, METAR) | 5.13 → 3.58 (30%) | 6.06 → 4.45 (26%) | 7.70 → 5.90 (23%) |
| Penrith | Eden valley | Spadeadam (45 km, METAR) | 5.13 → 3.58 (30%) | 6.06 → 4.45 (26%) | 7.70 → 5.90 (23%) |
| Keswick | Lake District fells | Spadeadam (62 km, METAR) | 5.13 → 3.58 (30%) | 6.06 → 4.45 (26%) | 7.70 → 5.90 (23%) |
| Seascale | west Cumbrian coast | Blackpool (75 km, METAR) | 4.38 → 3.41 (22%) | 5.59 → 4.48 (20%) | 7.85 → 6.28 (20%) |
| Kendal | south Cumbria | Blackpool (64 km, METAR) | 4.38 → 3.41 (22%) | 5.59 → 4.48 (20%) | 7.85 → 6.28 (20%) |
| Garstang | Fylde and Lancashire plain | Blackpool (22 km, METAR) | 4.38 → 3.41 (22%) | 5.59 → 4.48 (20%) | 7.85 → 6.28 (20%) |
| Settle | Yorkshire Dales | Leeds (46 km, METAR) | 5.06 → 3.94 (22%) | 5.13 → 4.51 (12%) | 6.68 → 5.52 (17%) |
| Scotch Corner | Tees lowland | Teesside (17 km, METAR) | 4.28 → 3.45 (19%) | 5.15 → 4.22 (18%) | 6.72 → 5.61 (16%) |
| Boroughbridge | Vale of York | Topcliffe (13 km, METAR) | 4.26 → 3.32 (22%) | 4.82 → 4.13 (14%) | 6.35 → 5.37 (15%) |
| Pocklington | Wolds edge | LECONFIELD (AUT) (24 km, METAR) | 3.48 → 2.90 (17%) | 5.06 → 3.49 (31%) | 6.52 → 4.62 (29%) |
| Driffield | Yorkshire Wolds | LECONFIELD (AUT) (14 km, METAR) | 3.48 → 2.90 (17%) | 5.06 → 3.49 (31%) | 6.52 → 4.62 (29%) |

### Daily rainfall (mm, MAE today → learned)

| Location | Area | Reference | 1 day | 3 day | 5 day |
|---|---|---|---|---|---|
| Berwick-upon-Tweed | north-east coast | Berwick (2 km, EA gauge) | 1.33 → 1.07 (19%) | 1.82 → 1.49 (18%) | 2.16 → 1.82 (15%) |
| Longhirst | Northumberland coastal plain | Newbiggin (11 km, EA gauge) | 1.39 → 1.07 (23%) | 1.85 → 1.60 (13%) | 2.34 → 1.98 (16%) |
| Hexham | Tyne valley | Hexham Firtrees (4 km, EA gauge) | 1.48 → 1.28 (14%) | 1.74 → 1.58 (9%) | 2.32 → 1.94 (16%) |
| Alston | North Pennines upland | Alston (0 km, EA gauge) | 2.33 → 1.83 (21%) | 2.72 → 2.30 (15%) | 3.34 → 2.89 (13%) |
| Carlisle | Solway and lower Eden | Willow Holme (2 km, EA gauge) | 1.74 → 1.48 (15%) | 2.27 → 1.94 (15%) | 2.80 → 2.26 (19%) |
| Penrith | Eden valley | Newton Rigg (2 km, EA gauge) | 1.82 → 1.47 (19%) | 2.11 → 1.73 (18%) | 2.62 → 2.24 (15%) |
| Keswick | Lake District fells | Keswick (2 km, EA gauge) | 2.50 → 2.04 (18%) | 3.53 → 2.78 (21%) | 4.33 → 3.55 (18%) |
| Seascale | west Cumbrian coast | Seascale (0 km, EA gauge) | 1.83 → 1.84 (−0%) | 3.87 → 2.88 (25%) | 5.11 → 3.33 (35%) |
| Kendal | south Cumbria | Fisher Tarn (3 km, EA gauge) | 2.22 → 1.98 (11%) | 4.08 → 2.75 (33%) | 5.17 → 3.58 (31%) |
| Garstang | Fylde and Lancashire plain | Barnacre (4 km, EA gauge) | 2.40 → 2.08 (13%) | 4.19 → 2.67 (36%) | 5.32 → 3.53 (34%) |
| Settle | Yorkshire Dales | Stainforth (4 km, EA gauge) | 2.00 → 1.60 (20%) | 3.79 → 2.26 (40%) | 4.62 → 2.89 (37%) |
| Scotch Corner | Tees lowland | Richmond (6 km, EA gauge) | 1.45 → 1.17 (19%) | 1.96 → 1.66 (15%) | 2.59 → 2.26 (13%) |
| Boroughbridge | Vale of York | Roecliffe (1 km, EA gauge) | 1.42 → 1.15 (19%) | 1.72 → 1.44 (16%) | 2.24 → 1.83 (18%) |
| Pocklington | Wolds edge | Elvington (10 km, EA gauge) | 1.29 → 1.06 (18%) | 1.58 → 1.32 (16%) | 2.13 → 1.61 (25%) |
| Driffield | Yorkshire Wolds | Driffield (1 km, EA gauge) | 1.33 → 1.13 (15%) | 1.75 → 1.52 (13%) | 2.25 → 1.84 (18%) |

## By season (median change, learned vs today)

| Variable | Lead | Winter | Spring | Summer | Autumn |
|---|---|---|---|---|---|
| Temperature | 1 | 19% | 14% | 18% | 17% |
| Temperature | 3 | 16% | 19% | 19% | 22% |
| Temperature | 5 | 19% | 21% | 20% | 19% |
| Wind speed | 1 | 27% | 20% | 20% | 22% |
| Wind speed | 3 | 29% | 23% | 22% | 24% |
| Wind speed | 5 | 28% | 21% | 24% | 20% |
| Daily rainfall | 1 | 18% | 12% | 12% | 17% |
| Daily rainfall | 3 | 18% | 19% | 14% | 18% |
| Daily rainfall | 5 | 17% | 8% | 29% | 19% |

## Training window (median change of the learned forecast)

| Variable | Lead | 30 days | 60 days | 90 days |
|---|---|---|---|---|
| Temperature | 1 | 16% | 17% | 17% |
| Temperature | 3 | 20% | 20% | 20% |
| Temperature | 5 | 19% | 19% | 19% |
| Wind speed | 1 | 22% | 22% | 22% |
| Wind speed | 3 | 26% | 26% | 26% |
| Wind speed | 5 | 23% | 23% | 23% |
| Daily rainfall | 1 | 17% | 18% | 19% |
| Daily rainfall | 3 | 17% | 16% | 17% |
| Daily rainfall | 5 | 17% | 18% | 18% |

## Which models the learner leans on (mean weight across sites)

| Variable | Lead | ECMWF | GFS | ICON | Met Office |
|---|---|---|---|---|---|
| Temperature | 1 | 28% | 18% | 28% | 26% |
| Temperature | 3 | 29% | 20% | 27% | 24% |
| Temperature | 5 | 31% | 22% | 24% | 23% |
| Wind speed | 1 | 28% | 23% | 24% | 26% |
| Wind speed | 3 | 29% | 23% | 24% | 25% |
| Wind speed | 5 | 30% | 23% | 22% | 24% |
| Daily rainfall | 1 | 25% | 25% | 23% | 26% |
| Daily rainfall | 3 | 26% | 25% | 28% | 21% |
| Daily rainfall | 5 | 26% | 26% | 23% | 24% |

## Rainfall: wet or dry day called right (median across sites, 1 mm threshold)

| Lead | Today | Learned | ECMWF | Met Office |
|---|---|---|---|---|
| 1 day | 83% | 85% | 82% | 83% |
| 3 day | 78% | 78% | 78% | 78% |
| 5 day | 73% | 73% | 71% | 73% |

## Rainfall in the west: what changes

Mean daily rainfall error (bias, forecast minus observed, mm/day) for AceWeather today and the model mean:

| Location | 1 day today | 1 day mean | 3 days today | 3 days mean | 5 days today | 5 days mean |
|---|---|---|---|---|---|---|
| Seascale | +0.1 | +1.1 | +2.3 | +1.7 | +3.2 | +1.2 |
| Kendal | −0.1 | −0.7 | +1.8 | +0.3 | +2.4 | +0.2 |
| Garstang | −0.3 | −0.7 | +1.9 | +0.4 | +2.2 | −0.2 |
| Settle | +0.6 | −0.3 | +1.8 | +0.3 | +2.2 | +0.1 |

AceWeather's forecast (the Met Office model in the UK) is well calibrated for tomorrow but over-forecasts rain three to five days ahead by about 2–3 mm a day across Cumbria, Lancashire and the Dales. The model mean removes most of that bias, which is why rainfall errors there fall by a quarter to two-fifths.

## Experiments

**Time-of-day bias correction.** Correcting the blend's bias separately for each 3-hour block of the day (a simple form of model output statistics) instead of with one number:

| Variable | Lead | One bias | By time of day | Stations better |
|---|---|---|---|---|
| Temperature | 1 | 0.76 | 0.76 | 5 / 9 |
| Temperature | 3 | 0.99 | 0.99 | 3 / 9 |
| Temperature | 5 | 1.36 | 1.36 | 3 / 9 |
| Wind speed | 1 | 3.53 | 3.52 | 6 / 8 |
| Wind speed | 3 | 4.33 | 4.31 | 6 / 8 |
| Wind speed | 5 | 5.65 | 5.64 | 5 / 8 |

It made no meaningful difference, so the live forecast keeps a single bias per lead day.

**Adding ECMWF's AI model (AIFS).** The same backtest with AIFS as a fifth model, averaged over independent stations:

| Variable | Lead | Learned, four models | Learned, with AIFS | Change | Stations better |
|---|---|---|---|---|---|
| Temperature | 1 | 0.76 | 0.75 | 1% | 7 / 9 |
| Temperature | 3 | 0.99 | 0.96 | 2% | 8 / 9 |
| Temperature | 5 | 1.36 | 1.30 | 4% | 9 / 9 |
| Wind speed | 1 | 3.53 | 3.54 | −0% | 2 / 8 |
| Wind speed | 3 | 4.33 | 4.27 | 1% | 8 / 8 |
| Wind speed | 5 | 5.65 | 5.40 | 4% | 8 / 8 |
| Daily rainfall | 1 | 1.47 | 1.48 | −1% | 7 / 15 |
| Daily rainfall | 3 | 2.00 | 1.96 | 2% | 13 / 15 |
| Daily rainfall | 5 | 2.51 | 2.47 | 2% | 12 / 15 |

AIFS adds nothing for tomorrow but 2–4% more at three to five days, so the live forecast includes it from day 3.

## Recommendation

1. **Temperature and wind:** show the inverse-error weighted mean of ECMWF, GFS, ICON and the Met Office model (plus AIFS from day 3), minus the blend's mean error over the last 60 days at the nearest reference station. In practice the weights stay close to equal, so the gain is robust rather than tuned.
2. **Rainfall:** show the equal-weight mean of the same models with no bias shift. It was the best rainfall strategy at every lead time.
3. **Fallback:** where no reference station has 20 days of data, keep today's forecast. Carlisle had no representative temperature station in this test.
4. **Keep scoring:** run the same comparison daily on live data, so a change in any model shows up within weeks.

## Limits

- Scores describe the reference stations, not the farms. A reference is chosen by distance plus 10 km per 100 m of height difference, and never more than 250 m above or below the location; the location tables give every distance.
- METAR temperatures are whole degrees, which adds about 0.25 °C to every strategy equally.
- One year is one set of seasons. A repeat next year would show whether the gains are stable.
- Rain gauges are single points; convective showers can miss a gauge that the models forecast correctly a few kilometres away.
- Wind at COSMOS-UK sites is measured below 10 m, so wind is scored at airports and Met Office stations only.
