from __future__ import annotations

from datetime import date
from typing import Any

# Spray-window thresholds
SPRAY_MAX_WIND_KMH: float = 18
SPRAY_MAX_GUST_KMH: float = 28
SPRAY_MAX_RAIN_MM: float = 0.2
SPRAY_MAX_RAIN_PROB_PCT: int = 35
SPRAY_MIN_TEMP_C: int = 5
SPRAY_MAX_TEMP_C: int = 28

# Fungal-pressure scoring thresholds
FUNGAL_TEMP_RANGE: tuple[int, int] = (12, 26)
FUNGAL_HIGH_RH: int = 88
FUNGAL_RAIN_THRESHOLD: float = 0.2
FUNGAL_HIGH_CLOUD: int = 75
FUNGAL_THRESHOLDS: tuple[float, float, float] = (1.8, 3.0, 4.2)

# Septoria scoring thresholds
SEPTORIA_TEMP_RANGE: tuple[int, int] = (10, 20)
SEPTORIA_HIGH_RH: int = 85
SEPTORIA_RAIN_THRESHOLD: float = 0.2
SEPTORIA_THRESHOLDS: tuple[float, float, float] = (1.5, 2.8, 4.0)

# Smith Period (late blight proxy) thresholds
SMITH_MIN_HOURS: int = 11
SMITH_MIN_TEMP_C: int = 10
SMITH_MIN_RH: int = 90


def empty_history_payload(start_date: date, end_date: date) -> dict[str, Any]:
    return {
        "daily": {
            "time": [],
            "weather_code": [],
            "temperature_2m_max": [],
            "temperature_2m_min": [],
            "precipitation_sum": [],
            "rain_sum": [],
            "snowfall_sum": [],
            "precipitation_hours": [],
            "wind_speed_10m_max": [],
        },
        "hourly": {
            "time": [],
            "temperature_2m": [],
            "relative_humidity_2m": [],
            "precipitation": [],
            "weather_code": [],
            "wind_speed_10m": [],
        },
        "range": {
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "days": 0,
        },
    }


def derive_climate_memory(climate_window: dict[str, Any], month_to_date_history: dict[str, Any]) -> dict[str, Any]:
    climate_daily = climate_window["daily"]
    grouped_monthly_rain: dict[str, float] = {}
    for time_value, rain_value in zip(
        climate_daily["time"],
        climate_daily["precipitation_sum"],
        strict=False,
    ):
        year = time_value[:4]
        grouped_monthly_rain[year] = grouped_monthly_rain.get(year, 0.0) + float(rain_value or 0.0)

    monthly_totals = list(grouped_monthly_rain.values())
    average_monthly_rain = sum(monthly_totals) / max(len(monthly_totals), 1)

    current_daily = month_to_date_history["daily"]
    current_month_rain = sum(float(value or 0.0) for value in current_daily["precipitation_sum"])
    observed_days = len(current_daily["time"])
    progress_pct = (current_month_rain / average_monthly_rain * 100) if average_monthly_rain > 0 else 0.0

    return {
        "averageMonthlyRain": round(average_monthly_rain, 1),
        "currentMonthRain": round(current_month_rain, 1),
        "observedDays": observed_days,
        "sampleYears": len(monthly_totals),
        "progressPct": round(progress_pct, 1),
        "progressPctCapped": round(min(progress_pct, 100.0), 1),
    }


def classify_index(score: float, *, thresholds: tuple[float, float, float]) -> str:
    if score >= thresholds[2]:
        return "High"
    if score >= thresholds[1]:
        return "Elevated"
    if score >= thresholds[0]:
        return "Watch"
    return "Low"


def longest_true_block(values: list[bool]) -> int:
    longest = current = 0
    for value in values:
        current = current + 1 if value else 0
        longest = max(longest, current)
    return longest


