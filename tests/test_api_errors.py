from __future__ import annotations

import io
import json
import unittest
import urllib.error
from unittest.mock import patch

from api import cropdynamics, digest, groups


def run_handler(handler_cls, path: str) -> tuple[int, dict, dict]:
    handler = handler_cls.__new__(handler_cls)
    handler.path = path
    handler.headers = {"host": "aceweather.app"}
    handler.wfile = io.BytesIO()
    status: list[int] = []
    headers: dict[str, str] = {}
    handler.send_response = lambda code: status.append(int(code))
    handler.send_header = lambda name, value: headers.__setitem__(name, value)
    handler.end_headers = lambda: None
    handler._handle()
    body = handler.wfile.getvalue().decode()
    return status[0], json.loads(body) if body.startswith("{") else {"text": body}, headers


class ApiErrorTests(unittest.TestCase):
    @patch("weather_sources.read_json", side_effect=urllib.error.URLError("429 Too Many Requests"))
    def test_digest_upstream_failure_returns_502_json(self, _read_json) -> None:
        status, body, headers = run_handler(digest.handler, "/api/digest?set=cropdynamics&format=short")

        self.assertEqual(status, 502)
        self.assertEqual(body, {"error": True, "message": "Digest generation is temporarily unavailable."})
        self.assertEqual(headers["Cache-Control"], "no-store")

    @patch("api.digest.lib.build_digest", return_value="# AceWeather Short Bundle")
    def test_digest_success_is_edge_cacheable(self, _build) -> None:
        status, body, headers = run_handler(digest.handler, "/api/digest?set=cropdynamics&format=short")

        self.assertEqual(status, 200)
        self.assertEqual(body, {"text": "# AceWeather Short Bundle"})
        self.assertEqual(headers["Cache-Control"], "public, s-maxage=600, stale-while-revalidate=600")

    @patch("api.cropdynamics.lib.build_cropdynamics_json", return_value={"set": "cropdynamics"})
    def test_cropdynamics_success_is_edge_cacheable(self, _build) -> None:
        status, _body, headers = run_handler(cropdynamics.handler, "/api/cropdynamics")

        self.assertEqual(status, 200)
        self.assertIn("s-maxage=600", headers["Cache-Control"])

    def test_groups_lists_cropdynamics_coordinates(self) -> None:
        status, body, headers = run_handler(groups.handler, "/api/groups")

        self.assertEqual(status, 200)
        group = body["groups"][0]
        self.assertEqual(group["id"], "cropdynamics")
        self.assertIn("pocklington", [location["slug"] for location in group["locations"]])
        self.assertIsInstance(group["locations"][0]["latitude"], float)
        self.assertEqual(headers["Cache-Control"], "no-store")


if __name__ == "__main__":
    unittest.main()
