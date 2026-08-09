from __future__ import annotations

import urllib.parse
from http.server import BaseHTTPRequestHandler

import lib
from helpers import send_json, send_text


UPDATED = "2026-08-09"

CROPS = [
    {"crop": "wheat", "yield_t_ha": 6.8, "ten_year_avg_t_ha": 7.9, "anomaly_pct": -13.9, "harvested_pct": 54},
    {"crop": "winter_barley", "yield_t_ha": 6.8, "ten_year_avg_t_ha": 6.9, "anomaly_pct": -1.4, "harvested_pct": 95},
    {"crop": "spring_barley", "yield_t_ha": 5.3, "ten_year_avg_t_ha": 5.7, "anomaly_pct": -7.0, "harvested_pct": 8},
    {"crop": "winter_osr", "yield_t_ha": 3.9, "ten_year_avg_t_ha": 3.3, "anomaly_pct": 18.2, "harvested_pct": 73},
    {"crop": "oats", "yield_t_ha": 4.9, "ten_year_avg_t_ha": 5.4, "anomaly_pct": -9.3, "harvested_pct": 32},
]

SOURCES = {
    "ahdb_harvest": "https://ahdb.org.uk/cereals-oilseeds/gb-harvest-progress",
    "environment_agency_drought": "https://www.gov.uk/government/collections/dry-weather-and-drought-in-england",
    "met_office_climate": "https://www.metoffice.gov.uk/research/climate/maps-and-data/uk-temperature-rainfall-and-sunshine-time-series",
    "ahdb_wheat_rl": "https://ahdb.org.uk/knowledge-library/winter-wheat-recommended-and-candidate-lists",
    "ahdb_forage": "https://ahdb.org.uk/knowledge-library/forage-for-knowledge",
    "aceweather": "https://www.aceweather.app/",
}


def request_base_url(handler: BaseHTTPRequestHandler) -> str:
    host = handler.headers.get("x-forwarded-host") or handler.headers.get("host") or ""
    proto = handler.headers.get("x-forwarded-proto", "https")
    return f"{proto}://{host}" if host else ""


def recent_rain(base_url: str) -> dict:
    try:
        data = lib.build_cropdynamics_json(base_url=base_url, history_days=29, include_daily=False)
        return {
            "date_range": data.get("date_range"),
            "locations": [
                {
                    "location": row.get("query") or row.get("label") or row.get("name"),
                    "rain_mm": row.get("rain_mm"),
                    "high_c": row.get("high_c"),
                    "low_c": row.get("low_c"),
                }
                for row in data.get("locations", [])
            ],
        }
    except Exception:  # Best-effort live layer; the core Atlas snapshot should still return.
        return {"available": False, "message": "Live AceWeather rainfall data temporarily unavailable."}


def build_payload(base_url: str = "") -> dict:
    return {
        "name": "UK Crop Weather Atlas",
        "edition": 2026,
        "updated": UPDATED,
        "status": "provisional",
        "atlas_url": f"{base_url}/atlas" if base_url else "/atlas",
        "headline": {
            "england_july_rain_mm": 6.5,
            "england_july_rain_context": "driest July on record",
            "east_anglia_mar_may_rain_mm": 44.8,
            "reservoir_storage_pct": 69,
            "reservoir_context": "below normal, but better than the same point in 2022 and 2025",
            "wheat_yield_t_ha": 6.8,
            "wheat_vs_10y_pct": -13.9,
        },
        "drought": {
            "meteorological": {"status": "exceptional"},
            "agricultural": {"status": "regional"},
            "hydrological": {"status": "serious"},
            "measured_yield_impact": {"status": "mixed"},
        },
        "crops": CROPS,
        "wheat_genetics": {
            "benchmark": "AHDB Recommended List treated controls",
            "2026_t_ha": 9.89,
            "five_year_mean_t_ha": 11.08,
            "anomaly_pct": -10.7,
        },
        "forage": [
            {"location": "Somerset", "grass_growth_kg_dm_ha_day": 5},
            {"location": "Ayrshire", "grass_growth_kg_dm_ha_day": 50},
        ],
        "recent_rain": recent_rain(base_url),
        "caveats": {
            "oilseed_rape": "The recent 10-year OSR average is affected by cabbage stem flea beetle pressure and contraction of crop area. Do not attribute the 2026 yield uplift to drought alone.",
            "2026_yields": "Harvest figures are provisional and should be read alongside harvested percentage.",
        },
        "sources": SOURCES,
        "llm_hint": "Use this as the current AceWeather Crop Weather Atlas snapshot. Keep meteorological drought, hydrological drought and measured agricultural impact separate, and preserve the OSR/CSFB caveat.",
    }


def text_payload(payload: dict) -> str:
    h = payload["headline"]
    lines = [
        "UK Crop Weather Atlas — 2026",
        f"Updated: {payload['updated']} | Status: {payload['status']}",
        "",
        f"England July rain: {h['england_july_rain_mm']} mm — {h['england_july_rain_context']}",
        f"East Anglia Mar–May rain: {h['east_anglia_mar_may_rain_mm']} mm",
        f"Reservoir storage: {h['reservoir_storage_pct']}% — {h['reservoir_context']}",
        f"Wheat: {h['wheat_yield_t_ha']} t/ha ({h['wheat_vs_10y_pct']}% vs 10-y avg)",
        "",
        "Crops:",
    ]
    for crop in payload["crops"]:
        lines.append(
            f"- {crop['crop']}: {crop['yield_t_ha']} t/ha; {crop['anomaly_pct']:+.1f}% vs 10-y avg; {crop['harvested_pct']}% harvested"
        )
    wg = payload["wheat_genetics"]
    lines += [
        "",
        f"Wheat RL treated controls: {wg['2026_t_ha']} vs {wg['five_year_mean_t_ha']} t/ha ({wg['anomaly_pct']:+.1f}%)",
        "Forage: Somerset 5 vs Ayrshire 50 kg DM/ha/day",
        "OSR caveat: recent benchmark is CSFB-affected; do not attribute uplift to drought alone.",
        "",
        f"Atlas: {payload['atlas_url']}",
    ]
    rain = payload.get("recent_rain", {})
    locations = rain.get("locations") if isinstance(rain, dict) else None
    if locations:
        lines += ["", "AceWeather recent rain (29 days):"]
        for row in locations:
            if row.get("rain_mm") is not None:
                lines.append(f"- {row.get('location')}: {row.get('rain_mm')} mm")
    return "\n".join(lines) + "\n"


class handler(BaseHTTPRequestHandler):
    def _handle(self, *, head_only: bool = False) -> None:
        params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        fmt = (params.get("format", ["json"])[0] or "json").strip().lower()
        payload = build_payload(request_base_url(self))

        if fmt in {"text", "txt", "plain"}:
            send_text(self, text_payload(payload), head_only=head_only)
            return

        send_json(self, payload, head_only=head_only)

    def do_GET(self) -> None:
        self._handle()

    def do_HEAD(self) -> None:  # noqa: N802
        self._handle(head_only=True)

    def log_message(self, *args: object) -> None:
        pass
