from __future__ import annotations

import urllib.parse
from http.server import BaseHTTPRequestHandler

import lib
from helpers import send_json, send_text


UPDATED = "2026-08-28"

CROPS = [
    {"crop": "wheat", "yield_t_ha": 6.8, "ten_year_avg_t_ha": 7.9, "anomaly_pct": -13.9, "harvested_pct": 94},
    {"crop": "winter_barley", "yield_t_ha": 6.9, "ten_year_avg_t_ha": 6.9, "anomaly_pct": 0.0, "harvested_pct": 99.5},
    {"crop": "spring_barley", "yield_t_ha": 4.6, "ten_year_avg_t_ha": 5.7, "anomaly_pct": -19.3, "harvested_pct": 80},
    {"crop": "winter_osr", "yield_t_ha": 4.0, "ten_year_avg_t_ha": 3.3, "anomaly_pct": 21.2, "harvested_pct": 100},
    {"crop": "oats", "yield_t_ha": 4.4, "ten_year_avg_t_ha": 5.4, "anomaly_pct": -18.5, "harvested_pct": 89},
]

SOURCES = {
    "ahdb_harvest": "https://ahdb.org.uk/cereals-oilseeds/gb-harvest-progress",
    "environment_agency_drought": "https://www.gov.uk/government/publications/dry-weather-and-drought-in-england-2026-summary-reports/dry-weather-and-drought-in-england-21-to-27-august-2026",
    "met_office_climate": "https://www.metoffice.gov.uk/research/climate/maps-and-data/uk-temperature-rainfall-and-sunshine-time-series",
    "ahdb_wheat_rl": "https://ahdb.org.uk/knowledge-library/winter-wheat-recommended-and-candidate-lists",
    "ahdb_forage": "https://ahdb.org.uk/knowledge-library/forage-for-knowledge",
    "aceweather": "https://www.aceweather.app/",
}

SOURCE_LABELS = {
    "ahdb_harvest": "AHDB GB Harvest Progress",
    "environment_agency_drought": "Environment Agency dry weather and drought reports",
    "met_office_climate": "Met Office UK climate time series",
    "ahdb_wheat_rl": "AHDB Winter Wheat Recommended List",
    "ahdb_forage": "AHDB Forage for Knowledge",
    "aceweather": "AceWeather",
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
            "england_august_rain_pct_lta": 34,
            "england_august_rain_to_date": "25 August 2026",
            "reservoir_storage_pct": 59.8,
            "reservoir_context": "18.2% below average for the time of year; nine major reservoirs exceptionally low",
            "wheat_yield_t_ha": 6.8,
            "wheat_vs_10y_pct": -13.9,
        },
        "drought": {
            "meteorological": {"status": "exceptional"},
            "agricultural": {"status": "regional"},
            "hydrological": {"status": "serious"},
            "measured_yield_impact": {"status": "mixed"},
            "england_area_pct": 71,
            "river_flows_below_normal_or_lower_pct": 93,
            "river_flow_breakdown_pct": {
                "below_normal": 35,
                "notably_low": 39,
                "exceptionally_low": 19,
            },
            "groundwater_context": "Seasonal recession continues; Tilshead in the Upper Hampshire Avon Chalk and Jackaments Bottom in the Cotswolds Oolite are exceptionally low, with several other chalk sites below normal or notably low.",
            "abstraction_restrictions": 1412,
            "agriculture_context": "Root-crop lifting is difficult on hard soils while irrigation restrictions limit water for softening ground; some restrictions have eased locally after higher river levels in Yorkshire and Lincolnshire.",
        },
        "crops": CROPS,
        "wheat_genetics": {
            "benchmark": "AHDB Recommended List treated controls",
            "2026_t_ha": 9.83,
            "five_year_mean_t_ha": 11.05,
            "anomaly_pct": -11.0,
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
    drought = payload["drought"]
    lines = [
        "UK Crop Weather Atlas — 2026",
        f"Updated: {payload['updated']} | Status: {payload['status']}",
        "",
        "Weather headlines:",
        f"England July rain: {h['england_july_rain_mm']} mm — {h['england_july_rain_context']}",
        f"East Anglia Mar–May rain: {h['east_anglia_mar_may_rain_mm']} mm",
        f"England August rain: {h['england_august_rain_pct_lta']}% of LTA — to {h['england_august_rain_to_date']}",
        f"Reservoir storage: {h['reservoir_storage_pct']}% — {h['reservoir_context']}",
        f"Wheat: {h['wheat_yield_t_ha']} t/ha ({h['wheat_vs_10y_pct']}% vs 10-y avg)",
        "",
        "Drought assessment:",
        f"- Meteorological drought: {drought['meteorological']['status']}",
        f"- Agricultural drought: {drought['agricultural']['status']}",
        f"- Hydrological drought: {drought['hydrological']['status']}",
        f"- Measured yield impact: {drought['measured_yield_impact']['status']}",
        f"- England in drought: {drought['england_area_pct']}%",
        f"- River flows below normal or lower: {drought['river_flows_below_normal_or_lower_pct']}%",
        f"- Groundwater: {drought['groundwater_context']}",
        f"- Abstraction licence restrictions: {drought['abstraction_restrictions']:,}",
        f"- Agriculture: {drought['agriculture_context']}",
        "",
        "Crops:",
    ]
    for crop in payload["crops"]:
        lines.append(
            f"- {crop['crop']}: {crop['yield_t_ha']} t/ha; {crop['anomaly_pct']:+.1f}% vs 10-y avg; {crop['harvested_pct']}% harvested"
        )

    wg = payload["wheat_genetics"]
    forage_by_location = {
        row["location"]: row["grass_growth_kg_dm_ha_day"]
        for row in payload["forage"]
    }
    lines += [
        "",
        f"Wheat RL treated controls: {wg['2026_t_ha']} vs {wg['five_year_mean_t_ha']} t/ha ({wg['anomaly_pct']:+.1f}%)",
        f"Forage: Somerset {forage_by_location.get('Somerset')} vs Ayrshire {forage_by_location.get('Ayrshire')} kg DM/ha/day",
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

    caveats = payload["caveats"]
    lines += [
        "",
        "Caveats:",
        f"- {caveats['2026_yields']}",
        f"- {caveats['oilseed_rape']}",
        "",
        "Sources:",
    ]
    for key, url in payload["sources"].items():
        lines.append(f"- {SOURCE_LABELS.get(key, key)}: {url}")

    lines += [
        "",
        "Interpretation:",
        "Keep meteorological drought, hydrological drought and measured agricultural impact separate. Do not assume that dry weather produces the same yield response across every crop or UK region.",
    ]
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
