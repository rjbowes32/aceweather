"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import type { FeatureCollection, LineString, Position } from "geojson";
import { useCallback, useEffect, useRef, useState } from "react";

import type { AwLocation } from "@/lib/aceweather/open-meteo";
import {
  fetchMetOfficeRadarFrames,
  formatRadarFrameTime,
  metOfficeRadarUrl,
  type MetOfficeRadarFrame,
} from "@/lib/aceweather/met-office-radar";
import { Card } from "./ui";

const OPEN_FREE_MAP = (theme: "dark" | "light") =>
  `https://tiles.openfreemap.org/styles/${theme === "light" ? "positron" : "dark"}`;

const FRAME_ID = "awx-radar-frame";
const PLAY_INTERVAL_MS = 1400;
const FRAME_FADE_MS = 320;
const RASTER_OPACITY = 0.86;
const RING_RADII = [25, 50, 100, 200];

type RadarCoordinates = [[number, number], [number, number], [number, number], [number, number]];
type RadarImage = { url: string; coordinates: RadarCoordinates };
type H5Attribute = { value: unknown };
type H5Node = { attrs: Record<string, H5Attribute>; value?: Float32Array; shape?: number[] };
type H5File = H5Node & { get: (path: string) => H5Node; close: () => void };

function rings(lat: number, lon: number, radiiKm: number[]): FeatureCollection<LineString, { km: number }> {
  return {
    type: "FeatureCollection",
    features: radiiKm.map((km) => {
      const coords: Position[] = [];
      for (let i = 0; i <= 96; i += 1) {
        const angle = (i / 96) * Math.PI * 2;
        coords.push([
          lon + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle),
          lat + (km / 111.32) * Math.cos(angle),
        ]);
      }
      return { type: "Feature", properties: { km }, geometry: { type: "LineString", coordinates: coords } };
    }),
  };
}

function removeRaster(map: maplibregl.Map, id: string) {
  if (map.getLayer(id)) map.removeLayer(id);
  if (map.getSource(id)) map.removeSource(id);
}

function attributeNumber(node: H5Node, name: string) {
  return Number(node.attrs[name]?.value);
}

function radarColour(rate: number): readonly [number, number, number, number] {
  if (!Number.isFinite(rate) || rate <= 0.05) return [0, 0, 0, 0];
  if (rate < 0.5) return [110, 160, 255, 115];
  if (rate < 1) return [73, 130, 238, 155];
  if (rate < 2) return [65, 190, 225, 185];
  if (rate < 4) return [77, 211, 158, 205];
  if (rate < 8) return [238, 202, 91, 220];
  if (rate < 16) return [239, 153, 74, 232];
  if (rate < 32) return [232, 104, 119, 242];
  return [194, 91, 220, 250];
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not render radar image")), "image/png");
  });
}

