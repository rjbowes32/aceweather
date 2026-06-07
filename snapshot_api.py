from __future__ import annotations

import json
import os
from datetime import date, timedelta
from http import HTTPStatus
from typing import Any

import lib
import periods

DEFAULT_HISTORY_DAYS = 7
FORECAST_DAYS_AVAILABLE = 14


def require_webhook_auth(headers: Any) -> tuple[bool, str]:
    expected_token = os.getenv("ACEWEATHER_WEBHOOK_TOKEN", "").strip()
    if not expected_token:
        return True, ""

    auth_header = headers.get("authorization") or headers.get("Authorization") or ""
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or token.strip() != expected_token:
        return False, "Unauthorized. Provide Authorization: Bearer <token>."

    return True, ""


def _coerce_float(value: Any, *, name: str) -> float:
    try:
        return float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be numeric.") from exc


def _coerce_int(value: Any, *, name: str, default: int) -> int:
    if value in (None, ""):
        return default
    try:
        return int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be an integer.") from exc


def _coerce_date(value: Any, *, name: str, default: date | None = None) -> date:
    if value in (None, ""):
        if default is None:
            raise ValueError(f"{name} is required.")
        return default
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise ValueError(f"{name} must use YYYY-MM-DD format.") from exc


def _first(values: Any, index: int = 0) -> Any:
    if isinstance(values, list) and len(values) > index:
        return values[index]
    return None


def _sum_numeric(values: Any) -> float:
    if not isinstance(values, list):
        return 0.0
    return round(sum(float(value or 0.0) for value in values), 1)


def _kph_to_mph(value: Any) -> float | None:
    if value in (None, ""):
        return None
    return round(float(value) * 0.621371, 1)