def derive_agronomy(
    forecast: dict[str, Any],
    history: dict[str, Any],
    climate_window: dict[str, Any],
    observations: dict[str, Any] | None = None,
) -> dict[str, Any]:
    hourly = forecast["hourly"]
    daily = forecast["daily"]
    current = forecast["current"]
    history_daily = history["daily"]
    climate_daily = climate_window["daily"]

    spray_flags: list[bool] = []
    fungal_scores: list[float] = []
    septoria_scores: list[float] = []

    for index in range(min(len(hourly["time"]), 72)):
        temp = hourly["temperature_2m"][index] or 0
        rh = hourly["relative_humidity_2m"][index] or 0
        rain = hourly["precipitation"][index] or 0
        rain_probability = hourly["precipitation_probability"][index] or 0
        wind = hourly["wind_speed_10m"][index] or 0
        gust = hourly["wind_gusts_10m"][index] or 0
        cloud = hourly["cloud_cover"][index] or 0

        spray_flags.append(
            wind <= SPRAY_MAX_WIND_KMH and gust <= SPRAY_MAX_GUST_KMH
            and rain < SPRAY_MAX_RAIN_MM and rain_probability < SPRAY_MAX_RAIN_PROB_PCT
            and SPRAY_MIN_TEMP_C <= temp <= SPRAY_MAX_TEMP_C
        )

        fungal_score = 0.0
        if FUNGAL_TEMP_RANGE[0] <= temp <= FUNGAL_TEMP_RANGE[1]:
            fungal_score += 1.5
        if rh >= FUNGAL_HIGH_RH:
            fungal_score += 2.0
        if rain >= FUNGAL_RAIN_THRESHOLD:
            fungal_score += 1.5
        if cloud >= FUNGAL_HIGH_CLOUD:
            fungal_score += 1.0
        fungal_scores.append(fungal_score)

        septoria_score = 0.0
        if SEPTORIA_TEMP_RANGE[0] <= temp <= SEPTORIA_TEMP_RANGE[1]:
            septoria_score += 1.5
        if rh >= SEPTORIA_HIGH_RH:
            septoria_score += 1.5
        if rain >= SEPTORIA_RAIN_THRESHOLD:
            septoria_score += 2.0
        septoria_scores.append(septoria_score)

    grouped_by_day: dict[str, int] = {}
    for time_value, temp, rh in zip(
        hourly["time"][:48],
        hourly["temperature_2m"][:48],
        hourly["relative_humidity_2m"][:48],
        strict=False,
    ):
        day_key = time_value.split("T")[0]
        if (temp or 0) >= SMITH_MIN_TEMP_C and (rh or 0) >= SMITH_MIN_RH:
            grouped_by_day[day_key] = grouped_by_day.get(day_key, 0) + 1

    smith_days = [count >= SMITH_MIN_HOURS for _day, count in sorted(grouped_by_day.items())]
    smith_proxy = any(
        smith_days[i] and smith_days[i + 1] for i in range(max(len(smith_days) - 1, 0))
    )

    observed_rain_last_7 = observations.get("rainfall", {}).get("last7dMm") if observations else None
    observed_wind_now = observations.get("wind", {}).get("speedKph") if observations else None
    observed_gust_now = observations.get("wind", {}).get("gustKph") if observations else None
    observed_soil_surface = observations.get("soil", {}).get("surfaceMoisture") if observations else None

    rain_last_7 = (
        float(observed_rain_last_7)
        if observed_rain_last_7 is not None
        else sum(v or 0 for v in history_daily["precipitation_sum"][-7:])
    )
    rain_next_7 = sum(v or 0 for v in daily["precipitation_sum"][:7])
    mean_climate_rain = sum(v or 0 for v in climate_daily["precipitation_sum"]) / max(
        len(climate_daily["precipitation_sum"]), 1
    )

    field_access_score = 100.0
    field_access_score -= min(rain_last_7 * 2.2, 40)
    field_access_score -= min(rain_next_7 * 1.4, 30)
    soil_moisture_surface = (
        float(observed_soil_surface)
        if observed_soil_surface is not None
        else float(hourly["soil_moisture_0_to_1cm"][0] or 0)
    )
    field_access_score -= min(soil_moisture_surface * 40, 20)
    field_access_score = max(field_access_score, 5.0)

    fungal_average = sum(fungal_scores[:48]) / max(len(fungal_scores[:48]), 1)
    septoria_average = sum(septoria_scores[:72]) / max(len(septoria_scores[:72]), 1)
    sprayable_hours = sum(1 for flag in spray_flags[:24] if flag)

    return {
        "summary": {
            "soilTemperature0cm": hourly["soil_temperature_0cm"][0],
            "soilMoistureSurface": soil_moisture_surface,
            "rainLast7Days": rain_last_7,
            "rainNext7Days": rain_next_7,
            "windNow": float(observed_wind_now) if observed_wind_now is not None else current["wind_speed_10m"],
            "gustNow": float(observed_gust_now) if observed_gust_now is not None else current["wind_gusts_10m"],
            "fieldAccessScore": round(field_access_score),
            "fieldAccessLabel": classify_index(100 - field_access_score, thresholds=(20, 40, 65)),
            "climateDailyRainMean": round(mean_climate_rain, 2),
            "dataSources": {
                "rainLast7Days": "observed" if observed_rain_last_7 is not None else "model_history",
                "windNow": "observed" if observed_wind_now is not None else "model_current",
                "gustNow": "observed" if observed_gust_now is not None else "model_current",
                "soilMoistureSurface": "observed" if observed_soil_surface is not None else "model_hourly",
            },
        },
        "sprayWindow": {
            "openHoursNext24": sprayable_hours,
            "longestBlockHours": longest_true_block(spray_flags[:24]),
            "riskLabel": classify_index(24 - sprayable_hours, thresholds=(6, 12, 18)),
        },
        "diseaseModels": {
            "generalFungalPressure": {
                "score": round(fungal_average, 2),
                "label": classify_index(fungal_average, thresholds=FUNGAL_THRESHOLDS),
                "basis": "Temperature, humidity, rain, and cloud-cover proxy over the next 48 hours.",
            },
            "lateBlightSmithProxy": {
                "triggered": smith_proxy,
                "label": "High" if smith_proxy else "Low",
                "basis": "Proxy for Smith Period using forecast temperature >=10C and RH >=90% for 11+ hours across two consecutive days.",
            },
            "septoriaProxy": {
                "score": round(septoria_average, 2),
                "label": classify_index(septoria_average, thresholds=SEPTORIA_THRESHOLDS),
                "basis": "Proxy from rain splash conditions, crop-friendly temperature band, and sustained humidity over 72 hours.",
            },
        },
        "inputQuality": observations.get("quality") if observations else {
            "score": 0.45,
            "label": "Low",
            "drivers": ["Agronomy currently based on model inputs only"],
        },
        "disclaimer": "Disease outputs are heuristic agronomic risk proxies built from weather conditions, not validated plant pathology models.",
    }
