// @ts-nocheck
"use client";

import { useEffect, useState } from "react";

import { basinLabel, categoryTone, fetchTropical, type TropicalPayload } from "@/lib/tropical";

function formatCoord(value: number | null, posLabel: string, negLabel: string): string {
  if (value == null) return "—";
  const v = Math.abs(value).toFixed(1);
  return `${v}° ${value >= 0 ? posLabel : negLabel}`;
}

function formatAdvisoryTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return s;
  }
}

export function TropicalPanel() {
  const [data, setData] = useState<TropicalPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetchTropical(controller.signal)
      .then((payload) => { setData(payload); setStatus("ready"); })
      .catch((err) => { if (err?.name !== "AbortError") setStatus("error"); });
    return () => controller.abort();
  }, []);

  if (status === "loading") {
    return <div className="aw2-tropical placeholder"><div className="aw2-tropical-status">Fetching NHC + JTWC…</div></div>;
  }
  if (status === "error" || !data) {
    return <div className="aw2-tropical placeholder"><div className="aw2-tropical-status error">Tropical feed unavailable.</div></div>;
  }

  const storms = data.storms ?? [];
  return (
    <div className="aw2-tropical">
      <div className="aw2-tropical-meta">
        <span>Fetched {formatAdvisoryTime(data.fetchedAt)}</span>
        <span className={"src " + (data.sources?.nhc?.ok ? "ok" : "err")}>NHC {data.sources?.nhc?.ok ? "OK" : "down"}</span>
        <span className={"src " + (data.sources?.jtwc?.ok ? "ok" : "err")}>JTWC {data.sources?.jtwc?.ok ? "OK" : "down"}</span>
        <span className="count">{storms.length} active</span>
      </div>

      {storms.length === 0 ? (
        <div className="aw2-tropical-empty">No active tropical systems on either feed.</div>
      ) : (
        <ul className="aw2-tropical-list">
          {storms.map((storm) => (
            <li key={`${storm.agency}-${storm.id}`} className="aw2-tropical-storm">
              <div className={"badge cat-" + categoryTone(storm.category)}>{storm.category}</div>
              <div className="meta">
                <div className="name">
                  {storm.name} <small>{storm.id} · {basinLabel(storm.basin)}</small>
                </div>
                <div className="line">
                  Winds <b>{storm.winds_kt != null ? `${storm.winds_kt} kt` : "—"}</b>
                  {storm.winds_kph != null ? ` (${storm.winds_kph} km/h)` : ""}
                  {" · "}
                  Pressure <b>{storm.pressure_mb != null ? `${storm.pressure_mb} mb` : "—"}</b>
                </div>
                <div className="line muted">
                  Pos {formatCoord(storm.lat, "N", "S")} · {formatCoord(storm.lon, "E", "W")}
                  {storm.movement_dir ? <> · Moving <b>{storm.movement_dir}</b></> : null}
                  {storm.movement_speed_kt ? <> @ <b>{storm.movement_speed_kt} kt</b></> : null}
                </div>
                <div className="line muted">
                  {storm.agency} · advisory {storm.advisory_number ?? "—"} · {formatAdvisoryTime(storm.advisory_time)}
                  {storm.url ? <> · <a href={storm.url} target="_blank" rel="noreferrer">bulletin ↗</a></> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
