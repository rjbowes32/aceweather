from __future__ import annotations

import concurrent.futures
import json
import os
import sys
import urllib.error
import urllib.parse
from datetime import date
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib
import weather_sources
from helpers import send_error, send_json

EARLIEST_YEAR = 1940
MAX_YEARS = 80


def _parse_int(value: str | None, *, name: str, default: int, low: int, high: int) -> int:
    if value in (None, ""):
        return default
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be an integer.") from exc
    if parsed < low or parsed > high:
        raise ValueError(f"{name} must be between {low} and {high}.")
    return parsed


def _resolve_target_date(params: dict[str, list[str]]) -> date:
    iso = (params.get("date", [None])[0] or "").strip()
    if iso:
        try:
            return date.fromisoformat(iso)
        except ValueError as exc:
            raise ValueError("date must be YYYY-MM-DD.") from exc
    month = _parse_int(params.get("month", [None])[0], name="month", default=date.today().month, low=1, high=12)
    day = _parse_int(params.get("day", [None])[0], name="day", default=date.today().day, low=1, high=31)
    try:
        return date(date.today().year, month, day)
    except ValueError as exc:
        raise ValueError("Invalid month/day combination.") from exc


def _fetch_year(latitude: float, longitude: float, timezone: str, target: date) -> dict[str, object]:
    try:
        payload = weather_sources.fetch_history(
            latitude, longitude, timezone,
            start_date=target, end_date=target,
        )
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError, ValueError) as exc:
        return {"year": target.year, "date": target.isoformat(), "error": str(exc)[:120]}
    daily = payload.get("daily") or {}
    times = daily.get("time") or []
    if not times:
        return {"year": target.year, "date": target.isoformat(), "missing": True}
    return {
        "year": target.year,
        "date": times[0],
        "tmax": (daily.get("temperature_2m_max") or [None])[0],
        "tmin": (daily.get("temperature_2m_min") or [None])[0],
        "rain_mm": (daily.get("precipitation_sum") or [None])[0],
        "wind_max_kph": (daily.get("wind_speed_10m_max") or [None])[0],
        "weather_code": (daily.get("weather_code") or [None])[0],
    }


def _build_response(latitude: float, longitude: float, timezone: str, label: str | None, target: date, years: int) -> dict[str, object]:
    today = date.today()
    end_year = target.year if target < today else today.year - 1
    start_year = max(EARLIEST_YEAR, end_year - years + 1)
    candidates: list[date] = []
    for year in range(start_year, end_year + 1):
        try:
            candidates.append(date(year, target.month, target.day))
        except ValueError:
            continue

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, max(1, len(candidates)))) as executor:
        results = list(executor.map(lambda d: _fetch_year(latitude, longitude, timezone, d), candidates))

    observations = [r for r in results if "tmax" in r and r.get("tmax") is not None]
    summary = _summarize(observations)

    return {
        "location": {
            "name": label or "Selected location",
            "latitude": latitude,
            "longitude": longitude,
            "timezone": timezone,
        },
        "target": {
            "month": target.month,
            "day": target.day,
            "month_day": f"{target.month:02d}-{target.day:02d}",
            "years_requested": years,
            "years_returned": len(results),
            "years_with_data": len(observations),
            "year_range": [start_year, end_year],
        },
        "summary": summary,
        "years": results,
    }


def _summarize(observations: list[dict[str, object]]) -> dict[str, object]:
    if not observations:
        return {}
    tmaxes = [(r["year"], r["tmax"]) for r in observations if r.get("tmax") is not None]
    tmins = [(r["year"], r["tmin"]) for r in observations if r.get("tmin") is not None]
    rains = [(r["year"], r["rain_mm"]) for r in observations if r.get("rain_mm") is not None]
    winds = [(r["year"], r["wind_max_kph"]) for r in observations if r.get("wind_max_kph") is not None]

    def pick(records, op):
        if not records:
            return None
        year, value = op(records, key=lambda pair: pair[1])
        return {"year": year, "value": value}

    mean = lambda pairs: round(sum(v for _, v in pairs) / len(pairs), 2) if pairs else None
    return {
        "tmax_mean": mean(tmaxes),
        "tmin_mean": mean(tmins),
        "rain_mean_mm": mean(rains),
        "wind_max_mean_kph": mean(winds),
        "hottest": pick(tmaxes, max),
        "coldest": pick(tmins, min),
        "wettest": pick(rains, max),
        "windiest": pick(winds, max),
    }


class handler(BaseHTTPRequestHandler):
    def _handle(self, *, head_only: bool = False) -> None:
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        location_query = params.get("query", [None])[0]
        try:
            if location_query:
                latitude, longitude, timezone, label = lib.resolve_location_query(location_query)
            else:
                try:
                    latitude = float(params.get("lat", [""])[0])
                    longitude = float(params.get("lon", [""])[0])
                except ValueError:
                    send_error(self, HTTPStatus.BAD_REQUEST, "Provide ?query=<place> or ?lat=&lon=.", head_only=head_only)
                    return
                if not (-90 <= latitude <= 90) or not (-180 <= longitude <= 180):
                    send_error(self, HTTPStatus.BAD_REQUEST, "Coordinates out of range.", head_only=head_only)
                    return
                timezone = params.get("timezone", ["auto"])[0] or "auto"
                if timezone != "auto" and not lib.VALID_TIMEZONE_RE.match(timezone):
                    send_error(self, HTTPStatus.BAD_REQUEST, "Invalid timezone format.", head_only=head_only)
                    return
                label = params.get("label", [None])[0]

            target = _resolve_target_date(params)
            years = _parse_int(params.get("years", [None])[0], name="years", default=40, low=1, high=MAX_YEARS)
            payload = _build_response(latitude, longitude, timezone, label, target, years)
            send_json(self, payload, head_only=head_only)
        except LookupError as exc:
            send_error(self, HTTPStatus.NOT_FOUND, str(exc), head_only=head_only)
        except ValueError as exc:
            send_error(self, HTTPStatus.BAD_REQUEST, str(exc), head_only=head_only)
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError, KeyError) as exc:
            lib._log = getattr(lib, "_log", None)
            if lib._log:
                lib._log.error("On-this-day generation failed: %s", exc)
            send_error(self, HTTPStatus.BAD_GATEWAY, "Historical data is temporarily unavailable.", head_only=head_only)

    def do_GET(self) -> None:
        self._handle()

    def do_HEAD(self) -> None:  # noqa: N802
        self._handle(head_only=True)

    def log_message(self, *args: object) -> None:
        pass
