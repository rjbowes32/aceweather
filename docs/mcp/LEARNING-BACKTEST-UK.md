# Learning backtest, UK-wide: does the learned forecast beat AceWeather today across the country?

Generated 2026-10-13 by `scripts/backtest/`. Scored period 2025-10-01 to 2026-09-17; training data from 2025-08-01. 40 locations (25 in England, 5 in Wales, 7 in Scotland, 3 in Northern Ireland), lead times of 1, 3, 5 days. The blend uses the same model set as the live forecast: four models, plus ECMWF's AI model (AIFS) from day 3.

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
| Temperature (°C) | 1 day | 0.91 | 0.77 | 16% | 40 / 0 | 36 / 0 |
| Temperature (°C) | 3 day | 1.25 | 0.98 | 22% | 40 / 0 | 36 / 0 |
| Temperature (°C) | 5 day | 1.78 | 1.32 | 24% | 40 / 0 | 36 / 0 |
| Wind speed (km/h) | 1 day | 4.68 | 3.83 | 17% | 40 / 0 | 35 / 0 |
| Wind speed (km/h) | 3 day | 5.58 | 4.44 | 19% | 40 / 0 | 35 / 0 |
| Wind speed (km/h) | 5 day | 7.31 | 5.40 | 23% | 40 / 0 | 35 / 0 |
| Daily rainfall (mm) | 1 day | 1.70 | 1.43 | 16% | 37 / 1 | 37 / 1 |
| Daily rainfall (mm) | 3 day | 2.08 | 1.73 | 17% | 38 / 0 | 38 / 0 |
| Daily rainfall (mm) | 5 day | 2.72 | 2.20 | 21% | 38 / 0 | 38 / 0 |

A positive change means the learned forecast has a lower error than today's forecast. Some locations share a temperature or wind reference station, so the independent-station column is the stricter count.

## By nation (median change, learned vs today, and locations better / scored)

| Nation | Temperature 1d | Temperature 3d | Temperature 5d | Wind speed 1d | Wind speed 3d | Wind speed 5d | Daily rainfall 1d | Daily rainfall 3d | Daily rainfall 5d |
|---|---|---|---|---|---|---|---|---|---|
| England | 16% (25/25) | 22% (25/25) | 24% (25/25) | 17% (25/25) | 19% (25/25) | 24% (25/25) | 16% (24/25) | 18% (25/25) | 20% (25/25) |
| Wales | 9% (5/5) | 21% (5/5) | 25% (5/5) | 20% (5/5) | 22% (5/5) | 21% (5/5) | 9% (4/4) | 16% (4/4) | 19% (4/4) |
| Scotland | 14% (7/7) | 19% (7/7) | 24% (7/7) | 16% (7/7) | 17% (7/7) | 20% (7/7) | 18% (7/7) | 16% (7/7) | 23% (7/7) |
| Northern Ireland | 26% (3/3) | 30% (3/3) | 30% (3/3) | 12% (3/3) | 17% (3/3) | 24% (3/3) | 25% (2/2) | 18% (2/2) | 25% (2/2) |

## All strategies (median MAE across sites)

| Variable | Lead | current | current bias | Met Office | ECMWF | ICON | GFS | AIFS | mean | best recent | weighted | weighted bias |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Temperature | 1 | 0.91 | 0.91 | 0.91 | 0.93 | 0.90 | 1.24 | 0.92 | 0.84 | 0.89 | 0.81 | **0.77** |
| Temperature | 3 | 1.25 | 1.21 | 1.25 | 1.18 | 1.19 | 1.52 | 1.11 | 1.03 | 1.11 | 1.02 | **0.98** |
| Temperature | 5 | 1.78 | 1.73 | 1.78 | 1.62 | 1.76 | 1.95 | 1.47 | 1.40 | 1.48 | 1.38 | **1.32** |
| Wind speed | 1 | 4.68 | 4.33 | 4.68 | 4.73 | 4.66 | 5.11 | 4.81 | 4.32 | 4.40 | 4.23 | **3.83** |
| Wind speed | 3 | 5.58 | 5.23 | 5.58 | 5.54 | 5.63 | 5.97 | 5.17 | 4.95 | 5.12 | 4.87 | **4.44** |
| Wind speed | 5 | 7.31 | 6.92 | 7.31 | 6.69 | 7.46 | 7.18 | 6.09 | 5.80 | 6.17 | 5.74 | **5.40** |
| Daily rainfall | 1 | 1.70 | 1.70 | 1.70 | 1.73 | 1.68 | 1.68 | 1.76 | **1.42** | 1.72 | 1.43 | 1.43 |
| Daily rainfall | 3 | 2.08 | 2.08 | 2.08 | 2.28 | 2.00 | 2.15 | 2.19 | **1.69** | 2.08 | 1.73 | 1.73 |
| Daily rainfall | 5 | 2.72 | 2.72 | 2.72 | 2.65 | 2.65 | 2.32 | 2.49 | 2.24 | 2.46 | **2.20** | **2.20** |

