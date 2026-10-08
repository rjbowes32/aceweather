from __future__ import annotations

import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import lib
from helpers import send_json


def build_groups_payload() -> dict:
    return {
        "groups": [
            {
                "id": set_name,
                "locations": [
                    {
                        "slug": region["slug"],
                        "label": region["label"],
                        "query": region["query"],
                        "latitude": float(region["latitude"]),
                        "longitude": float(region["longitude"]),
                        "timezone": region.get("timezone") or "auto",
                    }
                    for region in regions
                ],
            }
            for set_name, regions in lib.CANONICAL_REGION_SETS.items()
        ],
    }


class handler(BaseHTTPRequestHandler):
    def _handle(self, *, head_only: bool = False) -> None:
        send_json(self, build_groups_payload(), head_only=head_only)

    def do_GET(self) -> None:
        self._handle()

    def do_HEAD(self) -> None:  # noqa: N802
        self._handle(head_only=True)

    def log_message(self, *args: object) -> None:
        pass
