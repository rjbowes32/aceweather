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
from helpers import send_error


def request_base_url(handler: BaseHTTPRequestHandler) -> str:
    host = handler.headers.get("x-forwarded-host") or handler.headers.get("host") or ""
    proto = handler.headers.get("x-forwarded-proto", "https")
    return f"{proto}://{host}" if host else ""


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        set_name = (params.get("set", ["cropdynamics"])[0] or "cropdynamics").strip().lower()
        mode = (params.get("mode", ["brief"])[0] or "brief").strip().lower()

        try:
            digest_text = lib.build_digest(set_name, base_url=request_base_url(self), mode=mode)
            body = digest_text.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except ValueError as exc:
            send_error(self, HTTPStatus.BAD_REQUEST, str(exc))
        except LookupError as exc:
            send_error(self, HTTPStatus.NOT_FOUND, str(exc))
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError, KeyError) as exc:
            lib._log.error("Digest generation failed: %s", exc)
            send_error(self, HTTPStatus.BAD_GATEWAY, "Digest generation is temporarily unavailable.")

    def log_message(self, *args: object) -> None:
        pass
