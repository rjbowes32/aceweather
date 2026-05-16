from __future__ import annotations

import concurrent.futures
import urllib.parse
from datetime import date, datetime
from typing import Any, Callable


def _history_section_header(history: dict[str, Any], period_label: str | None) -> str:
    rng = history.get("range") or {}
    start = rng.get("startDate")
    end = rng.get("endDate")
    days = rng.get("days")
    if start and end and days:
        suffix = f" — {period_label}" if period_label else ""
        return f"## Observed Archive ({start} to {end}, {days} days){suffix}"
    return "## Observed Archive"


def _history_rows_csv(history: dict[str, Any], wmo_label: Callable[[int | None], str]) -> list[str]:
    hist = history["daily"]
    rows = ["date,max_c,min_c,rain_mm,wind_kph,condition"]
    n = len(hist["time"])
    for i in range(n):
        tmax = hist["temperature_2m_max"][i]
        tmin = hist["temperature_2m_min"][i]
        rain = hist["precipitation_sum"][i] or 0
        wind = hist["wind_speed_10m_max"][i] or 0
        rows.append(
            f"{hist['time'][i]},"
            f"{tmax if tmax is not None else ''},"
            f"{tmin if tmin is not None else ''},"
            f"{rain:.1f},"
            f"{wind:.0f},"
            f"\"{wmo_label(hist['weather_code'][i])}\""
        )
    return rows


def build_history_csv(payload: dict[str, Any], wmo_label: Callable[[int | None], str]) -> str:
    history = payload["providers"]["openMeteo"]["history"]
    return "\n".join(_history_rows_csv(history, wmo_label)) + "\n"


