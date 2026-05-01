from __future__ import annotations

import base64
import json
import logging
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
_log = logging.getLogger(__name__)

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
NOMINATIM_GEOCODE_URL = "https://nominatim.openstreetmap.org/search"
METEOMATICS_BASE_URL = "https://api.meteomatics.com"
TIMEOUT_SECONDS = 20

FORECAST_CURRENT = [
    "temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day",
    "precipitation", "rain", "showers", "snowfall", "weather_code", "cloud_cover",
    "pressure_msl", "surface_pressure", "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m",
]

FORECAST_HOURLY = [
    "temperature_2m", "relative_humidity_2m", "apparent_temperature",
    "precipitation_probability", "precipitation", "rain", "showers", "snowfall", "snow_depth",
    "weather_code", "pressure_msl", "surface_pressure", "cloud_cover", "cloud_cover_low",
    "cloud_cover_mid", "cloud_cover_high", "visibility", "evapotranspiration",
    "et0_fao_evapotranspiration", "vapour_pressure_deficit", "wind_speed_10m",
    "wind_direction_10m", "wind_gusts_10m", "soil_temperature_0cm", "soil_moisture_0_to_1cm",
    "uv_index", "uv_index_clear_sky", "sunshine_duration",
]

FORECAST_DAILY = [
    "weather_code", "temperature_2m_max", "temperature_2m_min", "apparent_temperature_max",
    "apparent_temperature_min", "sunrise", "sunset", "daylight_duration", "sunshine_duration",
    "uv_index_max", "precipitation_sum", "rain_sum", "showers_sum", "snowfall_sum",
    "precipitation_hours", "precipitation_probability_max", "wind_speed_10m_max",
    "wind_gusts_10m_max", "shortwave_radiation_sum", "et0_fao_evapotranspiration",
]

ARCHIVE_DAILY = [
    "weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_sum",
    "rain_sum", "snowfall_sum", "precipitation_hours", "wind_speed_10m_max",
]

ARCHIVE_HOURLY = [
    "temperature_2m", "relative_humidity_2m", "precipitation", "weather_code", "wind_speed_10m",
]

AIR_QUALITY_CURRENT = ["european_aqi", "us_aqi", "pm2_5", "pm10", "nitrogen_dioxide", "ozone"]

AIR_QUALITY_HOURLY = [
    "european_aqi", "us_aqi", "pm2_5", "pm10", "carbon_monoxide", "nitrogen_dioxide",
    "sulphur_dioxide", "ozone", "uv_index", "aerosol_optical_depth",
]

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

MAX_HISTORY_DAYS: int = 730
VALID_TIMEZONE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$")

_WMO_LABELS: dict[int, str] = {
    0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Rime fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
    56: "Freezing drizzle", 57: "Heavy freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Heavy freezing rain",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Rain showers", 81: "Heavy showers", 82: "Violent showers",
    85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Heavy thunderstorm with hail",
}


def wmo_label(code: int | None) -> str:
    if code is None:
        return "Unknown"
    return _WMO_LABELS.get(int(code), "Unknown")


@dataclass
class MeteomaticsCredentials:
    username: str
    password: str


def read_json(url: str, *, headers: dict[str, str] | None = None) -> Any:
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def build_url(base: str, **params: Any) -> str:
    filtered = {
        key: ",".join(value) if isinstance(value, list) else str(value)
        for key, value in params.items()
        if value is not None
    }
    return f"{base}?{urllib.parse.urlencode(filtered)}"


def get_meteomatics_credentials() -> MeteomaticsCredentials | None:
    username = os.getenv("METEOMATICS_USERNAME")
    password = os.getenv("METEOMATICS_PASSWORD")
    if username and password:
        return MeteomaticsCredentials(username=username, password=password)
    return None


