"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import type { FeatureCollection, LineString, Position } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AwLocation } from "@/lib/aceweather/open-meteo";
import {
  fetchMetOfficeRadarFrames,
  formatRadarAge,
  formatRadarFrameTime,
  metOfficeRadarUrl,
  type MetOfficeRadarFrame,
  type RadarIndex,
} from "@/lib/aceweather/met-office-radar";
import { nearestPaletteIndex, PALETTE, PALETTE_BANDS, radarPixel } from "@/lib/aceweather/radar-palette";
import { Card } from "./ui";

const OPEN_FREE_MAP = (theme: "dark" | "light") =>
  `https://tiles.openfreemap.org/styles/${theme === "light" ? "positron" : "dark"}`;

const FRAME_ID = "awx-radar-frame";
const STEP_MS = 900;
const LATEST_DWELL_MS = 2400;
const FRAME_FADE_MS = 320;
const RASTER_OPACITY = 0.86;
const RING_RADII = [25, 50, 100, 200];
const REFRESH_MS = 5 * 60_000;
const LEGEND = [2, 3, 4, 5, 6, 7, 8, 9].map((i) => `rgba(${PALETTE[i].slice(0, 3).join(",")},${(PALETTE[i][3] / 255).toFixed(2)})`);
const NO_RADAR = `rgba(${PALETTE[1].slice(0, 3).join(",")},${Math.min(1, (PALETTE[1][3] / 255) * 2.4).toFixed(2)})`;

type LoadedFrame = { band: number | null };

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

/** Downloads a frame image (warming the HTTP cache for the map) and reads the rain band at the user's location. */
async function loadFrame(frame: MetOfficeRadarFrame, lat: number, lon: number): Promise<LoadedFrame> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  // load/error rather than decode(): decode() can wait indefinitely for a paint that a throttled page never gets.
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Radar frame failed to load"));
    image.src = metOfficeRadarUrl(frame);
  });
  const pixel = radarPixel(lat, lon, image.naturalWidth, image.naturalHeight);
  if (!pixel) return { band: null };
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return { band: null };
    context.drawImage(image, pixel[0], pixel[1], 1, 1, 0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return { band: nearestPaletteIndex(r, g, b, a) };
  } catch {
    return { band: null };
  }
}

type RadarMapProps = { lat: number; lon: number; theme: "dark" | "light"; active: boolean; tz?: string };

