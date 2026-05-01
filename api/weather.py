from __future__ import annotations

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
from helpers import send_error, send_json


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)

        try:
            latitude = float(params.get("lat", [""])[0])
            longitude = float(params.get("lon", [""])[0])
        except ValueError:
            send_error(self, HTTPStatus.BAD_REQUEST, "Latitude and longitude are required numeric values.")
            return

        if not (-90 <= latitude <= 90):
            send_error(self, HTTPStatus.BAD_REQUEST, "Latitude must be between -90 and 90.")
            return
        if not (-180 <= longitude <= 180):
            send_error(self, HTTPStatus.BAD_REQUEST, "Longitude must be between -180 and 180.")
            return

        timezone = params.get("timezone", ["auto"])[0] or "auto"
        if timezone != "auto" and not lib.VALID_TIMEZONE_RE.match(timezone):
            send_error(self, HTTPStatus.BAD_REQUEST, "Invalid timezone format.")
            return

        label = params.get("label", [None])[0]
        history_days_value = params.get("history_days", [None])[0]
        history_start_value = params.get("history_start", [None])[0]
        history_end_value = params.get("history_end", [None])[0]

        try:
            history_days = int(history_days_value) if history_days_value else None
        except ValueError:
            send_error(self, HTTPStatus.BAD_REQUEST, "History days must be an integer.")
            return

        try:
            history_start = date.fromisoformat(history_start_value) if history_start_value else None
            history_end = date.fromisoformat(history_end_value) if history_end_value else None
        except ValueError:
            send_error(self, HTTPStatus.BAD_REQUEST, "Custom history dates must use YYYY-MM-DD format.")
            return

        try:
            payload = lib.aggregate_weather(
                latitude, longitude, timezone, label,
                history_days=history_days, history_start=history_start, history_end=history_end,
            )
            send_json(self, payload)
        except ValueError as exc:
            send_error(self, HTTPStatus.BAD_REQUEST, str(exc))
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError, KeyError) as exc:
            lib._log.error("Weather aggregation failed: %s", exc)
            send_error(self, HTTPStatus.BAD_GATEWAY, "Weather data is temporarily unavailable.")

    def log_message(self, *args: object) -> None:
        pass
