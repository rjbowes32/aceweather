from __future__ import annotations

from typing import Any


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
                "fullDigest": absolute("/api/digest?set=cropdynamics&mode=full"),
                "reportUrls": [
                    absolute("/api/report?query=Pocklington"),
                    absolute("/api/report?query=Boroughbridge"),
                    absolute("/api/report?query=Sleaford"),
                    absolute("/api/report?query=Scotch%20Corner"),
                    absolute("/api/report?query=Longhirst"),
                    absolute("/api/report?query=Berwick-upon-Tweed"),
                ],
            },
        },
        "reportEndpoint": {
            "path": "/api/report",
            "method": "GET",
            "responseFormat": "text/plain",
            "description": "Returns a plain-text weather report for a place name or coordinates.",
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
        },
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
                "responseFormat": "text/plain",
                "requiredParamsOneOf": [["query"], ["lat", "lon"]],
                "optionalParams": ["timezone", "label"],
                "description": "Returns the plain-text report derived from the weather payload.",
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
                "optionalParams": ["set", "mode"],
                "description": "Returns a bundled plain-text digest for a canonical regional set such as cropdynamics. Default mode is a faster brief bundle.",
            },
        ],
        "agentHint": "If you need one standard regional bundle, call /api/digest?set=cropdynamics. It defaults to a faster brief text bundle. If you need a single place, call /api/report directly.",
    }
