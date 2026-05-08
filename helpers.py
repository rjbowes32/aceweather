from __future__ import annotations

import json
from http import HTTPStatus
from typing import Any


def send_json(h: Any, payload: Any, status: HTTPStatus = HTTPStatus.OK, *, head_only: bool = False) -> None:
    body = json.dumps(payload).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    if not head_only:
        h.wfile.write(body)


def send_error(h: Any, status: HTTPStatus, message: str, *, head_only: bool = False) -> None:
    send_json(h, {"error": True, "message": message}, status, head_only=head_only)


def send_text(h: Any, text: str, status: HTTPStatus = HTTPStatus.OK, *, head_only: bool = False) -> None:
    body = text.encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "text/plain; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    if not head_only:
        h.wfile.write(body)
