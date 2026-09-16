"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import styles from "./atlas.module.css";
import mapStyles from "./rain-map.module.css";
import type { AtlasFreshness, AtlasRecentRain } from "./types";

type Point = {
  key: string;
  label: string;
  lat: number;
  lon: number;
  rain: number;
};

const LOCATIONS = [
  { key: "Sleaford", label: "Sleaford", lat: 52.99944, lon: -0.41038 },
  { key: "Alford, Lincolnshire", label: "Alford", lat: 53.25221, lon: 0.17193 },
  { key: "Pocklington", label: "Pocklington", lat: 53.93223, lon: -0.77447 },
  { key: "Boroughbridge", label: "Boroughbridge", lat: 54.09417, lon: -1.39528 },
  { key: "Scotch Corner", label: "Scotch Corner", lat: 54.44115, lon: -1.6699 },
  { key: "Longhirst, Northumberland, England", label: "Longhirst", lat: 55.199, lon: -1.63 },
  { key: "Berwick-upon-Tweed", label: "Berwick", lat: 55.77016, lon: -2.00587 },
] as const;

const OPEN_FREE_MAP = "https://tiles.openfreemap.org/styles/dark";

function tone(rain: number) {
  if (rain < 15) return mapStyles.dry;
  if (rain < 30) return mapStyles.mid;
  return mapStyles.wet;
}

function rangeLabel(data: AtlasRecentRain) {
  if (!data.date_range?.end) return "Unavailable";
  const end = new Date(`${data.date_range.end}T12:00:00Z`);
  const date = end.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${data.date_range.days || 29} days · to ${date}`;
}

export function RainMap({ data, freshness }: { data: AtlasRecentRain; freshness?: AtlasFreshness }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "error">("loading");

  const points = useMemo<Point[]>(() => {
    if (data.available === false || !Array.isArray(data.locations)) return [];
    const byLocation = new Map(
      data.locations.map((row) => [String(row.location || ""), Number(row.rain_mm)] as const),
    );
    return LOCATIONS.flatMap((location) => {
      const rain = byLocation.get(location.key);
      return Number.isFinite(rain) ? [{ ...location, rain: Number(rain) }] : [];
    });
  }, [data]);

  useEffect(() => {
    if (!containerRef.current || !points.length) return undefined;
    setMapState("loading");

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OPEN_FREE_MAP,
      center: [-1.0, 54.35],
      zoom: 5.2,
      minZoom: 4,
      maxZoom: 9,
      attributionControl: { compact: true },
    });

    map.on("styleimagemissing", ({ id }) => {
      if (!map.hasImage(id)) map.addImage(id, { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]) });
    });
    map.on("error", () => setMapState("error"));

    map.scrollZoom.disable();
    map.doubleClickZoom.disable();

    const bounds = new maplibregl.LngLatBounds();
    points.forEach((point) => {
      bounds.extend([point.lon, point.lat]);

      const marker = document.createElement("div");
      marker.className = mapStyles.marker;
      marker.setAttribute("aria-label", `${point.label}: ${point.rain.toFixed(1)} millimetres rain`);
      marker.title = `${point.label}: ${point.rain.toFixed(1)} mm`;

      const bubble = document.createElement("div");
      bubble.className = `${mapStyles.bubble} ${tone(point.rain)}`;
      bubble.textContent = point.rain.toFixed(0);

      const label = document.createElement("span");
      label.className = mapStyles.label;
      label.textContent = point.label;

      marker.append(bubble, label);
      new maplibregl.Marker({ element: marker, anchor: "center" })
        .setLngLat([point.lon, point.lat])
        .addTo(map);
    });

    map.once("load", () => {
      map.fitBounds(bounds, {
        padding: { top: 42, bottom: 42, left: 42, right: 42 },
        maxZoom: 6.8,
        duration: 0,
      });
      setMapState("ready");
    });

    return () => map.remove();
  }, [points]);

  const extremes = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.rain - b.rain);
    return sorted.length ? { dry: sorted[0], wet: sorted[sorted.length - 1] } : null;
  }, [points]);

  const unavailable = data.available === false || !points.length;

  return (
    <article className={styles.panel}>
      <div className={styles.sectionHead}>
        <div><span>Recent rain</span><small>{rangeLabel(data)}</small></div>
        <i className={freshness?.state === "unavailable" ? styles.tickRisk : styles.tickRain} aria-hidden="true" />
      </div>
      {unavailable ? (
        <div className={mapStyles.unavailable} role="status">
          <span aria-hidden="true" />
          <strong>Rain data unavailable</strong>
        </div>
      ) : (
        <div className={mapStyles.mapFrame}>
          <div ref={containerRef} className={mapStyles.map} aria-label="Crop Dynamics rainfall map" />
          {mapState !== "ready" ? (
            <div className={`${mapStyles.mapStatus} ${mapState === "error" ? mapStyles.error : ""}`} role="status">
              {mapState === "error" ? "Map unavailable" : "Loading map"}
            </div>
          ) : null}
        </div>
      )}
      {extremes ? (
        <>
          <div className={mapStyles.summary}>
            <span>Driest <strong>{extremes.dry.label} {extremes.dry.rain.toFixed(1)} mm</strong></span>
            <span>Wettest <strong>{extremes.wet.label} {extremes.wet.rain.toFixed(1)} mm</strong></span>
          </div>
          <ul className={mapStyles.srOnly} aria-label="Rainfall by Atlas location">
            {points.map((point) => <li key={point.key}>{point.label}: {point.rain.toFixed(1)} mm</li>)}
          </ul>
        </>
      ) : null}
    </article>
  );
}
