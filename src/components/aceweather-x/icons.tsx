/* Thin line icons (24x24, stroke=currentColor). Inherit sizing/stroke from CSS. */
import type { ReactNode } from "react";
import type { ConditionKey } from "@/lib/aceweather/format";

const P = (d: string) => <path d={d} />;

const NAV: Record<string, ReactNode> = {
  overview: P("M4 6h16M4 12h16M4 18h10"),
  now: <><circle cx="12" cy="12" r="4.5" />{P("M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8")}</>,
  rain: <>{P("M7 15.5h9.5a3.6 3.6 0 0 0 .5-7.2 5.5 5.5 0 0 0-10.4 1.5A3 3 0 0 0 7 15.5z")}{P("M9 18.5l-.8 2M13 18.5l-.8 2M17 18.5l-.8 2")}</>,
  radar: <><circle cx="12" cy="12" r="8.5" />{P("M3.5 12h17M12 3.5c2.6 2.3 2.6 14.7 0 17M12 3.5c-2.6 2.3-2.6 14.7 0 17")}</>,
  field: <>{P("M3 17c4-3.5 7-3.5 11 0 2.2 1.8 4 2.6 7 1.6")}{P("M3 13c4-3.5 7-3.5 11 0 2.2 1.8 4 2.6 7 1.6")}</>,
  outlook: <><rect x="4" y="5" width="16" height="15" rx="2" />{P("M8 3v4M16 3v4M4 10h16")}</>,
  seasonal: <>{P("M12 21V9")}{P("M12 9c0-3 2-5 5-5 0 3-2 5-5 5z")}{P("M12 13c0-2.4-1.6-4-4-4 0 2.4 1.6 4 4 4z")}</>,
};

export function NavIcon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{NAV[name] ?? NAV.overview}</svg>;
}

const COND: Record<ConditionKey, ReactNode> = {
  clear: <><circle cx="12" cy="12" r="4.5" />{P("M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5L19 19M3 12h2M19 12h2M5 19l1.5-1.5M17.5 6.5L19 5")}</>,
  cloud: P("M7 17h10a3.5 3.5 0 0 0 .4-7 5.5 5.5 0 0 0-10.6 1.2A3 3 0 0 0 7 17z"),
  fog: <>{P("M5 10.5h11a3 3 0 0 0 .3-6 5 5 0 0 0-9.5 1A2.6 2.6 0 0 0 5 10.5z")}{P("M4 14h16M6 17.5h12M8 21h8")}</>,
  rain: <>{P("M7 14.5h9.5a3.5 3.5 0 0 0 .4-7 5.5 5.5 0 0 0-10.5 1.2A3 3 0 0 0 7 14.5z")}{P("M9 17l-1 3M13 17l-1 3M17 17l-1 3")}</>,
  snow: <>{P("M7 13.5h9.5a3.5 3.5 0 0 0 .4-7 5.5 5.5 0 0 0-10.5 1.2A3 3 0 0 0 7 13.5z")}{P("M9 18h.01M12 20h.01M15 18h.01")}</>,
  storm: <>{P("M7 14.5h9.5a3.5 3.5 0 0 0 .4-7 5.5 5.5 0 0 0-10.5 1.2A3 3 0 0 0 7 14.5z")}{P("M13 14l-3 4h3l-1 3")}</>,
};

export function ConditionIcon({ k, className }: { k: ConditionKey; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{COND[k] ?? COND.cloud}</svg>;
}

export const ChevronIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;
export const SearchIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
export const ShareIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" /><path d="M12 15V4M8 8l4-4 4 4" /></svg>;
export const GpsIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>;
export const RefreshIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5" /><path d="M4 18v-5h5" /><path d="M18.2 9A7 7 0 0 0 6.4 6.6L4 9" /><path d="M5.8 15a7 7 0 0 0 11.8 2.4L20 15" /></svg>;
export const SettingsIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.1 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14 1h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 0 0 4.9 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2L10 23h4l.6-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" /></svg>;
export const BellIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