## By location

### Temperature (°C, MAE today → learned)

| Location | Area | Reference | 1 day | 3 day | 5 day |
|---|---|---|---|---|---|
| Berwick-upon-Tweed | north-east coast | Boulmer (46 km, Met Office via GHCNh) | 0.87 → 0.74 (16%) | 1.09 → 0.93 (15%) | 1.47 → 1.21 (18%) |
| Longhirst | Northumberland coastal plain | Cockle Park (4 km, COSMOS-UK) | 0.90 → 0.69 (23%) | 1.14 → 0.89 (22%) | 1.60 → 1.24 (23%) |
| Hexham | Tyne valley | Albemarle (16 km, Met Office via GHCNh) | 0.89 → 0.74 (16%) | 1.20 → 0.97 (19%) | 1.70 → 1.36 (20%) |
| Alston | North Pennines upland | Spadeadam (28 km, METAR) | 0.89 → 0.71 (21%) | 1.19 → 0.91 (24%) | 1.66 → 1.27 (23%) |
| Carlisle | Solway and lower Eden | Carlisle (5 km, Met Office via GHCNh) | 0.90 → 0.71 (21%) | 1.27 → 0.90 (29%) | 1.83 → 1.30 (29%) |
| Penrith | Eden valley | Shap (19 km, Met Office via GHCNh) | 1.00 → 0.90 (10%) | 1.25 → 1.06 (15%) | 1.78 → 1.42 (20%) |
| Keswick | Lake District fells | Keswick (3 km, Met Office via GHCNh) | 1.11 → 0.99 (11%) | 1.60 → 1.13 (29%) | 2.07 → 1.46 (29%) |
| Seascale | west Cumbrian coast | St Bees Head No.2 (15 km, Met Office via GHCNh) | 0.73 → 0.57 (22%) | 1.01 → 0.77 (24%) | 1.45 → 1.06 (27%) |
| Kendal | south Cumbria | Shap (20 km, Met Office via GHCNh) | 1.00 → 0.90 (10%) | 1.25 → 1.06 (15%) | 1.78 → 1.42 (20%) |
| Garstang | Fylde and Lancashire plain | Blackpool (22 km, Met Office via GHCNh) | 0.76 → 0.68 (11%) | 1.18 → 0.89 (24%) | 1.60 → 1.20 (25%) |
| Settle | Yorkshire Dales | Gisburn Forest (9 km, COSMOS-UK) | 0.78 → 0.65 (17%) | 1.10 → 0.85 (23%) | 1.68 → 1.24 (26%) |
| Scotch Corner | Tees lowland | Durham Tees Valley Airport (17 km, Met Office via GHCNh) | 0.94 → 0.78 (17%) | 1.22 → 1.00 (18%) | 1.71 → 1.33 (22%) |
| Boroughbridge | Vale of York | Topcliffe (12 km, Met Office via GHCNh) | 1.01 → 0.86 (14%) | 1.35 → 1.10 (19%) | 1.85 → 1.46 (21%) |
| Pocklington | Wolds edge | Leconfield (24 km, Met Office via GHCNh) | 0.94 → 0.79 (16%) | 1.24 → 1.01 (19%) | 1.72 → 1.32 (23%) |
| Driffield | Yorkshire Wolds | Leconfield (16 km, Met Office via GHCNh) | 0.94 → 0.79 (16%) | 1.24 → 1.01 (19%) | 1.72 → 1.32 (23%) |
| Penzance | west Cornwall | Camborne (19 km, Met Office via GHCNh) | 0.67 → 0.59 (12%) | 0.97 → 0.75 (23%) | 1.41 → 1.02 (28%) |
| Crediton | mid Devon | Exeter (18 km, Met Office via GHCNh) | 1.14 → 0.96 (16%) | 1.44 → 1.13 (21%) | 1.89 → 1.48 (22%) |
| Taunton | Somerset Levels | Yeovilton (32 km, Met Office via GHCNh) | 0.91 → 0.81 (10%) | 1.30 → 1.02 (22%) | 1.86 → 1.41 (24%) |
| Salisbury | Wiltshire chalk | Boscombe Down (10 km, Met Office via GHCNh) | 0.86 → 0.70 (18%) | 1.21 → 0.90 (26%) | 1.74 → 1.26 (28%) |
| Canterbury | east Kent | Manston (20 km, Met Office via GHCNh) | 0.79 → 0.65 (18%) | 1.84 → 0.93 (50%) | 2.10 → 1.23 (41%) |
| Cambridge | Cambridgeshire arable | Wimpole (14 km, COSMOS-UK) | 0.99 → 0.84 (15%) | 1.27 → 1.04 (18%) | 1.79 → 1.42 (21%) |
| Norwich | Norfolk | Norwich (5 km, Met Office via GHCNh) | 1.00 → 0.75 (25%) | 1.32 → 0.98 (26%) | 1.79 → 1.35 (25%) |
| Hereford | Wye valley | Holme Lacy (6 km, COSMOS-UK) | 1.00 → 0.76 (25%) | 1.36 → 0.93 (32%) | 1.90 → 1.32 (31%) |
| Shrewsbury | Shropshire plain | Shawbury (11 km, Met Office via GHCNh) | 0.92 → 0.78 (15%) | 1.25 → 0.99 (21%) | 1.84 → 1.39 (25%) |
| Lincoln | Lincolnshire | Riseholme (4 km, COSMOS-UK) | 0.88 → 0.69 (22%) | 1.14 → 0.91 (20%) | 1.69 → 1.28 (24%) |
| Carmarthen | south-west Wales | Pembry Sands (16 km, Met Office via GHCNh) | 0.86 → 0.83 (3%) | 1.41 → 1.01 (29%) | 1.80 → 1.32 (26%) |
| Aberystwyth | Cardigan Bay | Trawsgoed (11 km, Met Office via GHCNh) | 1.11 → 1.07 (4%) | 1.53 → 1.25 (18%) | 2.07 → 1.62 (21%) |
| Brecon | Brecon Beacons | Shobdon Airfield (48 km, Met Office via GHCNh) | 1.13 → 1.03 (9%) | 1.36 → 1.21 (11%) | 2.00 → 1.62 (19%) |
| Welshpool | Severn valley | Shawbury (36 km, Met Office via GHCNh) | 0.92 → 0.78 (15%) | 1.25 → 0.99 (21%) | 1.84 → 1.39 (25%) |
| Llangefni | Anglesey | Valley (15 km, Met Office via GHCNh) | 0.78 → 0.60 (24%) | 1.09 → 0.77 (29%) | 1.48 → 1.07 (27%) |
| Dumfries | Dumfries and Galloway | Carlisle (44 km, Met Office via GHCNh) | 0.90 → 0.71 (21%) | 1.27 → 0.90 (29%) | 1.83 → 1.30 (29%) |
| Kelso | Scottish Borders | Redesdale Camp (36 km, Met Office via GHCNh) | 0.99 → 0.87 (12%) | 1.35 → 1.11 (17%) | 1.82 → 1.47 (19%) |
| Ayr | Ayrshire | Prestwick Rnas (7 km, Met Office via GHCNh) | 0.85 → 0.72 (15%) | 1.16 → 0.91 (21%) | 1.68 → 1.25 (25%) |
| Perth | Perthshire | Strathallen Airfield (21 km, Met Office via GHCNh) | 1.06 → 0.94 (11%) | 1.33 → 1.12 (15%) | 1.86 → 1.48 (21%) |
| Huntly | Aberdeenshire | Dyce (45 km, Met Office via GHCNh) | 0.99 → 0.77 (22%) | 1.28 → 0.98 (23%) | 1.77 → 1.34 (24%) |
| Elgin | Moray | Lossiemouth (7 km, METAR) | 1.02 → 0.87 (14%) | 1.33 → 1.16 (13%) | 1.79 → 1.50 (16%) |
| Fort William | west Highlands | Tulloch Bridge (25 km, Met Office via GHCNh) | 1.06 → 1.00 (6%) | 1.46 → 1.18 (19%) | 1.95 → 1.47 (25%) |
| Enniskillen | Fermanagh | Thomastown (3 km, Met Office via GHCNh) | 0.91 → 0.67 (26%) | 1.25 → 0.85 (32%) | 1.83 → 1.27 (31%) |
| Armagh | Armagh | Glenanne No2 (16 km, Met Office via GHCNh) | 0.84 → 0.62 (26%) | 1.17 → 0.82 (30%) | 1.71 → 1.20 (30%) |
| Coleraine | north coast | Magilligan No 2 (17 km, Met Office via GHCNh) | 0.82 → 0.69 (16%) | 1.22 → 0.89 (27%) | 1.68 → 1.20 (28%) |