def _nominatim_geocoding(query: str) -> dict[str, Any]:
    url = build_url(NOMINATIM_GEOCODE_URL, q=query, format="json", limit=6, addressdetails=1)
    items = read_json(url, headers={"User-Agent": "AceWeather/1.0"})
    results = []
    for item in items:
        addr = item.get("address", {})
        name = (
            addr.get("city") or addr.get("town") or addr.get("village")
            or addr.get("hamlet") or addr.get("suburb")
            or item.get("display_name", "").split(",")[0].strip()
        )
        results.append({
            "name": name,
            "admin1": addr.get("state") or addr.get("county") or "",
            "country": addr.get("country") or "",
            "latitude": float(item["lat"]),
            "longitude": float(item["lon"]),
            "timezone": "auto",
        })
    return {"results": results}


def fetch_geocoding(query: str) -> dict[str, Any]:
    url = build_url(OPEN_METEO_GEOCODE_URL, name=query, count=8, language="en", format="json")
    data = read_json(url)
    if data.get("results"):
        return data
    return _nominatim_geocoding(query)


def fetch_forecast(latitude: float, longitude: float, timezone: str) -> dict[str, Any]:
    url = build_url(
        OPEN_METEO_FORECAST_URL,
        latitude=latitude, longitude=longitude, timezone=timezone,
        current=FORECAST_CURRENT, hourly=FORECAST_HOURLY, daily=FORECAST_DAILY,
        forecast_days=14, past_days=2, models="best_match",
    )
    return read_json(url)


