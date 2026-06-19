from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib
from helpers import send_error, send_json


def request_base_url(handler: BaseHTTPRequestHandler) -> str:
    host = handler.headers.get("x-forwarded-host") or handler.headers.get("host") or ""
    proto = handler.headers.get("x-forwarded-proto", "https")
    return f"{proto}://{host}" if host else ""


class handler(BaseHTTPRequestHandler):
    def _handle(self, *, head_only: bool = False) -> None:
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        history_days_value = params.get("history_days", [None])[0] or params.get("days", [None])[0]
        include_values = ",".join(params.get("include", []))
        include_daily = "daily" in {
            value.strip().lower()
            for value in include_values.split(",")
            if value.strip()
        }
        try:
            history_days = int(history_days_value) if history_days_value else None
        except ValueError:
            send_error(self, HTTPStatus.BAD_REQUEST, "days must be a positive integer.", head_only=head_only)
            return

        try:
            payload = lib.build_cropdynamics_json(
                base_url=request_base_url(self),
                history_days=history_days,
                include_daily=include_daily,
            )
            send_json(self, payload, head_only=head_only)
        except ValueError as exc:
            send_error(self, HTTPStatus.BAD_REQUEST, str(exc), head_only=head_only)
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError, KeyError) as exc:
            lib._log.error("Crop Dynamics summary failed: %s", exc)
            send_error(self, HTTPStatus.BAD_GATEWAY, "Crop Dynamics summary is temporarily unavailable.", head_only=head_only)

    def do_GET(self) -> None:
        self._handle()

    def do_HEAD(self) -> None:  # noqa: N802
        self._handle(head_only=True)

    def log_message(self, *args: object) -> None:
        pass