### Wind speed (km/h, MAE today → learned)

| Location | Area | Reference | 1 day | 3 day | 5 day |
|---|---|---|---|---|---|
| Berwick-upon-Tweed | north-east coast | Boulmer (46 km, Met Office via GHCNh) | 4.95 → 4.04 (18%) | 7.39 → 5.04 (32%) | 9.07 → 6.24 (31%) |
| Longhirst | Northumberland coastal plain | Newcastle (16 km, METAR) | 4.25 → 3.63 (15%) | 5.89 → 4.24 (28%) | 7.44 → 5.24 (30%) |
| Hexham | Tyne valley | Albemarle (16 km, Met Office via GHCNh) | 6.22 → 4.57 (27%) | 6.60 → 4.81 (27%) | 7.72 → 5.41 (30%) |
| Alston | North Pennines upland | Spadeadam (28 km, METAR) | 5.13 → 3.58 (30%) | 6.06 → 4.40 (27%) | 7.70 → 5.65 (27%) |
| Carlisle | Solway and lower Eden | Keswick (34 km, Met Office via GHCNh) | 4.59 → 4.01 (13%) | 6.57 → 4.68 (29%) | 8.11 → 5.40 (33%) |
| Penrith | Eden valley | Shap (19 km, Met Office via GHCNh) | 5.21 → 4.65 (11%) | 5.95 → 5.39 (10%) | 7.77 → 6.67 (14%) |
| Keswick | Lake District fells | Keswick (3 km, Met Office via GHCNh) | 4.59 → 4.01 (13%) | 6.57 → 4.68 (29%) | 8.11 → 5.40 (33%) |
| Seascale | west Cumbrian coast | St Bees Head No.2 (15 km, Met Office via GHCNh) | 7.39 → 4.57 (38%) | 6.68 → 5.71 (15%) | 9.54 → 7.70 (19%) |
| Kendal | south Cumbria | Shap (20 km, Met Office via GHCNh) | 5.21 → 4.65 (11%) | 5.95 → 5.39 (10%) | 7.77 → 6.67 (14%) |
| Garstang | Fylde and Lancashire plain | Blackpool (22 km, Met Office via GHCNh) | 5.62 → 3.63 (35%) | 5.65 → 4.54 (20%) | 7.90 → 5.91 (25%) |
| Settle | Yorkshire Dales | Leeds Bradford (46 km, Met Office via GHCNh) | 4.40 → 3.88 (12%) | 5.13 → 4.45 (13%) | 6.69 → 5.31 (21%) |
| Scotch Corner | Tees lowland | Durham Tees Valley Airport (17 km, Met Office via GHCNh) | 4.29 → 3.46 (19%) | 5.15 → 4.16 (19%) | 6.73 → 5.36 (20%) |
| Boroughbridge | Vale of York | Topcliffe (12 km, Met Office via GHCNh) | 4.84 → 3.78 (22%) | 5.35 → 4.43 (17%) | 6.80 → 5.50 (19%) |
| Pocklington | Wolds edge | Leconfield (24 km, Met Office via GHCNh) | 3.49 → 2.91 (17%) | 5.07 → 3.46 (32%) | 6.53 → 4.43 (32%) |
| Driffield | Yorkshire Wolds | Leconfield (16 km, Met Office via GHCNh) | 3.49 → 2.91 (17%) | 5.07 → 3.46 (32%) | 6.53 → 4.43 (32%) |
| Penzance | west Cornwall | Camborne (19 km, Met Office via GHCNh) | 4.25 → 3.20 (25%) | 5.15 → 4.23 (18%) | 7.53 → 5.72 (24%) |
| Crediton | mid Devon | Exeter (18 km, Met Office via GHCNh) | 3.87 → 3.46 (10%) | 4.78 → 4.11 (14%) | 6.21 → 4.98 (20%) |
| Taunton | Somerset Levels | Yeovilton (32 km, Met Office via GHCNh) | 5.10 → 4.24 (17%) | 5.54 → 4.82 (13%) | 6.86 → 5.64 (18%) |
| Salisbury | Wiltshire chalk | Boscombe Down (10 km, Met Office via GHCNh) | 4.51 → 3.52 (22%) | 4.92 → 4.15 (16%) | 6.18 → 5.01 (19%) |
| Canterbury | east Kent | Manston (20 km, Met Office via GHCNh) | 5.25 → 4.11 (22%) | 11.18 → 4.84 (57%) | 11.78 → 5.20 (56%) |
| Cambridge | Cambridgeshire arable | Lakenheath (37 km, Met Office via GHCNh) | 3.93 → 3.43 (13%) | 4.80 → 4.07 (15%) | 5.96 → 4.97 (17%) |
| Norwich | Norfolk | Norwich (5 km, Met Office via GHCNh) | 3.14 → 2.79 (11%) | 4.13 → 3.51 (15%) | 5.51 → 4.32 (22%) |
| Hereford | Wye valley | Shobdon Airfield (24 km, Met Office via GHCNh) | 4.69 → 3.36 (28%) | 5.51 → 3.81 (31%) | 6.95 → 4.60 (34%) |
| Shrewsbury | Shropshire plain | Shawbury (11 km, Met Office via GHCNh) | 4.37 → 3.74 (14%) | 5.04 → 4.39 (13%) | 6.48 → 5.31 (18%) |
| Lincoln | Lincolnshire | Waddington (7 km, Met Office via GHCNh) | 4.67 → 3.11 (33%) | 5.31 → 3.88 (27%) | 6.50 → 4.87 (25%) |
| Carmarthen | south-west Wales | Pembry Sands (16 km, Met Office via GHCNh) | 8.45 → 6.59 (22%) | 9.45 → 7.35 (22%) | 10.85 → 8.58 (21%) |
| Aberystwyth | Cardigan Bay | Trawsgoed (11 km, Met Office via GHCNh) | 4.78 → 3.94 (18%) | 7.63 → 4.55 (40%) | 9.23 → 5.51 (40%) |
| Brecon | Brecon Beacons | Shobdon Airfield (48 km, Met Office via GHCNh) | 4.69 → 3.36 (28%) | 5.51 → 3.81 (31%) | 6.95 → 4.60 (34%) |
| Welshpool | Severn valley | Shawbury (36 km, Met Office via GHCNh) | 4.37 → 3.74 (14%) | 5.04 → 4.39 (13%) | 6.48 → 5.31 (18%) |
| Llangefni | Anglesey | Valley (15 km, Met Office via GHCNh) | 6.05 → 4.87 (20%) | 6.87 → 5.79 (16%) | 9.16 → 7.60 (17%) |
| Dumfries | Dumfries and Galloway | Dundrennan (39 km, Met Office via GHCNh) | 7.22 → 4.73 (34%) | 8.58 → 6.09 (29%) | 10.63 → 7.76 (27%) |
| Kelso | Scottish Borders | Redesdale Camp (36 km, Met Office via GHCNh) | 4.98 → 4.43 (11%) | 7.15 → 4.88 (32%) | 8.57 → 5.80 (32%) |
| Ayr | Ayrshire | Prestwick Rnas (7 km, Met Office via GHCNh) | 4.64 → 4.38 (6%) | 5.56 → 5.00 (10%) | 7.32 → 6.03 (18%) |
| Perth | Perthshire | Strathallen Airfield (21 km, Met Office via GHCNh) | 3.98 → 3.50 (12%) | 4.89 → 4.04 (17%) | 6.27 → 5.01 (20%) |
| Huntly | Aberdeenshire | Dyce (45 km, Met Office via GHCNh) | 4.67 → 3.92 (16%) | 5.60 → 4.75 (15%) | 7.29 → 5.97 (18%) |
| Elgin | Moray | Lossiemouth (7 km, METAR) | 5.61 → 4.41 (21%) | 6.17 → 5.37 (13%) | 8.09 → 6.69 (17%) |
| Fort William | west Highlands | Tulloch Bridge (25 km, Met Office via GHCNh) | 5.15 → 3.90 (24%) | 6.16 → 4.20 (32%) | 7.08 → 4.73 (33%) |
| Enniskillen | Fermanagh | Thomastown (3 km, Met Office via GHCNh) | 3.80 → 3.34 (12%) | 4.99 → 3.95 (21%) | 6.49 → 4.81 (26%) |
| Armagh | Armagh | Glenanne No2 (16 km, Met Office via GHCNh) | 3.95 → 3.51 (11%) | 4.78 → 3.97 (17%) | 6.45 → 4.88 (24%) |
| Coleraine | north coast | Magilligan No 2 (17 km, Met Office via GHCNh) | 6.31 → 4.27 (32%) | 6.12 → 5.28 (14%) | 8.42 → 6.73 (20%) |

