"use client";

import { useEffect, useState } from "react";
import { CloseIcon } from "./icons";
import { SETUP_HINT_DISMISS_KEY, isIosSafari, setupHintState, type LocationPermission } from "@/lib/aceweather/setup-hint";

const RESET_EVENT = "aceweather:setup-hint-reset";

/** Clears the saved dismiss and shows the tips again. */
export function showSetupHint() {
  try { localStorage.removeItem(SETUP_HINT_DISMISS_KEY); } catch { /* private mode */ }
  window.dispatchEvent(new Event(RESET_EVENT));
}

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function isStandalone() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
}

export function SetupHint({ onAllowLocation, geoFollow }: { onAllowLocation: () => void; geoFollow: boolean }) {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [permission, setPermission] = useState<LocationPermission>("unknown");
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    try { setDismissed(localStorage.getItem(SETUP_HINT_DISMISS_KEY) === "1"); } catch { setDismissed(false); }
    setStandalone(isStandalone());
    setIos(isIosSafari(navigator.userAgent, navigator.maxTouchPoints));
    let status: PermissionStatus | null = null;
    const sync = () => { if (status) setPermission(status.state as LocationPermission); };
    // Reads the permission only. A position request would prompt, and belongs on the Here tap.
    navigator.permissions?.query({ name: "geolocation" as PermissionName })
      .then((s) => { status = s; sync(); s.addEventListener("change", sync); })
      .catch(() => setPermission("unknown"));
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvent(e as InstallPromptEvent); };
    const onInstalled = () => { setInstallEvent(null); setStandalone(true); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const onReset = () => setDismissed(false);
    window.addEventListener(RESET_EVENT, onReset);
    setReady(true);
    return () => {
      status?.removeEventListener("change", sync);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(RESET_EVENT, onReset);
    };
  }, []);

  const state = setupHintState({
    permission: geoFollow ? "granted" : permission,
    standalone, canPromptInstall: Boolean(installEvent), isIosSafari: ios, dismissed,
  });
  if (!ready || !state.show) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(SETUP_HINT_DISMISS_KEY, "1"); } catch { /* private mode */ }
  };
  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    await installEvent.userChoice.catch(() => null);
    setInstallEvent(null);
  };

  return (
    <section className="awx-card awx-setup-hint" aria-label="Get set up">
      <div className="awx-setup-hint-head">
        <strong>Get set up</strong>
        <button className="awx-icon-btn" type="button" onClick={dismiss} aria-label="Hide set-up tips"><CloseIcon /></button>
      </div>
      <ul>
        {state.location === "allow" ? (
          <li><span>Turn on location to use your GPS position.</span><button className="awx-btn" type="button" onClick={onAllowLocation}>Allow</button></li>
        ) : null}
        {state.location === "blocked" ? (
          <li><span>Location is blocked. Turn it on in your browser&apos;s site settings.</span></li>
        ) : null}
        {state.install === "button" ? (
          <li><span>Add AceWeather to your home screen.</span><button className="awx-btn" type="button" onClick={install}>Install</button></li>
        ) : null}
        {state.install === "ios" ? (
          <li><span>Add to your home screen: tap Share, then Add to Home Screen.</span></li>
        ) : null}
      </ul>
    </section>
  );
}
