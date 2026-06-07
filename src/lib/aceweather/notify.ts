/* eslint-disable @typescript-eslint/no-explicit-any */
/* Opt-in rain notifications. Local (when the app is opened) + best-effort
   background via Periodic Background Sync where the platform supports it.
   Reliable closed-app push would need a server with Web Push — not included. */

import type { AwLocation } from "./open-meteo";

const NOTIFIED_KEY = "awx-rain-notified";
const RUNTIME_CACHE = "awx-runtime";

export type NotifyState = NotificationPermission | "unsupported";

export function notifyPermission(): NotifyState {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function enableRainAlerts(): Promise<NotifyState> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  let perm = Notification.permission;
  if (perm === "default") perm = await Notification.requestPermission();
  if (perm === "granted") {
    try {
      const reg: any = await navigator.serviceWorker.ready;
      const ps = reg.periodicSync;
      if (ps?.register) {
        const tags: string[] = ps.getTags ? await ps.getTags() : [];
        if (!tags.includes("awx-rain-check")) {
          await ps.register("awx-rain-check", { minInterval: 3 * 60 * 60 * 1000 });
        }
      }
    } catch { /* periodic sync unsupported — local checks still work */ }
  }
  return perm;
}

/** Persist the active location so the service worker can re-check rain in the background. */
export async function saveLocationForSync(loc: AwLocation): Promise<void> {
  try {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.put("/__awx_location", new Response(JSON.stringify(loc), { headers: { "content-type": "application/json" } }));
  } catch { /* */ }
}

/** Fire a local notification if rain is imminent and not already alerted for it. */
export async function maybeNotifyRain(model: any, locName: string): Promise<void> {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  const nr = model?.nextRain;
  if (!nr || nr.inHours > 6 || nr.mm < 0.5) return;
  const key = `${locName}|${nr.atKey}`;
  let last = "";
  try { last = localStorage.getItem(NOTIFIED_KEY) || ""; } catch { /* */ }
  if (last === key) return;
  const title = `Rain expected · ${locName}`;
  const body = `${nr.mm} mm around ${nr.atLabel}${nr.prob != null ? ` (${nr.prob}% chance)` : ""}, in ~${nr.inHours}h.`;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { body, tag: "awx-rain", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png" });
  } catch {
    try { new Notification(title, { body }); } catch { /* */ }
  }
  try { localStorage.setItem(NOTIFIED_KEY, key); } catch { /* */ }
}