### Daily rainfall (mm, MAE today → learned)

| Location | Area | Reference | 1 day | 3 day | 5 day |
|---|---|---|---|---|---|
| Berwick-upon-Tweed | north-east coast | Berwick (2 km, EA gauge) | 1.33 → 1.07 (19%) | 1.82 → 1.48 (19%) | 2.16 → 1.80 (16%) |
| Longhirst | Northumberland coastal plain | Newbiggin (11 km, EA gauge) | 1.39 → 1.07 (23%) | 1.85 → 1.54 (17%) | 2.34 → 1.92 (18%) |
| Hexham | Tyne valley | Hexham Firtrees (4 km, EA gauge) | 1.48 → 1.28 (14%) | 1.74 → 1.59 (8%) | 2.32 → 1.93 (17%) |
| Alston | North Pennines upland | Alston (0 km, EA gauge) | 2.33 → 1.83 (21%) | 2.72 → 2.24 (18%) | 3.34 → 2.81 (16%) |
| Carlisle | Solway and lower Eden | Willow Holme (2 km, EA gauge) | 1.74 → 1.48 (15%) | 2.27 → 2.01 (11%) | 2.80 → 2.32 (17%) |
| Penrith | Eden valley | Newton Rigg (2 km, EA gauge) | 1.82 → 1.47 (19%) | 2.11 → 1.73 (18%) | 2.62 → 2.26 (14%) |
| Keswick | Lake District fells | Keswick (2 km, EA gauge) | 2.50 → 2.04 (18%) | 3.53 → 2.68 (24%) | 4.33 → 3.46 (20%) |
| Seascale | west Cumbrian coast | Seascale (0 km, EA gauge) | 1.83 → 1.84 (−0%) | 3.87 → 2.83 (27%) | 5.11 → 3.23 (37%) |
| Kendal | south Cumbria | Fisher Tarn (3 km, EA gauge) | 2.22 → 1.98 (11%) | 4.08 → 2.64 (35%) | 5.17 → 3.50 (32%) |
| Garstang | Fylde and Lancashire plain | Barnacre (4 km, EA gauge) | 2.40 → 2.08 (13%) | 4.19 → 2.57 (39%) | 5.32 → 3.40 (36%) |
| Settle | Yorkshire Dales | Stainforth (4 km, EA gauge) | 2.00 → 1.60 (20%) | 3.79 → 2.15 (43%) | 4.62 → 2.79 (40%) |
| Scotch Corner | Tees lowland | Richmond (6 km, EA gauge) | 1.45 → 1.17 (19%) | 1.96 → 1.60 (18%) | 2.59 → 2.21 (15%) |
| Boroughbridge | Vale of York | Roecliffe (1 km, EA gauge) | 1.42 → 1.15 (19%) | 1.72 → 1.40 (18%) | 2.24 → 1.85 (17%) |
| Pocklington | Wolds edge | Elvington (10 km, EA gauge) | 1.29 → 1.06 (18%) | 1.58 → 1.28 (19%) | 2.13 → 1.55 (27%) |
| Driffield | Yorkshire Wolds | Driffield (1 km, EA gauge) | 1.33 → 1.13 (15%) | 1.75 → 1.46 (17%) | 2.25 → 1.78 (21%) |
| Penzance | west Cornwall | St Ives Towednack (8 km, EA gauge) | 2.73 → 2.72 (0%) | 3.82 → 3.25 (15%) | 4.44 → 3.75 (16%) |
| Crediton | mid Devon | Crediton Knowle (6 km, EA gauge) | 1.62 → 1.35 (16%) | 1.71 → 1.59 (7%) | 2.39 → 1.93 (19%) |
| Taunton | Somerset Levels | Fulwood (6 km, EA gauge) | 1.61 → 1.42 (12%) | 1.99 → 1.67 (16%) | 2.72 → 2.13 (22%) |
| Salisbury | Wiltshire chalk | Winterbourne Stoke (12 km, EA gauge) | 1.33 → 1.12 (16%) | 1.71 → 1.35 (21%) | 2.29 → 1.73 (25%) |
| Canterbury | east Kent | Canterbury (3 km, EA gauge) | 0.97 → 0.90 (7%) | 1.51 → 1.26 (16%) | 1.96 → 1.52 (23%) |
| Cambridge | Cambridgeshire arable | Bourn (11 km, EA gauge) | 0.99 → 0.91 (8%) | 1.33 → 1.15 (14%) | 1.78 → 1.40 (21%) |
| Norwich | Norfolk | Acle (17 km, EA gauge) | 1.38 → 1.22 (12%) | 1.60 → 1.54 (4%) | 2.33 → 1.83 (22%) |
| Hereford | Wye valley | Yarkhill (11 km, EA gauge) | 1.24 → 1.00 (19%) | 1.60 → 1.25 (22%) | 1.97 → 1.56 (21%) |
| Shrewsbury | Shropshire plain | Monkmoor (2 km, EA gauge) | 1.37 → 1.24 (10%) | 1.68 → 1.43 (14%) | 2.11 → 1.81 (14%) |
| Lincoln | Lincolnshire | Canwick (2 km, EA gauge) | 1.45 → 1.17 (20%) | 1.58 → 1.39 (12%) | 2.14 → 1.80 (16%) |
| Carmarthen | south-west Wales | Cwm Garw (32 km, COSMOS-UK) | 2.51 → 2.32 (8%) | 3.30 → 2.95 (11%) | 4.58 → 3.69 (19%) |
| Aberystwyth | Cardigan Bay | Plynlimon (22 km, COSMOS-UK) | 3.38 → 3.20 (5%) | 4.25 → 3.89 (8%) | 5.53 → 4.81 (13%) |
| Brecon | Brecon Beacons | none in range | – | – | – |
| Welshpool | Severn valley | Rorrington (11 km, EA gauge) | 1.42 → 1.28 (10%) | 1.74 → 1.38 (21%) | 2.10 → 1.70 (19%) |
| Llangefni | Anglesey | Henfaes Farm (20 km, COSMOS-UK) | 2.57 → 2.21 (14%) | 4.01 → 2.44 (39%) | 5.06 → 3.19 (37%) |
| Dumfries | Dumfries and Galloway | Townfoot (Glencaple) (9 km, SEPA gauge) | 1.92 → 1.57 (18%) | 2.59 → 1.99 (23%) | 3.58 → 2.80 (22%) |
| Kelso | Scottish Borders | Goldscleugh (21 km, EA gauge) | 1.82 → 1.49 (18%) | 2.24 → 1.89 (15%) | 2.73 → 2.49 (9%) |
| Ayr | Ayrshire | Prestwick (5 km, SEPA gauge) | 1.93 → 1.43 (26%) | 2.47 → 2.09 (15%) | 3.20 → 2.29 (28%) |
| Perth | Perthshire | Perth Norwich Union (3 km, SEPA gauge) | 1.66 → 1.22 (26%) | 2.05 → 1.73 (16%) | 2.79 → 2.15 (23%) |
| Huntly | Aberdeenshire | Avochie (6 km, SEPA gauge) | 1.90 → 1.62 (14%) | 2.35 → 1.93 (18%) | 2.87 → 2.19 (24%) |
| Elgin | Moray | Blackhills No 2 (7 km, SEPA gauge) | 1.59 → 1.42 (10%) | 1.95 → 1.67 (15%) | 2.41 → 1.82 (24%) |
| Fort William | west Highlands | Glen Nevis (3 km, SEPA gauge) | 3.23 → 2.84 (12%) | 3.85 → 3.15 (18%) | 4.70 → 4.01 (15%) |
| Enniskillen | Fermanagh | Fivemiletown (23 km, COSMOS-UK) | 2.18 → 1.49 (32%) | 2.78 → 2.12 (24%) | 3.27 → 2.47 (24%) |
| Armagh | Armagh | Hillsborough (39 km, COSMOS-UK) | 2.04 → 1.68 (17%) | 2.58 → 2.25 (13%) | 3.35 → 2.51 (25%) |
| Coleraine | north coast | none in range | – | – | – |

