// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";

import { locationId as awLocationId } from "@/lib/store";

const KEY_PREFIX = "aceweather.rainGauge.v1.";

function storageKey(location) {
  return KEY_PREFIX + awLocationId(location.lat, location.lon);
}

function loadEntries(location) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(location));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && typeof e.date === "string" && typeof e.mm === "number" && Number.isFinite(e.mm))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  } catch {
    return [];
  }
}

function saveEntries(location, entries) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(location), JSON.stringify(entries));
  } catch { /* swallow quota */ }
}

function todayIso() {
  const d = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatDateShort(iso) {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  } catch {
    return iso;
  }
}

function lastNDates(n) {
  const out = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push(`${yy}-${mm}-${dd}`);
  }
  return out;
}

function sumWithin(entries, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (days - 1));
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  return entries.filter((e) => e.date >= cutoffIso).reduce((a, b) => a + b.mm, 0);
}

export const RainGauge = ({ location }) => {
  const [entries, setEntries] = useState([]);
  const [date, setDate] = useState(todayIso());
  const [mm, setMm] = useState("");
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setEntries(loadEntries(location));
    setEditing(null);
    setStatus("");
  }, [location.lat, location.lon]);

  function persist(next) {
    setEntries(next);
    saveEntries(location, next);
  }

  function submit(e) {
    e.preventDefault();
    const value = parseFloat(mm);
    if (!date || !Number.isFinite(value) || value < 0) {
      setStatus("Enter a date and value (mm)");
      return;
    }
    const others = entries.filter((x) => x.date !== date);
    const next = [...others, { date, mm: Math.round(value * 10) / 10 }].sort((a, b) => (a.date < b.date ? 1 : -1));
    persist(next);
    setMm("");
    setEditing(null);
    setStatus(`Saved ${value.toFixed(1)} mm for ${formatDateShort(date)}`);
  }

  function startEdit(entry) {
    setDate(entry.date);
    setMm(String(entry.mm));
    setEditing(entry.date);
    setStatus(`Editing ${formatDateShort(entry.date)}`);
  }

  function remove(entry) {
    const next = entries.filter((x) => x.date !== entry.date);
    persist(next);
    if (editing === entry.date) { setEditing(null); setMm(""); }
    setStatus(`Removed ${formatDateShort(entry.date)}`);
  }

  const total7 = useMemo(() => sumWithin(entries, 7), [entries]);
  const total30 = useMemo(() => sumWithin(entries, 30), [entries]);
  const totalAll = useMemo(() => entries.reduce((a, b) => a + b.mm, 0), [entries]);
  const wettest = useMemo(() => entries.reduce((acc, e) => (e.mm > (acc?.mm ?? -1) ? e : acc), null), [entries]);

  const chartDates = useMemo(() => lastNDates(14), []);
  const byDate = useMemo(() => Object.fromEntries(entries.map((e) => [e.date, e.mm])), [entries]);
  const chartMax = Math.max(1, ...chartDates.map((d) => byDate[d] || 0));

  return (
    <div className="aw2-m-gauge">
      <form className="aw2-m-gauge-form" onSubmit={submit}>
        <label className="aw2-m-gauge-field">
          <span>Date</span>
          <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label className="aw2-m-gauge-field">
          <span>Reading (mm)</span>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={mm}
            placeholder="0.0"
            onChange={(e) => setMm(e.target.value)}
            required
          />
        </label>
        <button type="submit">{editing ? "Update" : "Add"}</button>
        {editing ? (
          <button type="button" className="cancel" onClick={() => { setEditing(null); setMm(""); setDate(todayIso()); setStatus(""); }}>Cancel</button>
        ) : null}
      </form>

      {status ? <div className="aw2-m-gauge-status" role="status" aria-live="polite">{status}</div> : null}

      <div className="aw2-m-gauge-totals">
        <div className="cell"><div className="k">7-day</div><div className="v">{total7.toFixed(1)}<small>mm</small></div></div>
        <div className="cell"><div className="k">30-day</div><div className="v">{total30.toFixed(1)}<small>mm</small></div></div>
        <div className="cell"><div className="k">All-time</div><div className="v">{totalAll.toFixed(1)}<small>mm</small></div></div>
        <div className="cell"><div className="k">Wettest</div><div className="v">{wettest ? wettest.mm.toFixed(1) : "—"}<small>{wettest ? "mm" : ""}</small></div></div>
      </div>

      <div className="aw2-m-gauge-chart" aria-label="Rain gauge · last 14 days">
        {chartDates.map((d) => {
          const v = byDate[d] || 0;
          const h = Math.max(2, Math.round((v / chartMax) * 60));
          return (
            <div key={d} className="bar-wrap" title={`${formatDateShort(d)} · ${v.toFixed(1)} mm`}>
              <div className={"bar" + (v < 0.1 ? " dry" : "")} style={{ height: h + "px" }} />
              <div className="lbl">{d.slice(8, 10)}</div>
            </div>
          );
        })}
      </div>

      <div className="aw2-m-gauge-list">
        {entries.length === 0 ? (
          <div className="empty">No readings yet. Add your first above.</div>
        ) : (
          entries.slice(0, 30).map((e) => (
            <div key={e.date} className={"row" + (editing === e.date ? " editing" : "")}>
              <div className="d">{formatDateShort(e.date)}</div>
              <div className={"mm" + (e.mm < 0.1 ? " dry" : "")}>{e.mm.toFixed(1)}<small>mm</small></div>
              <button type="button" onClick={() => startEdit(e)} aria-label={`Edit ${e.date}`}>Edit</button>
              <button type="button" className="del" onClick={() => remove(e)} aria-label={`Remove ${e.date}`}>×</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