def _daily_rows(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    daily = payload.get("daily", {})
    times = daily.get("time", [])
    rows: dict[str, dict[str, Any]] = {}
    for idx, raw_day in enumerate(times):
        row: dict[str, Any] = {}
        for key, values in daily.items():
            if key == "time":
                continue
            row[key] = values[idx] if isinstance(values, list) and len(values) > idx else None
        rows[str(raw_day)] = row
    return rows


def _hourly_avg_wind_mph_by_date(payload: dict[str, Any]) -> dict[str, float]:
    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    winds = hourly.get("wind_speed_10m", [])
    buckets: dict[str, dict[str, float]] = {}
    for idx, raw_time in enumerate(times):
        if idx >= len(winds):
            continue
        wind = winds[idx]
        if wind in (None, ""):
            continue
        day = str(raw_time)[:10]
        bucket = buckets.setdefault(day, {"sum": 0.0, "count": 0.0})
        bucket["sum"] += float(wind)
        bucket["count"] += 1.0
    return {
        day: round((values["sum"] / values["count"]) * 0.621371, 1)
        for day, values in buckets.items()
        if values["count"] > 0
    }


def _hourly_value_for_date(payload: dict[str, Any], *, key: str, target_date: date) -> float | None:
    hourly = payload.get("hourly", {})
    times = hourly.get("time", [])
    values = hourly.get(key, [])
    target_key = target_date.isoformat()
    matched: list[float] = []
    for idx, raw_time in enumerate(times):
        if idx >= len(values):
            continue
        if str(raw_time)[:10] != target_key:
            continue
        value = values[idx]
        if value in (None, ""):
            continue
        matched.append(float(value))
    if not matched:
        return None
    return round(matched[-1], 1)


def _sum_daily_range(
    history_rows: dict[str, dict[str, Any]],
    forecast_rows: dict[str, dict[str, Any]],
    start_date: date,
    end_date: date,
    *,
    key: str,
    today: date,
) -> float:
    total = 0.0
    cursor = start_date
    while cursor <= end_date:
        row = history_rows.get(cursor.isoformat()) if cursor < today else forecast_rows.get(cursor.isoformat())
        total += float((row or {}).get(key) or 0.0)
        cursor += timedelta(days=1)
    return round(total, 1)


def parse_snapshot_request(*, query_params: dict[str, list[str]], body: dict[str, Any] | None = None) -> dict[str, Any]:
    body = body or {}

    def pick(name: str) -> Any:
        body_value = body.get(name)
        if body_value not in (None, ""):
            return body_value
        query_values = query_params.get(name, [])
        if query_values:
            return query_values[0]
        return None

    location_query = pick("query")
    label = pick("label")
    timezone = pick("timezone") or "auto"
    period_value = pick("period")
    history_start_value = pick("history_start")
    history_end_value = pick("history_end")
    history_start: date | None = None
    history_end: date | None = None
    period_canonical: str | None = None
    if period_value:
        start_date, end_date, canonical = periods.resolve_period(str(period_value))
        history_start = start_date
        history_end = end_date
        period_canonical = canonical
        history_days = None
    elif history_start_value or history_end_value:
        try:
            history_start = date.fromisoformat(str(history_start_value)) if history_start_value else None
            history_end = date.fromisoformat(str(history_end_value)) if history_end_value else None
        except ValueError as exc:
            raise ValueError("history_start and history_end must use YYYY-MM-DD format.") from exc
        if history_start and history_end and history_start > history_end:
            raise ValueError("history_start must be on or before history_end.")
        history_days = None
    else:
        history_days = _coerce_int(pick("history_days"), name="history_days", default=DEFAULT_HISTORY_DAYS)

    station_id = pick("station")
    site_id = pick("site_id")
    target_date = _coerce_date(pick("target_date") or pick("date"), name="target_date", default=date.today())

    max_forecast_date = date.today() + timedelta(days=FORECAST_DAYS_AVAILABLE - 1)
    if target_date > max_forecast_date:
        raise ValueError(f"target_date cannot be later than {max_forecast_date.isoformat()} with current forecast data.")

    if location_query:
        latitude, longitude, resolved_timezone, resolved_label = lib.resolve_location_query(str(location_query).strip())
        if timezone == "auto":
            timezone = resolved_timezone
        if not label:
            label = resolved_label
    else:
        latitude = _coerce_float(pick("lat"), name="lat")
        longitude = _coerce_float(pick("lon"), name="lon")
        if not (-90 <= latitude <= 90):
            raise ValueError("Latitude must be between -90 and 90.")
        if not (-180 <= longitude <= 180):
            raise ValueError("Longitude must be between -180 and 180.")
        if timezone != "auto" and not lib.VALID_TIMEZONE_RE.match(timezone):
            raise ValueError("Invalid timezone format.")

    return {
        "query": location_query,
        "latitude": latitude,
        "longitude": longitude,
        "timezone": timezone,
        "label": label,
        "history_days": history_days,
        "history_start": history_start,
        "history_end": history_end,
        "period": period_canonical,
        "station": station_id,
        "site_id": site_id,
        "target_date": target_date,
    }


def parse_json_body(raw_body: bytes) -> dict[str, Any]:
    if not raw_body:
        return {}
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("Request body must be valid JSON.") from exc
    if not isinstance(payload, dict):
        raise ValueError("Request body must be a JSON object.")
    return payload


def build_snapshot_response(request_payload: dict[str, Any]) -> dict[str, Any]:
    today = date.today()
    target_date = request_payload["target_date"]
    last_7_start = target_date - timedelta(days=6)
    month_start = date(target_date.year, target_date.month, 1)
    season_start = date(target_date.year - 1, 8, 1)

    payload = lib.aggregate_weather(
        request_payload["latitude"],
        request_payload["longitude"],
        request_payload["timezone"],
        request_payload["label"],
        history_days=request_payload.get("history_days"),
        history_start=request_payload.get("history_start"),
        history_end=request_payload.get("history_end"),
    )

    forecast = payload["providers"]["openMeteo"]["forecast"]
    history = payload["providers"]["openMeteo"]["history"]
    current = forecast.get("current", {})
    forecast_daily = forecast.get("daily", {})
    history_daily = history.get("daily", {})
    forecast_rows = _daily_rows(forecast)
    history_rows = _daily_rows(history)

    hourly_history_payload = {"hourly": {"time": [], "wind_speed_10m": [], "soil_temperature_6cm": []}}
    history_window_end = min(target_date, today - timedelta(days=1))
    if last_7_start <= history_window_end:
        hourly_history_payload = lib.fetch_history(
            request_payload["latitude"],
            request_payload["longitude"],
            request_payload["timezone"],
            start_date=last_7_start,
            end_date=history_window_end,
        )
        history_rows.update(_daily_rows(hourly_history_payload))

    history_hourly_wind = _hourly_avg_wind_mph_by_date(hourly_history_payload)
    forecast_hourly_wind = _hourly_avg_wind_mph_by_date(forecast)
    soil_temp_6cm_for_target = (
        _hourly_value_for_date(hourly_history_payload, key="soil_temperature_6cm", target_date=target_date)
        if target_date < today
        else _hourly_value_for_date(forecast, key="soil_temperature_6cm", target_date=target_date)
    )

    season_history_rows: dict[str, dict[str, Any]] = {}
    season_history_end = min(target_date, today - timedelta(days=1))
    if season_start <= season_history_end:
        season_history_payload = lib.fetch_history(
            request_payload["latitude"],
            request_payload["longitude"],
            request_payload["timezone"],
            start_date=season_start,
            end_date=season_history_end,
        )
        season_history_rows = _daily_rows(season_history_payload)

    today_high = _first(forecast_daily.get("temperature_2m_max"))
    today_low = _first(forecast_daily.get("temperature_2m_min"))
    today_precip = _first(forecast_daily.get("precipitation_sum"))
    current_temp = current.get("temperature_2m")
    current_humidity = current.get("relative_humidity_2m")

    temp_avg = None
    if today_high is not None and today_low is not None:
        temp_avg = round((float(today_high) + float(today_low)) / 2, 1)

    actual_day_row = history_rows.get(target_date.isoformat()) if target_date < today else forecast_rows.get(target_date.isoformat())
    actual_day_wind_avg_mph = history_hourly_wind.get(target_date.isoformat()) if target_date < today else forecast_hourly_wind.get(target_date.isoformat())

    last_7_wind_values: list[float] = []
    last_7_fields: dict[str, Any] = {}
    for idx in range(7):
        day = last_7_start + timedelta(days=idx)
        row = history_rows.get(day.isoformat()) if day < today else forecast_rows.get(day.isoformat())
        wind_avg_mph = history_hourly_wind.get(day.isoformat()) if day < today else forecast_hourly_wind.get(day.isoformat())
        if wind_avg_mph is not None:
            last_7_wind_values.append(wind_avg_mph)
        prefix = f"last_7_day_{idx + 1}"
        last_7_fields[f"{prefix}_date"] = day.isoformat()
        last_7_fields[f"{prefix}_rain_mm"] = (row or {}).get("precipitation_sum")
        last_7_fields[f"{prefix}_temp_high_c"] = (row or {}).get("temperature_2m_max")
        last_7_fields[f"{prefix}_temp_low_c"] = (row or {}).get("temperature_2m_min")
        last_7_fields[f"{prefix}_wind_avg_mph"] = wind_avg_mph

    wind_avg_last_7_days_mph = round(sum(last_7_wind_values) / len(last_7_wind_values), 1) if last_7_wind_values else None
    temp_high_last_7_days_c = max(
        (
            float(value)
            for key, value in last_7_fields.items()
            if key.endswith("_temp_high_c") and value not in (None, "")
        ),
        default=None,
    )
    temp_low_last_7_days_c = min(
        (
            float(value)
            for key, value in last_7_fields.items()
            if key.endswith("_temp_low_c") and value not in (None, "")
        ),
        default=None,
    )
    rain_last_7_days_mm = _sum_daily_range(
        history_rows,
        forecast_rows,
        last_7_start,
        target_date,
        key="precipitation_sum",
        today=today,
    )
    rain_month_to_date_mm = _sum_daily_range(
        history_rows,
        forecast_rows,
        month_start,
        target_date,
        key="precipitation_sum",
        today=today,
    )
    rain_season_mm = _sum_daily_range(
        season_history_rows,
        forecast_rows,
        season_start,
        target_date,
        key="precipitation_sum",
        today=today,
    )

    history_range = history.get("range") or {}
    history_period_precip = _sum_numeric(history_daily.get("precipitation_sum"))
    response = {
        "query": request_payload["query"],
        "station": request_payload["station"],
        "site_id": request_payload["site_id"],
        "period": request_payload.get("period"),
        "history_start": history_range.get("startDate"),
        "history_end": history_range.get("endDate"),
        "history_days_resolved": history_range.get("days"),
        "history_period_precip_mm": history_period_precip,
        "location_name": payload["location"]["name"],
        "latitude": payload["location"]["latitude"],
        "longitude": payload["location"]["longitude"],
        "timezone": payload["location"]["timezone"],
        "target_date": target_date.isoformat(),
        "temp_avg": temp_avg,
        "temp_avg_c": temp_avg,
        "precip_mm": today_precip,
        "today_precip_mm": today_precip,
        "history_7d_precip_mm": _sum_numeric(history_daily.get("precipitation_sum")),
        "forecast_7d_precip_mm": _sum_numeric(forecast_daily.get("precipitation_sum")),
        "rain_last_7_days_mm": rain_last_7_days_mm,
        "rain_month_to_date_mm": rain_month_to_date_mm,
        "cumulative_rainfall_since_aug_1_prev_year_mm": rain_season_mm,
        "wind_avg_last_7_days_mph": wind_avg_last_7_days_mph,
        "temp_high_last_7_days_c": temp_high_last_7_days_c,
        "temp_low_last_7_days_c": temp_low_last_7_days_c,
        "rain_7d": rain_last_7_days_mm,
        "rain_mtd": rain_month_to_date_mm,
        "rain_season": rain_season_mm,
        "wind_7d": wind_avg_last_7_days_mph,
        "temp_high": temp_high_last_7_days_c,
        "temp_low": temp_low_last_7_days_c,
        "humidity": current_humidity,
        "humidity_pct": current_humidity,
        "current_temp_c": current_temp,
        "current_precip_mm": current.get("precipitation"),
        "current_rain_mm": current.get("rain"),
        "current_wind_kph": current.get("wind_speed_10m"),
        "current_gust_kph": current.get("wind_gusts_10m"),
        "current_wind_mph": _kph_to_mph(current.get("wind_speed_10m")),
        "current_gust_mph": _kph_to_mph(current.get("wind_gusts_10m")),
        "soil_temp_10cm": soil_temp_6cm_for_target,
        "today_high_c": today_high,
        "today_low_c": today_low,
        "actual_day_date": target_date.isoformat(),
        "actual_day_weather_code": (actual_day_row or {}).get("weather_code"),
        "actual_day_weather": lib.wmo_label((actual_day_row or {}).get("weather_code")),
        "actual_day_rain_mm": (actual_day_row or {}).get("precipitation_sum"),
        "actual_day_temp_high_c": (actual_day_row or {}).get("temperature_2m_max"),
        "actual_day_temp_low_c": (actual_day_row or {}).get("temperature_2m_min"),
        "actual_day_wind_avg_mph": actual_day_wind_avg_mph,
        "snapshot_time": current.get("time") or payload["generatedAt"],
        "generated_at": payload["generatedAt"],
    }
    response.update(last_7_fields)
    return response


def snapshot_endpoint_docs(base_url: str = "") -> dict[str, Any]:
    absolute = lambda path: f"{base_url.rstrip('/')}{path}" if base_url else path
    return {
        "snapshot": absolute("/api/snapshot"),
        "method": ["GET", "POST"],
        "responseFormat": "application/json",
        "description": "Returns a flat weather snapshot intended for AppSheet webhook return values.",
        "examples": {
            "getByQuery": absolute("/api/snapshot?query=Pocklington&target_date=2026-05-08"),
            "period": absolute("/api/snapshot?query=Pocklington&period=last_30d"),
            "post": {
                "url": absolute("/api/snapshot"),
                "jsonBody": {"query": "Pocklington", "station": "demo-station-1", "target_date": "2026-05-08"},
            },
        },
        "fields": [
            "history_period_precip_mm",
            "rain_last_7_days_mm",
            "cumulative_rainfall_since_aug_1_prev_year_mm",
            "wind_avg_last_7_days_mph",
            "actual_day_weather",
            "actual_day_rain_mm",
            "actual_day_temp_high_c",
            "actual_day_temp_low_c",
        ],
        "auth": "Optional bearer token via ACEWEATHER_WEBHOOK_TOKEN environment variable.",
    }


def send_auth_error(send_error_fn: Any, *, head_only: bool = False) -> None:
    send_error_fn(HTTPStatus.UNAUTHORIZED, "Unauthorized. Provide Authorization: Bearer <token>.", head_only=head_only)
