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
from helpers import send_error, send_json


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

        try:
            latitude = float(params.get("lat", [""])[0])
            longitude = float(params.get("lon", [""])[0])
        except ValueError:
            send_error(self, HTTPStatus.BAD_REQUEST, "Latitude and longitude are required numeric values.", head_only=head_only)
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
        history_days_value = params.get("history_days", [None])[0]
        history_start_value = params.get("history_start", [None])[0]
        history_end_value = params.get("history_end", [None])[0]

        try:
            history_days = int(history_days_value) if history_days_value else None
        except ValueError:
            send_error(self, HTTPStatus.BAD_REQUEST, "History days must be an integer.", head_only=head_only)
            return

        try:
            history_start = date.fromisoformat(history_start_value) if history_start_value else None
            history_end = date.fromisoformat(history_end_value) if history_end_value else None
        except ValueError:
            send_error(self, HTTPStatus.BAD_REQUEST, "Custom history dates must use YYYY-MM-DD format.", head_only=head_only)
            return

        try:
            observations_payload = self._parse_observations(params)
            payload = lib.aggregate_weather(
                latitude, longitude, timezone, label,
                history_days=history_days, history_start=history_start, history_end=history_end,
                observations_payload=observations_payload,
            )
            send_json(self, payload, head_only=head_only)
        except ValueError as exc:
            send_error(self, HTTPStatus.BAD_REQUEST, str(exc), head_only=head_only)
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError, KeyError) as exc:
            lib._log.error("Weather aggregation failed: %s", exc)
            send_error(self, HTTPStatus.BAD_GATEWAY, "Weather data is temporarily unavailable.", head_only=head_only)

    def do_GET(self) -> None:
        self._handle()

    def do_HEAD(self) -> None:  # noqa: N802
        self._handle(head_only=True)

    def log_message(self, *args: object) -> None:
        pass
