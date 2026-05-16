from __future__ import annotations

import json
import os
import re
import socket
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from helpers import send_error, send_json

NHC_URL = "https://www.nhc.noaa.gov/CurrentStorms.json"
JTWC_RSS = "https://www.metoc.navy.mil/jtwc/rss/jtwc.rss?layout=enhanced"
TIMEOUT_SECONDS = 12
USER_AGENT = "AceWeather/1.0 (+https://aceweather.app)"

KT_TO_KPH = 1.852


def _fetch_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as response:
        return response.read().decode("utf-8", errors="replace")


def _category_from_wind_kt(wind_kt: float | None) -> str:
    if wind_kt is None:
        return "??"
    if wind_kt < 34:
        return "TD"
    if wind_kt < 64:
        return "TS"
    if wind_kt < 83:
        return "HU1"
    if wind_kt < 96:
        return "HU2"
    if wind_kt < 113:
        return "HU3"
    if wind_kt < 137:
        return "HU4"
    return "HU5"


def _parse_nhc(text: str) -> list[dict]:
    body = json.loads(text)
    storms_in = body.get("activeStorms") or []
    storms_out = []
    for s in storms_in:
        wind_kt = s.get("intensity")
        try:
            wind_kt_val = float(wind_kt) if wind_kt is not None else None
        except (TypeError, ValueError):
            wind_kt_val = None
        try:
            pressure = float(s.get("pressure")) if s.get("pressure") not in (None, "") else None
        except (TypeError, ValueError):
            pressure = None
        try:
            lat = float(s.get("latitudeNumeric"))
            lon = float(s.get("longitudeNumeric"))
        except (TypeError, ValueError, AttributeError):
            lat = lon = None
        storms_out.append({
            "id": s.get("id") or s.get("binNumber") or s.get("name"),
            "name": (s.get("name") or "").strip() or "Unnamed",
            "basin": s.get("basinId") or s.get("basin"),
            "agency": "NHC",
            "classification": s.get("classification"),
            "category": _category_from_wind_kt(wind_kt_val),
            "winds_kt": wind_kt_val,
            "winds_kph": round(wind_kt_val * KT_TO_KPH, 0) if wind_kt_val is not None else None,
            "pressure_mb": pressure,
            "lat": lat,
            "lon": lon,
            "movement_dir": s.get("movementDir"),
            "movement_speed_kt": s.get("movementSpeed"),
            "advisory_number": s.get("advisoryNumber"),
            "advisory_time": s.get("lastUpdate") or s.get("advisoryStartTime"),
            "url": s.get("publicAdvisory", {}).get("url") if isinstance(s.get("publicAdvisory"), dict) else None,
        })
    return storms_out


_JTWC_TITLE_RE = re.compile(
    r"(?:Tropical\s+(?:Cyclone|Depression|Storm)|Super Typhoon|Typhoon|Subtropical Storm)\s+(\d{2}[A-Z])\s*(?:\(([^)]+)\))?",
    re.IGNORECASE,
)
_JTWC_WIND_RE = re.compile(r"max(?:imum)?\s+sustained\s+winds?[^0-9]*(\d+)\s*kt", re.IGNORECASE)
_JTWC_PRESSURE_RE = re.compile(r"min(?:imum)?\s+(?:central\s+)?pressure[^0-9]*(\d+)\s*mb", re.IGNORECASE)
_JTWC_POSITION_RE = re.compile(r"(\d+\.\d+)\s*([NS])\s*[,/]?\s*(\d+\.\d+)\s*([EW])", re.IGNORECASE)


def _parse_jtwc(text: str) -> list[dict]:
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        return []
    items = root.findall(".//item")
    seen: dict[str, dict] = {}
    for item in items:
        title = (item.findtext("title") or "").strip()
        desc = (item.findtext("description") or "").strip()
        link = (item.findtext("link") or "").strip()
        pubdate = (item.findtext("pubDate") or "").strip()

        title_match = _JTWC_TITLE_RE.search(title)
        if not title_match:
            continue
        storm_id = title_match.group(1).upper()
        if storm_id in seen:
            continue

        name = (title_match.group(2) or storm_id).strip().title()
        basin = storm_id[-1]
        wind_match = _JTWC_WIND_RE.search(desc) or _JTWC_WIND_RE.search(title)
        wind_kt = float(wind_match.group(1)) if wind_match else None
        pressure_match = _JTWC_PRESSURE_RE.search(desc)
        pressure = float(pressure_match.group(1)) if pressure_match else None
        position_match = _JTWC_POSITION_RE.search(desc)
        lat = lon = None
        if position_match:
            lat = float(position_match.group(1)) * (1 if position_match.group(2).upper() == "N" else -1)
            lon = float(position_match.group(3)) * (1 if position_match.group(4).upper() == "E" else -1)

        seen[storm_id] = {
            "id": storm_id,
            "name": name,
            "basin": basin,
            "agency": "JTWC",
            "classification": title.split(" ")[0],
            "category": _category_from_wind_kt(wind_kt),
            "winds_kt": wind_kt,
            "winds_kph": round(wind_kt * KT_TO_KPH, 0) if wind_kt is not None else None,
            "pressure_mb": pressure,
            "lat": lat,
            "lon": lon,
            "movement_dir": None,
            "movement_speed_kt": None,
            "advisory_number": None,
            "advisory_time": pubdate,
            "url": link or None,
        }
    return list(seen.values())


def _safe_fetch(name: str, url: str, parser):
    try:
        text = _fetch_text(url)
        return {"source": name, "ok": True, "storms": parser(text)}
    except (urllib.error.URLError, urllib.error.HTTPError, socket.timeout, OSError, ValueError, json.JSONDecodeError) as exc:
        return {"source": name, "ok": False, "error": str(exc)[:160], "storms": []}


def _build_response() -> dict:
    nhc = _safe_fetch("nhc", NHC_URL, _parse_nhc)
    jtwc = _safe_fetch("jtwc", JTWC_RSS, _parse_jtwc)
    storms = [*nhc.get("storms", []), *jtwc.get("storms", [])]
    storms.sort(key=lambda s: (s.get("winds_kt") or 0), reverse=True)
    return {
        "fetchedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "sources": {"nhc": {"ok": nhc["ok"], **({"error": nhc["error"]} if not nhc["ok"] else {})},
                    "jtwc": {"ok": jtwc["ok"], **({"error": jtwc["error"]} if not jtwc["ok"] else {})}},
        "count": len(storms),
        "storms": storms,
    }


class handler(BaseHTTPRequestHandler):
    def _handle(self, *, head_only: bool = False) -> None:
        try:
            payload = _build_response()
            send_json(self, payload, head_only=head_only)
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
            send_error(self, HTTPStatus.BAD_GATEWAY, f"Tropical feed unavailable: {exc}", head_only=head_only)

    def do_GET(self) -> None:
        self._handle()

    def do_HEAD(self) -> None:  # noqa: N802
        self._handle(head_only=True)

    def log_message(self, *args: object) -> None:
        pass
