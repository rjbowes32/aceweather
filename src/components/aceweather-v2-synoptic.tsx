// @ts-nocheck
"use client";

import { Desktop } from "./aceweather/desktop";
import { Mobile } from "./aceweather/mobile";

export function AceWeatherV2Synoptic() {
  return (
    <main className="aw2-shell">
      <section className="aw2-shell-desktop" aria-label="AceWeather desktop mission control">
        <Desktop />
      </section>
      <section className="aw2-shell-mobile" aria-label="AceWeather mobile PWA">
        <Mobile />
      </section>
    </main>
  );
}