def fetch_history(
    latitude: float,
    longitude: float,
    timezone: str,
    *,
    history_days: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict[str, Any]:
    resolved_end = end_date or (date.today() - timedelta(days=1))
    if resolved_end >= date.today():
        resolved_end = date.today() - timedelta(days=1)
    if start_date is None:
        resolved_days = max(1, min(history_days or 30, 366))
        resolved_start = resolved_end - timedelta(days=resolved_days - 1)
    else:
        resolved_start = start_date
    if resolved_start > resolved_end:
        raise ValueError("History start date must be on or before the end date.")
    if (resolved_end - resolved_start).days + 1 > MAX_HISTORY_DAYS:
        raise ValueError(f"History range cannot exceed {MAX_HISTORY_DAYS} days.")
    url = build_url(
        OPEN_METEO_ARCHIVE_URL,
        latitude=latitude, longitude=longitude, timezone=timezone,
        start_date=resolved_start.isoformat(), end_date=resolved_end.isoformat(),
        daily=ARCHIVE_DAILY, hourly=ARCHIVE_HOURLY,
    )
    payload = read_json(url)
    payload["range"] = {
        "startDate": resolved_start.isoformat(),
        "endDate": resolved_end.isoformat(),
        "days": (resolved_end - resolved_start).days + 1,
    }
    return payload


def fetch_climate_window(latitude: float, longitude: float, timezone: str) -> dict[str, Any]:
    today = date.today()
    start_date = date(today.year - 8, today.month, 1)
    if today.month == 12:
        end_date = date(today.year - 1, 12, 31)
    else:
        end_date = date(today.year - 1, today.month + 1, 1) - timedelta(days=1)
    url = build_url(
        OPEN_METEO_ARCHIVE_URL,
        latitude=latitude, longitude=longitude, timezone=timezone,
        start_date=start_date.isoformat(), end_date=end_date.isoformat(),
        daily=["temperature_2m_max", "temperature_2m_min", "precipitation_sum"],
    )
    return read_json(url)


def fetch_air_quality(latitude: float, longitude: float, timezone: str) -> dict[str, Any]:
    url = build_url(
        OPEN_METEO_AIR_QUALITY_URL,
        latitude=latitude, longitude=longitude, timezone=timezone,
        current=AIR_QUALITY_CURRENT, hourly=AIR_QUALITY_HOURLY,
    )
    return read_json(url)


def fetch_meteomatics(latitude: float, longitude: float) -> dict[str, Any]:
    credentials = get_meteomatics_credentials()
    if credentials is None:
        return {
            "enabled": False,
            "reason": "Meteomatics credentials were not provided. Set METEOMATICS_USERNAME and METEOMATICS_PASSWORD to enable it.",
        }
    now = datetime.utcnow().replace(minute=0, second=0, microsecond=0)
    start = (now - timedelta(hours=12)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end = (now + timedelta(hours=72)).strftime("%Y-%m-%dT%H:%M:%SZ")
    coords = f"{latitude},{longitude}"
    params = ",".join(["t_2m:C", "precip_1h:mm", "wind_speed_10m:ms", "weather_symbol_1h:idx"])
    url = f"{METEOMATICS_BASE_URL}/{start}--{end}:PT1H/{params}/{coords}/json?model=mix"
    token = base64.b64encode(f"{credentials.username}:{credentials.password}".encode()).decode("ascii")
    try:
        data = read_json(url, headers={"Authorization": f"Basic {token}"})
        return {"enabled": True, "data": data}
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError) as exc:
        _log.warning("Meteomatics request failed: %s", exc)
        return {"enabled": False, "reason": "Meteomatics data is temporarily unavailable."}


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

    rain_last_7 = sum(v or 0 for v in history_daily["precipitation_sum"][-7:])
    rain_next_7 = sum(v or 0 for v in daily["precipitation_sum"][:7])
    mean_climate_rain = sum(v or 0 for v in climate_daily["precipitation_sum"]) / max(
        len(climate_daily["precipitation_sum"]), 1
    )

    field_access_score = 100.0
    field_access_score -= min(rain_last_7 * 2.2, 40)
    field_access_score -= min(rain_next_7 * 1.4, 30)
    field_access_score -= min((hourly["soil_moisture_0_to_1cm"][0] or 0) * 40, 20)
    field_access_score = max(field_access_score, 5.0)

    fungal_average = sum(fungal_scores[:48]) / max(len(fungal_scores[:48]), 1)
    septoria_average = sum(septoria_scores[:72]) / max(len(septoria_scores[:72]), 1)
    sprayable_hours = sum(1 for flag in spray_flags[:24] if flag)

    return {
        "summary": {
            "soilTemperature0cm": hourly["soil_temperature_0cm"][0],
            "soilMoistureSurface": hourly["soil_moisture_0_to_1cm"][0],
            "rainLast7Days": rain_last_7,
            "rainNext7Days": rain_next_7,
            "windNow": current["wind_speed_10m"],
            "gustNow": current["wind_gusts_10m"],
            "fieldAccessScore": round(field_access_score),
            "fieldAccessLabel": classify_index(100 - field_access_score, thresholds=(20, 40, 65)),
            "climateDailyRainMean": round(mean_climate_rain, 2),
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
        "disclaimer": "Disease outputs are heuristic agronomic risk proxies built from weather conditions, not validated plant pathology models.",
    }


def aggregate_weather(
    latitude: float,
    longitude: float,
    timezone: str,
    label: str | None,
    *,
    history_days: int | None = None,
    history_start: date | None = None,
    history_end: date | None = None,
) -> dict[str, Any]:
    forecast = fetch_forecast(latitude, longitude, timezone)
    history = fetch_history(
        latitude, longitude, timezone,
        history_days=history_days, start_date=history_start, end_date=history_end,
    )
    climate_window = fetch_climate_window(latitude, longitude, timezone)
    air_quality = fetch_air_quality(latitude, longitude, timezone)
    meteomatics = fetch_meteomatics(latitude, longitude)
    return {
        "location": {
            "name": label or "Selected location",
            "latitude": latitude,
            "longitude": longitude,
            "timezone": timezone,
        },
        "providers": {
            "openMeteo": {
                "forecast": forecast,
                "history": history,
                "climateWindow": climate_window,
                "airQuality": air_quality,
            },
            "meteomatics": meteomatics,
        },
        "agronomy": derive_agronomy(forecast, history, climate_window),
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }


def build_report(payload: dict[str, Any]) -> str:
    location = payload["location"]
    forecast = payload["providers"]["openMeteo"]["forecast"]
    history = payload["providers"]["openMeteo"]["history"]
    air = payload["providers"]["openMeteo"]["airQuality"]
    agronomy = payload["agronomy"]

    lines: list[str] = [
        f"# AceWeather Report: {location['name']}",
        f"Generated: {payload['generatedAt']} | Lat: {location['latitude']:.4f} | Lon: {location['longitude']:.4f} | Timezone: {location['timezone']}",
        "",
        "## Current Conditions",
    ]
    cur = forecast["current"]
    lines += [
        f"- Temperature: {cur['temperature_2m']:.1f} °C (feels like {cur['apparent_temperature']:.1f} °C)",
        f"- Condition: {wmo_label(cur['weather_code'])}",
        f"- Humidity: {cur['relative_humidity_2m']}% | Wind: {cur['wind_speed_10m']:.0f} km/h (gusts {cur['wind_gusts_10m']:.0f} km/h) | Pressure: {cur['pressure_msl']:.0f} hPa",
        f"- Precipitation (current reading): {cur['precipitation']:.1f} mm",
        "",
        "## Last 7 Days (Observed Archive)",
        "| Date       | Max °C | Min °C | Rain mm | Wind km/h | Condition            |",
        "|------------|--------|--------|---------|-----------|----------------------|",
    ]
    hist = history["daily"]
    n = len(hist["time"])
    for i in range(max(0, n - 7), n):
        tmax = hist["temperature_2m_max"][i]
        tmin = hist["temperature_2m_min"][i]
        rain = hist["precipitation_sum"][i] or 0
        wind = hist["wind_speed_10m_max"][i] or 0
        lines.append(
            f"| {hist['time'][i]} | {f'{tmax:.1f}' if tmax is not None else '--':>6} | "
            f"{f'{tmin:.1f}' if tmin is not None else '--':>6} | {rain:>7.1f} | "
            f"{wind:>9.0f} | {wmo_label(hist['weather_code'][i]):<20} |"
        )
    lines += [
        "",
        "## 10-Day Forecast",
        "| Date       | Max °C | Min °C | Rain mm | Rain % | Wind km/h | Condition            |",
        "|------------|--------|--------|---------|--------|-----------|----------------------|",
    ]
    daily = forecast["daily"]
    for i in range(min(10, len(daily["time"]))):
        tmax = daily["temperature_2m_max"][i]
        tmin = daily["temperature_2m_min"][i]
        rain = daily["precipitation_sum"][i] or 0
        rain_prob = daily["precipitation_probability_max"][i] or 0
        wind = daily["wind_speed_10m_max"][i] or 0
        lines.append(
            f"| {daily['time'][i]} | {f'{tmax:.1f}' if tmax is not None else '--':>6} | "
            f"{f'{tmin:.1f}' if tmin is not None else '--':>6} | {rain:>7.1f} | "
            f"{rain_prob:>5}% | {wind:>9.0f} | {wmo_label(daily['weather_code'][i]):<20} |"
        )
    air_cur = air["current"]
    lines += [
        "",
        "## Air Quality (Current)",
        f"- European AQI: {air_cur.get('european_aqi', '--')} | US AQI: {air_cur.get('us_aqi', '--')}",
        f"- PM2.5: {air_cur.get('pm2_5', '--')} µg/m³ | PM10: {air_cur.get('pm10', '--')} µg/m³",
        f"- NO2: {air_cur.get('nitrogen_dioxide', '--')} µg/m³ | O3: {air_cur.get('ozone', '--')} µg/m³",
        "",
        "## Agronomy Summary",
    ]
    ag = agronomy["summary"]
    spray = agronomy["sprayWindow"]
    disease = agronomy["diseaseModels"]
    lines += [
        f"- Rain last 7 days: {ag['rainLast7Days']:.1f} mm | Rain next 7 days: {ag['rainNext7Days']:.1f} mm",
        f"- Field access score: {ag['fieldAccessScore']}/100 ({ag['fieldAccessLabel']})",
        f"- Spray window (next 24 h): {spray['openHoursNext24']} h open | {spray['longestBlockHours']} h longest block",
        f"- General fungal pressure: {disease['generalFungalPressure']['label']} (score {disease['generalFungalPressure']['score']})",
        f"- Late blight Smith proxy: {'Triggered' if disease['lateBlightSmithProxy']['triggered'] else 'Not triggered'}",
        f"- Septoria proxy: {disease['septoriaProxy']['label']} (score {disease['septoriaProxy']['score']})",
        f"- Disclaimer: {agronomy['disclaimer']}",
        "",
    ]
    return "\n".join(lines)
