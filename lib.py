from __future__ import annotations

import os
import re
import urllib.parse
from datetime import date, datetime, timedelta
from typing import Any

import agronomy
import observations
import reports
import weather_sources

DEFAULT_PUBLIC_BASE_URL = os.getenv("ACEWEATHER_PUBLIC_BASE_URL", "https://aceweather.app")

CANONICAL_REGION_SETS: dict[str, list[dict[str, str]]] = {
    "cropdynamics": [
        {"slug": "pocklington", "query": "Pocklington"},
        {"slug": "boroughbridge", "query": "Boroughbridge"},
        {"slug": "sleaford", "query": "Sleaford"},
        {"slug": "scotch-corner", "query": "Scotch Corner"},
        {
            "slug": "longhirst",
            "query": "Longhirst, Northumberland, England",
            "latitude": "55.1774",
            "longitude": "-1.6894",
            "timezone": "Europe/London",
            "label": "Longhirst, Northumberland, United Kingdom",
        },
        {"slug": "berwick", "query": "Berwick-upon-Tweed"},
    ],
}

VALID_TIMEZONE_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$")

_WMO_LABELS: dict[int, str] = {
    0: "Clear sky",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Dense drizzle",
    56: "Freezing drizzle",
    57: "Heavy freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Heavy freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Heavy showers",
    82: "Violent showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Heavy thunderstorm with hail",
}

MeteomaticsCredentials = weather_sources.MeteomaticsCredentials


def wmo_label(code: int | None) -> str:
    if code is None:
        return "Unknown"
    return _WMO_LABELS.get(int(code), "Unknown")


def get_meteomatics_credentials() -> MeteomaticsCredentials | None:
    return weather_sources.get_meteomatics_credentials()


def fetch_geocoding(query: str) -> dict[str, Any]:
    return weather_sources.fetch_geocoding(query)


def resolve_location_query(location_query: str) -> tuple[float, float, str, str]:
    cleaned_query = location_query.strip()
    if len(cleaned_query) < 2:
        raise ValueError("Location query must be at least 2 characters.")
    geo = fetch_geocoding(cleaned_query)
    results = geo.get("results") or []
    if not results:
        raise LookupError(f"No location found for '{cleaned_query}'.")
    best = results[0]
    latitude = float(best["latitude"])
    longitude = float(best["longitude"])
    timezone = best.get("timezone") or "auto"
    label = ", ".join(filter(None, [best.get("name"), best.get("admin1"), best.get("country")]))
    return latitude, longitude, timezone, label


def resolve_region_location(region: dict[str, str]) -> tuple[float, float, str, str]:
    if region.get("latitude") and region.get("longitude"):
        latitude = float(region["latitude"])
        longitude = float(region["longitude"])
        timezone = region.get("timezone") or "auto"
        label = region.get("label") or region.get("query") or region.get("slug") or "Selected location"
        return latitude, longitude, timezone, label
    return resolve_location_query(region["query"])


def public_base_url(base_url: str = "") -> str:
    normalized = (base_url or DEFAULT_PUBLIC_BASE_URL).rstrip("/")
    return normalized or DEFAULT_PUBLIC_BASE_URL


def absolute_public_url(path: str, base_url: str = "") -> str:
    return f"{public_base_url(base_url)}{path}"


def canonical_region_set_urls(set_name: str, base_url: str = "") -> list[str]:
    regions = CANONICAL_REGION_SETS.get(set_name, [])
    return [
        absolute_public_url(
            f"/api/report?query={urllib.parse.quote(region['query'])}",
            base_url,
        )
        for region in regions
    ]


def digest_url(set_name: str, base_url: str = "") -> str:
    return absolute_public_url(f"/api/digest?set={urllib.parse.quote(set_name)}", base_url)


def full_digest_url(set_name: str, base_url: str = "") -> str:
    return absolute_public_url(f"/api/digest?set={urllib.parse.quote(set_name)}&mode=full", base_url)


def fetch_forecast(latitude: float, longitude: float, timezone: str) -> dict[str, Any]:
    return weather_sources.fetch_forecast(latitude, longitude, timezone)


