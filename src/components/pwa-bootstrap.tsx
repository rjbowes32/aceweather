"use client";

import { useEffect } from "react";

import { migrateFromLocalStorage } from "@/lib/store";

const PWA_UPDATE_CHECK_MS = 60 * 60 * 1000;
const SKIP_WAITING_MESSAGE = { type: "aw-skip-waiting" };

function activateWaitingWorker(worker?: ServiceWorker | null) {
  if (!worker) return;
  window.dispatchEvent(new Event("aceweather:pwa-update-ready"));
  worker.postMessage(SKIP_WAITING_MESSAGE);
}

export function PwaBootstrap() {
  useEffect(() => {
    migrateFromLocalStorage().catch(() => {});

    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) => {
          registrations.forEach((registration) => {
            void registration.unregister();
          });
        })
        .catch(() => {});
      if ("caches" in window) {
        void window.caches.keys()
          .then((keys) => Promise.all(
            keys
              .filter((key) => key.startsWith("aw-static-"))
              .map((key) => window.caches.delete(key)),
          ))
          .catch(() => {});
      }
      return;
    }

    let hasController = Boolean(navigator.serviceWorker.controller);
    let refreshing = false;
    let updateTimer: number | undefined;

    const checkForUpdate = (registration?: ServiceWorkerRegistration) => {
      if (!navigator.onLine) return;
      const update = registration
        ? registration.update()
        : navigator.serviceWorker.getRegistration().then((current) => current?.update());
      void update.catch(() => {});
    };

    const onControllerChange = () => {
      if (!hasController) {
        hasController = true;
        return;
      }
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    const onFocus = () => checkForUpdate();
    const onOnline = () => checkForUpdate();
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForUpdate();
      }
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibilityChange);

    const register = () => {
      navigator.serviceWorker
        .register("/service-worker.js", { scope: "/", updateViaCache: "none" })
        .then((registration) => {
          if (registration.waiting) {
            activateWaitingWorker(registration.waiting);
          }
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                activateWaitingWorker(installing);
              }
            });
          });
          checkForUpdate(registration);
          updateTimer = window.setInterval(() => checkForUpdate(registration), PWA_UPDATE_CHECK_MS);
        })
        .catch((error) => {
          console.warn("AceWeather service worker registration failed", error);
        });
    };

    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("load", register);
      if (updateTimer) {
        window.clearInterval(updateTimer);
      }
    };
  }, []);

  return null;
}
