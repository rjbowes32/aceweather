from __future__ import annotations

import os
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib
from helpers import send_json


class handler(BaseHTTPRequestHandler):
    def _handle(self, *, head_only: bool = False) -> None:
        send_json(self, {
            "meteomaticsEnabled": lib.get_meteomatics_credentials() is not None,
            "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        }, head_only=head_only)

    def do_GET(self) -> None:
        self._handle()

    def do_HEAD(self) -> None:  # noqa: N802
        self._handle(head_only=True)

    def log_message(self, *args: object) -> None:
        pass
