# Approved components

Compose these; don't create. Before building anything new, look here for something that already does the job.

`npm run lint` fails when a `.tsx` file under `src/components/` is not named in the table below. A new component needs a row (what it is for, why nothing existing fits) and Rob's OK in the same change.

## Component files

| File | What it holds | Reach for it when |
|---|---|---|
| `ui.tsx` | `Card` (kicker, meta, tick, Details disclosure), `Tags`, `Meter`, `Bars`, `LineTrend`, `HourlyChart`, `SoilRows`, `Verdict`, `DeltaTBand`, `RiskStrip`, `OpsMatrix` | Any new card or small chart. Every card goes through `Card` |
| `icons.tsx` | `NavIcon`, `ConditionIcon`, `WeatherIcon`, and the UI glyphs (chevron, search, share, GPS, refresh, settings, bell, docs, close) | Any icon. Don't inline a new SVG in a screen |
| `cards.tsx` | `CalendarCard`, `SprayCard`, `DiseaseCard`, `SoilWaterCard`, `SeasonCard`, `SeasonalCard`, `SourcesCard` | The existing domain cards |
| `spray-strip.tsx` | `SprayHourStrip`, `SprayCardSkeleton`, run reasons | Spray hours, and the loading skeleton |
| `work-window-planner.tsx` | `WorkWindowPlanner` | Work windows in Field |
| `overview-experience.tsx` | `OverviewExperience` | The Overview tab |
| `now-experience.tsx` | `NowExperience` | The Now tab |
| `field-experience.tsx` | `FieldExperience` | The Field tab |
| `radar-card.tsx` | `RadarMap`, `RadarCard` | The radar map |
| `setup-hint.tsx` | `SetupHint` | The one set-up hint on Overview |
| `location-picker-content.tsx` | `LocationPickerContent` | Place search, saved places and GPS |
| `app.tsx` | `AceWeatherApp`: shell, header, rail, bottom nav, settings and More sheets | The app shell. Screens plug in here |
| `pwa-bootstrap.tsx` | `PwaBootstrap` | Service worker and update prompt |

## CSS building blocks

Classes in `src/app/shared-surfaces.css` and `src/app/aceweather-x.css`. Use them rather than restyling a new element.

| Need | Use |
|---|---|
| A card | `Card` from `ui.tsx` (`.awx-card`, `.awx-card-head`, `.awx-kicker`) |
| A button | `.awx-btn` with `.awx-btn-primary` or `.awx-btn-ghost`; icon only: `.awx-icon-btn` with an `aria-label` |
| A choice of a few options | `.awx-segmented` |
| A label and value row | `.awx-row-item` with `.awx-k` and `.awx-v` |
| A sheet or dialog | `.awx-sheet-overlay` > `.awx-sheet` (`.awx-sheet-head`, `.awx-sheet-body`, `.awx-sheet-actions`), `role="dialog"` |
| A status word | `.awx-status` (with text, never colour alone) |
| A place row | `.awx-place` |

There is no toast, badge or modal outside these. If a screen seems to need one, ask Rob first and add it here.
