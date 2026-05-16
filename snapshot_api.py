from __future__ import annotations

import json
import os
from datetime import date
from http import HTTPStatus
from typing import Any

import lib
import periods

DEFAULT_HISTORY_DAYS = 7


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


def _first(values: Any, index: int = 0) -> Any:
    if isinstance(values, list) and len(values) > index:
        return values[index]
    return None


def _sum_numeric(values: Any) -> float:
    if not isinstance(values, list):
        return 0.0
    return round(sum(float(value or 0.0) for value in values), 1)


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

    today_high = _first(forecast_daily.get("temperature_2m_max"))
    today_low = _first(forecast_daily.get("temperature_2m_min"))
    today_precip = _first(forecast_daily.get("precipitation_sum"))
    current_temp = current.get("temperature_2m")
    current_humidity = current.get("relative_humidity_2m")

    temp_avg = None
    if today_high is not None and today_low is not None:
        temp_avg = round((float(today_high) + float(today_low)) / 2, 1)

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
        "temp_avg": temp_avg,
        "temp_avg_c": temp_avg,
        "precip_mm": today_precip,
        "today_precip_mm": today_precip,
        "history_7d_precip_mm": _sum_numeric(history_daily.get("precipitation_sum")),
        "forecast_7d_precip_mm": _sum_numeric(forecast_daily.get("precipitation_sum")),
        "humidity": current_humidity,
        "humidity_pct": current_humidity,
        "current_temp_c": current_temp,
        "current_precip_mm": current.get("precipitation"),
        "current_rain_mm": current.get("rain"),
        "current_wind_kph": current.get("wind_speed_10m"),
        "current_gust_kph": current.get("wind_gusts_10m"),
        "today_high_c": today_high,
        "today_low_c": today_low,
        "snapshot_time": current.get("time") or payload["generatedAt"],
        "generated_at": payload["generatedAt"],
    }

    return response


def snapshot_endpoint_docs(base_url: str = "") -> dict[str, Any]:
    absolute = lambda path: f"{base_url.rstrip('/')}{path}" if base_url else path
    return {
        "snapshot": absolute("/api/snapshot"),
        "method": ["GET", "POST"],
        "responseFormat": "application/json",
        "description": "Returns a compact weather snapshot intended for AppSheet webhook return values.",
        "examples": {
            "getByQuery": absolute("/api/snapshot?query=Pocklington"),
            "post": {
                "url": absolute("/api/snapshot"),
                "jsonBody": {"query": "Pocklington", "station": "demo-station-1"},
            },
        },
        "auth": "Optional bearer token via ACEWEATHER_WEBHOOK_TOKEN environment variable.",
    }


def send_auth_error(send_error_fn: Any, *, head_only: bool = False) -> None:
    send_error_fn(HTTPStatus.UNAUTHORIZED, "Unauthorized. Provide Authorization: Bearer <token>.", head_only=head_only)
