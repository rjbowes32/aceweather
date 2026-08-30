// @ts-nocheck
"use client";

import dynamic from "next/dynamic";

const RadarMap = dynamic(
  () => import("@/components/aceweather-x/radar-card").then((mod) => mod.RadarMap),
  {
    ssr: false,
    loading: () => (
      <div className="aw2-radar-live placeholder">
        <div className="aw2-radar-live-status">Loading radar…</div>
      </div>
    ),
  },
);

export function RadarLive({ location, height = 360 }) {
  if (!location || typeof location.lat !== "number" || typeof location.lon !== "number") {
    return (
      <div className="aw2-radar-live placeholder">
        <div className="aw2-radar-live-status">Locate to view live radar.</div>
      </div>
    );
  }
  return (
    <div style={{ height }}>
      <RadarMap lat={location.lat} lon={location.lon} theme="dark" active tz={location.tz} />
    </div>
  );
}
