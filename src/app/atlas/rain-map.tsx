// @ts-nocheck
"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import styles from "./atlas.module.css";
import mapStyles from "./rain-map.module.css";

type Point = {
  key: string;
  label: string;
  lat: number;
  lon: number;
  rain: number;
};

type CropDynamicsRow = {
  query?: string;
  rain_mm?: number;
};

type CropDynamicsResponse = {
  locations?: CropDynamicsRow[];
  date_range?: {
    end?: string;
    days?: number;
  };
};

const FALLBACK: Point[] = [
  { key: "Sleaford", label: "Sleaford", lat: 52.99944, lon: -0.41038, rain: 4.8 },
  { key: "Alford, Lincolnshire", label: "Alford", lat: 53.25221, lon: 0.17193, rain: 10.6 },
  { key: "Pocklington", label: "Pocklington", lat: 53.93223, lon: -0.77447, rain: 9.2 },
  { key: "Boroughbridge", label: "Boroughbridge", lat: 54.09417, lon: -1.39528, rain: 10.7 },
  { key: "Scotch Corner", label: "Scotch Corner", lat: 54.44115, lon: -1.6699, rain: 9.2 },
  { key: "Longhirst, Northumberland, England", label: "Longhirst", lat: 55.199, lon: -1.63, rain: 35.5 },
  { key: "Berwick-upon-Tweed", label: "Berwick", lat: 55.77016, lon: -2.00587, rain: 55.4 },
];

const CARTO = [
  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
  "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
];

function tone(rain: number) {
  if (rain < 15) return mapStyles.dry;
  if (rain < 30) return mapStyles.mid;
  return mapStyles.wet;
}

export function RainMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [points, setPoints] = useState<Point[]>(FALLBACK);
  const [range, setRange] = useState("29 days to 8 Aug");

  useEffect(() => {
    let active = true;

    fetch("/api/cropdynamics")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("rain fetch failed")))
      .then((raw: CropDynamicsResponse) => {
        if (!active || !Array.isArray(raw.locations)) return;

        const byQuery = new Map<string, number>(
          raw.locations.map((row) => [String(row.query || ""), Number(row.rain_mm)] as [string, number]),
        );

        setPoints(FALLBACK.map((point) => {
          const rain = byQuery.get(point.key);
          return rain !== undefined && Number.isFinite(rain) ? { ...point, rain } : point;
        }));

        if (raw.date_range?.end) {
          const end = new Date(`${raw.date_range.end}T12:00:00Z`);
          const label = end.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          setRange(`${raw.date_range.days || 29} days to ${label}`);
        }
      })
      .catch(() => {});

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          base: {
            type: "raster",
            tiles: CARTO,
            tileSize: 256,
            attribution: "OpenStreetMap contributors / CARTO",
          },
        },
        layers: [{ id: "base", type: "raster", source: "base" }],
      },
      center: [-1.0, 54.35],
      zoom: 5.2,
      minZoom: 4,
      maxZoom: 9,
      attributionControl: { compact: true },
    });

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
    });

    return () => map.remove();
  }, [points]);

  const extremes = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.rain - b.rain);
    return { dry: sorted[0], wet: sorted[sorted.length - 1] };
  }, [points]);

  return (
    <article className={styles.panel}>
      <div className={styles.sectionHead}><h2>Recent rain map</h2><span>AceWeather · {range}</span></div>
      <div ref={containerRef} className={mapStyles.map} aria-label="Crop Dynamics rainfall map" />
      <div className={mapStyles.summary}>
        <span>Driest <strong>{extremes.dry.label} {extremes.dry.rain.toFixed(1)} mm</strong></span>
        <span>Wettest <strong>{extremes.wet.label} {extremes.wet.rain.toFixed(1)} mm</strong></span>
      </div>
    </article>
  );
}
