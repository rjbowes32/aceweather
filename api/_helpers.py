from __future__ import annotations

import json
from http import HTTPStatus
from typing import Any


def send_json(h: Any, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
    body = json.dumps(payload).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    h.send_header("Cache-Control", "no-store")
    h.end_headers()
    h.wfile.write(body)


def send_error(h: Any, status: HTTPStatus, message: str) -> None:
    send_json(h, {"error": True, "message": message}, status)
