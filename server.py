"""Local development server. Production runs on Vercel via api/*.py serverless functions."""
from __future__ import annotations

import json
import os
import socket
import urllib.error
import urllib.parse
from datetime import date, datetime
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from api_index import build_api_index
import lib

ROOT = Path(__file__).resolve().parent
PUBLIC_DIR = ROOT / "public"
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000


class AceWeatherHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/search":
            self._handle_search(parsed.query)
            return
        if parsed.path == "/api":
            self._send_json(build_api_index())
            return
        if parsed.path == "/api/report":
            self._handle_report(parsed.query)
            return
        if parsed.path == "/api/weather":
            self._handle_weather(parsed.query)
            return
        if parsed.path == "/api/providers":
            self._send_json({
                "meteomaticsEnabled": lib.get_meteomatics_credentials() is not None,
                "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
            })
            return
        super().do_GET()

    def _handle_search(self, query_string: str) -> None:
        params = urllib.parse.parse_qs(query_string)
        query = params.get("query", [""])[0].strip()
        if len(query) < 2:
            self._send_error(HTTPStatus.BAD_REQUEST, "Query must be at least 2 characters long.")
            return
        try:
            self._send_json(lib.fetch_geocoding(query))
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError) as exc:
            lib._log.error("Geocoding request failed: %s", exc)
            self._send_error(HTTPStatus.BAD_GATEWAY, "Location search is temporarily unavailable.")

    def _handle_report(self, query_string: str) -> None:
        params = urllib.parse.parse_qs(query_string)
        location_query = params.get("query", [None])[0]
        try:
            if location_query:
                location_query = location_query.strip()
                if len(location_query) < 2:
                    self._send_error(HTTPStatus.BAD_REQUEST, "Location query must be at least 2 characters.")
                    return
                geo = lib.fetch_geocoding(location_query)
                results = geo.get("results") or []
                if not results:
                    self._send_error(HTTPStatus.NOT_FOUND, f"No location found for '{location_query}'.")
                    return
                best = results[0]
                latitude = float(best["latitude"])
                longitude = float(best["longitude"])
                timezone = best.get("timezone") or "auto"
                label = ", ".join(filter(None, [best.get("name"), best.get("admin1"), best.get("country")]))
            else:
                try:
                    latitude = float(params.get("lat", [""])[0])
                    longitude = float(params.get("lon", [""])[0])
                except ValueError:
                    self._send_error(HTTPStatus.BAD_REQUEST, "Provide ?query=<location> or ?lat=<n>&lon=<n>.")
                    return
                if not (-90 <= latitude <= 90):
                    self._send_error(HTTPStatus.BAD_REQUEST, "Latitude must be between -90 and 90.")
                    return
                if not (-180 <= longitude <= 180):
                    self._send_error(HTTPStatus.BAD_REQUEST, "Longitude must be between -180 and 180.")
                    return
                timezone = params.get("timezone", ["auto"])[0] or "auto"
                if timezone != "auto" and not lib.VALID_TIMEZONE_RE.match(timezone):
                    self._send_error(HTTPStatus.BAD_REQUEST, "Invalid timezone format.")
                    return
                label = params.get("label", [None])[0]

            payload = lib.aggregate_weather(latitude, longitude, timezone, label, history_days=7)
            report_text = lib.build_report(payload)
            body = report_text.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except ValueError as exc:
            self._send_error(HTTPStatus.BAD_REQUEST, str(exc))
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError, KeyError) as exc:
            lib._log.error("Report generation failed: %s", exc)
            self._send_error(HTTPStatus.BAD_GATEWAY, "Report generation is temporarily unavailable.")

    def _handle_weather(self, query_string: str) -> None:
        params = urllib.parse.parse_qs(query_string)
        try:
            latitude = float(params.get("lat", [""])[0])
            longitude = float(params.get("lon", [""])[0])
        except ValueError:
            self._send_error(HTTPStatus.BAD_REQUEST, "Latitude and longitude are required numeric values.")
            return
        if not (-90 <= latitude <= 90):
            self._send_error(HTTPStatus.BAD_REQUEST, "Latitude must be between -90 and 90.")
            return
        if not (-180 <= longitude <= 180):
            self._send_error(HTTPStatus.BAD_REQUEST, "Longitude must be between -180 and 180.")
            return
        timezone = params.get("timezone", ["auto"])[0] or "auto"
        if timezone != "auto" and not lib.VALID_TIMEZONE_RE.match(timezone):
            self._send_error(HTTPStatus.BAD_REQUEST, "Invalid timezone format.")
            return
        label = params.get("label", [None])[0]
        history_days_value = params.get("history_days", [None])[0]
        history_start_value = params.get("history_start", [None])[0]
        history_end_value = params.get("history_end", [None])[0]
        try:
            history_days = int(history_days_value) if history_days_value else None
        except ValueError:
            self._send_error(HTTPStatus.BAD_REQUEST, "History days must be an integer.")
            return
        try:
            history_start = date.fromisoformat(history_start_value) if history_start_value else None
            history_end = date.fromisoformat(history_end_value) if history_end_value else None
        except ValueError:
            self._send_error(HTTPStatus.BAD_REQUEST, "Custom history dates must use YYYY-MM-DD format.")
            return
        try:
            payload = lib.aggregate_weather(
                latitude, longitude, timezone, label,
                history_days=history_days, history_start=history_start, history_end=history_end,
            )
            self._send_json(payload)
        except ValueError as exc:
            self._send_error(HTTPStatus.BAD_REQUEST, str(exc))
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError, KeyError) as exc:
            lib._log.error("Weather aggregation failed: %s", exc)
            self._send_error(HTTPStatus.BAD_GATEWAY, "Weather data is temporarily unavailable.")

    def _send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status: HTTPStatus, message: str) -> None:
        self._send_json({"error": True, "message": message}, status=status)


def get_server_host() -> str:
    return os.environ.get("ACEWEATHER_HOST", DEFAULT_HOST)


def get_server_port() -> int:
    raw_port = os.environ.get("ACEWEATHER_PORT", str(DEFAULT_PORT))
    try:
        return int(raw_port)
    except ValueError as exc:
        raise ValueError("ACEWEATHER_PORT must be a valid integer.") from exc


def get_lan_ip() -> str | None:
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        return probe.getsockname()[0]
    except OSError:
        return None
    finally:
        probe.close()


def print_startup_urls(host: str, port: int) -> None:
    print(f"AceWeather running at http://{host}:{port}")
    if host == "0.0.0.0":
        print(f"Open on this computer: http://localhost:{port}")
        lan_ip = get_lan_ip()
        if lan_ip:
            print(f"Open on your phone (same Wi-Fi): http://{lan_ip}:{port}")


def run() -> None:
    host = get_server_host()
    port = get_server_port()
    server = ThreadingHTTPServer((host, port), AceWeatherHandler)
    server.allow_reuse_address = True
    print_startup_urls(host, port)
    server.serve_forever()


if __name__ == "__main__":
    run()