def fetch_history(
    latitude: float,
    longitude: float,
    timezone: str,
    *,
    history_days: int | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> dict[str, Any]:
    return weather_sources.fetch_history(
        latitude,
        longitude,
        timezone,
        history_days=history_days,
        start_date=start_date,
        end_date=end_date,
    )


def fetch_climate_window(latitude: float, longitude: float, timezone: str) -> dict[str, Any]:
    return weather_sources.fetch_climate_window(latitude, longitude, timezone)


def empty_history_payload(start_date: date, end_date: date) -> dict[str, Any]:
    return agronomy.empty_history_payload(start_date, end_date)


def derive_climate_memory(climate_window: dict[str, Any], month_to_date_history: dict[str, Any]) -> dict[str, Any]:
    return agronomy.derive_climate_memory(climate_window, month_to_date_history)


def fetch_air_quality(latitude: float, longitude: float, timezone: str) -> dict[str, Any]:
    return weather_sources.fetch_air_quality(latitude, longitude, timezone)


def fetch_ecmwf_current(latitude: float, longitude: float, timezone: str) -> dict[str, Any]:
    return weather_sources.fetch_ecmwf_current(latitude, longitude, timezone)


def fetch_meteomatics(latitude: float, longitude: float) -> dict[str, Any]:
    return weather_sources.fetch_meteomatics(latitude, longitude)


def classify_index(score: float, *, thresholds: tuple[float, float, float]) -> str:
    return agronomy.classify_index(score, thresholds=thresholds)


def longest_true_block(values: list[bool]) -> int:
    return agronomy.longest_true_block(values)


def derive_agronomy(
    forecast: dict[str, Any],
    history: dict[str, Any],
    climate_window: dict[str, Any],
    observations_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return agronomy.derive_agronomy(forecast, history, climate_window, observations_payload)


def normalize_observations(
    *,
    source_type: str = "manual",
    source_name: str | None = None,
    observed_at: str | None = None,
    rain_24h_mm: float | None = None,
    rain_7d_mm: float | None = None,
    wind_kph: float | None = None,
    gust_kph: float | None = None,
    soil_moisture_surface: float | None = None,
) -> dict[str, Any]:
    return observations.normalize_observations(
        source_type=source_type,
        source_name=source_name,
        observed_at=observed_at,
        rain_24h_mm=rain_24h_mm,
        rain_7d_mm=rain_7d_mm,
        wind_kph=wind_kph,
        gust_kph=gust_kph,
        soil_moisture_surface=soil_moisture_surface,
    )


def aggregate_weather(
    latitude: float,
    longitude: float,
    timezone: str,
    label: str | None,
    *,
    history_days: int | None = None,
    history_start: date | None = None,
    history_end: date | None = None,
    observations_payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    forecast = fetch_forecast(latitude, longitude, timezone)
    today = date.today()
    history = fetch_history(
        latitude,
        longitude,
        timezone,
        history_days=history_days,
        start_date=history_start,
        end_date=history_end,
    )
    climate_window = fetch_climate_window(latitude, longitude, timezone)
    month_start = date(today.year, today.month, 1)
    if today.day > 1:
        month_to_date_history = fetch_history(
            latitude,
            longitude,
            timezone,
            start_date=month_start,
            end_date=today - timedelta(days=1),
        )
    else:
        month_to_date_history = empty_history_payload(month_start, month_start)

    climate_window["summary"] = derive_climate_memory(climate_window, month_to_date_history)
    air_quality = fetch_air_quality(latitude, longitude, timezone)
    ecmwf = fetch_ecmwf_current(latitude, longitude, timezone)
    meteomatics = fetch_meteomatics(latitude, longitude)

    return {
        "location": {
            "name": label or "Selected location",
            "latitude": latitude,
            "longitude": longitude,
            "timezone": timezone,
        },
        "providers": {
            "openMeteo": {
                "forecast": forecast,
                "history": history,
                "climateWindow": climate_window,
                "airQuality": air_quality,
            },
            "ecmwf": ecmwf,
            "meteomatics": meteomatics,
        },
        "observations": observations_payload,
        "agronomy": derive_agronomy(forecast, history, climate_window, observations_payload),
        "generatedAt": datetime.utcnow().isoformat(timespec="seconds") + "Z",
    }


def build_report(payload: dict[str, Any], *, base_url: str = "", include_related: bool = True) -> str:
    return reports.build_report(
        payload,
        base_url=base_url,
        include_related=include_related,
        wmo_label=wmo_label,
        canonical_region_set_urls=canonical_region_set_urls,
        digest_url=digest_url,
        full_digest_url=full_digest_url,
    )


def _build_region_brief(region: dict[str, str]) -> dict[str, Any]:
    latitude, longitude, timezone, label = resolve_region_location(region)
    forecast = fetch_forecast(latitude, longitude, timezone)
    history = fetch_history(latitude, longitude, timezone, history_days=7)
    return {
        "label": label,
        "query": region["query"],
        "history": history["daily"],
        "daily": forecast["daily"],
    }


def build_brief_digest(set_name: str, *, base_url: str = "") -> str:
    regions = CANONICAL_REGION_SETS.get(set_name)
    if not regions:
        supported = ", ".join(sorted(CANONICAL_REGION_SETS))
        raise ValueError(f"Unknown digest set '{set_name}'. Supported sets: {supported}.")

    return reports.build_brief_digest(
        set_name,
        regions=regions,
        base_url=base_url,
        digest_url=digest_url,
        full_digest_url=full_digest_url,
        canonical_region_set_urls=canonical_region_set_urls,
        build_region_brief=_build_region_brief,
    )


def build_digest(set_name: str, *, base_url: str = "", mode: str = "brief") -> str:
    regions = CANONICAL_REGION_SETS.get(set_name)
    if not regions:
        supported = ", ".join(sorted(CANONICAL_REGION_SETS))
        raise ValueError(f"Unknown digest set '{set_name}'. Supported sets: {supported}.")

    def aggregate_weather_for_region(region: dict[str, str]) -> dict[str, Any]:
        latitude, longitude, timezone, label = resolve_region_location(region)
        return aggregate_weather(latitude, longitude, timezone, label, history_days=7)

    return reports.build_digest(
        set_name,
        regions=regions,
        base_url=base_url,
        mode=mode,
        digest_url=digest_url,
        canonical_region_set_urls=canonical_region_set_urls,
        aggregate_weather_for_region=aggregate_weather_for_region,
        build_brief_digest_fn=lambda requested_set_name, *, regions, base_url: reports.build_brief_digest(
            requested_set_name,
            regions=regions,
            base_url=base_url,
            digest_url=digest_url,
            full_digest_url=full_digest_url,
            canonical_region_set_urls=canonical_region_set_urls,
            build_region_brief=_build_region_brief,
        ),
        build_report_fn=lambda payload, *, base_url, include_related: reports.build_report(
            payload,
            base_url=base_url,
            include_related=include_related,
            wmo_label=wmo_label,
            canonical_region_set_urls=canonical_region_set_urls,
            digest_url=digest_url,
            full_digest_url=full_digest_url,
        ),
    )
