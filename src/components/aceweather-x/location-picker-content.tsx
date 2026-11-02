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
  gpsStatus?: string;
  searchEmpty?: boolean;
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
  gpsStatus,
  searchEmpty = false,
  autoFocus = false,
  onQueryChange,
  onSubmit,
  onSelectLocation,
  onLocate,
}: LocationPickerContentProps) {
  return (
    <div className="awx-location-picker">
      <form className="awx-location-form" onSubmit={onSubmit} role="search">
        <label className="awx-search">
          <SearchIcon />
          <input
            type="search"
            enterKeyHint="search"
            aria-label="Search for a location"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Town or postcode"
            autoComplete="off"
            autoFocus={autoFocus}
          />
          {query.trim() ? <button className="awx-go" type="submit">Load</button> : null}
        </label>
      </form>

      {suggestions.length ? (
        <div className="awx-loc-list" role="group" aria-label="Search results">
          {suggestions.map((location) => (
            <button key={`${location.lat},${location.lon}`} className="awx-place" type="button" onClick={() => onSelectLocation(location)}>
              <span className="awx-p-line"><span className="awx-p-name">{location.name}</span><span className="awx-p-region">{[location.region, location.country].filter(Boolean).join(", ")}</span></span>
              <span className="awx-p-temp" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      ) : null}

      {searchEmpty ? <div className="awx-loc-empty" role="status">No places found. Try a town or postcode.</div> : null}
      {suggestions.length || searchEmpty ? <div className="awx-loc-label" aria-hidden="true">Saved</div> : null}
      <div className="awx-loc-list" role="group" aria-label="Saved places">
        <button className={"awx-loc-gps awx-location-gps" + (gpsStatus === "blocked" ? " is-blocked" : "") + (gpsStatus === "following" ? " is-on" : "")} type="button" onClick={onLocate} disabled={gpsStatus === "locating"}>
          <GpsIcon /><span>{gpsButtonLabel}</span>
        </button>
        {saved.map((location) => {
          const active = location.name === activeLocationName;
          const region = location.region || location.country || "";
          return (
            <button key={`${location.lat},${location.lon}`} className="awx-place" type="button" aria-pressed={active} aria-label={[location.name, region, active ? "selected" : "", active && currentTemperature ? currentTemperature : ""].filter(Boolean).join(", ")} onClick={() => onSelectLocation(location)}>
              <span className="awx-p-line" aria-hidden="true"><span className="awx-p-name">{location.name}</span>{region ? <span className="awx-p-region">{region}</span> : null}</span>
              <span className="awx-p-temp">{active ? <><span className="awx-p-tick" aria-hidden="true">✓</span>{currentTemperature ? <span>{currentTemperature}</span> : null}</> : null}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
