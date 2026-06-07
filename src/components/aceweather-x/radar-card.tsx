/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import { Card } from "./ui";
import {
  allFrames, fetchRainViewerIndex, formatFrameTime, isForecastFrame, radarTileUrl,
} from "@/lib/aceweather/radar";

const CARTO = (variant) => [
  `https://a.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
  `https://b.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
  `https://c.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
  `https://d.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
];

function rings(lat, lon, radiiKm) {
  return {
    type: "FeatureCollection",
    features: radiiKm.map((km) => {
      const coords = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        coords.push([
          lon + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(a),
          lat + (km / 111.32) * Math.cos(a),
        ]);
      }
      return { type: "Feature", properties: { km }, geometry: { type: "LineString", coordinates: coords } };
    }),
  };
}

function RadarMap({ lat, lon, theme, active }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [index, setIndex] = useState(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState(null);

  const frames = useMemo(() => (index ? allFrames(index) : []), [index]);
  const currentFrame = frames[frameIdx] ?? null;
  const frameRef = useRef(null);
  const indexRef = useRef(null);
  useEffect(() => { frameRef.current = currentFrame; indexRef.current = index; }, [currentFrame, index]);

  useEffect(() => {
    let cancelled = false;
    fetchRainViewerIndex()
      .then((idx) => { if (cancelled) return; setIndex(idx); setFrameIdx(Math.max(0, idx.past.length - 1)); })
      .catch(() => { if (!cancelled) setError("Radar unavailable"); });
    return () => { cancelled = true; };
  }, []);

  const applyFrame = () => {
    const map = mapRef.current, idx = indexRef.current, fr = frameRef.current;
    if (!map || !idx || !fr || !map.isStyleLoaded()) return;
    if (map.getLayer("frame")) map.removeLayer("frame");
    if (map.getSource("frame")) map.removeSource("frame");
    map.addSource("frame", { type: "raster", tiles: [radarTileUrl(idx, fr)], tileSize: 256 });
    map.addLayer({ id: "frame", type: "raster", source: "frame", paint: { "raster-opacity": 0.8, "raster-fade-duration": 0 } },
      map.getLayer("station") ? "station" : undefined);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: { base: { type: "raster", tiles: CARTO(theme === "light" ? "light_all" : "dark_all"), tileSize: 256, attribution: "© OpenStreetMap · © CARTO · RainViewer" } },
        layers: [{ id: "base", type: "raster", source: "base" }],
      },
      center: [lon, lat], zoom: 6, maxZoom: 10, attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("rings", { type: "geojson", data: rings(lat, lon, [25, 50, 100, 200]) });
      map.addLayer({ id: "rings", type: "line", source: "rings", paint: { "line-color": theme === "light" ? "#2f6cf0" : "#6ea0ff", "line-width": 0.6, "line-opacity": 0.4, "line-dasharray": [2, 2] } });
      map.addSource("station", { type: "geojson", data: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] } }] } });
      map.addLayer({ id: "station", type: "circle", source: "station", paint: { "circle-radius": 4, "circle-color": "#e0b15e", "circle-stroke-color": theme === "light" ? "#fff" : "#0a0b0d", "circle-stroke-width": 1.5 } });
      applyFrame();
    });
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [lat, lon, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) map.once("load", applyFrame); else applyFrame();
  }, [index, frameIdx]);

  useEffect(() => {
    if (!playing || frames.length === 0) return undefined;
    const id = window.setInterval(() => setFrameIdx((i) => (i + 1) % frames.length), 600);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  useEffect(() => {
    if (active && mapRef.current) {
      const t = window.setTimeout(() => mapRef.current && mapRef.current.resize(), 80);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [active]);

  const forecast = index && currentFrame ? isForecastFrame(index, currentFrame) : false;

  return (
    <div className="awx-radar">
      <div className="awx-radar-map" ref={containerRef} style={{ height: 300 }} />
      {error ? <div className="awx-radar-status">{error} — RainViewer did not respond.</div> : null}
      {!error && frames.length > 0 ? (
        <div className="awx-radar-controls">
          <button type="button" className="awx-radar-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>{playing ? "❚❚" : "►"}</button>
          <input type="range" min={0} max={frames.length - 1} value={frameIdx} aria-label="Radar frame"
            onChange={(e) => { setPlaying(false); setFrameIdx(Number(e.target.value)); }} />
          <div className={"awx-radar-time" + (forecast ? " forecast" : "")}>
            <span>{currentFrame ? formatFrameTime(currentFrame) : "—"}</span>
            <span className="awx-tag-sm">{forecast ? "FORECAST" : "OBSERVED"}</span>
          </div>
        </div>
      ) : null}
      <div className="awx-radar-foot">
        <span>Rings 25 · 50 · 100 · 200 km</span>
        <span>RainViewer · {index?.past.length ?? 0} past + {index?.nowcast.length ?? 0} nowcast</span>
      </div>
    </div>
  );
}

export function RadarCard({ location, theme, view }) {
  const active = view === "all" || view === "radar";
  return (
    <Card section="radar" currentView={view} tick="rain" kicker="Rainfall radar"
      meta={`${location.name} · live precipitation`}
      detail="Radar imagery is from RainViewer (Open-Meteo has no radar product). Solid frames are observed; the final frames are a short nowcast. Pan and zoom the map; rings mark distance from your location.">
      <RadarMap lat={location.lat} lon={location.lon} theme={theme} active={active} />
    </Card>
  );
}
