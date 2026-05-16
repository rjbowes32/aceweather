"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "aceweather.install.dismissedAt";
const DISMISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  return Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

function recentlyDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;
    if (isIOS()) {
      setShowIos(true);
      return;
    }
    const handler = (incoming: Event) => {
      incoming.preventDefault();
      setEvent(incoming as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    setDismissed(true);
    try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* swallow */ }
  }

  async function accept() {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
  }

  if (dismissed) return null;
  if (event) {
    return (
      <div className="aw2-install-prompt" role="region" aria-label="Install AceWeather">
        <span className="text">Install AceWeather for offline radar and faster cold-starts.</span>
        <button type="button" onClick={accept}>Install</button>
        <button type="button" className="dismiss" onClick={dismiss} aria-label="Dismiss install prompt">×</button>
      </div>
    );
  }
  if (showIos) {
    return (
      <div className="aw2-install-prompt" role="region" aria-label="Add to Home Screen">
        <span className="text">Add to Home Screen: tap the Share icon, then “Add to Home Screen”.</span>
        <button type="button" className="dismiss" onClick={dismiss} aria-label="Dismiss install hint">×</button>
      </div>
    );
  }
  return null;
}
