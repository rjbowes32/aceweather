from __future__ import annotations

import io
import unittest

from helpers import send_json


class FakeHandler:
    def __init__(self, origin: str | None) -> None:
        self.headers = {"Origin": origin} if origin else {}
        self.sent: dict[str, str] = {}
        self.wfile = io.BytesIO()

    def send_response(self, status: int) -> None:
        pass

    def send_header(self, key: str, value: str) -> None:
        self.sent[key] = value

    def end_headers(self) -> None:
        pass


def allowed_origin(origin: str | None) -> str | None:
    handler = FakeHandler(origin)
    send_json(handler, {"ok": True})
    return handler.sent.get("Access-Control-Allow-Origin")


class CorsTests(unittest.TestCase):
    def test_app_origins_are_allowed(self) -> None:
        for origin in ["capacitor://localhost", "https://localhost", "http://localhost:3000"]:
            self.assertEqual(allowed_origin(origin), origin)

    def test_other_origins_are_not_allowed(self) -> None:
        for origin in [None, "https://evil.example", "https://localhost.evil.example", "capacitor://evil"]:
            self.assertIsNone(allowed_origin(origin))


if __name__ == "__main__":
    unittest.main()
