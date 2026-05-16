from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable

PERIOD_ALIASES: dict[str, str] = {
    "last7d": "last_7d",
    "last-7d": "last_7d",
    "last_week_rolling": "last_7d",
    "last14d": "last_14d",
    "last-14d": "last_14d",
    "last30d": "last_30d",
    "last-30d": "last_30d",
    "last90d": "last_90d",
    "last-90d": "last_90d",
    "last365d": "last_365d",
    "last-365d": "last_365d",
    "last_year_rolling": "last_365d",
    "lastweek": "last_week",
    "last-week": "last_week",
    "previous_week": "last_week",
    "thisweek": "this_week",
    "this-week": "this_week",
    "wtd": "this_week",
    "lastmonth": "last_month",
    "last-month": "last_month",
    "previous_month": "last_month",
    "month_to_date": "mtd",
    "monthtodate": "mtd",
    "year_to_date": "ytd",
    "yeartodate": "ytd",
    "same_week_lastyear": "same_week_last_year",
    "same-week-last-year": "same_week_last_year",
    "sameweeklastyear": "same_week_last_year",
    "same_month_lastyear": "same_month_last_year",
    "same-month-last-year": "same_month_last_year",
    "sameperiod_lastyear": "same_period_last_year",
    "same-period-last-year": "same_period_last_year",
}

SUPPORTED_PERIODS: list[str] = [
    "last_7d",
    "last_14d",
    "last_30d",
    "last_90d",
    "last_365d",
    "last_week",
    "this_week",
    "last_month",
    "mtd",
    "ytd",
    "same_week_last_year",
    "same_month_last_year",
    "same_period_last_year",
]


def _previous_year(d: date) -> date:
    try:
        return d.replace(year=d.year - 1)
    except ValueError:
        return d.replace(year=d.year - 1, day=28)


def _iso_week_bounds(d: date) -> tuple[date, date]:
    monday = d - timedelta(days=d.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def _month_bounds(d: date) -> tuple[date, date]:
    first = d.replace(day=1)
    if d.month == 12:
        next_first = date(d.year + 1, 1, 1)
    else:
        next_first = date(d.year, d.month + 1, 1)
    last = next_first - timedelta(days=1)
    return first, last


def normalize_period(name: str) -> str:
    cleaned = name.strip().lower().replace(" ", "_")
    return PERIOD_ALIASES.get(cleaned, cleaned)


def resolve_period(name: str, *, today: date | None = None) -> tuple[date, date, str]:
    today = today or date.today()
    yesterday = today - timedelta(days=1)
    canonical = normalize_period(name)

    if canonical == "last_7d":
        return today - timedelta(days=7), yesterday, canonical
    if canonical == "last_14d":
        return today - timedelta(days=14), yesterday, canonical
    if canonical == "last_30d":
        return today - timedelta(days=30), yesterday, canonical
    if canonical == "last_90d":
        return today - timedelta(days=90), yesterday, canonical
    if canonical == "last_365d":
        return today - timedelta(days=365), yesterday, canonical

    if canonical == "last_week":
        this_monday, _ = _iso_week_bounds(today)
        last_monday = this_monday - timedelta(days=7)
        last_sunday = this_monday - timedelta(days=1)
        return last_monday, last_sunday, canonical

    if canonical == "this_week":
        monday, _ = _iso_week_bounds(today)
        end = min(yesterday, today)
        if monday > end:
            end = monday
        return monday, end, canonical

    if canonical == "last_month":
        first_this_month, _ = _month_bounds(today)
        last_month_last_day = first_this_month - timedelta(days=1)
        last_month_first_day, _ = _month_bounds(last_month_last_day)
        return last_month_first_day, last_month_last_day, canonical

    if canonical == "mtd":
        first, _ = _month_bounds(today)
        end = max(first, yesterday)
        return first, end, canonical

    if canonical == "ytd":
        first = date(today.year, 1, 1)
        end = max(first, yesterday)
        return first, end, canonical

    if canonical == "same_week_last_year":
        last_year_today = _previous_year(today)
        monday, sunday = _iso_week_bounds(last_year_today)
        return monday, sunday, canonical

    if canonical == "same_month_last_year":
        last_year_today = _previous_year(today)
        return _month_bounds(last_year_today) + (canonical,)

    if canonical == "same_period_last_year":
        ytd_start = date(today.year, 1, 1)
        ytd_end = yesterday
        start = _previous_year(ytd_start)
        end = _previous_year(ytd_end)
        return start, end, canonical

    supported = ", ".join(SUPPORTED_PERIODS)
    raise ValueError(f"Unknown period '{name}'. Supported: {supported}.")


def describe_period(canonical: str) -> str:
    descriptions = {
        "last_7d": "Last 7 days (rolling)",
        "last_14d": "Last 14 days (rolling)",
        "last_30d": "Last 30 days (rolling)",
        "last_90d": "Last 90 days (rolling)",
        "last_365d": "Last 365 days (rolling)",
        "last_week": "Previous calendar week (Mon-Sun)",
        "this_week": "Current week to date (Mon-yesterday)",
        "last_month": "Previous calendar month",
        "mtd": "Month to date",
        "ytd": "Year to date",
        "same_week_last_year": "Same ISO week as today, one year ago",
        "same_month_last_year": "Same calendar month as today, one year ago",
        "same_period_last_year": "Same Jan-1-to-yesterday range, one year ago",
    }
    return descriptions.get(canonical, canonical)


def supported_periods() -> Iterable[str]:
    return tuple(SUPPORTED_PERIODS)
