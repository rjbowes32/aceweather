from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from helpers import send_error, send_json
import lib
import snapshot_api


class handler(BaseHTTPRequestHandler):
    def _handle(self, *, head_only: bool = False) -> None:
        is_authorized, _ = snapshot_api.require_webhook_auth(self.headers)
        if not is_authorized:
            snapshot_api.send_auth_error(
                lambda status, message, *, head_only=False: send_error(self, status, message, head_only=head_only),
                head_only=head_only,
            )
            return

        try:
            raw_body = b""
            if self.command == "POST":
                content_length = int(self.headers.get("content-length", "0") or "0")
                raw_body = self.rfile.read(content_length) if content_length > 0 else b""
            body = snapshot_api.parse_json_body(raw_body)
            query_params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            request_payload = snapshot_api.parse_snapshot_request(query_params=query_params, body=body)
            response_payload = snapshot_api.build_snapshot_response(request_payload)
            send_json(self, response_payload, head_only=head_only)
        except ValueError as exc:
            send_error(self, HTTPStatus.BAD_REQUEST, str(exc), head_only=head_only)
        except LookupError as exc:
            send_error(self, HTTPStatus.NOT_FOUND, str(exc), head_only=head_only)
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError, KeyError) as exc:
            lib._log.error("Snapshot generation failed: %s", exc)
            send_error(self, HTTPStatus.BAD_GATEWAY, "Snapshot generation is temporarily unavailable.", head_only=head_only)

    def do_GET(self) -> None:
        self._handle()

    def do_POST(self) -> None:  # noqa: N802
        self._handle()

    def do_HEAD(self) -> None:  # noqa: N802
        self._handle(head_only=True)

    def log_message(self, *args: object) -> None:
        pass
