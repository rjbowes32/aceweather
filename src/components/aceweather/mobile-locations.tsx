// @ts-nocheck
"use client";

export function MobileLocationLists({ suggestions, savedLocations, onPick, onRemove }) {
  return (
    <>
      {suggestions.length ? (
        <div className="aw2-m-location-suggestions">
          {suggestions.map((location) => (
            <button key={`${location.lat}-${location.lon}`} type="button" onClick={() => onPick(location)}>
              <span>{location.name}</span>
              <small>{[location.region, location.country].filter(Boolean).join(", ")}</small>
            </button>
          ))}
        </div>
      ) : null}
      {savedLocations.length ? (
        <div className="aw2-m-saved-locations" aria-label="Saved locations">
          {savedLocations.map((location) => (
            <span key={`${location.lat}-${location.lon}`} className="aw2-m-saved-pill">
              <button type="button" onClick={() => onPick(location)}>
                {location.name}
              </button>
              <button
                type="button"
                className="aw2-m-saved-remove"
                aria-label={`Remove ${location.name}`}
                onClick={() => onRemove(location)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
