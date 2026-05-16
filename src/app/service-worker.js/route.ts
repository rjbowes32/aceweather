import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = false;

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "dev";

const SW_SOURCE = `
const SW_VERSION = ${JSON.stringify(BUILD_ID)};
const STATIC_CACHE = "aw-static-" + SW_VERSION;
const DATA_CACHE = "aw-data-v1";
const APP_SHELL = [
  "/",
  "/offline.html",
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

function isDataRequest(url) {
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return true;
  if (url.hostname === "api.open-meteo.com") return true;
  if (url.hostname === "archive-api.open-meteo.com") return true;
  if (url.hostname === "air-quality-api.open-meteo.com") return true;
  if (url.hostname === "geocoding-api.open-meteo.com") return true;
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
  const cached = await cache.match(request);
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
  if (event.data && event.data.type === "aw-skip-waiting") {
    self.skipWaiting();
  }
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
