from __future__ import annotations

import json
import re
from http import HTTPStatus
from typing import Any

# The phone app's pages come from localhost inside the app, not from
# aceweather.app, so the API must say those origins may read its responses.
# capacitor://localhost is iOS, https://localhost is Android, any other
# localhost port is a developer testing the app build in a desktop browser.
APP_ORIGIN = re.compile(r"^(capacitor://localhost|https?://localhost(:\d+)?)$")


def send_cors_headers(h: Any) -> None:
    origin = h.headers.get("Origin") if h.headers else None
    if origin and APP_ORIGIN.match(origin):
        h.send_header("Access-Control-Allow-Origin", origin)
    h.send_header("Vary", "Origin")


def send_json(h: Any, payload: Any, status: HTTPStatus = HTTPStatus.OK, *, head_only: bool = False) -> None:
    body = json.dumps(payload).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    h.send_header("Cache-Control", "no-store")
    send_cors_headers(h)
    h.end_headers()
    if not head_only:
        h.wfile.write(body)


def send_error(h: Any, status: HTTPStatus, message: str, *, head_only: bool = False) -> None:
    send_json(h, {"error": True, "message": message}, status, head_only=head_only)


def send_text(
    h: Any,
    text: str,
    status: HTTPStatus = HTTPStatus.OK,
    *,
    head_only: bool = False,
    content_type: str = "text/plain; charset=utf-8",
) -> None:
    body = text.encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", content_type)
    h.send_header("Content-Length", str(len(body)))
    h.send_header("Cache-Control", "no-store")
    send_cors_headers(h)
    h.end_headers()
    if not head_only:
        h.wfile.write(body)
