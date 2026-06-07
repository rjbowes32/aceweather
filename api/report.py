from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
from datetime import date
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib
import periods
from helpers import send_error, send_json, send_text


def request_base_url(handler: BaseHTTPRequestHandler) -> str:
    host = handler.headers.get("x-forwarded-host") or handler.headers.get("host") or ""
    proto = handler.headers.get("x-forwarded-proto", "https")
    return f"{proto}://{host}" if host else ""


def _build_request_query_string(params: dict[str, list[str]]) -> str:
    location_params = []
    for key in ("query", "lat", "lon", "timezone", "label"):
        value = params.get(key, [None])[0]
        if value:
            location_params.append((key, value))
    return urllib.parse.urlencode(location_params)


class handler(BaseHTTPRequestHandler):
    def _parse_observations(self, params: dict[str, list[str]]) -> dict[str, Any] | None:
        def parse_float(name: str) -> float | None:
            raw_value = params.get(name, [None])[0]
            if raw_value in (None, ""):
                return None
            try:
                return float(raw_value)
            except ValueError as exc:
                raise ValueError(f"{name} must be numeric.") from exc

        source_type = params.get("obs_source_type", [None])[0]
        source_name = params.get("obs_source_name", [None])[0]
        observed_at = params.get("obs_observed_at", [None])[0]
        rain_24h_mm = parse_float("obs_rain_24h_mm")
        rain_7d_mm = parse_float("obs_rain_7d_mm")
        wind_kph = parse_float("obs_wind_kph")
        gust_kph = parse_float("obs_gust_kph")
        soil_moisture_surface = parse_float("obs_soil_moisture_surface")

        if all(
            value is None
            for value in [
                source_type,
                source_name,
                observed_at,
                rain_24h_mm,
                rain_7d_mm,
                wind_kph,
                gust_kph,
                soil_moisture_surface,
            ]
        ):
            return None

        return lib.normalize_observations(
            source_type=source_type or "manual",
            source_name=source_name,
            observed_at=observed_at,
            rain_24h_mm=rain_24h_mm,
            rain_7d_mm=rain_7d_mm,
            wind_kph=wind_kph,
            gust_kph=gust_kph,
            soil_moisture_surface=soil_moisture_surface,
        )

    def _handle(self, *, head_only: bool = False) -> None:
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        location_query = params.get("query", [None])[0]
        format_value = (params.get("format", ["md"])[0] or "md").lower()
        if format_value not in ("md", "markdown", "text", "csv", "json"):
            send_error(self, HTTPStatus.BAD_REQUEST, "format must be one of: md, csv, json.", head_only=head_only)
            return

        period_value = params.get("period", [None])[0]
        history_days_value = params.get("history_days", [None])[0]
        history_start_value = params.get("history_start", [None])[0]
        history_end_value = params.get("history_end", [None])[0]

        history_days: int | None = None
        history_start: date | None = None
        history_end: date | None = None
        period_label: str | None = None

        try:
            if period_value:
                start_date, end_date, canonical = periods.resolve_period(period_value)
                history_start = start_date
                history_end = end_date
                period_label = f"{periods.describe_period(canonical)} ({canonical})"
            else:
                if history_days_value:
                    try:
                        history_days = int(history_days_value)
                        if history_days < 1:
                            raise ValueError
                    except ValueError:
                        send_error(self, HTTPStatus.BAD_REQUEST, "history_days must be a positive integer.", head_only=head_only)
                        return
                else:
                    history_days = 7
                if history_start_value:
                    history_start = date.fromisoformat(history_start_value)
                if history_end_value:
                    history_end = date.fromisoformat(history_end_value)
                if history_start and history_end and history_start > history_end:
                    send_error(self, HTTPStatus.BAD_REQUEST, "history_start must be on or before history_end.", head_only=head_only)
                    return
                if history_start_value or history_end_value:
                    history_days = None
        except ValueError as exc:
            send_error(self, HTTPStatus.BAD_REQUEST, str(exc), head_only=head_only)
            return

        try:
            if location_query:
                latitude, longitude, timezone, label = lib.resolve_location_query(location_query)
            else:
                try:
                    latitude = float(params.get("lat", [""])[0])
                    longitude = float(params.get("lon", [""])[0])
                except ValueError:
                    send_error(self, HTTPStatus.BAD_REQUEST, "Provide ?query=<location> or ?lat=<n>&lon=<n>.", head_only=head_only)
                    return
                if not (-90 <= latitude <= 90):
                    send_error(self, HTTPStatus.BAD_REQUEST, "Latitude must be between -90 and 90.", head_only=head_only)
                    return
                if not (-180 <= longitude <= 180):
                    send_error(self, HTTPStatus.BAD_REQUEST, "Longitude must be between -180 and 180.", head_only=head_only)
                    return
                timezone = params.get("timezone", ["auto"])[0] or "auto"
                if timezone != "auto" and not lib.VALID_TIMEZONE_RE.match(timezone):
                    send_error(self, HTTPStatus.BAD_REQUEST, "Invalid timezone format.", head_only=head_only)
                    return
                label = params.get("label", [None])[0]

            observations_payload = self._parse_observations(params)
            payload = lib.aggregate_weather(
                latitude,
                longitude,
                timezone,
                label,
                history_days=history_days,
                history_start=history_start,
                history_end=history_end,
                observations_payload=observations_payload,
            )

            if format_value == "csv":
                csv_body = lib.build_history_csv(payload)
                send_text(self, csv_body, head_only=head_only, content_type="text/csv; charset=utf-8")
                return
            if format_value == "json":
                send_json(self, payload, head_only=head_only)
                return

            request_query_string = _build_request_query_string(params)
            report_text = lib.build_report(
                payload,
                base_url=request_base_url(self),
                period_label=period_label,
                request_query_string=request_query_string,
            )
            send_text(self, report_text, head_only=head_only)

        except LookupError as exc:
            send_error(self, HTTPStatus.NOT_FOUND, str(exc), head_only=head_only)
        except ValueError as exc:
            send_error(self, HTTPStatus.BAD_REQUEST, str(exc), head_only=head_only)
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError, KeyError) as exc:
            lib._log.error("Report generation failed: %s", exc)
            send_error(self, HTTPStatus.BAD_GATEWAY, "Report generation is temporarily unavailable.", head_only=head_only)

    def do_GET(self) -> None:
        self._handle()

    def do_HEAD(self) -> None:  # noqa: N802
        self._handle(head_only=True)

    def log_message(self, *args: object) -> None:
        pass
