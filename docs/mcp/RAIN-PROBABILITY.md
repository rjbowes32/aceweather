# Rain probability, step 1: a calibrated chance of rain from the archived models

Generated 2026-10-14 by `scripts/backtest/rain-probability.mjs`. 38 rain gauges across the UK (the nationwide backtest's rain references), forecasts issued 1 to 7 days ahead, scored 2025-12-01 to 2026-09-17.

## Why this and not the ensembles

The plan was to score ensemble rain chances (191 members across ECMWF, ECMWF's AI ensemble, NOAA, ICON and the Met Office) against the gauges. That turned out to be impossible today. Open-Meteo's ensemble archive accepts dates back to mid-July but returns no member values before the last four or five days. The probability the dashboard shows today is not archived either. Ensemble chances can only be scored from records AceWeather keeps itself, which is step 2.

What can be scored over a full year is a calibrated probability built from the archived deterministic models: ECMWF, GFS, ICON, the Met Office model and ECMWF's AI model. Day 7 has no archived Met Office or ICON forecasts, so its calibration uses the other three. A logistic regression turns four things into a chance of rain: how many models forecast rain, the average and largest amounts forecast, and how often it rains at that gauge. National weather services call this model output statistics. Each month's forecasts use a calibration fitted only on days known when they were issued (before the month start minus the lead time).

Two calibrations were tested. The full one uses all four inputs; the simple one uses only the share of models forecasting rain.

**Not yet tested in autumn.** The first two months (August and September 2025) train the calibration, so scoring runs from December to mid-September. October and November, the main autumn drilling and spraying window, have not been scored. Step 2's daily records will cover this autumn.

## Results

Brier score, the standard accuracy measure for probabilities: 0 is perfect and lower is better.

| Rain on the day | Lead | Days scored | Climatology | Share of models forecasting rain | AceWeather today (yes/no) | Calibrated, model share only | Calibrated, full | Skill over climatology |
|---|---|---|---|---|---|---|---|---|
| 1 mm or more | 1 | 10318 | 0.236 | 0.108 | 0.158 | 0.109 | **0.097** | 59% |
| 1 mm or more | 2 | 9495 | 0.239 | 0.121 | 0.192 | 0.118 | **0.107** | 55% |
| 1 mm or more | 3 | 10022 | 0.237 | 0.136 | 0.216 | 0.131 | **0.122** | 49% |
| 1 mm or more | 4 | 9341 | 0.241 | 0.156 | 0.254 | 0.149 | **0.141** | 42% |
| 1 mm or more | 5 | 9305 | 0.238 | 0.165 | 0.277 | 0.160 | **0.155** | 35% |
| 1 mm or more | 6 | 9752 | 0.237 | 0.186 | 0.315 | 0.176 | **0.168** | 29% |
| 1 mm or more | 7 | 10583 | 0.238 | 0.215 | 0.328 | 0.193 | **0.180** | 24% |
| 0.2 mm or more | 1 | 10318 | 0.246 | 0.123 | 0.173 | 0.128 | **0.114** | 54% |
| 0.2 mm or more | 2 | 9495 | 0.252 | 0.137 | 0.209 | 0.139 | **0.124** | 51% |
| 0.2 mm or more | 3 | 10022 | 0.247 | 0.146 | 0.225 | 0.146 | **0.132** | 46% |
| 0.2 mm or more | 4 | 9341 | 0.245 | 0.160 | 0.262 | 0.158 | **0.147** | 40% |
| 0.2 mm or more | 5 | 9305 | 0.251 | 0.170 | 0.275 | 0.169 | **0.158** | 37% |
| 0.2 mm or more | 6 | 9752 | 0.248 | 0.194 | 0.308 | 0.186 | **0.176** | 29% |
| 0.2 mm or more | 7 | 10583 | 0.247 | 0.219 | 0.302 | 0.198 | **0.182** | 26% |

AceWeather today shows a yes or no from its standard forecast next to a rain chance whose origin cannot be scored. Scored as a probability of 0 or 100%, that yes or no is penalised heavily when wrong; it is included because it is the only part of today's display that can be scored.

## Are the differences real?

Improvement in Brier score of the full calibration, with a 95% range from resampling whole days (1000 resamples). One weather system hits many gauges on the same day, so days, not gauge-days, are resampled. A range clear of zero means the improvement is not luck.

| Rain of 1 mm or more | Over model share | Over AceWeather's yes/no | Over the simple calibration |
|---|---|---|---|
| 1 day | 8% to 11% | 36% to 41% | 9% to 12% |
| 2 day | 9% to 13% | 41% to 47% | 7% to 11% |
| 3 day | 8% to 13% | 41% to 46% | 5% to 9% |
| 4 day | 7% to 13% | 42% to 47% | 4% to 7% |
| 5 day | 4% to 9% | 41% to 47% | 1% to 6% |
| 6 day | 7% to 12% | 44% to 49% | 3% to 7% |
| 7 day | 12% to 20% | 42% to 48% | 5% to 9% |

## By season (Brier score, rain of 1 mm or more; full calibration vs model share)

| Season | 1 day | 3 day | 5 day |
|---|---|---|---|
| Winter | 0.105 vs 0.111 (90 days) | 0.135 vs 0.140 (90 days) | 0.186 vs 0.190 (90 days) |
| Spring | 0.106 vs 0.121 (85 days) | 0.121 vs 0.139 (71 days) | 0.140 vs 0.151 (66 days) |
| Summer | 0.079 vs 0.090 (86 days) | 0.104 vs 0.123 (92 days) | 0.132 vs 0.149 (78 days) |
| Autumn | 0.107 vs 0.116 (16 days) | 0.147 vs 0.167 (16 days) | 0.152 vs 0.166 (16 days) |

Autumn here is September 2026 only.

## By nation (Brier score of the full calibration, rain of 1 mm or more, and skill over climatology)

| Nation | 1 day | 3 days | 5 days | 7 days |
|---|---|---|---|---|
| England | 0.094 (59%) | 0.119 (49%) | 0.152 (35%) | 0.175 (24%) |
| Wales | 0.103 (59%) | 0.128 (49%) | 0.164 (36%) | 0.188 (26%) |
| Scotland | 0.108 (56%) | 0.128 (48%) | 0.160 (35%) | 0.188 (24%) |
| Northern Ireland | 0.087 (66%) | 0.124 (51%) | 0.159 (37%) | 0.192 (24%) |

## Reliability, rain of 1 mm or more, 1 day ahead

When the forecast says X%, how often did it rain? A reliable forecast has the two columns close together.

| Forecast | Full calibration: days | it rained | Model share: days | it rained |
|---|---|---|---|---|
| 0–10% | 3732 | 2% | 3873 | 2% |
| 10–20% | 894 | 11% | 0 | – |
| 20–30% | 572 | 22% | 971 | 14% |
| 30–40% | 475 | 34% | 0 | – |
| 40–50% | 463 | 42% | 820 | 29% |
| 50–60% | 437 | 52% | 0 | – |
| 60–70% | 516 | 59% | 893 | 48% |
| 70–80% | 608 | 71% | 0 | – |
| 80–90% | 857 | 87% | 1105 | 67% |
| 90–100% | 1764 | 96% | 2656 | 91% |

## Reliability in summer (showers), rain of 1 mm or more, 1 day ahead

When the forecast says X%, how often did it rain? A reliable forecast has the two columns close together.

| Forecast | Full calibration: days | it rained | Model share: days | it rained |
|---|---|---|---|---|
| 0–10% | 1542 | 1% | 1557 | 1% |
| 10–20% | 277 | 8% | 0 | – |
| 20–30% | 182 | 16% | 305 | 8% |
| 30–40% | 119 | 28% | 0 | – |
| 40–50% | 140 | 34% | 259 | 24% |
| 50–60% | 113 | 49% | 0 | – |
| 60–70% | 141 | 56% | 266 | 42% |
| 70–80% | 139 | 68% | 0 | – |
| 80–90% | 170 | 88% | 281 | 66% |
| 90–100% | 375 | 94% | 530 | 91% |

## Reliability, rain of 1 mm or more, 5 days ahead

When the forecast says X%, how often did it rain? A reliable forecast has the two columns close together.

| Forecast | Full calibration: days | it rained | Model share: days | it rained |
|---|---|---|---|---|
| 0–10% | 1694 | 2% | 2467 | 4% |
| 10–20% | 1320 | 10% | 0 | – |
| 20–30% | 873 | 24% | 1205 | 18% |
| 30–40% | 804 | 32% | 0 | – |
| 40–50% | 779 | 40% | 1319 | 31% |
| 50–60% | 747 | 51% | 0 | – |
| 60–70% | 794 | 61% | 1345 | 48% |
| 70–80% | 923 | 68% | 0 | – |
| 80–90% | 877 | 81% | 1520 | 68% |
| 90–100% | 494 | 89% | 1449 | 82% |

## What this means

- **The full calibration is reliable overall at every lead time.** When it says a given chance, it rains about that often (tables above). Raw model agreement over-promises: on days most models forecast rain, it rained less often than the share implies.
- **Summer showers are the weak spot.** In summer the calibration runs about 5–10 points high between 30% and 70% (for example, "40–50%" days were wet about a third of the time). It is still much closer than raw model agreement, which runs 15–25 points high there. A calibration fitted per season is the obvious next refinement once step 2 has a summer of records.
- **The gains are real.** Against raw model agreement and against today's yes or no, the 95% ranges above stay clear of zero at every lead.
- **The full calibration earns its extra inputs:** it beats the simple, share-only version by 4% to 10% depending on lead (the right-hand column above shows whether each gap is clear of zero). The amounts forecast carry information that agreement alone misses.
- **It holds in every nation and season scored.** Autumn has only September so far.

The final calibrations for days 1–7, fitted on all the data, are saved in `src/mcp/rain-calibration.json`, with the models each lead uses and national climatology values for locations without a gauge. The next step is to show the calibrated chance in the dashboard. In parallel, step 2 records the live ensemble chance and the dashboard's current chance against gauge outcomes, to test whether ensembles add skill on top.