def build_report(
    payload: dict[str, Any],
    *,
    base_url: str = "",
    include_related: bool = True,
    wmo_label: Callable[[int | None], str],
    canonical_region_set_urls: Callable[[str, str], list[str]],
    digest_url: Callable[[str, str], str],
    full_digest_url: Callable[[str, str], str],
    period_label: str | None = None,
    request_query_string: str = "",
) -> str:
    location = payload["location"]
    forecast = payload["providers"]["openMeteo"]["forecast"]
    history = payload["providers"]["openMeteo"]["history"]
    air = payload["providers"]["openMeteo"]["airQuality"]
    ecmwf = payload["providers"].get("ecmwf", {})
    agronomy = payload["agronomy"]
    history_range = history.get("range") or {}

    header_meta = (
        f"Generated: {payload['generatedAt']} | Lat: {location['latitude']:.4f} | "
        f"Lon: {location['longitude']:.4f} | Timezone: {location['timezone']}"
    )
    if history_range.get("startDate") and history_range.get("endDate"):
        header_meta += (
            f" | History: {history_range['startDate']} to {history_range['endDate']} "
            f"({history_range.get('days', '?')} days)"
        )
        if period_label:
            header_meta += f" [{period_label}]"

    lines: list[str] = [
        f"# AceWeather Report: {location['name']}",
        header_meta,
        "",
        "## Current Conditions",
    ]
    cur = forecast["current"]
    lines += [
        f"- Temperature: {cur['temperature_2m']:.1f} C (feels like {cur['apparent_temperature']:.1f} C)",
        f"- Condition: {wmo_label(cur['weather_code'])}",
        f"- Humidity: {cur['relative_humidity_2m']}% | Wind: {cur['wind_speed_10m']:.0f} km/h (gusts {cur['wind_gusts_10m']:.0f} km/h) | Pressure: {cur['pressure_msl']:.0f} hPa",
        f"- Precipitation (current reading): {cur['precipitation']:.1f} mm",
        "",
        _history_section_header(history, period_label),
        "| Date       | Max C | Min C | Rain mm | Wind km/h | Condition            |",
        "|------------|-------|-------|---------|-----------|----------------------|",
    ]
    hist = history["daily"]
    n = len(hist["time"])
    for i in range(n):
        tmax = hist["temperature_2m_max"][i]
        tmin = hist["temperature_2m_min"][i]
        rain = hist["precipitation_sum"][i] or 0
        wind = hist["wind_speed_10m_max"][i] or 0
        lines.append(
            f"| {hist['time'][i]} | {f'{tmax:.1f}' if tmax is not None else '--':>5} | "
            f"{f'{tmin:.1f}' if tmin is not None else '--':>5} | {rain:>7.1f} | "
            f"{wind:>9.0f} | {wmo_label(hist['weather_code'][i]):<20} |"
        )
    if n > 0:
        rain_total = sum(v or 0 for v in hist["precipitation_sum"])
        tmax_values = [v for v in hist["temperature_2m_max"] if v is not None]
        tmin_values = [v for v in hist["temperature_2m_min"] if v is not None]
        summary_bits = [f"Rain total: {rain_total:.1f} mm"]
        if tmax_values:
            summary_bits.append(f"Highest max: {max(tmax_values):.1f} C")
        if tmin_values:
            summary_bits.append(f"Lowest min: {min(tmin_values):.1f} C")
        lines.append("")
        lines.append("Period summary: " + " | ".join(summary_bits))
    lines += [
        "",
        "## 10-Day Forecast",
        "| Date       | Max C | Min C | Rain mm | Rain % | Wind km/h | Condition            |",
        "|------------|-------|-------|---------|--------|-----------|----------------------|",
    ]
    daily = forecast["daily"]
    for i in range(min(10, len(daily["time"]))):
        tmax = daily["temperature_2m_max"][i]
        tmin = daily["temperature_2m_min"][i]
        rain = daily["precipitation_sum"][i] or 0
        rain_prob = daily["precipitation_probability_max"][i] or 0
        wind = daily["wind_speed_10m_max"][i] or 0
        lines.append(
            f"| {daily['time'][i]} | {f'{tmax:.1f}' if tmax is not None else '--':>5} | "
            f"{f'{tmin:.1f}' if tmin is not None else '--':>5} | {rain:>7.1f} | "
            f"{rain_prob:>5}% | {wind:>9.0f} | {wmo_label(daily['weather_code'][i]):<20} |"
        )
    if ecmwf.get("enabled") and ecmwf.get("observation"):
        obs = ecmwf["observation"]
        e_temp = f"{obs['temperature_2m']:.1f} C" if obs.get("temperature_2m") is not None else "--"
        e_wind = f"{obs['wind_speed_10m']:.0f} km/h" if obs.get("wind_speed_10m") is not None else "--"
        e_gust = f"{obs['wind_gusts_10m']:.0f} km/h" if obs.get("wind_gusts_10m") is not None else "--"
        e_rain = f"{obs['precipitation']:.1f} mm" if obs.get("precipitation") is not None else "--"
        e_pres = f"{obs['pressure_msl']:.0f} hPa" if obs.get("pressure_msl") is not None else "--"
        lines += [
            "",
            "## ECMWF IFS 0.25deg Model Verification",
            f"Most recent ECMWF reading: {obs.get('time', 'unknown')}",
            f"- Temperature: {e_temp}",
            f"- Humidity: {obs.get('relative_humidity_2m', '--')}% | Wind: {e_wind} (gusts {e_gust})",
            f"- Precipitation: {e_rain} | Cloud cover: {obs.get('cloud_cover', '--')}% | Pressure: {e_pres}",
            f"- Condition: {wmo_label(obs.get('weather_code'))}",
        ]
        if cur.get("temperature_2m") is not None and obs.get("temperature_2m") is not None:
            delta = obs["temperature_2m"] - cur["temperature_2m"]
            lines.append(f"- Model delta vs best_match: {delta:+.1f} C temperature")

    air_cur = air["current"]
    lines += [
        "",
        "## Air Quality (Current)",
        f"- European AQI: {air_cur.get('european_aqi', '--')} | US AQI: {air_cur.get('us_aqi', '--')}",
        f"- PM2.5: {air_cur.get('pm2_5', '--')} ug/m3 | PM10: {air_cur.get('pm10', '--')} ug/m3",
        f"- NO2: {air_cur.get('nitrogen_dioxide', '--')} ug/m3 | O3: {air_cur.get('ozone', '--')} ug/m3",
        "",
        "## Agronomy Summary",
    ]
    ag = agronomy["summary"]
    spray = agronomy["sprayWindow"]
    disease = agronomy["diseaseModels"]
    lines += [
        f"- Rain last 7 days: {ag['rainLast7Days']:.1f} mm | Rain next 7 days: {ag['rainNext7Days']:.1f} mm",
        f"- Field access score: {ag['fieldAccessScore']}/100 ({ag['fieldAccessLabel']})",
        f"- Spray window (next 24 h): {spray['openHoursNext24']} h open | {spray['longestBlockHours']} h longest block",
        f"- General fungal pressure: {disease['generalFungalPressure']['label']} (score {disease['generalFungalPressure']['score']})",
        f"- Late blight Smith proxy: {'Triggered' if disease['lateBlightSmithProxy']['triggered'] else 'Not triggered'}",
        f"- Septoria proxy: {disease['septoriaProxy']['label']} (score {disease['septoriaProxy']['score']})",
        f"- Disclaimer: {agronomy['disclaimer']}",
        "",
    ]
    if include_related:
        related_urls = canonical_region_set_urls("cropdynamics", base_url)
        lines += [
            "## Direct Report URLs",
            "If an agent can fetch this report, it can also fetch the following exact report URLs:",
            *[f"- {url}" for url in related_urls],
            "",
            "## Regional Digest URL",
            f"- {digest_url('cropdynamics', base_url)}",
            f"- Full version: {full_digest_url('cropdynamics', base_url)}",
            "",
        ]
    base_query = request_query_string or "query=<place>"
    lines += [
        "## Pulling Historical Data (for LLM agents)",
        "Re-call this same /api/report endpoint with one of these parameters to change the observed window:",
        f"- ?{base_query}&period=last_week (previous Mon-Sun)",
        f"- ?{base_query}&period=last_month",
        f"- ?{base_query}&period=same_week_last_year",
        f"- ?{base_query}&period=same_month_last_year",
        f"- ?{base_query}&period=ytd",
        f"- ?{base_query}&period=last_30d  (or last_7d, last_14d, last_90d, last_365d)",
        f"- ?{base_query}&history_start=YYYY-MM-DD&history_end=YYYY-MM-DD (custom range)",
        f"- ?{base_query}&history_days=N (last N days, max 730)",
        f"- ?{base_query}&format=csv  (return the observed-archive table as CSV)",
        "",
    ]
    return "\n".join(lines)


