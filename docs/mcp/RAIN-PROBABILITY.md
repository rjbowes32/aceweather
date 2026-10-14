# Rain probability, step 1: a calibrated chance of rain from the archived models

Generated 2026-10-14 by `scripts/backtest/rain-probability.mjs`. 38 rain gauges across the UK (the nationwide backtest's rain references), forecasts issued 1, 3 and 5 days ahead, scored 2025-12-01 to 2026-09-17.

## Why this and not the ensembles

The plan was to score ensemble rain chances (191 members across ECMWF, ECMWF's AI ensemble, NOAA, ICON and the Met Office) against the gauges. That turned out to be impossible today. Open-Meteo's ensemble archive accepts dates back to mid-July but returns no member values before the last four or five days. The probability the dashboard shows today is not archived either. Ensemble chances can only be scored from records AceWeather keeps itself, which is step 2.

What can be scored over a full year is a calibrated probability built from the five models already archived (ECMWF, GFS, ICON, the Met Office model and ECMWF's AI model). A logistic regression turns four things into a chance of rain: how many models forecast rain, the average and largest amounts forecast, and how often it rains at that gauge. This is the method national weather services call model output statistics. Each month's forecasts use a calibration fitted only on days before that month, minus the lead time, so no forecast uses information from after it was issued.

## Results

Brier score, the standard accuracy measure for probabilities: 0 is perfect and lower is better. Skill is relative to climatology (how often it rains at that gauge): 100% is perfect, 0% is no better than climatology, and negative is worse.

| Rain on the day | Lead | Days scored | Climatology | Share of models forecasting rain | AceWeather today (yes/no) | Calibrated probability | Skill of calibrated |
|---|---|---|---|---|---|---|---|
| 1 mm or more | 1 day | 10318 | 0.236 | 0.108 | 0.158 | **0.097** | 59% |
| 1 mm or more | 3 day | 10022 | 0.237 | 0.136 | 0.216 | **0.122** | 49% |
| 1 mm or more | 5 day | 9305 | 0.238 | 0.165 | 0.277 | **0.155** | 35% |
| 0.2 mm or more | 1 day | 10318 | 0.246 | 0.123 | 0.173 | **0.114** | 54% |
| 0.2 mm or more | 3 day | 10022 | 0.247 | 0.146 | 0.225 | **0.132** | 46% |
| 0.2 mm or more | 5 day | 9305 | 0.251 | 0.170 | 0.275 | **0.158** | 37% |

AceWeather today shows a yes or no from its standard forecast (wet if it forecasts 1 mm, or 0.2 mm, or more) next to a rain chance whose origin cannot be scored. Scored as a probability of 0 or 100%, that yes or no is penalised heavily when wrong; it is included because it is the only part of today's display that can be scored.

## By nation (Brier score of the calibrated probability, rain of 1 mm or more)

| Nation | 1 day | 3 days | 5 days |
|---|---|---|---|
| England | 0.094 (skill 59%) | 0.119 (skill 49%) | 0.152 (skill 35%) |
| Wales | 0.103 (skill 59%) | 0.128 (skill 49%) | 0.164 (skill 36%) |
| Scotland | 0.108 (skill 56%) | 0.128 (skill 48%) | 0.160 (skill 35%) |
| Northern Ireland | 0.087 (skill 66%) | 0.124 (skill 51%) | 0.159 (skill 37%) |

## Reliability, rain of 1 mm or more, 1 day ahead

When the forecast says X%, how often did it rain? A reliable forecast has the two columns close together.

| Forecast | Calibrated: days | Calibrated: it rained | Model share: days | Model share: it rained |
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

## What this means

- **The calibrated probability is reliable at every lead time.** When it says a given chance, it rains about that often (the table above for day 1; days 3 and 5 are as close). Raw model agreement over-promises: on days where four or five of the five models forecast rain, it rained less often than the share implies.
- **It beats everything AceWeather can be scored on today.** For rain of 1 mm or more it improves on raw model agreement by 10% at day 1, 10% at day 3, 6% at day 5, and on the standard forecast's yes or no by 38% at day 1, 44% at day 3, 44% at day 5.
- **It holds in every nation,** with skill over climatology of 56–66% for tomorrow and 35–37% at five days.
- **Local climatology adds little once the models are known:** its weight in the fitted calibration is small, so a regional value is enough at locations without a gauge.

Next: step 2 records the live 191-member ensemble chance, the dashboard's current chance and this calibrated chance against gauge outcomes every day, so after about 60 days it can be shown whether the ensembles add skill on top. The calibrated chance itself could go into the dashboard now for days 1–7; that needs coefficients for days 2, 4, 6 and 7, which means one more archived-forecast download per gauge.
