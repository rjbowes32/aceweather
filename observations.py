from __future__ import annotations

from datetime import datetime
from typing import Any


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
    source = source_type.strip().lower() if source_type else "manual"
    if source not in {"manual", "station", "public_station"}:
        raise ValueError("Observation source type must be one of manual, station, or public_station.")

    try:
        normalized_observed_at = (
            datetime.fromisoformat(observed_at.replace("Z", "+00:00")).isoformat()
            if observed_at
            else None
        )
    except ValueError as exc:
        raise ValueError("Observation timestamp must use ISO 8601 format.") from exc

    return {
        "source": {
            "type": source,
            "name": source_name or (
                "Manual rain gauge"
                if source == "manual"
                else "Linked weather station"
                if source == "station"
                else "Nearby public weather station"
            ),
            "observedAt": normalized_observed_at,
        },
        "rainfall": {
            "last24hMm": rain_24h_mm,
            "last7dMm": rain_7d_mm,
        },
        "wind": {
            "speedKph": wind_kph,
            "gustKph": gust_kph,
        },
        "soil": {
            "surfaceMoisture": soil_moisture_surface,
        },
        "quality": summarize_observation_quality(
            source_type=source,
            rain_24h_mm=rain_24h_mm,
            rain_7d_mm=rain_7d_mm,
            wind_kph=wind_kph,
            gust_kph=gust_kph,
            soil_moisture_surface=soil_moisture_surface,
        ),
    }


def summarize_observation_quality(
    *,
    source_type: str,
    rain_24h_mm: float | None,
    rain_7d_mm: float | None,
    wind_kph: float | None,
    gust_kph: float | None,
    soil_moisture_surface: float | None,
) -> dict[str, Any]:
    observed_metric_count = sum(
        value is not None
        for value in [rain_24h_mm, rain_7d_mm, wind_kph, gust_kph, soil_moisture_surface]
    )

    base_score = {
        "manual": 0.55,
        "public_station": 0.72,
        "station": 0.85,
    }[source_type]
    score = min(1.0, base_score + observed_metric_count * 0.03)

    if score >= 0.88:
        label = "High"
    elif score >= 0.72:
        label = "Medium"
    else:
        label = "Low"

    drivers: list[str] = []
    if rain_7d_mm is not None:
        drivers.append("Observed 7-day rainfall available")
    if wind_kph is not None and gust_kph is not None:
        drivers.append("Observed wind and gust data available")
    if soil_moisture_surface is not None:
        drivers.append("Observed surface soil moisture available")
    if not drivers:
        drivers.append("No observed weather inputs supplied")

    return {
        "score": round(score, 2),
        "label": label,
        "drivers": drivers,
    }
