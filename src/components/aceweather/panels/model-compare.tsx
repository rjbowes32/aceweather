// @ts-nocheck
"use client";

import { useEffect, useState } from "react";

import { fetchMultiModel, spread, type MultiModelPayload } from "@/lib/multi-model";

type Metric = "temp" | "rain" | "wind";

const METRICS: { id: Metric; label: string; key: keyof MultiModelPayload["models"][number]["daily"]; unit: string; spreadThreshold: number }[] = [
  { id: "temp", label: "Tmax (°C)", key: "temperature_2m_max", unit: "°", spreadThreshold: 2 },
  { id: "rain", label: "Rain (mm)", key: "precipitation_sum", unit: "mm", spreadThreshold: 4 },
  { id: "wind", label: "Wind max (km/h)", key: "wind_speed_10m_max", unit: "", spreadThreshold: 12 },
];

export function ModelCompare({ location }) {
  const [data, setData] = useState<MultiModelPayload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [metric, setMetric] = useState<Metric>("temp");

  const hasLocation = location && typeof location.lat === "number" && typeof location.lon === "number";

  useEffect(() => {
    if (!hasLocation) return;
    const controller = new AbortController();
    setStatus("loading");
    fetchMultiModel(location.lat, location.lon, location.tz, controller.signal)
      .then((payload) => { setData(payload); setStatus("ready"); })
      .catch((err) => { if (err?.name !== "AbortError") setStatus("error"); });
    return () => controller.abort();
  }, [hasLocation, location?.lat, location?.lon, location?.tz]);

  if (!hasLocation) {
    return <div className="aw2-models placeholder"><div className="aw2-models-status">Locate to compare models.</div></div>;
  }
  if (status === "loading") {
    return <div className="aw2-models placeholder"><div className="aw2-models-status">Loading ECMWF · GFS · ICON · UKMO…</div></div>;
  }
  if (status === "error" || !data) {
    return <div className="aw2-models placeholder"><div className="aw2-models-status error">Model data unavailable.</div></div>;
  }

  const metricDef = METRICS.find((m) => m.id === metric)!;
  const days = data.models[0]?.daily.time?.slice(0, 7) ?? [];

  const rows = days.map((day, i) => {
    const cells = data.models.map((m) => {
      const v = (m.daily[metricDef.key] ?? [])[i];
      return { id: m.id, short: m.short, value: typeof v === "number" ? v : null };
    });
    const sp = spread(cells.map((c) => c.value));
    return { day, cells, spread: sp };
  });

  const fmtCell = (v: number | null) => {
    if (v == null) return "—";
    if (metric === "rain") return v < 0.1 ? "·" : v.toFixed(1);
    if (metric === "wind") return Math.round(v).toString();
    return v.toFixed(1);
  };

  return (
    <div className="aw2-models">
      <div className="aw2-models-controls">
        {METRICS.map((m) => (
          <button
            key={m.id}
            type="button"
            aria-pressed={metric === m.id}
            onClick={() => setMetric(m.id)}
          >
            {m.label}
          </button>
        ))}
      </div>
      <table className="aw2-models-table">
        <thead>
          <tr>
            <th className="day">Day</th>
            {data.models.map((m) => <th key={m.id}>{m.short}</th>)}
            <th className="spread">Spread</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isHigh = row.spread != null && row.spread > metricDef.spreadThreshold;
            return (
              <tr key={row.day} className={isHigh ? "high-spread" : ""}>
                <td className="day">{row.day.slice(5)}</td>
                {row.cells.map((c) => (
                  <td key={c.id}>{fmtCell(c.value)}</td>
                ))}
                <td className="spread">{row.spread != null ? `${row.spread.toFixed(metric === "wind" ? 0 : 1)}${metricDef.unit}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="aw2-models-foot">
        <span>Red = day where models disagree by &gt; {metricDef.spreadThreshold}{metricDef.unit}</span>
        <span>Open-Meteo ensemble · {new Date(data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    </div>
  );
}
