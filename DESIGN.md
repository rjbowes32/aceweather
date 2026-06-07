---
version: 1
name: AceWeather
description: A calm, premium field-weather console for farmers and agronomists. Near-monochrome, dark-first, one accent. Restraint over decoration.
theme: dark-first (light parity required)
tokens:
  color-dark:
    bg: "#0a0b0d"          # app background (near-black, slightly warm-neutral)
    surface: "#101216"     # cards / panels
    surface-2: "#15181d"   # insets, search fields, segmented tracks
    surface-3: "#1c2026"   # hover / active inset
    line: "rgba(255,255,255,0.07)"   # hairline dividers
    line-2: "rgba(255,255,255,0.13)" # stronger hairline / control borders
    text: "#e9eaec"        # primary text
    muted: "#9aa0a8"       # secondary text
    faint: "#6a7079"       # tertiary text / kickers / axis labels
    accent: "#6ea0ff"      # THE single interactive accent (links, active, rain)
    accent-weak: "rgba(110,160,255,0.13)"
    accent-line: "rgba(110,160,255,0.34)"
  color-light:
    bg: "#f6f7f9"
    surface: "#ffffff"
    surface-2: "#f1f3f6"
    surface-3: "#e8ecf1"
    line: "rgba(12,16,22,0.09)"
    line-2: "rgba(12,16,22,0.16)"
    text: "#14171c"
    muted: "#5c636d"
    faint: "#8a929c"
    accent: "#2f6cf0"
  semantic:               # DESATURATED. Small indicators only — never fills/backgrounds.
    sun: "#e0b15e"        # temperature, sun, UV, heat
    warn: "#d6a45c"       # watch / marginal (amber)
    go: "#5cb98c"         # go / live / good (green)
    risk: "#db7d84"       # severe / disease / frost risk (red)
    cool: "#7fb6d9"       # frost / cold / snow
    violet: "#a596e8"     # pressure / anomaly
  radius:
    card: 16px
    inset: 11px
    pill: 999px
  type:
    family: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif"
    display:  { weight: 200, tracking: "-0.045em", note: "huge temperature/numerals — thin & elegant" }
    title:    { size: 15px, weight: 600, tracking: "-0.01em" }
    body:     { size: 15px, weight: 400, lineHeight: 1.5 }
    label:    { size: 12-13px, weight: 500, muted: true }
    kicker:   { size: 10.5px, weight: 600, tracking: "0.14em", transform: uppercase, color: faint }
    numbers:  "font-variant-numeric: tabular-nums on every figure that can change"
  motion:
    base: "140-180ms ease"
    rule: "subtle only; respect prefers-reduced-motion (disable all)"
---

# AceWeather — Design System

This document is the **source of truth**. Anything added to AceWeather must adhere to it. When in doubt, choose the quieter option.

## 1. Philosophy
A calm, premium **instrument** for making field decisions — not a consumer weather toy and not a social feed. The look is **near-monochrome, dark-first, with a single accent**. Beauty comes from typography, spacing, and restraint, never from saturated colour or illustration. Every screen should feel like a quiet, well-made console a grower trusts at a glance.

Three words: **calm, precise, premium.**

## 2. Colour
- The canvas is near-black (`bg`); cards sit one step up (`surface`); insets one step further (`surface-2/3`). Separation comes from these **tints + hairlines**, not shadows or borders-everywhere.
- **One accent** (`accent`, a calm blue) carries all interactivity: links, active nav, focus, primary buttons, rainfall. Do not introduce a second interactive colour.
- **Semantic colours are desaturated and used sparingly** — as a small dot, a thin meter fill, a single value's text colour. Never as a filled badge background, never as a card background. (sun=temp, warn=watch, go=good, risk=danger, cool=frost, violet=pressure.)
- Light theme must reach the same contrast and calm. Every colour has a light-mode token; build with the CSS variables, never hard-coded hex.

## 3. Typography
- **Inter only.** Hierarchy comes from **weight + size + spacing**, not many families.
- **Display numerals are thin** (weight 200, tight tracking). The big temperature is the one heroic moment per screen — keep it light and elegant, never an 800-weight block.
- **Kickers** (tiny uppercase, tracked, `faint`) label sections quietly — use instead of heavy headers.
- **Tabular numbers everywhere** a figure changes, so values don't jitter.
- Avoid ALL-CAPS body text and decorative mono. Sentence case for copy.

## 4. Layout
- **Three columns** on desktop: nav **rail** (`min 76 → 232`) · **feed** (`max 600`) · **sidebar** (`280–348`), centred. Hairline dividers between columns.
- The feed is a **vertical stack of section cards** — one concern per card, generous padding (~22px), separated by a single hairline. Let it breathe; density lives *inside* a card or behind *Details*, not in the spacing.
- **Responsive:** `≤1080px` collapse rail to icons; `≤900px` drop rail+sidebar to a single feed with a fixed **bottom tab bar**; `≤540px` tighten metrics to 2-up and shrink the display numeral. Mobile is the PWA's primary surface — it must feel first-class.

## 5. The card pattern (use for every new section)
1. **Header:** a `kicker` + a short `meta` line, with a small semantic `accent-tick` square top-right.
2. **Body:** the minimal, scannable summary (a number, a small chart, a few quiet rows).
3. **Footer:** a `Details` disclosure (chevron) on the left, a quiet `note` on the right.
4. **Detail:** hidden by default; expands to the rich/dense view (full chart, more numbers, methodology).

This **minimal-by-default, depth-on-demand** rhythm is mandatory — never dump everything into the default view.

## 6. Components
- **Charts:** thin strokes, soft low-opacity area fills, **faint** gridlines, no bright caps. Bars are slim with a subtle gradient. A line chart may use `sun` (temp), `accent` (rain, dashed), `violet` (pressure). Keep them readable at a glance, detailed on expand.
- **Meters:** thin (≈5px) rounded track on `surface-3`; fill in a single semantic colour; a small value label beside it.
- **Controls:** pill segmented switches for binary/range choices (theme, units, chart range); ghost or solid-accent buttons. Active state = `surface` lift + accent text, never a glowing dot.
- **Tags:** hairline-outlined, `muted` text, a tiny semantic dot. Never saturated fills.
- **Sky panel** (current conditions): a soft gradient with a single glowing orb — abstract, not an illustration.

## 7. Do / Don't
**Do**
- Privilege field decisions (spray window, access, disease, frost, rainfall, soil) and present related signals together.
- Label model outputs as **heuristic** where they are (agronomy, disease, "approx" radar derivations).
- Build with the CSS variables and the card pattern so new sections are consistent for free.
- Keep source files small and focused (see the repo's ≤400-line UI convention).

**Don't**
- ❌ Cartoon weather illustrations, emoji, or bouncing animations.
- ❌ Social-media cosplay (avatars, @handles, "18m" timestamps, like/reply rows).
- ❌ Rainbows of saturated filled badges, or a second interactive colour.
- ❌ Heavy 700–800 weights as the default; hard black shadows; boxes around everything.
- ❌ Let beauty reduce readability, or hide unavailable data behind broken UI — degrade gracefully.

## 8. Data & honesty
Primary source is **Open-Meteo** (forecast: current/hourly/daily incl. soil; 7 past days; 14 forecast days). **Radar** is **RainViewer** (Open-Meteo has no radar). Climate normals come from the **Open-Meteo archive**. Always show source and freshness; when a value is derived/approximate, say so quietly in the card's note or Details.
