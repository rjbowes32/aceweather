from __future__ import annotations

from typing import Any
import periods
import snapshot_api


def build_api_index(base_url: str = "") -> dict[str, Any]:
    normalized_base = base_url.rstrip("/")

    def absolute(path: str) -> str:
        if not normalized_base:
            return path
        return f"{normalized_base}{path}"

    return {
        "name": "AceWeather API",
        "description": "Weather dashboard API with a plain-text report endpoint for LLM-friendly summaries.",
        "docs": {
            "human": absolute("/report-api.md"),
            "llms": absolute("/llms.txt"),
            "openapi": absolute("/openapi.json"),
        },
        "regionalDigests": {
            "cropdynamics": {
                "digest": absolute("/api/digest?set=cropdynamics"),
                "shortDigest": absolute("/api/digest?set=cropdynamics&history_days=29&format=short"),
                "last29DaysDigest": absolute("/api/digest?set=cropdynamics&history_days=29"),
                "fullDigest": absolute("/api/digest?set=cropdynamics&mode=full"),
                "reportUrls": [
                    absolute("/api/report?query=Scotch%20Corner"),
                    absolute("/api/report?query=Boroughbridge"),
                    absolute("/api/report?query=Pocklington"),
                    absolute("/api/report?query=Alford%2C%20Lincolnshire"),
                    absolute("/api/report?query=Sleaford"),
                    absolute("/api/report?query=Longhirst%2C%20Northumberland%2C%20England"),
                    absolute("/api/report?query=Berwick-upon-Tweed"),
                ],
            },
        },
        "reportEndpoint": {
            "path": "/api/report",
            "method": "GET",
            "responseFormat": "text/plain",
            "description": "Returns a plain-text weather report for a place name or coordinates. Supports flexible historical windows via period shortcuts or explicit date ranges.",
            "queryOptions": [
                {
                    "mode": "place search",
                    "required": ["query"],
                    "example": absolute("/api/report?query=Pocklington"),
                },
                {
                    "mode": "coordinates",
                    "required": ["lat", "lon"],
                    "optional": ["timezone", "label"],
                    "example": absolute(
                        "/api/report?lat=53.9093&lon=-0.7810&timezone=Europe/London&label=Pocklington,%20England,%20United%20Kingdom"
                    ),
                },
            ],
            "optionalParams": [
                "timezone", "label", "period", "history_days", "history_start", "history_end", "format",
            ],
            "supportedPeriods": list(periods.supported_periods()),
            "historyExamples": {
                "lastWeek": absolute("/api/report?query=Pocklington&period=last_week"),
                "sameWeekLastYear": absolute("/api/report?query=Pocklington&period=same_week_last_year"),
                "sameMonthLastYear": absolute("/api/report?query=Pocklington&period=same_month_last_year"),
                "monthToDate": absolute("/api/report?query=Pocklington&period=mtd"),
                "yearToDate": absolute("/api/report?query=Pocklington&period=ytd"),
                "customRange": absolute("/api/report?query=Pocklington&history_start=2024-06-01&history_end=2024-06-30"),
                "csvTable": absolute("/api/report?query=Pocklington&period=last_30d&format=csv"),
                "jsonPayload": absolute("/api/report?query=Pocklington&period=last_30d&format=json"),
            },
        },
        "snapshotEndpoint": snapshot_api.snapshot_endpoint_docs(normalized_base),
        "endpoints": [
            {
                "path": "/api/search",
                "method": "GET",
                "responseFormat": "application/json",
                "requiredParams": ["query"],
                "description": "Searches for places and returns matching coordinates.",
            },
            {
                "path": "/api/weather",
                "method": "GET",
                "responseFormat": "application/json",
                "requiredParams": ["lat", "lon"],
                "optionalParams": ["timezone", "label", "history_days", "history_start", "history_end"],
                "description": "Returns the structured weather payload that powers the dashboard.",
            },
            {
                "path": "/api/report",
                "method": "GET",
                "responseFormat": "text/plain (or text/csv / application/json when format= is set)",
                "requiredParamsOneOf": [["query"], ["lat", "lon"]],
                "optionalParams": [
                    "timezone", "label", "period", "history_days", "history_start", "history_end", "format",
                ],
                "supportedPeriods": list(periods.supported_periods()),
                "description": "Plain-text report with a configurable historical window. Use period= for natural ranges like last_week or same_week_last_year, or history_start/history_end for custom ranges, or history_days=N for the last N days. format=csv returns just the observed table, format=json returns the structured payload.",
            },
            {
                "path": "/api/snapshot",
                "method": "GET, POST",
                "responseFormat": "application/json",
                "requiredParamsOneOf": [["query"], ["lat", "lon"]],
                "optionalParams": [
                    "timezone", "label", "history_days", "history_start", "history_end", "period", "station", "site_id",
                ],
                "supportedPeriods": list(periods.supported_periods()),
                "description": "Compact JSON weather snapshot. Same period / history_start / history_end / history_days controls as /api/report.",
            },
            {
                "path": "/api/providers",
                "method": "GET",
                "responseFormat": "application/json",
                "description": "Reports optional provider availability such as Meteomatics credentials.",
            },
            {
                "path": "/api/digest",
                "method": "GET",
                "responseFormat": "text/plain",
                "optionalParams": ["set", "mode", "history_days", "format"],
                "description": "Returns a bundled plain-text digest for a canonical regional set such as cropdynamics. Use format=short for a fast historical-only summary table. history_days controls the observed historical window ending yesterday.",
            },
            {
                "path": "/api/onthisday",
                "method": "GET",
                "responseFormat": "application/json",
                "requiredParamsOneOf": [["query"], ["lat", "lon"]],
                "optionalParams": ["timezone", "label", "date", "month", "day", "years"],
                "description": "Returns the same calendar date across the last N years (Open-Meteo ERA5 archive back to 1940). Default years=40. Includes hottest/coldest/wettest/windiest year for the date.",
            },
            {
                "path": "/api/tropical",
                "method": "GET",
                "responseFormat": "application/json",
                "description": "Aggregates active tropical systems from NHC (Atlantic + East Pacific JSON) and JTWC (West Pacific + Indian Ocean RSS). Returns one storm list normalized across both agencies with category, winds, pressure, position, and advisory link.",
            },
        ],
        "agentHint": "If you need one standard regional bundle, call /api/digest?set=cropdynamics. It defaults to a faster brief text bundle. If you need a single place, call /api/report directly.",
    }