def build_brief_digest(
    set_name: str,
    *,
    regions: list[dict[str, str]],
    base_url: str = "",
    digest_url: Callable[[str, str], str],
    full_digest_url: Callable[[str, str], str],
    canonical_region_set_urls: Callable[[str, str], list[str]],
    build_region_brief: Callable[[dict[str, str]], dict[str, Any]],
) -> str:
    digest_link = digest_url(set_name, base_url)
    report_links = canonical_region_set_urls(set_name, base_url)
    lines = [
        f"# AceWeather Bundle: {set_name}",
        f"Generated: {datetime.utcnow().isoformat(timespec='seconds')}Z",
        "",
        "This is the fast plain-text bundle intended for LLM fetching and interpretation.",
        f"Fixed bundle URL: {digest_link}",
        f"Full bundle URL: {full_digest_url(set_name, base_url)}",
        "",
        "## Direct Report URLs",
        *[f"- {url}" for url in report_links],
        "",
        "## Regional Snapshot",
    ]

    with concurrent.futures.ThreadPoolExecutor(max_workers=min(6, len(regions))) as executor:
        briefs = list(executor.map(build_region_brief, regions))

    for brief in briefs:
        history = brief["history"]
        daily = brief["daily"]
        forecast_start = 0
        today_iso = date.today().isoformat()
        for index, day_value in enumerate(daily["time"]):
            if day_value >= today_iso:
                forecast_start = index
                break
        lines += [
            "",
            f"### {brief['label']}",
            "Observed last 7 days:",
        ]
        for index in range(min(7, len(history["time"]))):
            lines.append(
                f"  - {history['time'][index]}: high {float(history['temperature_2m_max'][index] or 0.0):.1f} C, "
                f"low {float(history['temperature_2m_min'][index] or 0.0):.1f} C, "
                f"rain {float(history['precipitation_sum'][index] or 0.0):.1f} mm"
            )
        lines.append("Forecast next 7 days:")
        for index in range(forecast_start, min(forecast_start + 7, len(daily["time"]))):
            lines.append(
                f"  - {daily['time'][index]}: high {float(daily['temperature_2m_max'][index] or 0.0):.1f} C, "
                f"low {float(daily['temperature_2m_min'][index] or 0.0):.1f} C, "
                f"rain {float(daily['precipitation_sum'][index] or 0.0):.1f} mm"
            )

    lines += [
        "",
        "## Agent Instruction",
        "Read this text bundle directly, then interpret rainfall and temperature patterns region by region.",
    ]
    return "\n".join(lines)


def build_digest(
    set_name: str,
    *,
    regions: list[dict[str, str]],
    base_url: str = "",
    mode: str = "brief",
    digest_url: Callable[[str, str], str],
    canonical_region_set_urls: Callable[[str, str], list[str]],
    aggregate_weather_for_region: Callable[[dict[str, str]], dict[str, Any]],
    build_brief_digest_fn: Callable[..., str],
    build_report_fn: Callable[..., str],
) -> str:
    if mode == "brief":
        return build_brief_digest_fn(
            set_name,
            regions=regions,
            base_url=base_url,
        )
    if mode != "full":
        raise ValueError("Unknown digest mode. Supported modes: brief, full.")

    digest_link = digest_url(set_name, base_url)
    report_links = canonical_region_set_urls(set_name, base_url)
    lines = [
        f"# AceWeather Digest: {set_name}",
        f"Generated: {datetime.utcnow().isoformat(timespec='seconds')}Z",
        "",
        "## Digest URL",
        f"- {digest_link}",
        "",
        "## Direct Report URLs",
        *[f"- {url}" for url in report_links],
        "",
    ]

    for region in regions:
        payload = aggregate_weather_for_region(region)
        lines += [
            "---",
            "",
            build_report_fn(payload, base_url=base_url, include_related=False),
            "",
        ]

    return "\n".join(lines)