## By season (median change, learned vs today)

| Variable | Lead | Winter | Spring | Summer | Autumn |
|---|---|---|---|---|---|
| Temperature | 1 | 19% | 14% | 15% | 15% |
| Temperature | 3 | 19% | 22% | 21% | 22% |
| Temperature | 5 | 24% | 27% | 24% | 22% |
| Wind speed | 1 | 17% | 19% | 15% | 17% |
| Wind speed | 3 | 16% | 21% | 16% | 22% |
| Wind speed | 5 | 25% | 21% | 22% | 22% |
| Daily rainfall | 1 | 17% | 8% | 14% | 17% |
| Daily rainfall | 3 | 18% | 15% | 14% | 19% |
| Daily rainfall | 5 | 16% | 17% | 28% | 20% |

## Training window (median change of the learned forecast)

| Variable | Lead | 30 days | 60 days | 90 days |
|---|---|---|---|---|
| Temperature | 1 | 16% | 16% | 16% |
| Temperature | 3 | 21% | 22% | 21% |
| Temperature | 5 | 24% | 24% | 25% |
| Wind speed | 1 | 17% | 17% | 17% |
| Wind speed | 3 | 18% | 19% | 18% |
| Wind speed | 5 | 22% | 23% | 23% |
| Daily rainfall | 1 | 15% | 16% | 16% |
| Daily rainfall | 3 | 17% | 17% | 18% |
| Daily rainfall | 5 | 21% | 21% | 20% |

