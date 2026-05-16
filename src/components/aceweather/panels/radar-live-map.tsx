// @ts-nocheck
"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  allFrames,
  fetchRainViewerIndex,
  formatFrameTime,
  isForecastFrame,
  radarTileUrl,
  type RainViewerIndex,
  type RainViewerFrame,
} from "@/lib/radar-frames";

const BASE_STYLE = {
  version: 8 as const,
  sources: {
    "carto-positron": {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap · © CARTO",
    },
  },
  layers: [{ id: "carto-positron", type: "raster" as const, source: "carto-positron" }],
};

const FRAME_LAYER_ID = "rainviewer-frame";
const FRAME_SOURCE_ID = "rainviewer-frame";
const PLAY_INTERVAL_MS = 600;

function buildRangeRings(lat: number, lon: number, radiiKm: number[]) {
  const features = radiiKm.map((km) => {
    const points = 96;
    const coords = [];
    for (let i = 0; i <= points; i += 1) {
      const angle = (i / points) * Math.PI * 2;
      const dLat = (km / 111.32) * Math.cos(angle);
      const dLon = (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
      coords.push([lon + dLon, lat + dLat]);
    }
    return {
      type: "Feature" as const,
      properties: { km },
      geometry: { type: "LineString" as const, coordinates: coords },
    };
  });
  return { type: "FeatureCollection" as const, features };
}

export function RadarLiveMap({ lat, lon, location, height = 360 }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [index, setIndex] = useState<RainViewerIndex | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const frames = useMemo(() => (index ? allFrames(index) : []), [index]);
  const currentFrame: RainViewerFrame | null = frames[frameIdx] ?? null;

  useEffect(() => {
    let cancelled = false;
    fetchRainViewerIndex()
      .then((idx) => {
        if (cancelled) return;
        setIndex(idx);
        const past = idx.past.length;
        setFrameIdx(past > 0 ? past - 1 : 0);
      })
      .catch(() => { if (!cancelled) setError("Radar unavailable"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      center: [lon, lat],
      zoom: 7,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("range-rings", { type: "geojson", data: buildRangeRings(lat, lon, [20, 50, 100, 200]) });
      map.addLayer({
        id: "range-rings",
        type: "line",
        source: "range-rings",
        paint: {
          "line-color": "#1a4f6b",
          "line-width": 0.6,
          "line-opacity": 0.55,
          "line-dasharray": [2, 2],
        },
      });
      map.addSource("station", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [{
            type: "Feature", properties: {},
            geometry: { type: "Point", coordinates: [lon, lat] },
          }],
        },
      });
      map.addLayer({
        id: "station",
        type: "circle",
        source: "station",
        paint: { "circle-radius": 4, "circle-color": "#b54a2c", "circle-stroke-color": "#fff", "circle-stroke-width": 1 },
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) {
      map.once("load", () => {
        map.flyTo({ center: [lon, lat], zoom: 7, duration: 600 });
        const ringSource = map.getSource("range-rings");
        if (ringSource && "setData" in ringSource) ringSource.setData(buildRangeRings(lat, lon, [20, 50, 100, 200]));
        const stationSource = map.getSource("station");
        if (stationSource && "setData" in stationSource) {
          stationSource.setData({
            type: "FeatureCollection",
            features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] } }],
          });
        }
      });
      return;
    }
    map.flyTo({ center: [lon, lat], zoom: 7, duration: 600 });
    const ringSource = map.getSource("range-rings");
    if (ringSource && "setData" in ringSource) ringSource.setData(buildRangeRings(lat, lon, [20, 50, 100, 200]));
    const stationSource = map.getSource("station");
    if (stationSource && "setData" in stationSource) {
      stationSource.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] } }],
      });
    }
  }, [lat, lon]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !index || !currentFrame) return;
    const tiles = [radarTileUrl(index, currentFrame)];
    const apply = () => {
      if (map.getLayer(FRAME_LAYER_ID)) map.removeLayer(FRAME_LAYER_ID);
      if (map.getSource(FRAME_SOURCE_ID)) map.removeSource(FRAME_SOURCE_ID);
      map.addSource(FRAME_SOURCE_ID, { type: "raster", tiles, tileSize: 256 });
      map.addLayer(
        {
          id: FRAME_LAYER_ID,
          type: "raster",
          source: FRAME_SOURCE_ID,
          paint: { "raster-opacity": 0.75, "raster-fade-duration": 0 },
        },
        map.getLayer("station") ? "station" : undefined,
      );
    };
    if (!map.isStyleLoaded()) {
      map.once("load", apply);
    } else {
      apply();
    }
  }, [index, currentFrame]);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const id = window.setInterval(() => {
      setFrameIdx((idx) => (idx + 1) % frames.length);
    }, PLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  const isForecast = index && currentFrame ? isForecastFrame(index, currentFrame) : false;
  const frameLabel = currentFrame ? formatFrameTime(currentFrame) : "—";
  const pastCount = index?.past.length ?? 0;
  const forecastCount = index?.nowcast.length ?? 0;

  return (
    <div className="aw2-radar-live">
      <div className="aw2-radar-live-map" ref={containerRef} style={{ height }} />
      {error ? <div className="aw2-radar-live-status error">{error}</div> : null}
      {!error && frames.length > 0 ? (
        <div className="aw2-radar-live-controls">
          <button
            type="button"
            className="aw2-radar-live-play"
            onClick={() => setPlaying((p) => !p)}
            aria-label={playing ? "Pause radar" : "Play radar"}
          >
            {playing ? "❚❚" : "►"}
          </button>
          <input
            type="range"
            min={0}
            max={frames.length - 1}
            value={frameIdx}
            onChange={(event) => { setPlaying(false); setFrameIdx(Number(event.target.value)); }}
            aria-label="Radar frame scrubber"
          />
          <div className={"aw2-radar-live-time" + (isForecast ? " forecast" : "")}>
            <span className="t">{frameLabel}</span>
            <span className="tag">{isForecast ? "FORECAST" : "OBSERVED"}</span>
          </div>
        </div>
      ) : null}
      <div className="aw2-radar-live-foot">
        <span>{location?.name ?? "—"} · rings 20 · 50 · 100 · 200 km</span>
        <span>RainViewer · {pastCount} past + {forecastCount} nowcast</span>
      </div>
    </div>
  );
}
