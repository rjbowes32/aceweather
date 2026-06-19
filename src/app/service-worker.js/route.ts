import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = false;

const BUILD_ID =
  process.env.NEXT_PUBLIC_BUILD_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  "dev";

const SW_SOURCE = `
const SW_VERSION = ${JSON.stringify(BUILD_ID)};
const STATIC_CACHE = "aw-static-" + SW_VERSION;
const DATA_CACHE = "aw-data-v1";
const APP_SHELL = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/aceweather-icon.svg",
  "/icons/aceweather-icon-maskable.svg",
  "/icons/aceweather-icon-mono.svg",
];
const DATA_MAX_ENTRIES = 200;
const DATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.all(APP_SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: "reload" })); } catch (err) { /* ignore */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => {
      if (key.startsWith("aw-static-") && key !== STATIC_CACHE) return caches.delete(key);
      return null;
    }));
    await self.clients.claim();
  })());
});

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname.startsWith("/icons/")) return true;
  if (url.pathname === "/manifest.webmanifest") return true;
  if (url.pathname === "/offline.html") return true;
  return false;
}

function isInstallAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname === "/manifest.webmanifest") return true;
  if (url.pathname.startsWith("/icons/")) return true;
  return false;
}

function isDataRequest(url) {
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return true;
  if (url.hostname === "api.open-meteo.com") return true;
  if (url.hostname === "archive-api.open-meteo.com") return true;
  if (url.hostname === "air-quality-api.open-meteo.com") return true;
  if (url.hostname === "geocoding-api.open-meteo.com") return true;
  if (url.hostname === "api.rainviewer.com") return true;
  return false;
}

function isMapTileRequest(url) {
  if (url.hostname === "tilecache.rainviewer.com") return true;
  if (url.hostname.endsWith(".basemaps.cartocdn.com")) return true;
  return false;
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  for (let i = 0; i < keys.length - maxEntries; i += 1) {
    await cache.delete(keys[i]);
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (err) {
    const offline = await cache.match("/offline.html");
    if (offline) return offline;
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const bypassCached = request.cache === "reload" || request.cache === "no-cache";
  const cached = bypassCached ? null : await cache.match(request);
  const fetchPromise = fetch(request).then(async (response) => {
    if (response && response.ok) {
      const headers = new Headers(response.headers);
      headers.set("x-aw-cached-at", new Date().toISOString());
      const body = await response.clone().blob();
      const stamped = new Response(body, { status: response.status, statusText: response.statusText, headers });
      cache.put(request, stamped.clone()).catch(() => {});
      trimCache(cacheName, DATA_MAX_ENTRIES).catch(() => {});
      return stamped;
    }
    return response;
  }).catch(() => null);

  if (bypassCached) {
    const fresh = await fetchPromise;
    if (fresh) return fresh;
    const fallback = await cache.match(request);
    if (fallback) return fallback;
    throw new Error("Network failed and no cached copy");
  }

  if (cached) {
    const cachedAt = cached.headers.get("x-aw-cached-at");
    if (cachedAt) {
      const age = Date.now() - Date.parse(cachedAt);
      if (age > DATA_TTL_MS) {
        const fresh = await fetchPromise;
        if (fresh) return fresh;
      }
    }
    fetchPromise.then((fresh) => {
      if (!fresh) return;
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => client.postMessage({ type: "aw-data-refreshed", url: request.url }));
      });
    });
    return cached;
  }

  const fresh = await fetchPromise;
  if (fresh) return fresh;
  throw new Error("Network failed and no cached copy");
}

async function networkFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await cache.match("/offline.html");
      if (offline) return offline;
    }
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  let url;
  try { url = new URL(request.url); } catch { return; }

  if (isDataRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }
  if (isMapTileRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }
  if (isInstallAsset(url)) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
});

self.addEventListener("message", (event) => {
  if (event.data && (event.data.type === "aw-skip-waiting" || event.data.type === "SKIP_WAITING")) {
    self.skipWaiting();
  }
});

async function checkRain() {
  const cache = await caches.open("awx-runtime");
  const locRes = await cache.match("/__awx_location");
  if (!locRes) return;
  const loc = await locRes.json();
  const url = "https://api.open-meteo.com/v1/forecast?latitude=" + loc.lat + "&longitude=" + loc.lon
    + "&timezone=" + encodeURIComponent(loc.tz || "auto") + "&forecast_days=2"
    + "&current=temperature_2m,precipitation&hourly=precipitation,precipitation_probability";
  const response = await fetch(url);
  if (!response.ok) return;
  const data = await response.json();
  const times = data.hourly?.time || [];
  const precipitation = data.hourly?.precipitation || [];
  const probability = data.hourly?.precipitation_probability || [];
  const nowTime = data.current?.time || times[0];
  let nowIndex = times.findIndex((time) => time > nowTime);
  nowIndex = nowIndex === -1 ? times.length - 1 : Math.max(0, nowIndex - 1);
  let hit = null;
  for (let i = nowIndex; i < Math.min(times.length, nowIndex + 6); i += 1) {
    if ((precipitation[i] || 0) >= 0.5) {
      let mm = 0;
      let cursor = i;
      while (cursor < times.length && (precipitation[cursor] || 0) > 0) {
        mm += precipitation[cursor];
        cursor += 1;
      }
      hit = {
        atKey: times[i].slice(0, 13),
        atLabel: times[i].slice(11, 16),
        mm: Math.round(mm * 10) / 10,
        prob: probability[i] ?? null,
        inHours: i - nowIndex,
      };
      break;
    }
  }
  if (!hit) return;
  const key = loc.name + "|" + hit.atKey;
  const notRes = await cache.match("/__awx_rain_notified");
  if (notRes && (await notRes.text()) === key) return;
  await self.registration.showNotification("Rain expected - " + loc.name, {
    body: hit.mm + " mm around " + hit.atLabel + (hit.prob != null ? " (" + hit.prob + "% chance)" : "") + ", in ~" + hit.inHours + "h.",
    tag: "awx-rain",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  });
  await cache.put("/__awx_rain_notified", new Response(key));
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "awx-rain-check") event.waitUntil(checkRain());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = {}; }
  event.waitUntil(self.registration.showNotification(payload.title || "AceWeather", {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "awx",
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      if ("focus" in client) return client.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow("/");
    return undefined;
  })());
});
`;

export function GET(): Response {
  return new NextResponse(SW_SOURCE, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
