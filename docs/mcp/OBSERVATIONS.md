# Observed layer (Phase 1)

Added 13 October 2026, MCP server 0.4.0. Until now every AceWeather value was a model output: current conditions were the forecast model's grid-point analysis, recent days a hindcast, and history ERA5 reanalysis. This layer adds real station readings from open sources, read on demand with no database, and makes `get_current_weather` prefer a nearby quality-controlled observation over the model.

## Sources

| Source | Network id | Tier | What it gives | Cadence and lag (measured 13 Oct 2026) | Access | Licence |
|---|---|---|---|---|---|---|
| [MeteoGate E-SOH](https://api.meteogate.eu/eu-eumetnet-surface-observations) (EUMETNET) | `metoffice_synop`, `metoffice_aws`, `esoh_station` | official | Met Office synoptic stations: temperature, dew point, humidity, sea-level pressure, 10-minute wind and gust, hourly gust, hourly rainfall; automatic (`99xxx`) sites: temperature, humidity, hourly rainfall | Synoptic hourly, about 45 min behind; some sites 10-minute; automatic sites about 3 h behind | OGC EDR, anonymous, 24 h retention | CC BY 4.0 |
| [aviationweather.gov METAR](https://aviationweather.gov/data/api/) (NOAA) | `metar` | official | Airport temperature and dew point (whole degrees), wind and gust (knots), pressure, visibility, present weather and cloud | Every 30 min or on change, 10–30 min behind | JSON by bounding box, no key, 100 requests/min | US public domain |
| [Environment Agency rainfall](https://environment.data.gov.uk/flood-monitoring/doc/rainfall) | `ea_rain_gauge` | official_gauge | 15-minute tipping-bucket totals; the layer derives 1 h and 24 h totals ending at the gauge's latest reading | Many gauges within 30 min; some once or twice a day (the age is reported) | JSON, no key, England only | OGL v3 |
| [COSMOS-UK](https://cosmos-api.ceh.ac.uk) (UKCEH) | `cosmos_uk` | research | Volumetric soil moisture at 10 cm (mean of two TDT probes), soil temperature at 10 cm, air temperature, humidity, wind, 30-minute rainfall | 30-minute data published in daily batches: readings end at the previous midnight | OGC EDR, no key, about 50 sites | OGL |

For learning (not current conditions), the learned forecast also reads Met Office synoptic and climate stations from NOAA's GHCNh hourly archive: about 145 UK stations reporting near-hourly, 0.1 °C precision, about three days behind real time. This fills gaps the airports leave, for example Tulloch Bridge for Fort William, Trawsgoed for Aberystwyth and Glenanne for Armagh. See [LEARNING-BACKTEST-UK.md](LEARNING-BACKTEST-UK.md).

The daily learning job also learns rainfall from Environment Agency and SEPA rain gauges, and can learn from quality-controlled Netatmo citizen stations in gaps of the official networks. Neither appears in current conditions; Netatmo readings are used for learning only and never republished. See [LEARNING-DAILY.md](LEARNING-DAILY.md).

Sources looked at and not used yet: the WMO WIS2 Global Cache (same Met Office SYNOP data as BUFR, backup route if E-SOH fails), the Met Office radar rain-rate grid on AWS (CC BY-SA), Met Éireann observations (CC BY 4.0), Natural Resources Wales rain gauges (needs an API key) and CWOP citizen stations (needs a persistent APRS-IS connection or 30 MB hourly files, so not suited to serverless fetches). Weather Underground does not allow redistribution. Met Office WOW is being retired during 2026.

## How a request works

`nearbyObservations` in `src/mcp/observations.ts` runs the four adapters in `src/mcp/sources/` in parallel for a location and radius (60 km for `get_current_weather`, 5–100 km for `get_nearby_observations`), then:

1. **Normalises** every reading to °C, km/h, hPa, mm and % (wind is converted to the requested unit afterwards).
2. **Range-checks** each value (for example temperature −40 to 50 °C, pressure 870 to 1085 hPa); a failing value is removed and the station gets `out_of_range`.
3. **De-duplicates** co-located records. The same Met Office site can arrive under a WMO id (`0-20000-0-03265`) and a national id (`0-826-0-244`); the newest record wins and gaps are filled from the other if it is fresh.
4. **Flags freshness**: readings older than 90 minutes are `stale`. A 24 h rainfall total is only reported when at least 90 % of the intervals are present; otherwise `partial_rainfall`.
5. **Buddy-checks** temperature: an official station more than 4 °C from the median of its fresh official neighbours within 60 km (needs at least two) gets `temperature_outlier`.
6. **Compares with the model**: a station more than 6 °C from the grid-point analysis gets `differs_from_model` (informational; the model can be wrong).
7. Marks a station `usable_for_current` when it is official tier, has a temperature, and carries none of `stale`, `temperature_outlier` or `no_air_readings`.

`get_current_weather` then picks the nearest usable station within 40 km, the nearest fresh 24 h rainfall (gauges first, then stations) within 40 km and no more than 6 hours old, and the nearest COSMOS-UK soil moisture within 60 km and two days. When no station qualifies the response is the model with `preferred: "model"` and a warning saying so.

A failing source adds a warning (`... unavailable: ...`) and the other sources still load. Each adapter caches its result in the instance cache for 10 minutes; station catalogues (E-SOH names, EA gauge list, COSMOS sites) for 6–24 hours. Requests add at most about one second to a cold call.

## Known limits

- Readings are measured at the station, not the farm. Rainfall and wind vary over a few kilometres; the response always states distance and age.
- E-SOH station names come from the GTS as upper-case 20-character strings and are tidied heuristically; one Met Office automatic site near Malton is labelled "Dalmally, Stronmilchan" upstream.
- Met Office automatic (`99xxx`) sites are typically three hours behind, so they are flagged stale and never preferred, but they still appear in `get_nearby_observations`.
- COSMOS-UK is daily-batch, so its soil moisture is up to a day old; the timestamp is always included.
- METAR temperatures are whole degrees and carry no rainfall for UK airports; the layer prefers a Met Office station when both are equally close.
- No citizen stations yet. Adding them means a quality-control history per station, which needs storage (Phase 2).

## Next steps

- Store forecast snapshots and score each model against these observations per location to pick and bias-correct the blend (the accuracy mechanism the observations exist for).
- Add the Met Office radar rain-rate grid for rainfall at the location itself, calibrated against the gauges.
- Add SEPA gauges for Scotland and the WIS2 cache as a fallback for E-SOH.