async function renderRadarFrame(frame: MetOfficeRadarFrame, signal?: AbortSignal): Promise<RadarImage> {
  const response = await fetch(metOfficeRadarUrl(frame), { signal, cache: "force-cache" });
  if (!response.ok) throw new Error(`Met Office radar frame ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const { default: h5wasm } = await import("h5wasm");
  const { FS } = await h5wasm.ready;
  const filename = `/aceweather-radar-${frame.time}.h5`;
  let file: H5File | null = null;

  try {
    FS.writeFile(filename, bytes);
    file = new h5wasm.File(filename, "r") as unknown as H5File;
    const dataset = file.get("dataset1/data1/data");
    const where = file.get("where");
    const values = dataset.value;
    const [height, width] = dataset.shape ?? [];
    if (!values || !width || !height || values.length !== width * height) {
      throw new Error("Met Office radar frame had an unexpected grid");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Radar canvas unavailable");
    const image = context.createImageData(width, height);
    const pixels = image.data;
    for (let index = 0; index < values.length; index += 1) {
      const [red, green, blue, alpha] = radarColour(values[index]);
      const pixel = index * 4;
      pixels[pixel] = red;
      pixels[pixel + 1] = green;
      pixels[pixel + 2] = blue;
      pixels[pixel + 3] = alpha;
    }
    context.putImageData(image, 0, 0);
    const blob = await canvasBlob(canvas);

    return {
      url: URL.createObjectURL(blob),
      coordinates: [
        [attributeNumber(where, "UL_lon"), attributeNumber(where, "UL_lat")],
        [attributeNumber(where, "UR_lon"), attributeNumber(where, "UR_lat")],
        [attributeNumber(where, "LR_lon"), attributeNumber(where, "LR_lat")],
        [attributeNumber(where, "LL_lon"), attributeNumber(where, "LL_lat")],
      ],
    };
  } finally {
    file?.close();
    try { FS.unlink(filename); } catch { /* already removed */ }
  }
}

type RadarMapProps = { lat: number; lon: number; theme: "dark" | "light"; active: boolean; tz?: string };

export function RadarMap({ lat, lon, theme, active, tz }: RadarMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const frameRef = useRef<MetOfficeRadarFrame | null>(null);
  const framesRef = useRef<MetOfficeRadarFrame[]>([]);
  const frameIndexRef = useRef(0);
  const mountedRef = useRef(false);
  const layerSlotRef = useRef(0);
  const fadeTimerRef = useRef<number | null>(null);
  const readyTimerRef = useRef<number | null>(null);
  const initialReadyRef = useRef(false);
  const renderSequenceRef = useRef(0);
  const imageCacheRef = useRef(new Map<string, Promise<RadarImage>>());

  const [frames, setFrames] = useState<MetOfficeRadarFrame[]>([]);
  const [framesLoaded, setFramesLoaded] = useState(false);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [initialFrameReady, setInitialFrameReady] = useState(false);
  const currentFrame = frames[frameIdx] ?? null;

  useEffect(() => {
    mountedRef.current = true;
    const imageCache = imageCacheRef.current;
    return () => {
      mountedRef.current = false;
      renderSequenceRef.current += 1;
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      if (readyTimerRef.current) window.clearTimeout(readyTimerRef.current);
      for (const image of imageCache.values()) image.then((value) => URL.revokeObjectURL(value.url)).catch(() => {});
      imageCache.clear();
    };
  }, []);

  useEffect(() => {
    frameRef.current = currentFrame;
    framesRef.current = frames;
    frameIndexRef.current = frameIdx;
  }, [currentFrame, frameIdx, frames]);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setFramesLoaded(false);
    fetchMetOfficeRadarFrames(controller.signal)
      .then((availableFrames) => {
        if (!mountedRef.current) return;
        setFrames(availableFrames);
        setFrameIdx(Math.max(0, availableFrames.length - 1));
        setFramesLoaded(true);
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setFramesLoaded(true);
          setError("Radar unavailable");
        }
      });
    return () => controller.abort();
  }, []);

  const markInitialFrameReady = useCallback((map: maplibregl.Map) => {
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

  const getRadarImage = useCallback((frame: MetOfficeRadarFrame) => {
    const cached = imageCacheRef.current.get(frame.key);
    if (cached) return cached;
    const pending = renderRadarFrame(frame).catch((caught) => {
      imageCacheRef.current.delete(frame.key);
      throw caught;
    });
    imageCacheRef.current.set(frame.key, pending);
    return pending;
  }, []);

  const applyFrame = useCallback(async () => {
    const map = mapRef.current;
    const frame = frameRef.current;
    if (!map || !frame || !map.isStyleLoaded()) return;
    const sequence = ++renderSequenceRef.current;

    try {
      const rendered = await getRadarImage(frame);
      if (!mountedRef.current || sequence !== renderSequenceRef.current || mapRef.current !== map) return;
      const nextSlot = layerSlotRef.current === 0 ? 1 : 0;
      const previousSlot = layerSlotRef.current;
      const nextId = `${FRAME_ID}-${nextSlot}`;
      const previousId = `${FRAME_ID}-${previousSlot}`;

      removeRaster(map, nextId);
      map.addSource(nextId, { type: "image", url: rendered.url, coordinates: rendered.coordinates });
      map.addLayer({
        id: nextId,
        type: "raster",
        source: nextId,
        paint: {
          "raster-opacity": 0,
          "raster-fade-duration": 180,
          "raster-opacity-transition": { duration: FRAME_FADE_MS, delay: 0 },
        },
      }, map.getLayer("station") ? "station" : undefined);

      window.requestAnimationFrame(() => {
        if (!mountedRef.current || mapRef.current !== map) return;
        if (map.getLayer(nextId)) map.setPaintProperty(nextId, "raster-opacity", RASTER_OPACITY);
        if (map.getLayer(previousId)) map.setPaintProperty(previousId, "raster-opacity", 0);
      });
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = window.setTimeout(() => {
        if (mapRef.current === map) removeRaster(map, previousId);
      }, FRAME_FADE_MS + 90);
      layerSlotRef.current = nextSlot;
      markInitialFrameReady(map);

      const availableFrames = framesRef.current;
      const nextFrame = availableFrames[(frameIndexRef.current + 1) % availableFrames.length];
      if (nextFrame) getRadarImage(nextFrame).catch(() => {});
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError") && mountedRef.current) setError("Radar unavailable");
    }
  }, [getRadarImage, markInitialFrameReady]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    setMapReady(false);
    setInitialFrameReady(false);
    initialReadyRef.current = false;
    layerSlotRef.current = 0;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPEN_FREE_MAP(theme),
      center: [lon, lat],
      zoom: 6,
      maxZoom: 10,
      attributionControl: {
        compact: true,
        customAttribution: '<a href="https://registry.opendata.aws/met-office-uk-radar-observations/" target="_blank" rel="noreferrer">Met Office radar</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>',
      },
    });

    map.on("styleimagemissing", ({ id }) => {
      if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]) });
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
  }, [currentFrame, applyFrame]);

  useEffect(() => {
    if (!playing || !active || frames.length === 0) return undefined;
    const timer = window.setInterval(() => setFrameIdx((index) => (index + 1) % frames.length), PLAY_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing, active, frames.length]);

  useEffect(() => {
    if (!active || !mapRef.current) return undefined;
    const first = window.setTimeout(() => mapRef.current?.resize(), 80);
    const second = window.setTimeout(() => mapRef.current?.resize(), 280);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [active]);

  function selectFrame(next: number) {
    setPlaying(false);
    setFrameIdx(Math.max(0, Math.min(frames.length - 1, next)));
  }

  function stepFrame(delta: number) {
    if (!frames.length) return;
    setPlaying(false);
    setFrameIdx((index) => (index + delta + frames.length) % frames.length);
  }

  const frameLabel = currentFrame ? formatRadarFrameTime(currentFrame, tz) : "--:--";
  const hasFrames = frames.length > 0;
  const loading = !error && (!mapReady || !framesLoaded || (hasFrames && !initialFrameReady));

  return (
    <div className={"awx-radar" + (loading ? " is-loading" : "")}>
      <div className="awx-radar-stage">
        <div className="awx-radar-map" ref={containerRef} style={{ height: 300 }} />
        <div className={"awx-radar-loading" + (loading ? "" : " is-done")} role="status" aria-live="polite">
          <span>Loading rainfall radar</span>
          <i aria-hidden="true" />
        </div>
      </div>

      {error ? <div className="awx-radar-status is-error">Radar unavailable.</div> : null}
      {!loading && !error && !hasFrames ? <div className="awx-radar-status">No radar frames available.</div> : null}

      {!error && hasFrames ? (
        <div className="awx-radar-controls">
          <div className="awx-radar-control-row">
            <button type="button" className="awx-radar-play" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause radar animation" : "Play radar animation"} aria-pressed={playing}>
              <span className={"awx-radar-play-icon" + (playing ? " is-pause" : " is-play")} aria-hidden="true" />
              <span className="awx-radar-play-label">{playing ? "Pause" : "Play"}</span>
            </button>
            <button type="button" className="awx-radar-step" onClick={() => stepFrame(-1)} aria-label="Previous radar frame"><span className="awx-radar-step-icon is-prev" aria-hidden="true" /></button>
            <button type="button" className="awx-radar-step" onClick={() => stepFrame(1)} aria-label="Next radar frame"><span className="awx-radar-step-icon is-next" aria-hidden="true" /></button>
            <div className="awx-radar-time" aria-live="polite">
              <span className="awx-radar-time-main">{frameLabel}</span>
              <span className="awx-tag-sm">OBSERVED</span>
              <span className="awx-radar-count">{frameIdx + 1}/{frames.length}</span>
            </div>
          </div>

          <input type="range" min={0} max={frames.length - 1} step={1} value={frameIdx} aria-label="Radar frame" aria-valuetext={`${frameLabel} observed`} onChange={(event) => selectFrame(Number(event.target.value))} />

          <div className="awx-radar-frames" aria-label="Radar frame shortcuts">
            {frames.map((frame, index) => {
              const selected = index === frameIdx;
              const label = formatRadarFrameTime(frame, tz);
              return (
                <button key={frame.key} type="button" className={"awx-radar-frame" + (selected ? " is-active" : "")} aria-pressed={selected} aria-label={`Observed radar frame at ${label}`} onClick={() => selectFrame(index)}>
                  <span>{label}</span>
                  <small>Obs</small>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="awx-radar-foot">
        <span>Rings {RING_RADII.join(" / ")} km</span>
        <span className="awx-radar-scale"><i />Light <i />Heavy</span>
      </div>
    </div>
  );
}

export function RadarCard({ location, theme }: { location: AwLocation; theme: "dark" | "light" }) {
  return (
    <Card
      section="radar"
      tick="rain"
      kicker="Rainfall radar"
      detail="Observed UK Radar data © Met Office, licensed CC BY-SA 4.0 and recoloured by AceWeather. Frames update every 15 minutes. Rings mark distance from your location."
    >
      <RadarMap lat={location.lat} lon={location.lon} theme={theme} active tz={location.tz} />
    </Card>
  );
}
