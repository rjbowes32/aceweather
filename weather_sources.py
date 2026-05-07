from __future__ import annotations

import base64
import json
import logging
import os
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

_log = logging.getLogger(__name__)

OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
OPEN_METEO_GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
NOMINATIM_GEOCODE_URL = "https://nominatim.openstreetmap.org/search"
METEOMATICS_BASE_URL = "https://api.meteomatics.com"
TIMEOUT_SECONDS = 20
READ_JSON_ATTEMPTS = 2
READ_JSON_RETRY_DELAY_SECONDS = 0.35
MAX_HISTORY_DAYS: int = 730

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

ECMWF_HOURLY_VARS = [
    "temperature_2m", "relative_humidity_2m", "precipitation",
    "weather_code", "cloud_cover", "wind_speed_10m", "wind_gusts_10m", "pressure_msl",
]


@dataclass
class MeteomaticsCredentials:
    username: str
    password: str


def read_json(url: str, *, headers: dict[str, str] | None = None) -> Any:
    last_error: Exception | None = None
    for attempt in range(READ_JSON_ATTEMPTS):
        request = urllib.request.Request(url, headers=headers or {})
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
                return json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, socket.timeout, json.JSONDecodeError, OSError) as exc:
            last_error = exc
            if attempt == READ_JSON_ATTEMPTS - 1:
                raise
            time.sleep(READ_JSON_RETRY_DELAY_SECONDS)
    if last_error is not None:
        raise last_error
    raise RuntimeError("read_json failed without raising an explicit error.")


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


def fetch_nominatim_geocoding(query: str) -> dict[str, Any]:
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
    return fetch_nominatim_geocoding(query)


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


def fetch_ecmwf_current(latitude: float, longitude: float, timezone: str) -> dict[str, Any]:
    url = build_url(
        OPEN_METEO_FORECAST_URL,
        latitude=latitude, longitude=longitude, timezone=timezone,
        hourly=ECMWF_HOURLY_VARS,
        past_hours=3, forecast_hours=1,
        models="ecmwf_ifs025",
    )
    try:
        data = read_json(url)
        times = data.get("hourly", {}).get("time", [])
        if not times:
            return {"enabled": False, "reason": "No ECMWF data returned."}
        idx = max(0, len(times) - 2)
        hourly = data["hourly"]
        obs = {var: hourly[var][idx] for var in ECMWF_HOURLY_VARS if var in hourly}
        obs["time"] = times[idx]
        return {
            "enabled": True,
            "model": "ECMWF IFS 0.25deg",
            "observation": obs,
            "retrievedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        }
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError, KeyError) as exc:
        _log.warning("ECMWF IFS fetch failed: %s", exc)
        return {"enabled": False, "reason": "ECMWF IFS data is temporarily unavailable."}


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
