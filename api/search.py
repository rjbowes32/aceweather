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


class handler(BaseHTTPRequestHandler):
    def _handle(self, *, head_only: bool = False) -> None:
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        query = params.get("query", [""])[0].strip()
        if len(query) < 2:
            send_error(self, HTTPStatus.BAD_REQUEST, "Query must be at least 2 characters long.", head_only=head_only)
            return
        try:
            send_json(self, lib.fetch_geocoding(query), head_only=head_only)
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError) as exc:
            lib._log.error("Geocoding request failed: %s", exc)
            send_error(self, HTTPStatus.BAD_GATEWAY, "Location search is temporarily unavailable.", head_only=head_only)

    def do_GET(self) -> None:
        self._handle()

    def do_HEAD(self) -> None:  # noqa: N802
        self._handle(head_only=True)

    def log_message(self, *args: object) -> None:
        pass
