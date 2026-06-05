"use client";

import { useEffect } from "react";

import { migrateFromLocalStorage } from "@/lib/store";

const PWA_UPDATE_CHECK_MS = 60 * 60 * 1000;
const SKIP_WAITING_MESSAGE = { type: "aw-skip-waiting" };

export function PwaBootstrap() {
  useEffect(() => {
    migrateFromLocalStorage().catch(() => {});

    if (!("serviceWorker" in navigator)) return;
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
            registration.waiting.postMessage(SKIP_WAITING_MESSAGE);
          }
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                installing.postMessage(SKIP_WAITING_MESSAGE);
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
