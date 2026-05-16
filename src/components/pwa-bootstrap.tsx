"use client";

import { useEffect } from "react";

import { migrateFromLocalStorage } from "@/lib/store";

export function PwaBootstrap() {
  useEffect(() => {
    migrateFromLocalStorage().catch(() => {});

    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register("/service-worker.js", { scope: "/" })
        .then((registration) => {
          if (registration.waiting) {
            registration.waiting.postMessage({ type: "aw-skip-waiting" });
          }
          registration.addEventListener("updatefound", () => {
            const installing = registration.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                installing.postMessage({ type: "aw-skip-waiting" });
              }
            });
          });
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
  }, []);

  return null;
}