## Which models the learner leans on (mean weight across sites)

| Variable | Lead | ECMWF | GFS | ICON | Met Office | AIFS |
|---|---|---|---|---|---|---|
| Temperature | 1 | 27% | 17% | 29% | 27% | 0% |
| Temperature | 3 | 22% | 14% | 21% | 18% | 24% |
| Temperature | 5 | 23% | 16% | 18% | 16% | 27% |
| Wind speed | 1 | 26% | 21% | 27% | 26% | 0% |
| Wind speed | 3 | 21% | 17% | 20% | 19% | 23% |
| Wind speed | 5 | 22% | 17% | 17% | 19% | 26% |
| Daily rainfall | 1 | 26% | 24% | 24% | 26% | 0% |
| Daily rainfall | 3 | 19% | 19% | 20% | 18% | 24% |
| Daily rainfall | 5 | 19% | 21% | 17% | 19% | 23% |

## Rainfall: wet or dry day called right (median across sites, 1 mm threshold)

| Lead | Today | Learned | ECMWF | Met Office |
|---|---|---|---|---|
| 1 day | 84% | 85% | 83% | 84% |
| 3 day | 78% | 80% | 78% | 78% |
| 5 day | 73% | 74% | 72% | 73% |

## Rainfall in the west: what changes

Mean daily rainfall error (bias, forecast minus observed, mm/day) for AceWeather today and the model mean:

| Location | 1 day today | 1 day mean | 3 days today | 3 days mean | 5 days today | 5 days mean |
|---|---|---|---|---|---|---|
| Seascale | +0.1 | +1.1 | +2.3 | +1.7 | +3.2 | +1.3 |
| Kendal | −0.1 | −0.7 | +1.8 | +0.4 | +2.4 | +0.3 |
| Garstang | −0.3 | −0.7 | +1.9 | +0.4 | +2.2 | −0.1 |
| Settle | +0.6 | −0.3 | +1.8 | +0.4 | +2.2 | +0.2 |

AceWeather's forecast (the Met Office model in the UK) is well calibrated for tomorrow but over-forecasts rain three to five days ahead by about 2–3 mm a day across Cumbria, Lancashire and the Dales. The model mean removes most of that bias, which is why rainfall errors there fall by a quarter to two-fifths.

## Experiments

**Time-of-day bias correction.** Correcting the blend's bias separately for each 3-hour block of the day (a simple form of model output statistics) instead of with one number:

| Variable | Lead | One bias | By time of day | Stations better |
|---|---|---|---|---|
| Temperature | 1 | 0.78 | 0.77 | 20 / 36 |
| Temperature | 3 | 0.98 | 0.98 | 19 / 36 |
| Temperature | 5 | 1.33 | 1.33 | 21 / 36 |
| Wind speed | 1 | 3.93 | 3.91 | 21 / 35 |
| Wind speed | 3 | 4.64 | 4.61 | 25 / 35 |
| Wind speed | 5 | 5.70 | 5.68 | 21 / 35 |

