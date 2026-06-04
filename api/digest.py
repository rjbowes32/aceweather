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
from helpers import send_error, send_text


def request_base_url(handler: BaseHTTPRequestHandler) -> str:
    host = handler.headers.get("x-forwarded-host") or handler.headers.get("host") or ""
    proto = handler.headers.get("x-forwarded-proto", "https")
    return f"{proto}://{host}" if host else ""


class handler(BaseHTTPRequestHandler):
    def _handle(self, *, head_only: bool = False) -> None:
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        set_name = (params.get("set", ["cropdynamics"])[0] or "cropdynamics").strip().lower()
        mode = (params.get("mode", ["brief"])[0] or "brief").strip().lower()
        history_days_value = params.get("history_days", [None])[0]
        try:
            history_days = int(history_days_value) if history_days_value else None
        except ValueError:
            send_error(self, HTTPStatus.BAD_REQUEST, "history_days must be a positive integer.", head_only=head_only)
            return

        try:
            digest_text = lib.build_digest(
                set_name,
                base_url=request_base_url(self),
                mode=mode,
                history_days=history_days,
            )
            send_text(self, digest_text, head_only=head_only)
        except ValueError as exc:
            send_error(self, HTTPStatus.BAD_REQUEST, str(exc), head_only=head_only)
        except LookupError as exc:
            send_error(self, HTTPStatus.NOT_FOUND, str(exc), head_only=head_only)
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError, KeyError) as exc:
            lib._log.error("Digest generation failed: %s", exc)
            send_error(self, HTTPStatus.BAD_GATEWAY, "Digest generation is temporarily unavailable.", head_only=head_only)

    def do_GET(self) -> None:
        self._handle()

    def do_HEAD(self) -> None:  # noqa: N802
        self._handle(head_only=True)

    def log_message(self, *args: object) -> None:
        pass
