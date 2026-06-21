// @ts-nocheck
"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const FRAME_ID = "awx-radar-frame";
const PLAY_INTERVAL_MS = 900;
const FRAME_FADE_MS = 320;
const RASTER_OPACITY = 0.82;
const RING_RADII = [25, 50, 100, 200];

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

function removeRaster(map, id) {
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
}

function RadarMap({ lat, lon, theme, active, tz }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const frameRef = useRef(null);
  const indexRef = useRef(null);
  const mountedRef = useRef(false);
  const layerSlotRef = useRef(0);
  const fadeTimerRef = useRef(null);
  const readyTimerRef = useRef(null);
  const initialReadyRef = useRef(false);

  const [index, setIndex] = useState(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [initialFrameReady, setInitialFrameReady] = useState(false);

  const frames = useMemo(() => (index ? allFrames(index) : []), [index]);
  const currentFrame = frames[frameIdx] ?? null;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    frameRef.current = currentFrame;
    indexRef.current = index;
  }, [currentFrame, index]);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    fetchRainViewerIndex(ctrl.signal)
      .then((idx) => {
        setIndex(idx);
        setFrameIdx(Math.max(0, idx.past.length - 1));
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError("Radar unavailable");
      });
    return () => ctrl.abort();
  }, []);

  const markInitialFrameReady = useCallback((map) => {
    if (initialReadyRef.current) return;

    const done = () => {
      if (!mountedRef.current || initialReadyRef.current) return;
      initialReadyRef.current = true;
      setInitialFrameReady(true);
    };

    map.once("idle", done);
    if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
    readyTimerRef.current = window.setTimeout(done, 1000);
  }, []);

  const applyFrame = useCallback(() => {
    const map = mapRef.current;
    const idx = indexRef.current;
    const fr = frameRef.current;
    if (!map || !idx || !fr || !map.isStyleLoaded()) return;

    const nextSlot = layerSlotRef.current === 0 ? 1 : 0;
    const prevSlot = layerSlotRef.current;
    const nextId = `${FRAME_ID}-${nextSlot}`;
    const prevId = `${FRAME_ID}-${prevSlot}`;

    removeRaster(map, nextId);
    map.addSource(nextId, { type: "raster", tiles: [radarTileUrl(idx, fr)], tileSize: 256 });
    map.addLayer(
      {
        id: nextId,
        type: "raster",
        source: nextId,
        paint: {
          "raster-opacity": 0,
          "raster-fade-duration": 180,
          "raster-opacity-transition": { duration: FRAME_FADE_MS, delay: 0 },
        },
      },
      map.getLayer("station") ? "station" : undefined,
    );

    window.requestAnimationFrame(() => {
      if (map.getLayer(nextId)) map.setPaintProperty(nextId, "raster-opacity", RASTER_OPACITY);
      if (map.getLayer(prevId)) map.setPaintProperty(prevId, "raster-opacity", 0);
    });

    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    fadeTimerRef.current = window.setTimeout(() => {
      if (mapRef.current === map) removeRaster(map, prevId);
    }, FRAME_FADE_MS + 90);

    layerSlotRef.current = nextSlot;
    markInitialFrameReady(map);
  }, [markInitialFrameReady]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    setMapReady(false);
    setInitialFrameReady(false);
    initialReadyRef.current = false;
    layerSlotRef.current = 0;
    if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          base: {
            type: "raster",
            tiles: CARTO(theme === "light" ? "light_all" : "dark_all"),
            tileSize: 256,
            attribution: "OpenStreetMap / CARTO / RainViewer",
          },
        },
        layers: [{ id: "base", type: "raster", source: "base" }],
      },
      center: [lon, lat],
      zoom: 6,
      maxZoom: 10,
      attributionControl: { compact: true },
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      if (!mountedRef.current) return;
      setMapReady(true);
      map.addSource("rings", { type: "geojson", data: rings(lat, lon, RING_RADII) });
      map.addLayer({
        id: "rings",
        type: "line",
        source: "rings",
        paint: {
          "line-color": theme === "light" ? "#2f6cf0" : "#6ea0ff",
          "line-width": 0.6,
          "line-opacity": 0.4,
          "line-dasharray": [2, 2],
        },
      });
      map.addSource("station", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] } }],
        },
      });
      map.addLayer({
        id: "station",
        type: "circle",
        source: "station",
        paint: {
          "circle-radius": 4,
          "circle-color": "#e0b15e",
          "circle-stroke-color": theme === "light" ? "#fff" : "#0a0b0d",
          "circle-stroke-width": 1.5,
        },
      });
      applyFrame();
    });

    mapRef.current = map;
    return () => {
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lon, theme, applyFrame]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!map.isStyleLoaded()) map.once("load", applyFrame);
    else applyFrame();
  }, [index, frameIdx, applyFrame]);

  useEffect(() => {
    if (!playing || !active || frames.length === 0) return undefined;
    const id = window.setInterval(() => setFrameIdx((i) => (i + 1) % frames.length), PLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, active, frames.length]);

  useEffect(() => {
    if (!active || !mapRef.current) return undefined;
    const t1 = window.setTimeout(() => mapRef.current && mapRef.current.resize(), 80);
    const t2 = window.setTimeout(() => mapRef.current && mapRef.current.resize(), 280);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [active]);

  function selectFrame(next) {
    setPlaying(false);
    setFrameIdx(Math.max(0, Math.min(frames.length - 1, next)));
  }

  function stepFrame(delta) {
    if (!frames.length) return;
    setPlaying(false);
    setFrameIdx((i) => (i + delta + frames.length) % frames.length);
  }

  const forecast = index && currentFrame ? isForecastFrame(index, currentFrame) : false;
  const frameLabel = currentFrame ? formatFrameTime(currentFrame, tz) : "--:--";
  const hasFrames = frames.length > 0;
  const loading = !error && (!mapReady || !index || (hasFrames && !initialFrameReady));

  return (
    <div className={"awx-radar" + (loading ? " is-loading" : "")}>
      <div className="awx-radar-stage">
        <div className="awx-radar-map" ref={containerRef} style={{ height: 300 }} />
        <div className={"awx-radar-loading" + (loading ? "" : " is-done")} role="status" aria-live="polite">
          <span>Loading rainfall radar</span>
          <i aria-hidden="true" />
        </div>
      </div>

      {error ? <div className="awx-radar-status is-error">{error} - RainViewer did not respond.</div> : null}
      {!loading && !error && index && !hasFrames ? (
        <div className="awx-radar-status">No radar frames are available right now.</div>
      ) : null}

      {!error && hasFrames ? (
        <div className="awx-radar-controls">
          <div className="awx-radar-control-row">
            <button
              type="button"
              className="awx-radar-play"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause radar animation" : "Play radar animation"}
              aria-pressed={playing}
            >
              <span className={"awx-radar-play-icon" + (playing ? " is-pause" : " is-play")} aria-hidden="true" />
            </button>
            <button type="button" className="awx-radar-step" onClick={() => stepFrame(-1)} aria-label="Previous radar frame">
              <span className="awx-radar-step-icon is-prev" aria-hidden="true" />
            </button>
            <button type="button" className="awx-radar-step" onClick={() => stepFrame(1)} aria-label="Next radar frame">
              <span className="awx-radar-step-icon is-next" aria-hidden="true" />
            </button>
            <div className={"awx-radar-time" + (forecast ? " forecast" : "")} aria-live="polite">
              <span className="awx-radar-time-main">{frameLabel}</span>
              <span className="awx-tag-sm">{forecast ? "NOWCAST" : "OBSERVED"}</span>
              <span className="awx-radar-count">{frameIdx + 1}/{frames.length}</span>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={frames.length - 1}
            step={1}
            value={frameIdx}
            aria-label="Radar frame"
            aria-valuetext={`${frameLabel} ${forecast ? "nowcast" : "observed"}`}
            onChange={(e) => selectFrame(Number(e.target.value))}
          />

          <div className="awx-radar-frames" aria-label="Radar frame shortcuts">
            {frames.map((frame, i) => {
              const frameForecast = index ? isForecastFrame(index, frame) : false;
              const selected = i === frameIdx;
              const label = formatFrameTime(frame, tz);
              return (
                <button
                  key={`${frame.time}-${frame.path}`}
                  type="button"
                  className={"awx-radar-frame" + (selected ? " is-active" : "") + (frameForecast ? " is-forecast" : "")}
                  aria-pressed={selected}
                  aria-label={`${frameForecast ? "Nowcast" : "Observed"} radar frame at ${label}`}
                  onClick={() => selectFrame(i)}
                >
                  <span>{label}</span>
                  <small>{frameForecast ? "Cast" : "Obs"}</small>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="awx-radar-foot">
        <span>Rings {RING_RADII.join(" / ")} km</span>
        <span>RainViewer - {index?.past.length ?? 0} past + {index?.nowcast.length ?? 0} nowcast</span>
      </div>
    </div>
  );
}

export function RadarCard({ location, theme, view }) {
  const active = view === "all" || view === "radar";
  return (
    <Card section="radar" currentView={view} tick="rain" kicker="Rainfall radar"
      meta={`${location.name} - live precipitation`}
      detail="Radar imagery is from RainViewer. Observed frames show recent rainfall; nowcast frames are short-range extrapolations. Pan and zoom the map; rings mark distance from your location.">
      <RadarMap lat={location.lat} lon={location.lon} theme={theme} active={active} tz={location.tz} />
    </Card>
  );
}
