from __future__ import annotations

import os
import re
import urllib.parse
import concurrent.futures
from datetime import date, datetime, timedelta
from typing import Any

import agronomy
import observations
import reports
import weather_sources

DEFAULT_PUBLIC_BASE_URL = os.getenv("ACEWEATHER_PUBLIC_BASE_URL", "https://aceweather.app")
DEFAULT_DIGEST_HISTORY_DAYS = 7
DEFAULT_CROPDYNAMICS_JSON_HISTORY_DAYS = 29
MAX_DIGEST_HISTORY_DAYS = 366

CANONICAL_REGION_SETS: dict[str, list[dict[str, str]]] = {
    "cropdynamics": [
        {
            "slug": "scotch-corner",
            "query": "Scotch Corner",
            "latitude": "54.44158",
            "longitude": "-1.6658",
            "timezone": "Europe/London",
            "label": "Scotch Corner, England, United Kingdom",
        },
        {
            "slug": "boroughbridge",
            "query": "Boroughbridge",
            "latitude": "54.0895",
            "longitude": "-1.4011",
            "timezone": "Europe/London",
            "label": "Boroughbridge, England, United Kingdom",
        },
        {
            "slug": "pocklington",
            "query": "Pocklington",
            "latitude": "53.93335",
            "longitude": "-0.78106",
            "timezone": "Europe/London",
            "label": "Pocklington, England, United Kingdom",
        },
        {
            "slug": "alford-east-lindsey",
            "query": "Alford, Lincolnshire",
            "latitude": "53.2591409",
            "longitude": "0.1777346",
            "timezone": "Europe/London",
            "label": "Alford / East Lindsey, England, United Kingdom",
        },
        {
            "slug": "sleaford",
            "query": "Sleaford",
            "latitude": "52.99826",
            "longitude": "-0.40941",
            "timezone": "Europe/London",
            "label": "Sleaford, England, United Kingdom",
        },
        {
            "slug": "longhirst",
            "query": "Longhirst, Northumberland, England",
            "latitude": "55.1774",
            "longitude": "-1.6894",
            "timezone": "Europe/London",
            "label": "Longhirst, Northumberland, United Kingdom",
        },
        {
            "slug": "berwick",
            "query": "Berwick-upon-Tweed",
            "latitude": "55.76868",
            "longitude": "-2.00537",
            "timezone": "Europe/London",
            "label": "Berwick",
        },
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
    latitude, longitude, timezone, label = resolve_location_query(region["query"])
    return latitude, longitude, timezone, region.get("label") or label


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


def resolve_digest_history_days(history_days: int | None = None) -> int:
    resolved_days = DEFAULT_DIGEST_HISTORY_DAYS if history_days is None else history_days
    if resolved_days < 1:
        raise ValueError("history_days must be a positive integer.")
    if resolved_days > MAX_DIGEST_HISTORY_DAYS:
        raise ValueError(f"history_days cannot exceed {MAX_DIGEST_HISTORY_DAYS}.")
    return resolved_days


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


def build_report(
    payload: dict[str, Any],
    *,
    base_url: str = "",
    include_related: bool = True,
    period_label: str | None = None,
    request_query_string: str = "",
) -> str:
    return reports.build_report(
        payload,
        base_url=base_url,
        include_related=include_related,
        wmo_label=wmo_label,
        canonical_region_set_urls=canonical_region_set_urls,
        digest_url=digest_url,
        full_digest_url=full_digest_url,
        period_label=period_label,
        request_query_string=request_query_string,
    )


def build_history_csv(payload: dict[str, Any]) -> str:
    return reports.build_history_csv(payload, wmo_label)


def _build_region_brief(region: dict[str, str], *, history_days: int = DEFAULT_DIGEST_HISTORY_DAYS) -> dict[str, Any]:
    latitude, longitude, timezone, label = resolve_region_location(region)
    forecast = fetch_forecast(latitude, longitude, timezone)
    history = fetch_history(latitude, longitude, timezone, history_days=history_days)
    return {
        "label": label,
        "query": region["query"],
        "history": history["daily"],
        "daily": forecast["daily"],
    }


def _build_region_history_summary(
    region: dict[str, str],
    *,
    history_days: int = DEFAULT_DIGEST_HISTORY_DAYS,
) -> dict[str, Any]:
    latitude, longitude, timezone, label = resolve_region_location(region)
    history = fetch_history(latitude, longitude, timezone, history_days=history_days)
    return {
        "label": label,
        "query": region["query"],
        "history": history["daily"],
        "range": history.get("range", {}),
    }


def _daily_value(values: list[Any], index: int) -> Any:
    return values[index] if index < len(values) else None


def _daily_history_rows(history: dict[str, Any]) -> list[dict[str, Any]]:
    dates = history.get("time", [])
    rain_values = history.get("precipitation_sum") or []
    high_values = history.get("temperature_2m_max") or []
    low_values = history.get("temperature_2m_min") or []
    rows: list[dict[str, Any]] = []
    for index, day in enumerate(dates):
        rain_value = _daily_value(rain_values, index)
        high_value = _daily_value(high_values, index)
        low_value = _daily_value(low_values, index)
        rows.append(
            {
                "date": day,
                "rain_mm": round(float(rain_value or 0.0), 1),
                "high_c": round(float(high_value), 1) if high_value is not None else None,
                "low_c": round(float(low_value), 1) if low_value is not None else None,
            }
        )
    return rows


def _largest_daily_rain(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not rows:
        return None
    wettest = max(rows, key=lambda row: row["rain_mm"])
    return {
        "date": wettest["date"],
        "rain_mm": wettest["rain_mm"],
    }


def _history_confidence(*, requested_days: int, observed_days: int, missing_values: int) -> str:
    if observed_days == 0:
        return "low"
    if observed_days < requested_days or missing_values:
        return "medium"
    return "high"


def _summarize_history_region(
    item: dict[str, Any],
    *,
    requested_days: int,
    include_daily: bool = False,
) -> dict[str, Any]:
    history = item["history"]
    rng = item.get("range") or {}
    rows = _daily_history_rows(history)
    dates = [row["date"] for row in rows]
    rain_values = [row["rain_mm"] for row in rows]
    high_values = [
        row["high_c"]
        for row in rows
        if row["high_c"] is not None
    ]
    low_values = [
        row["low_c"]
        for row in rows
        if row["low_c"] is not None
    ]
    start_date = rng.get("startDate") or (dates[0] if dates else None)
    end_date = rng.get("endDate") or (dates[-1] if dates else None)
    requested_or_range_days = int(rng.get("days") or requested_days)
    observed_days = len(dates)
    missing_days = max(0, requested_or_range_days - observed_days)
    missing_values = sum(
        1
        for row in rows
        if row["high_c"] is None or row["low_c"] is None
    )
    summary = {
        "location": item["label"],
        "query": item["query"],
        "date_range": {
            "start": start_date,
            "end": end_date,
            "days": requested_or_range_days,
        },
        "rain_mm": round(sum(rain_values), 1),
        "high_c": round(max(high_values), 1) if high_values else None,
        "low_c": round(min(low_values), 1) if low_values else None,
        "largest_daily_rain": _largest_daily_rain(rows),
        "data_quality": {
            "observed_days": observed_days,
            "missing_days": missing_days,
            "missing_temperature_values": missing_values,
            "confidence": _history_confidence(
                requested_days=requested_or_range_days,
                observed_days=observed_days,
                missing_values=missing_values,
            ),
        },
    }
    if include_daily:
        summary["daily"] = rows
    return summary


def _rank_locations(
    locations: list[dict[str, Any]],
    field: str,
    *,
    reverse: bool,
    label: str,
) -> list[dict[str, Any]]:
    ranked = sorted(
        (location for location in locations if location.get(field) is not None),
        key=lambda location: location[field],
        reverse=reverse,
    )
    return [
        {
            "rank": index + 1,
            "location": location["location"],
            label: location[field],
        }
        for index, location in enumerate(ranked)
    ]


def _location_value(location: dict[str, Any], field: str) -> dict[str, Any] | None:
    value = location.get(field)
    if value is None:
        return None
    return {
        "location": location["location"],
        field: value,
    }


def _cropdynamics_summary(locations: list[dict[str, Any]]) -> dict[str, Any]:
    if not locations:
        return {}
    wettest = max(locations, key=lambda location: location["rain_mm"])
    driest = min(locations, key=lambda location: location["rain_mm"])
    high_locations = [location for location in locations if location.get("high_c") is not None]
    low_locations = [location for location in locations if location.get("low_c") is not None]
    rain_day_candidates = [
        {
            "location": location["location"],
            **location["largest_daily_rain"],
        }
        for location in locations
        if location.get("largest_daily_rain")
    ]
    largest_rain_day = max(
        rain_day_candidates,
        key=lambda item: item["rain_mm"],
    ) if rain_day_candidates else None
    return {
        "wettest_location": _location_value(wettest, "rain_mm"),
        "driest_location": _location_value(driest, "rain_mm"),
        "highest_temp_location": _location_value(
            max(high_locations, key=lambda location: location["high_c"]),
            "high_c",
        ) if high_locations else None,
        "lowest_temp_location": _location_value(
            min(low_locations, key=lambda location: location["low_c"]),
            "low_c",
        ) if low_locations else None,
        "largest_rain_day": largest_rain_day,
        "average_rain_mm": round(
            sum(location["rain_mm"] for location in locations) / len(locations),
            1,
        ),
    }


def _common_date_range(locations: list[dict[str, Any]]) -> dict[str, Any] | None:
    ranges = [location["date_range"] for location in locations if location.get("date_range")]
    if not ranges:
        return None
    first = ranges[0]
    if all(rng == first for rng in ranges):
        return first
    starts = [rng["start"] for rng in ranges if rng.get("start")]
    ends = [rng["end"] for rng in ranges if rng.get("end")]
    return {
        "start": min(starts) if starts else None,
        "end": max(ends) if ends else None,
        "days": max(rng.get("days", 0) for rng in ranges),
        "varies_by_location": True,
    }


def _cropdynamics_confidence(locations: list[dict[str, Any]]) -> dict[str, Any]:
    quality = [location.get("data_quality", {}) for location in locations]
    missing_location_count = sum(1 for item in quality if item.get("observed_days", 0) == 0)
    missing_day_count = sum(int(item.get("missing_days") or 0) for item in quality)
    missing_temperature_value_count = sum(int(item.get("missing_temperature_values") or 0) for item in quality)
    confidence = "high"
    if missing_location_count:
        confidence = "low"
    elif missing_day_count or missing_temperature_value_count:
        confidence = "medium"
    return {
        "level": confidence,
        "source": "Open-Meteo historical archive",
        "missing_location_count": missing_location_count,
        "missing_day_count": missing_day_count,
        "missing_temperature_value_count": missing_temperature_value_count,
        "caveats": [
            "Historical observations end yesterday.",
            "Rainfall is modelled gridded archive data, not a farm rain gauge.",
            "Point coordinates represent the named place, not every field within the surrounding area.",
        ],
    }


def build_cropdynamics_json(
    *,
    base_url: str = "",
    history_days: int | None = None,
    include_daily: bool = False,
) -> dict[str, Any]:
    resolved_history_days = resolve_digest_history_days(
        DEFAULT_CROPDYNAMICS_JSON_HISTORY_DAYS if history_days is None else history_days
    )
    regions = CANONICAL_REGION_SETS["cropdynamics"]
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(4, len(regions))) as executor:
        histories = list(
            executor.map(
                lambda region: _build_region_history_summary(
                    region,
                    history_days=resolved_history_days,
                ),
                regions,
            )
        )
    locations = [
        _summarize_history_region(
            item,
            requested_days=resolved_history_days,
            include_daily=include_daily,
        )
        for item in histories
    ]
    date_range = _common_date_range(locations)

    return {
        "name": "AceWeather Crop Dynamics Summary",
        "set": "cropdynamics",
        "format": "json",
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "history_days": resolved_history_days,
        "window": "last N days ending yesterday",
        "date_range": date_range,
        "units": {
            "rain_mm": "millimetres",
            "high_c": "degrees Celsius",
            "low_c": "degrees Celsius",
        },
        "summary": _cropdynamics_summary(locations),
        "rankings": {
            "rain_mm_desc": _rank_locations(locations, "rain_mm", reverse=True, label="rain_mm"),
            "rain_mm_asc": _rank_locations(locations, "rain_mm", reverse=False, label="rain_mm"),
            "high_c_desc": _rank_locations(locations, "high_c", reverse=True, label="high_c"),
            "low_c_asc": _rank_locations(locations, "low_c", reverse=False, label="low_c"),
        },
        "confidence": _cropdynamics_confidence(locations),
        "locations": locations,
        "links": {
            "self": absolute_public_url("/api/cropdynamics", base_url),
            "daily_json": absolute_public_url(
                f"/api/cropdynamics?history_days={resolved_history_days}&include=daily",
                base_url,
            ),
            "short_text": absolute_public_url(
                f"/api/digest?set=cropdynamics&history_days={resolved_history_days}&format=short",
                base_url,
            ),
            "detailed_text": absolute_public_url(
                f"/api/digest?set=cropdynamics&history_days={resolved_history_days}",
                base_url,
            ),
        },
    }


def build_brief_digest(
    set_name: str,
    *,
    base_url: str = "",
    history_days: int | None = None,
) -> str:
    regions = CANONICAL_REGION_SETS.get(set_name)
    if not regions:
        supported = ", ".join(sorted(CANONICAL_REGION_SETS))
        raise ValueError(f"Unknown digest set '{set_name}'. Supported sets: {supported}.")
    resolved_history_days = resolve_digest_history_days(history_days)

    return reports.build_brief_digest(
        set_name,
        regions=regions,
        base_url=base_url,
        history_days=resolved_history_days,
        digest_url=digest_url,
        full_digest_url=full_digest_url,
        canonical_region_set_urls=canonical_region_set_urls,
        build_region_brief=lambda region: _build_region_brief(region, history_days=resolved_history_days),
    )


def build_short_digest(
    set_name: str,
    *,
    base_url: str = "",
    history_days: int | None = None,
) -> str:
    regions = CANONICAL_REGION_SETS.get(set_name)
    if not regions:
        supported = ", ".join(sorted(CANONICAL_REGION_SETS))
        raise ValueError(f"Unknown digest set '{set_name}'. Supported sets: {supported}.")
    resolved_history_days = resolve_digest_history_days(history_days)

    return reports.build_short_digest(
        set_name,
        regions=regions,
        base_url=base_url,
        history_days=resolved_history_days,
        digest_url=digest_url,
        canonical_region_set_urls=canonical_region_set_urls,
        build_region_history=lambda region: _build_region_history_summary(
            region,
            history_days=resolved_history_days,
        ),
    )


def build_digest(
    set_name: str,
    *,
    base_url: str = "",
    mode: str = "brief",
    history_days: int | None = None,
    digest_format: str = "brief",
) -> str:
    regions = CANONICAL_REGION_SETS.get(set_name)
    if not regions:
        supported = ", ".join(sorted(CANONICAL_REGION_SETS))
        raise ValueError(f"Unknown digest set '{set_name}'. Supported sets: {supported}.")
    resolved_history_days = resolve_digest_history_days(history_days)
    if digest_format == "short":
        return build_short_digest(
            set_name,
            base_url=base_url,
            history_days=resolved_history_days,
        )
    if digest_format not in ("brief", "text"):
        raise ValueError("format must be one of: brief, short.")

    def aggregate_weather_for_region(region: dict[str, str]) -> dict[str, Any]:
        latitude, longitude, timezone, label = resolve_region_location(region)
        return aggregate_weather(latitude, longitude, timezone, label, history_days=resolved_history_days)

    return reports.build_digest(
        set_name,
        regions=regions,
        base_url=base_url,
        mode=mode,
        history_days=resolved_history_days,
        digest_url=digest_url,
        canonical_region_set_urls=canonical_region_set_urls,
        aggregate_weather_for_region=aggregate_weather_for_region,
        build_brief_digest_fn=lambda requested_set_name, *, regions, base_url, history_days: reports.build_brief_digest(
            requested_set_name,
            regions=regions,
            base_url=base_url,
            history_days=history_days,
            digest_url=digest_url,
            full_digest_url=full_digest_url,
            canonical_region_set_urls=canonical_region_set_urls,
            build_region_brief=lambda region: _build_region_brief(region, history_days=history_days),
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
