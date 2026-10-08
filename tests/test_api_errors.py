from __future__ import annotations

import io
import json
import unittest
import urllib.error
from unittest.mock import patch

from api import digest, groups


def run_handler(handler_cls, path: str) -> tuple[int, dict]:
    handler = handler_cls.__new__(handler_cls)
    handler.path = path
    handler.headers = {"host": "aceweather.app"}
    handler.wfile = io.BytesIO()
    status: list[int] = []
    handler.send_response = lambda code: status.append(int(code))
    handler.send_header = lambda *_args: None
    handler.end_headers = lambda: None
    handler._handle()
    return status[0], json.loads(handler.wfile.getvalue())


class ApiErrorTests(unittest.TestCase):
    @patch("weather_sources.read_json", side_effect=urllib.error.URLError("429 Too Many Requests"))
    def test_digest_upstream_failure_returns_502_json(self, _read_json) -> None:
        status, body = run_handler(digest.handler, "/api/digest?set=cropdynamics&format=short")

        self.assertEqual(status, 502)
        self.assertEqual(body, {"error": True, "message": "Digest generation is temporarily unavailable."})

    def test_groups_lists_cropdynamics_coordinates(self) -> None:
        status, body = run_handler(groups.handler, "/api/groups")

        self.assertEqual(status, 200)
        group = body["groups"][0]
        self.assertEqual(group["id"], "cropdynamics")
        self.assertIn("pocklington", [location["slug"] for location in group["locations"]])
        self.assertIsInstance(group["locations"][0]["latitude"], float)


if __name__ == "__main__":
    unittest.main()