export function RadarMap({ lat, lon, theme, active, tz }: RadarMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const indexRef = useRef<RadarIndex | null>(null);
  const frameRef = useRef<MetOfficeRadarFrame | null>(null);
  const mountedRef = useRef(false);
  const layerSlotRef = useRef(0);
  const fadeTimerRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);
  const loadsRef = useRef(new Map<string, Promise<LoadedFrame>>());
  const shownRef = useRef<string | null>(null);
  // MapLibre's isStyleLoaded() also waits for tiles, so track the style.load event directly.
  const loadedRef = useRef(false);

  const [index, setIndex] = useState<RadarIndex | null>(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [shownStamp, setShownStamp] = useState<string | null>(null);
  const [bands, setBands] = useState<Record<string, number | null>>({});
  const [now, setNow] = useState(() => Date.now());

  const frames = useMemo(() => index?.frames ?? [], [index]);
  const currentFrame = frames[frameIdx] ?? null;

  useEffect(() => {
    mountedRef.current = true;
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      mountedRef.current = false;
      sequenceRef.current += 1;
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(clock);
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    indexRef.current = index;
    frameRef.current = currentFrame;
  }, [index, currentFrame]);

  // Frame list: load once, then refresh every few minutes while the radar is on screen.
  useEffect(() => {
    if (!visible) return undefined;
    const controller = new AbortController();
    const load = () => fetchMetOfficeRadarFrames(controller.signal)
      .then((next) => {
        if (!mountedRef.current) return;
        setError(null);
        const previous = indexRef.current;
        if (previous && previous.frames.at(-1)?.stamp === next.frames.at(-1)?.stamp) return;
        indexRef.current = next;
        setIndex(next);
        setFrameIdx(Math.max(0, next.frames.length - 1));
      })
      .catch((caught: unknown) => {
        if (!(caught instanceof DOMException && caught.name === "AbortError") && mountedRef.current && !indexRef.current) setError("Radar unavailable");
      });
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [visible]);

  const loadOnce = useCallback((frame: MetOfficeRadarFrame) => {
    const cached = loadsRef.current.get(frame.stamp);
    if (cached) return cached;
    const attempt = () => loadFrame(frame, lat, lon);
    // One retry covers a cold server or a dropped connection; a frame that still fails is skipped, not fatal.
    const pending = attempt().catch(() => new Promise<void>((resolve) => window.setTimeout(resolve, 1200)).then(attempt)).then((loaded) => {
      if (mountedRef.current) setBands((previous) => ({ ...previous, [frame.stamp]: loaded.band }));
      return loaded;
    }).catch((caught) => {
      loadsRef.current.delete(frame.stamp);
      throw caught;
    });
    loadsRef.current.set(frame.stamp, pending);
    return pending;
  }, [lat, lon]);

  // Warm every frame in the background, newest first, so playback never waits.
  useEffect(() => {
    if (!frames.length) return;
    let cancelled = false;
    (async () => {
      for (const frame of [...frames].reverse()) {
        if (cancelled) return;
        await loadOnce(frame).catch(() => {});
      }
    })();
    return () => { cancelled = true; };
  }, [frames, loadOnce]);

  const applyFrame = useCallback(async () => {
    const map = mapRef.current;
    const frame = frameRef.current;
    const corners = indexRef.current?.corners;
    if (!map || !frame || !corners || !loadedRef.current) return;
    const sequence = ++sequenceRef.current;
    try {
      await loadOnce(frame);
      if (!mountedRef.current || sequence !== sequenceRef.current || mapRef.current !== map) return;
      const nextSlot = layerSlotRef.current === 0 ? 1 : 0;
      const previousId = `${FRAME_ID}-${layerSlotRef.current}`;
      const nextId = `${FRAME_ID}-${nextSlot}`;
      removeRaster(map, nextId);
      map.addSource(nextId, { type: "image", url: metOfficeRadarUrl(frame), coordinates: corners });
      map.addLayer({
        id: nextId,
        type: "raster",
        source: nextId,
        paint: { "raster-opacity": 0, "raster-fade-duration": 0, "raster-resampling": "nearest", "raster-opacity-transition": { duration: FRAME_FADE_MS, delay: 0 } },
      }, map.getLayer("rings") ? "rings" : undefined);
      window.requestAnimationFrame(() => {
        if (!mountedRef.current || mapRef.current !== map) return;
        if (map.getLayer(nextId)) map.setPaintProperty(nextId, "raster-opacity", RASTER_OPACITY);
        if (map.getLayer(previousId)) map.setPaintProperty(previousId, "raster-opacity", 0);
      });
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = window.setTimeout(() => { if (mapRef.current === map) removeRaster(map, previousId); }, FRAME_FADE_MS + 90);
      layerSlotRef.current = nextSlot;
      shownRef.current = frame.stamp;
      setShownStamp(frame.stamp);
    } catch {
      // Keep the last good frame on screen; only report failure when nothing can be shown.
      if (mountedRef.current && !shownRef.current && frame.stamp === indexRef.current?.frames.at(-1)?.stamp) setError("Radar unavailable");
    }
  }, [loadOnce]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    setMapReady(false);
    loadedRef.current = false;
    layerSlotRef.current = 0;
    const container = containerRef.current;
    const map = new maplibregl.Map({
      container,
      style: OPEN_FREE_MAP(theme),
      center: [lon, lat],
      zoom: 6,
      minZoom: 4,
      maxZoom: 10,
      // Full credits are shown in the card footer, next to the map, so the overlay control is not needed.
      attributionControl: false,
    });
    map.on("styleimagemissing", ({ id }) => {
      if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]) });
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // Add overlays as soon as the style is parsed rather than on "load", which also waits for every base tile.
    map.once("style.load", () => {
      if (!mountedRef.current) return;
      map.addSource("rings", { type: "geojson", data: rings(lat, lon, RING_RADII) });
      map.addLayer({ id: "rings", type: "line", source: "rings", paint: { "line-color": theme === "light" ? "#2f6cf0" : "#6ea0ff", "line-width": 0.6, "line-opacity": 0.4, "line-dasharray": [2, 2] } });
      map.addSource("station", { type: "geojson", data: { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lon, lat] } }] } });
      map.addLayer({ id: "station", type: "circle", source: "station", paint: { "circle-radius": 4.5, "circle-color": "#e0b15e", "circle-stroke-color": theme === "light" ? "#fff" : "#0a0b0d", "circle-stroke-width": 1.5 } });
      loadedRef.current = true;
      setMapReady(true);
    });
    mapRef.current = map;
    return () => {
      if (fadeTimerRef.current) window.clearTimeout(fadeTimerRef.current);
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lon, theme]);

  useEffect(() => {
    if (mapReady) applyFrame();
  }, [currentFrame, mapReady, applyFrame]);

  // Playback: step through the frames and rest on the latest one before looping.
  useEffect(() => {
    if (!playing || !active || !visible || !shownStamp || frames.length < 2) return undefined;
    const delay = frameIdx === frames.length - 1 ? LATEST_DWELL_MS : STEP_MS;
    const timer = window.setTimeout(() => setFrameIdx((i) => (i + 1) % frames.length), delay);
    return () => window.clearTimeout(timer);
  }, [playing, active, visible, shownStamp, frameIdx, frames.length]);

  useEffect(() => {
    if (!active || !mapRef.current) return undefined;
    const first = window.setTimeout(() => mapRef.current?.resize(), 80);
    const second = window.setTimeout(() => mapRef.current?.resize(), 280);
    return () => { window.clearTimeout(first); window.clearTimeout(second); };
  }, [active]);

  function selectFrame(next: number) {
    setPlaying(false);
    setFrameIdx(Math.max(0, Math.min(frames.length - 1, next)));
  }

  function stepFrame(delta: number) {
    if (!frames.length) return;
    setPlaying(false);
    setFrameIdx((i) => (i + delta + frames.length) % frames.length);
  }

  const shownFrame = frames.find((f) => f.stamp === shownStamp) ?? null;
  const frameLabel = shownFrame ? formatRadarFrameTime(shownFrame, tz) : "--:--";
  const age = shownFrame ? formatRadarAge(shownFrame.time, now) : "";
  const latest = frames.at(-1);
  const hereBand = latest ? bands[latest.stamp] : undefined;
  const here = hereBand == null ? null : PALETTE_BANDS[hereBand];
  const loading = !error && (!mapReady || !index || (frames.length > 0 && !shownStamp));
  const stale = latest ? now - latest.time > 45 * 60_000 : false;

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
      {!loading && !error && !frames.length ? <div className="awx-radar-status">No radar frames available.</div> : null}

      {!error && frames.length ? (
        <div className="awx-radar-controls">
          <div className="awx-radar-now">
            <div className="awx-radar-time">
              <span className="awx-tag-sm">Observed</span>
              <span className="awx-radar-time-main">{frameLabel}</span>
              <span className={"awx-radar-age" + (stale && shownFrame?.stamp === latest?.stamp ? " is-stale" : "")}>{age}</span>
            </div>
            {here ? <span className={"awx-radar-here" + (here.rain ? " is-rain" : "")}>{hereBand === 1 ? "No radar here" : `${here.label} here`}</span> : null}
          </div>
          <div className="awx-radar-control-row">
            <button type="button" className="awx-radar-play" onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause radar animation" : "Play radar animation"} aria-pressed={playing}>
              <span className={"awx-radar-play-icon" + (playing ? " is-pause" : " is-play")} aria-hidden="true" />
            </button>
            <button type="button" className="awx-radar-step" onClick={() => stepFrame(-1)} aria-label="Previous radar frame"><span className="awx-radar-step-icon is-prev" aria-hidden="true" /></button>
            <input type="range" min={0} max={frames.length - 1} step={1} value={frameIdx} aria-label="Radar frame" aria-valuetext={`${currentFrame ? formatRadarFrameTime(currentFrame, tz) : ""} observed`} onChange={(event) => selectFrame(Number(event.target.value))} />
            <button type="button" className="awx-radar-step" onClick={() => stepFrame(1)} aria-label="Next radar frame"><span className="awx-radar-step-icon is-next" aria-hidden="true" /></button>
          </div>
        </div>
      ) : null}

      <div className="awx-radar-foot">
        <div className="awx-radar-legend" role="img" aria-label="Rain rate from light, under 1 millimetre an hour, to very heavy, over 16. Grey shows no radar coverage.">
          <span>Light</span>
          <span className="awx-radar-ramp" aria-hidden="true">{LEGEND.map((colour) => <i key={colour} style={{ background: colour }} />)}</span>
          <span>Heavy</span>
          <span className="awx-radar-norad"><i aria-hidden="true" style={{ background: NO_RADAR }} />No radar</span>
        </div>
        <div className="awx-radar-credit">
          Radar © <a href="https://registry.opendata.aws/met-office-uk-radar-observations/" target="_blank" rel="noreferrer">Met Office</a>, <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a> · Map <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a>, data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
        </div>
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
      detail="Observed UK radar from the Met Office (CC BY-SA 4.0), reprojected and recoloured by AceWeather. A new frame arrives every 15 minutes, usually 10 to 20 minutes after it was observed. Rings mark 25, 50, 100 and 200 km from your location. Rain rate bands: light under 1 mm/h, moderate 1 to 4, heavy 4 to 16, very heavy over 16."
    >
      <RadarMap lat={location.lat} lon={location.lon} theme={theme} active tz={location.tz} />
    </Card>
  );
}
