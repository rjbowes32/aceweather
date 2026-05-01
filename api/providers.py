from __future__ import annotations

import os
import sys
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib
from helpers import send_json


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        send_json(self, {
            "meteomaticsEnabled": lib.get_meteomatics_credentials() is not None,
            "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        })

    def log_message(self, *args: object) -> None:
        pass
