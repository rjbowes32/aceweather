from __future__ import annotations

import json
from http import HTTPStatus
from typing import Any

# Successful digest/report responses may be served by Vercel's edge for 10 minutes,
# then for up to 10 more while a fresh copy is fetched. Errors are never cached.
EDGE_CACHE = "public, s-maxage=600, stale-while-revalidate=600"


def send_json(
    h: Any,
    payload: Any,
    status: HTTPStatus = HTTPStatus.OK,
    *,
    head_only: bool = False,
    cache_control: str = "no-store",
) -> None:
    body = json.dumps(payload).encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", "application/json; charset=utf-8")
    h.send_header("Content-Length", str(len(body)))
    h.send_header("Cache-Control", cache_control)
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
    cache_control: str = "no-store",
) -> None:
    body = text.encode("utf-8")
    h.send_response(status)
    h.send_header("Content-Type", content_type)
    h.send_header("Content-Length", str(len(body)))
    h.send_header("Cache-Control", cache_control)
    h.end_headers()
    if not head_only:
        h.wfile.write(body)
