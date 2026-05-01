---
version: alpha
name: AceWeather
description: Agronomy-focused weather intelligence with atmospheric depth, expressive Material-inspired surfaces, and dense field decision support.
colors:
  primary: "#08111F"
  secondary: "#0E1F36"
  tertiary: "#5AA7FF"
  accent-warm: "#FFB86A"
  accent-cool: "#8CE7FF"
  accent-rain: "#6E7DFF"
  neutral: "#EDF4FF"
  success: "#7AE7AE"
  warning: "#FFD36D"
  danger: "#FF8A7A"
typography:
  display-xl:
    fontFamily: Sora
    fontSize: 4.5rem
    fontWeight: 800
    lineHeight: 0.92
  headline-lg:
    fontFamily: Sora
    fontSize: 2.4rem
    fontWeight: 700
    lineHeight: 1
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 1.1rem
    fontWeight: 700
    lineHeight: 1.2
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.6
  label-caps:
    fontFamily: IBM Plex Mono
    fontSize: 0.78rem
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.16em
  metric-md:
    fontFamily: IBM Plex Mono
    fontSize: 1.45rem
    fontWeight: 500
    lineHeight: 1.2
rounded:
  sm: 14px
  md: 22px
  lg: 30px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
components:
  app-shell:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral}"
  glass-panel:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.neutral}"
    rounded: "{rounded.lg}"
    padding: 24px
  button-primary:
    backgroundColor: "{colors.accent-warm}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: 16px
  metric-chip:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.neutral}"
    rounded: "{rounded.full}"
    padding: 12px
  risk-card:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.neutral}"
    rounded: "{rounded.md}"
    padding: 16px
  chart-primary:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 12px
  chart-rain:
    backgroundColor: "{colors.accent-rain}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 12px
  focus-ring:
    backgroundColor: "{colors.accent-cool}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: 4px
  status-positive:
    backgroundColor: "{colors.success}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: 8px
  status-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: 8px
  status-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.primary}"
    rounded: "{rounded.full}"
    padding: 8px
---

## Overview
AceWeather should feel like a premium field observatory for farmers and agronomists, not a generic consumer weather app. The interface pairs atmospheric beauty with operational clarity so a grower can assess spray windows, field access, disease pressure, rainfall totals, wind behavior, and soil conditions at a glance.

## Colors
The palette is night-led and luminous. Deep navy surfaces create room for weather-driven accents to glow without feeling neon or synthetic.

- **Primary (`#08111F`)** anchors the full canvas and major text contrast.
- **Secondary (`#0E1F36`)** carries the glass panels and inner surfaces.
- **Tertiary (`#5AA7FF`)** is the core signal color for data emphasis and charts.
- **Accent Warm (`#FFB86A`)** is reserved for actions, sun-driven metrics, and emphasis.
- **Accent Cool (`#8CE7FF`)** supports light, air, and focus states.
- **Accent Rain (`#6E7DFF`)** belongs to rainfall, cloud, and moisture narratives.
- **Neutral (`#EDF4FF`)** keeps the page readable against translucent dark layers.

## Typography
Typography should separate atmosphere from instrumentation. `Sora` handles the emotional top line and hero moments. `Plus Jakarta Sans` keeps explanatory copy clean and modern. `IBM Plex Mono` is for values, units, and agronomic metrics so the data reads like instrumentation rather than decoration.

## Layout
The page should breathe like a landscape dashboard:

- The hero area is immersive and expressive.
- The main grid is dense but calm, with information broken into purposeful field workflows.
- Historical context should sit near forecast content so anomalies are obvious.
- Agronomy-specific cards should be visually prominent, not treated as secondary add-ons.

## Elevation & Depth
Depth comes from blur, glow, inner highlights, and large-radius translucent panels. Avoid hard black shadows or flat blocks. The UI should feel like layered glass over a living sky map.

## Shapes
Rounded corners should be generous. Pills and chips should feel equipment-grade and tactile. Charts and cards should keep soft radii even in high-density sections.

## Components
- **Hero panel:** cinematic current conditions with summary text grounded in field relevance.
- **Agronomy insight card:** concise risk or opportunity statement with supporting numbers.
- **Metric chip:** compact, high-signal, unit-explicit field metric.
- **Chart panel:** dark, luminous, and readable at a distance.
- **Provider card:** trustworthy source status with graceful handling of unavailable premium data.

## Do's and Don'ts
- Do privilege field decisions over generic consumer novelty.
- Do show rainfall totals, wind, humidity, leaf-wetness proxies, and soil data together when discussing disease or spray timing.
- Do explain that disease outputs are heuristic risk models unless validated against local pathology systems.
- Do not let beauty reduce readability.
- Do not hide unavailable premium data behind broken UI.
