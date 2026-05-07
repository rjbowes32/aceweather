from __future__ import annotations

import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api_index import build_api_index
from helpers import send_json


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        host = self.headers.get("x-forwarded-host") or self.headers.get("host") or ""
        proto = self.headers.get("x-forwarded-proto", "https")
        base_url = f"{proto}://{host}" if host else ""
        send_json(self, build_api_index(base_url))

    def log_message(self, *args: object) -> None:
        pass
