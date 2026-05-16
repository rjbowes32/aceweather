// @ts-nocheck
"use client";

import { AW_LOCATION } from "./sample-data";

function reportParamsFor(location = AW_LOCATION) {
  return new URLSearchParams({
    lat: location.lat.toString(),
    lon: location.lon.toString(),
    timezone: location.tz,
    label: `${location.name}, ${location.region}`,
  });
}

function reportUrlFor(location = AW_LOCATION) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/api/report?${reportParamsFor(location).toString()}`;
}

export async function shareWeatherReport(setStatus, location = AW_LOCATION) {
  const reportUrl = reportUrlFor(location);
  setStatus("Preparing report");
  try {
    const response = await fetch(reportUrl);
    if (!response.ok) throw new Error(`Report ${response.status}`);
    const text = await response.text();
    const title = `AceWeather report · ${location.name}`;

    if (navigator.share) {
      await navigator.share({ title, text, url: reportUrl });
      setStatus("Report shared");
      return;
    }

    await navigator.clipboard.writeText(text);
    setStatus("Report copied");
  } catch {
    setStatus("Report unavailable");
  }
}

export const ReportAction = ({ status, onShare, compact = false }) => (
  <div className={compact ? "aw2-report-action compact" : "aw2-report-action"}>
    <button type="button" onClick={onShare}>Share report</button>
    <span role="status" aria-live="polite">{status}</span>
  </div>
);
