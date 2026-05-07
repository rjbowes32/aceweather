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
from helpers import send_error, send_json


def request_base_url(handler: BaseHTTPRequestHandler) -> str:
    host = handler.headers.get("x-forwarded-host") or handler.headers.get("host") or ""
    proto = handler.headers.get("x-forwarded-proto", "https")
    return f"{proto}://{host}" if host else ""


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        location_query = params.get("query", [None])[0]

        try:
            if location_query:
                latitude, longitude, timezone, label = lib.resolve_location_query(location_query)
            else:
                try:
                    latitude = float(params.get("lat", [""])[0])
                    longitude = float(params.get("lon", [""])[0])
                except ValueError:
                    send_error(self, HTTPStatus.BAD_REQUEST, "Provide ?query=<location> or ?lat=<n>&lon=<n>.")
                    return
                if not (-90 <= latitude <= 90):
                    send_error(self, HTTPStatus.BAD_REQUEST, "Latitude must be between -90 and 90.")
                    return
                if not (-180 <= longitude <= 180):
                    send_error(self, HTTPStatus.BAD_REQUEST, "Longitude must be between -180 and 180.")
                    return
                timezone = params.get("timezone", ["auto"])[0] or "auto"
                if timezone != "auto" and not lib.VALID_TIMEZONE_RE.match(timezone):
                    send_error(self, HTTPStatus.BAD_REQUEST, "Invalid timezone format.")
                    return
                label = params.get("label", [None])[0]

            payload = lib.aggregate_weather(latitude, longitude, timezone, label, history_days=7)
            report_text = lib.build_report(payload, base_url=request_base_url(self))
            body = report_text.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        except LookupError as exc:
            send_error(self, HTTPStatus.NOT_FOUND, str(exc))
        except ValueError as exc:
            send_error(self, HTTPStatus.BAD_REQUEST, str(exc))
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, OSError, KeyError) as exc:
            lib._log.error("Report generation failed: %s", exc)
            send_error(self, HTTPStatus.BAD_GATEWAY, "Report generation is temporarily unavailable.")

    def log_message(self, *args: object) -> None:
        pass
