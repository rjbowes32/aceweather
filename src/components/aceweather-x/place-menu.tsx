"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import type { AwLocation } from "@/lib/aceweather/open-meteo";
import { HERE_NAME, placeKey } from "@/lib/aceweather/places";
import { CloseIcon } from "./icons";

type PlaceSlotProps = {
  open: boolean;
  name: string;
  region: string;
  query: string;
  onOpen: () => void;
  onClose: () => void;
  onQuery: (query: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

/** The place name, or the search field that replaces it. */
export function PlaceSlot({ open, name, region, query, onOpen, onClose, onQuery, onSubmit }: PlaceSlotProps) {
  return (
    <div className="awx-place-slot">
      {open ? (
        <form className="awx-place-search" onSubmit={onSubmit} role="search">
          <input
            type="search"
            aria-label="Search for a place"
            placeholder="Town or postcode"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
          <button className="awx-icon-btn" type="button" aria-label="Close" onClick={onClose}><CloseIcon /></button>
        </form>
      ) : (
        <button className="awx-location-trigger" type="button" onClick={onOpen} aria-label={`Change place. ${[name, region].filter(Boolean).join(", ")}`}>
          <strong>{name}</strong>
          {region ? <small>{region}</small> : null}
        </button>
      )}
    </div>
  );
}

type PlaceMenuProps = {
  query: string;
  suggestions: AwLocation[];
  saved: AwLocation[];
  note: string | null;
  hereDetail: string;
  hereOn: boolean;
  activeKey: string | null;
  temperature?: string;
  onSelect: (location: AwLocation) => void;
  onHere: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMove: (fromId: string, toId: string) => void;
};

function PlaceLine({ name, region, active, temperature }: { name: string; region: string; active: boolean; temperature?: string }) {
  return (
    <>
      <span className="awx-p-name">{name}</span>
      {region ? <span className="awx-p-region">{region}</span> : null}
      {active ? <span className="awx-p-temp"><span className="awx-p-tick" aria-hidden="true">✓</span>{temperature ? <span>{temperature}</span> : null}</span> : null}
    </>
  );
}

function SavedRow({
  place,
  active,
  temperature,
  onSelect,
  onRename,
  onDelete,
  onMove,
}: {
  place: AwLocation;
  active: boolean;
  temperature?: string;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onMove: (overId: string) => void;
}) {
  const id = placeKey(place);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);
  const dragging = useRef(false);
  const [shift, setShift] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(place.name);

  /** Rows in this menu only. The phone and desktop headers each draw a copy of the list. */
  function siblingIds(from: HTMLElement): string[] {
    const menu = from.closest(".awx-place-menu");
    return [...(menu?.querySelectorAll<HTMLElement>("[data-place-id]") ?? [])].map((row) => row.getAttribute("data-place-id") || "");
  }

  // Swipe left on the row face for Rename and Delete. Vertical movement is left to the page scroll.
  // The pointer is captured only once a swipe has started, so a plain tap still clicks the row button.
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("input, .awx-place-grip")) return;
    start.current = { x: event.clientX, y: event.clientY };
    moved.current = false;
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    if (!moved.current && Math.abs(dy) > Math.abs(dx)) return;
    if (dx < -8) {
      if (!moved.current) event.currentTarget.setPointerCapture(event.pointerId);
      moved.current = true;
      setShift(Math.max(dx, -156));
    }
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!start.current) return;
    const dx = event.clientX - start.current.x;
    start.current = null;
    if (!moved.current) return;
    if (dx < -48) setShift(-156);
    else setShift(0);
  }

  // Reorder from the grip only. It sets touch-action: none, so a phone drags instead of scrolling.
  function onGripDown(event: PointerEvent<HTMLButtonElement>) {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onGripMove(event: PointerEvent<HTMLButtonElement>) {
    if (!dragging.current) return;
    const menu = event.currentTarget.closest(".awx-place-menu");
    const overId = [...(menu?.querySelectorAll<HTMLElement>("[data-place-id]") ?? [])].find((row) => {
      const box = row.getBoundingClientRect();
      return event.clientY >= box.top && event.clientY <= box.bottom;
    })?.getAttribute("data-place-id");
    if (overId && overId !== id) onMove(overId);
  }
  function onGripUp() {
    dragging.current = false;
  }
  function onGripKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    const ids = siblingIds(event.currentTarget);
    const target = ids[ids.indexOf(id) + (event.key === "ArrowUp" ? -1 : 1)];
    if (target) onMove(target);
  }
  function commitRename(event?: FormEvent) {
    event?.preventDefault();
    const next = draft.trim();
    if (next && next !== place.name) onRename(next);
    setEditing(false);
  }

  return (
    <div className="awx-place-swipe" data-place-id={id}>
      <div className="awx-place-swipe-actions">
        <button type="button" onClick={() => { setDraft(place.name); setEditing(true); setShift(0); }}>Rename</button>
        <button type="button" className="is-delete" onClick={onDelete}>Delete</button>
      </div>
      <div className="awx-place-swipe-face" style={{ transform: `translateX(${shift}px)` }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
        {editing ? (
          <form onSubmit={commitRename}>
            <input
              className="awx-place-rename-input"
              aria-label={`Rename ${place.name}`}
              value={draft}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => commitRename()}
              onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setEditing(false); } }}
            />
          </form>
        ) : (
          <button
            className="awx-place-row"
            type="button"
            aria-pressed={active}
            aria-label={[place.name, place.region, active ? "selected" : ""].filter(Boolean).join(", ")}
            onClick={() => { if (moved.current) { moved.current = false; return; } onSelect(); }}
          >
            <PlaceLine name={place.name} region={place.region} active={active} temperature={temperature} />
          </button>
        )}
        {editing ? null : (
          <button
            className="awx-place-grip"
            type="button"
            aria-label={`Move ${place.name}. Use the up and down arrow keys.`}
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
            onKeyDown={onGripKey}
          >
            <span aria-hidden="true">≡</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Results under the header. An empty search lists Here and the saved places. */
export function PlaceMenu({
  query,
  suggestions,
  saved,
  note,
  hereDetail,
  hereOn,
  activeKey,
  temperature,
  onSelect,
  onHere,
  onRename,
  onDelete,
  onMove,
}: PlaceMenuProps) {
  const searching = query.trim().length >= 2;
  return (
    <div className="awx-place-menu" role="group" aria-label="Places">
      {note ? <div className="awx-place-note" role="status">{note}</div> : null}
      {searching ? suggestions.map((place) => (
        <button key={`${place.lat},${place.lon},${place.name}`} className="awx-place-row" type="button" onClick={() => onSelect(place)}>
          <PlaceLine name={place.name} region={place.region} active={false} />
        </button>
      )) : (
        <>
          <button className={"awx-place-row awx-place-here" + (hereOn ? " is-on" : "")} type="button" aria-pressed={hereOn} onClick={onHere}>
            <PlaceLine name={HERE_NAME} region={hereDetail} active={hereOn} temperature={hereOn ? temperature : undefined} />
          </button>
          {saved.map((place) => {
            const key = placeKey(place);
            return (
              <SavedRow
                key={key}
                place={place}
                active={activeKey === key}
                temperature={activeKey === key ? temperature : undefined}
                onSelect={() => onSelect(place)}
                onRename={(name) => onRename(key, name)}
                onDelete={() => onDelete(key)}
                onMove={(overId) => onMove(key, overId)}
              />
            );
          })}
        </>
      )}
    </div>
  );
}