It made no meaningful difference, so the live forecast keeps a single bias per lead day.

## Recommendation

1. **Temperature and wind:** show the inverse-error weighted mean of ECMWF, GFS, ICON and the Met Office model (plus AIFS from day 3), minus the blend's mean error over the last 60 days at the nearest reference station. In practice the weights stay close to equal, so the gain is robust rather than tuned.
2. **Rainfall:** show the equal-weight mean of the same models with no bias shift. It was the best rainfall strategy at every lead time.
3. **Fallback:** where no reference station has 20 days of data, keep today's forecast. Carlisle had no representative temperature station in this test.
4. **Keep scoring:** run the same comparison daily on live data, so a change in any model shows up within weeks.

## Limits

- Scores describe the reference stations, not the farms. A reference is chosen by distance plus 10 km per 100 m of height difference, and never more than 250 m above or below the location; the location tables give every distance.
- Rainfall in Wales and Northern Ireland is checked against a handful of COSMOS-UK sites (no open national gauge feed); Brecon and Coleraine had no rain reference at all.
- METAR temperatures are whole degrees, which adds about 0.25 °C to every strategy equally.
- One year is one set of seasons. A repeat next year would show whether the gains are stable.
- Rain gauges are single points; convective showers can miss a gauge that the models forecast correctly a few kilometres away.
- Wind at COSMOS-UK sites is measured below 10 m, so wind is scored at airports and Met Office stations only.
