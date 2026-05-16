// @ts-nocheck
"use client";

import dynamic from "next/dynamic";

const RadarLiveMap = dynamic(
  () => import("./radar-live-map").then((mod) => mod.RadarLiveMap),
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
  return <RadarLiveMap lat={location.lat} lon={location.lon} location={location} height={height} />;
}
