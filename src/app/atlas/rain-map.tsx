"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./atlas.module.css";

type Point = {
  key: string;
  label: string;
  lat: number;
  lon: number;
  rain: number;
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

const BOUNDS = { minLon: -2.6, maxLon: 0.7, minLat: 52.6, maxLat: 56.0 };

function mercatorY(lat: number) {
  const radians = lat * Math.PI / 180;
  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
}

function position(lat: number, lon: number) {
  const left = (lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon) * 100;
  const maxY = mercatorY(BOUNDS.maxLat);
  const minY = mercatorY(BOUNDS.minLat);
  const top = (maxY - mercatorY(lat)) / (maxY - minY) * 100;
  return { left: `${left}%`, top: `${top}%` };
}

function rainClass(rain: number) {
  if (rain < 15) return styles.mapDotDry;
  if (rain < 30) return styles.mapDotMid;
  return styles.mapDotWet;
}

export function RainMap() {
  const [points, setPoints] = useState<Point[]>(FALLBACK);
  const [range, setRange] = useState("29 days to 8 Aug");

  useEffect(() => {
    let active = true;
    fetch("/api/cropdynamics")
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("rain fetch failed")))
      .then((data) => {
        if (!active || !Array.isArray(data?.locations)) return;
        const byQuery = new Map(data.locations.map((row: any) => [String(row.query || ""), Number(row.rain_mm)]));
        const next = FALLBACK.map((point) => {
          const rain = byQuery.get(point.key);
          return Number.isFinite(rain) ? { ...point, rain } : point;
        });
        setPoints(next);
        if (data?.date_range?.end) {
          const end = new Date(`${data.date_range.end}T12:00:00Z`);
          const label = end.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          setRange(`${data.date_range.days || 29} days to ${label}`);
        }
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const extremes = useMemo(() => {
    const sorted = [...points].sort((a, b) => a.rain - b.rain);
    return { dry: sorted[0], wet: sorted[sorted.length - 1] };
  }, [points]);

  return (
    <article className={styles.panel}>
      <div className={styles.sectionHead}><h2>Recent rain map</h2><span>AceWeather · {range}</span></div>
      <div className={styles.mapFrame}>
        <iframe
          className={styles.mapBase}
          title="Eastern UK Crop Dynamics rainfall map"
          src="https://www.openstreetmap.org/export/embed.html?bbox=-2.6%2C52.6%2C0.7%2C56.0&layer=mapnik"
          loading="lazy"
          aria-hidden="true"
          tabIndex={-1}
        />
        <div className={styles.mapOverlay} aria-label="Crop Dynamics rainfall locations">
          {points.map((point) => {
            const size = Math.max(22, Math.min(42, 20 + Math.sqrt(point.rain) * 2.5));
            return (
              <div
                className={`${styles.mapMarker} ${rainClass(point.rain)}`}
                key={point.label}
                style={{ ...position(point.lat, point.lon), width: size, height: size }}
                title={`${point.label}: ${point.rain.toFixed(1)} mm`}
              >
                <strong>{point.rain.toFixed(0)}</strong>
                <span>{point.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.mapSummary}>
        <span>Driest <strong>{extremes.dry.label} {extremes.dry.rain.toFixed(1)} mm</strong></span>
        <span>Wettest <strong>{extremes.wet.label} {extremes.wet.rain.toFixed(1)} mm</strong></span>
      </div>
    </article>
  );
}
