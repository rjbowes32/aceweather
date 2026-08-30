"use client";

import type { FormEvent } from "react";
import type { AwLocation } from "@/lib/aceweather/open-meteo";
import { GpsIcon, SearchIcon } from "./icons";

type LocationPickerContentProps = {
  query: string;
  suggestions: AwLocation[];
  saved: AwLocation[];
  activeLocationName: string;
  currentTemperature?: string;
  gpsButtonLabel: string;
  autoFocus?: boolean;
  onQueryChange: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSelectLocation: (location: AwLocation) => void;
  onLocate: () => void;
};

export function LocationPickerContent({
  query,
  suggestions,
  saved,
  activeLocationName,
  currentTemperature,
  gpsButtonLabel,
  autoFocus = false,
  onQueryChange,
  onSubmit,
  onSelectLocation,
  onLocate,
}: LocationPickerContentProps) {
  return (
    <div className="awx-location-picker">
      <form className="awx-location-form" onSubmit={onSubmit}>
        <label className="awx-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Town, postcode or field"
            autoComplete="off"
            autoFocus={autoFocus}
          />
          <button className="awx-go" type="submit">Load</button>
        </label>
      </form>

      {suggestions.length ? (
        <section className="awx-sheet-section" aria-label="Search results">
          <div className="awx-sheet-section-title">Results</div>
          <div className="awx-sheet-list">
            {suggestions.map((location) => (
              <button key={`${location.lat},${location.lon}`} className="awx-place" type="button" onClick={() => onSelectLocation(location)}>
                <span><span className="awx-p-name">{location.name}</span><span className="awx-p-region">{[location.region, location.country].filter(Boolean).join(", ")}</span></span>
                <span className="awx-p-temp">Load</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="awx-sheet-section" aria-label="Saved places">
        <div className="awx-sheet-section-title">Saved places</div>
        <div className="awx-sheet-list">
          {saved.map((location) => {
            const active = location.name === activeLocationName;
            return (
              <button key={`${location.lat},${location.lon}`} className="awx-place" type="button" aria-pressed={active} onClick={() => onSelectLocation(location)}>
                <span><span className="awx-p-name">{location.name}</span><span className="awx-p-region">{location.region || location.country || "Saved location"}</span></span>
                <span className="awx-p-temp">{active ? currentTemperature || "Current" : "›"}</span>
              </button>
            );
          })}
        </div>
      </section>

      <button className="awx-btn awx-btn-ghost awx-location-gps" type="button" onClick={onLocate}>
        <GpsIcon /><span>{gpsButtonLabel}</span>
      </button>
    </div>
  );
}
