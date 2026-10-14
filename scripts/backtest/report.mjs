// Turns .cache/backtest/results.json into docs/mcp/LEARNING-BACKTEST.md.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { STRATEGY_LABELS } from "../../src/mcp/learning.ts";
import { CACHE, RESULTS_TAG } from "./download.mjs";

const R = JSON.parse(readFileSync(join(CACHE, `results${RESULTS_TAG}.json`), "utf8"));
const NATIONWIDE = R.sites.some((s) => s.nation && s.nation !== "England");
const WITH_AI = R.models.includes("ecmwf_aifs025_single");
const OUT_FILE = NATIONWIDE ? "LEARNING-BACKTEST-UK.md" : "LEARNING-BACKTEST.md";
const W = R.primary_window;
const VARS = [["temperature", "Temperature", "°C"], ["wind", "Wind speed", "km/h"], ["rain", "Daily rainfall", "mm"]];
const MODEL_NAMES = { ecmwf_ifs025: "ECMWF", gfs_seamless: "GFS", icon_seamless: "ICON", ukmo_seamless: "Met Office", ...(WITH_AI ? { ecmwf_aifs025_single: "AIFS" } : {}) };
const NETWORKS = { metar: "METAR", ghcnh: "Met Office via GHCNh", cosmos_uk: "COSMOS-UK", ea_hydrology: "EA gauge", sepa: "SEPA gauge" };
const median = (xs) => { const s = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const pct = (learned, current) => (current ? (1 - learned / current) * 100 : null);
const f2 = (x) => (x == null ? "–" : x.toFixed(2));
const signed = (x) => (x == null ? "–" : `${x >= 0 ? "" : "−"}${Math.abs(x).toFixed(0)}%`);
const lines = [];
const out = (s = "") => lines.push(s);

const cells = [];
for (const site of R.sites) for (const [v] of VARS) for (const lead of R.leads) {
  const s = site.scores[v]?.[lead]?.[W];
  if (s?.n) cells.push({ site, v, lead, s });
}
const learnedGain = (c) => pct(c.s.mae.weighted_bias, c.s.mae.current);

out(NATIONWIDE ? "# Learning backtest, UK-wide: does the learned forecast beat AceWeather today across the country?" : "# Learning backtest: does a per-location learned forecast beat AceWeather today?");
out();
const nations = [...new Set(R.sites.map((s) => s.nation ?? "England"))];
out(`Generated ${R.generated_at.slice(0, 10)} by \`scripts/backtest/\`. Scored period ${R.period.evalStart} to ${R.period.end}; training data from ${R.period.trainStart}. ${R.sites.length} locations (${nations.map((n) => `${R.sites.filter((s) => (s.nation ?? "England") === n).length} in ${n}`).join(", ")}), lead times of ${R.leads.join(", ")} days.${WITH_AI ? " The blend uses the same model set as the live forecast: four models, plus ECMWF's AI model (AIFS) from day 3." : ""}`);
out();
out("## Method");
out();
out(`Each day in the scored period, every strategy is built using only the ${W} days before it, then scored on that day against what the reference station measured. Nothing ever sees the day it is scored on. All strategies and models are scored on exactly the same hours (temperature, wind) or days (rainfall). Archived forecasts come from Open-Meteo's Previous Runs API at each reference station's own coordinates and elevation. Observations come from Met Office stations (NOAA GHCNh archive) and METAR airports (Iowa Environmental Mesonet archive), COSMOS-UK sites for temperature where neither is close, and rain gauges: Environment Agency (England), SEPA (Scotland) and COSMOS-UK elsewhere, complete UTC days only.`);
out();
out("| Strategy | What it does |");
out("|---|---|");
for (const [k, v] of Object.entries(STRATEGY_LABELS)) out(`| ${k.replace("_", " ")} | ${v} |`);
out();
out("Rainfall uses the weighted blend without a bias shift and never goes below zero. Training for a forecast at lead L stops the day before that forecast would have been issued (L days before the scored day), so no strategy uses observations that were not yet available.");
out();

out("## Headline");
out();
out("| Variable | Lead | Median MAE today | Median MAE learned | Median change | Locations better / worse | Independent stations better / worse |");
out("|---|---|---|---|---|---|---|");
for (const [v, label, unit] of VARS) for (const lead of R.leads) {
  const cs = cells.filter((c) => c.v === v && c.lead === lead);
  if (!cs.length) continue;
  const better = cs.filter((c) => c.s.mae.weighted_bias < c.s.mae.current).length;
  const stations = new Map(cs.map((c) => [c.site.references[v].id, c]));
  const stationsBetter = [...stations.values()].filter((c) => c.s.mae.weighted_bias < c.s.mae.current).length;
  out(`| ${label} (${unit}) | ${lead} day | ${f2(median(cs.map((c) => c.s.mae.current)))} | ${f2(median(cs.map((c) => c.s.mae.weighted_bias)))} | ${signed(median(cs.map(learnedGain)))} | ${better} / ${cs.length - better} | ${stationsBetter} / ${stations.size - stationsBetter} |`);
}
out();
out("A positive change means the learned forecast has a lower error than today's forecast. Some locations share a temperature or wind reference station, so the independent-station column is the stricter count.");
out();

if (NATIONWIDE) {
  out("## By nation (median change, learned vs today, and locations better / scored)");
  out();
  out(`| Nation | ${VARS.flatMap(([, label]) => R.leads.map((l) => `${label} ${l}d`)).join(" | ")} |`);
  out(`|---|${VARS.flatMap(() => R.leads.map(() => "---")).join("|")}|`);
  for (const nation of nations) {
    const cols = VARS.flatMap(([v]) => R.leads.map((lead) => {
      const cs = cells.filter((c) => c.v === v && c.lead === lead && (c.site.nation ?? "England") === nation);
      if (!cs.length) return "–";
      return `${signed(median(cs.map(learnedGain)))} (${cs.filter((c) => c.s.mae.weighted_bias < c.s.mae.current).length}/${cs.length})`;
    }));
    out(`| ${nation} | ${cols.join(" | ")} |`);
  }
  out();
}

out("## All strategies (median MAE across sites)");
out();
const rows = ["current", "current_bias", "ukmo_seamless", "ecmwf_ifs025", "icon_seamless", "gfs_seamless", ...(WITH_AI ? ["ecmwf_aifs025_single"] : []), "mean", "best_recent", "weighted", "weighted_bias"];
const rowName = (r) => MODEL_NAMES[r] ?? r.replace("_", " ");
out(`| Variable | Lead | ${rows.map(rowName).join(" | ")} |`);
out(`|---|---|${rows.map(() => "---").join("|")}|`);
for (const [v, label] of VARS) for (const lead of R.leads) {
  const cs = cells.filter((c) => c.v === v && c.lead === lead);
  if (!cs.length) continue;
  const meds = rows.map((r) => median(cs.map((c) => c.s.mae[r])));
  const best = Math.min(...meds.filter((x) => x != null));
  out(`| ${label} | ${lead} | ${meds.map((m) => (m === best ? `**${f2(m)}**` : f2(m))).join(" | ")} |`);
}
out();

out("## By location");
out();
for (const [v, label, unit] of VARS) {
  out(`### ${label} (${unit}, MAE today → learned)`);
  out();
  out(`| Location | Area | Reference | ${R.leads.map((l) => `${l} day`).join(" | ")} |`);
  out(`|---|---|---|${R.leads.map(() => "---").join("|")}|`);
  for (const site of R.sites) {
    const ref = site.references[v];
    if (!ref) { out(`| ${site.name} | ${site.area} | none in range | ${R.leads.map(() => "–").join(" | ")} |`); continue; }
    const cols = R.leads.map((l) => {
      const s = site.scores[v]?.[l]?.[W];
      return s?.n ? `${f2(s.mae.current)} → ${f2(s.mae.weighted_bias)} (${signed(pct(s.mae.weighted_bias, s.mae.current))})` : "–";
    });
    out(`| ${site.name} | ${site.area} | ${ref.name} (${Math.round(ref.distance_km)} km, ${NETWORKS[ref.network] ?? ref.network}) | ${cols.join(" | ")} |`);
  }
  out();
}

out("## By season (median change, learned vs today)");
out();
out("| Variable | Lead | Winter | Spring | Summer | Autumn |");
out("|---|---|---|---|---|---|");
for (const [v, label] of VARS) for (const lead of R.leads) {
  const cs = cells.filter((c) => c.v === v && c.lead === lead);
  if (!cs.length) continue;
  const col = (k) => signed(median(cs.map((c) => { const s = c.s.seasons[k]; return s?.n ? pct(s.mae.weighted_bias, s.mae.current) : null; })));
  out(`| ${label} | ${lead} | ${col("DJF")} | ${col("MAM")} | ${col("JJA")} | ${col("SON")} |`);
}
out();

out("## Training window (median change of the learned forecast)");
out();
out(`| Variable | Lead | ${R.windows.map((w) => `${w} days`).join(" | ")} |`);
out(`|---|---|${R.windows.map(() => "---").join("|")}|`);
for (const [v, label] of VARS) for (const lead of R.leads) {
  const vals = R.windows.map((w) => median(R.sites.map((site) => { const s = site.scores[v]?.[lead]?.[w]; return s?.n ? pct(s.mae.weighted_bias, s.mae.current) : null; })));
  if (vals.every((x) => x == null)) continue;
  out(`| ${label} | ${lead} | ${vals.map(signed).join(" | ")} |`);
}
out();

out("## Which models the learner leans on (mean weight across sites)");
out();
out(`| Variable | Lead | ${Object.values(MODEL_NAMES).join(" | ")} |`);
out(`|---|---|${Object.keys(MODEL_NAMES).map(() => "---").join("|")}|`);
for (const [v, label] of VARS) for (const lead of R.leads) {
  const cs = cells.filter((c) => c.v === v && c.lead === lead);
  if (!cs.length) continue;
  const means = Object.keys(MODEL_NAMES).map((m) => cs.reduce((a, c) => a + (c.s.mean_weights[m] ?? 0), 0) / cs.length);
  out(`| ${label} | ${lead} | ${means.map((x) => `${Math.round(x * 100)}%`).join(" | ")} |`);
}
out();

if (cells.some((c) => c.v === "rain")) {
  out("## Rainfall: wet or dry day called right (median across sites, 1 mm threshold)");
  out();
  out("| Lead | Today | Learned | ECMWF | Met Office |");
  out("|---|---|---|---|---|");
  for (const lead of R.leads) {
    const cs = cells.filter((c) => c.v === "rain" && c.lead === lead);
    const m = (r) => `${Math.round((median(cs.map((c) => c.s.wet_day_accuracy[r])) ?? 0) * 100)}%`;
    out(`| ${lead} day | ${m("current")} | ${m("weighted_bias")} | ${m("ecmwf_ifs025")} | ${m("ukmo_seamless")} |`);
  }
  out();
}

const west = ["Seascale", "Kendal", "Garstang", "Settle"].map((n) => R.sites.find((x) => x.name === n)).filter(Boolean);
if (west.length) {
  out("## Rainfall in the west: what changes");
  out();
  out("Mean daily rainfall error (bias, forecast minus observed, mm/day) for AceWeather today and the model mean:");
  out();
  out("| Location | 1 day today | 1 day mean | 3 days today | 3 days mean | 5 days today | 5 days mean |");
  out("|---|---|---|---|---|---|---|");
  const b = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)}`;
  for (const site of west) out(`| ${site.name} | ${R.leads.map((l) => { const x = site.scores.rain[l][W]; return `${b(x.bias.current)} | ${b(x.bias.mean)}`; }).join(" | ")} |`);
  out();
  out("AceWeather's forecast (the Met Office model in the UK) is well calibrated for tomorrow but over-forecasts rain three to five days ahead by about 2–3 mm a day across Cumbria, Lancashire and the Dales. The model mean removes most of that bias, which is why rainfall errors there fall by a quarter to two-fifths.");
  out();
}

out("## Experiments");
out();
{
  const k = (v) => (v === "rain" ? "mean" : "weighted_bias");
  const perStation = (results, v, l, row) => {
    const seen = new Map();
    for (const site of results.sites) { const ref = site.references[v]; const s = site.scores[v]?.[l]?.[W]; if (ref && s?.n && !seen.has(ref.id)) seen.set(ref.id, s.mae[row]); }
    return seen;
  };
  out("**Time-of-day bias correction.** Correcting the blend's bias separately for each 3-hour block of the day (a simple form of model output statistics) instead of with one number:");
  out();
  out("| Variable | Lead | One bias | By time of day | Stations better |");
  out("|---|---|---|---|---|");
  for (const [v, label] of VARS.slice(0, 2)) for (const lead of R.leads) {
    const a = perStation(R, v, lead, "weighted_bias"); const b = perStation(R, v, lead, "weighted_bias_diurnal");
    const mean = (m) => [...m.values()].reduce((x, y) => x + y, 0) / m.size;
    out(`| ${label} | ${lead} | ${f2(mean(a))} | ${f2(mean(b))} | ${[...a.keys()].filter((id) => b.get(id) < a.get(id)).length} / ${a.size} |`);
  }
  out();
  out("It made no meaningful difference, so the live forecast keeps a single bias per lead day.");
  out();
  const aiFile = join(CACHE, "results-ecmwf_aifs025_single.json");
  if (!WITH_AI && existsSync(aiFile)) {
    const AI = JSON.parse(readFileSync(aiFile, "utf8"));
    out("**Adding ECMWF's AI model (AIFS).** The same backtest with AIFS as a fifth model, averaged over independent stations:");
    out();
    out("| Variable | Lead | Learned, four models | Learned, with AIFS | Change | Stations better |");
    out("|---|---|---|---|---|---|");
    for (const [v, label] of VARS) for (const lead of R.leads) {
      const a = perStation(R, v, lead, k(v)); const b = perStation(AI, v, lead, k(v));
      const mean = (m) => [...m.values()].reduce((x, y) => x + y, 0) / m.size;
      out(`| ${label} | ${lead} | ${f2(mean(a))} | ${f2(mean(b))} | ${signed((1 - mean(b) / mean(a)) * 100)} | ${[...a.keys()].filter((id) => b.get(id) < a.get(id)).length} / ${a.size} |`);
    }
    out();
    out("AIFS adds nothing for tomorrow but 2–4% more at three to five days, so the live forecast includes it from day 3.");
    out();
  }
}

out("## Recommendation");
out();
out("1. **Temperature and wind:** show the inverse-error weighted mean of ECMWF, GFS, ICON and the Met Office model (plus AIFS from day 3), minus the blend's mean error over the last 60 days at the nearest reference station. In practice the weights stay close to equal, so the gain is robust rather than tuned.");
out("2. **Rainfall:** show the equal-weight mean of the same models with no bias shift. It was the best rainfall strategy at every lead time.");
out("3. **Fallback:** where no reference station has 20 days of data, keep today's forecast. Carlisle had no representative temperature station in this test.");
out("4. **Keep scoring:** run the same comparison daily on live data, so a change in any model shows up within weeks.");
out();

out("## Limits");
out();
out("- Scores describe the reference stations, not the farms. A reference is chosen by distance plus 10 km per 100 m of height difference, and never more than 250 m above or below the location; the location tables give every distance.");
if (NATIONWIDE) out("- Rainfall in Wales and Northern Ireland is checked against a handful of COSMOS-UK sites (no open national gauge feed); Brecon and Coleraine had no rain reference at all.");
out("- METAR temperatures are whole degrees, which adds about 0.25 °C to every strategy equally.");
out("- One year is one set of seasons. A repeat next year would show whether the gains are stable.");
out("- Rain gauges are single points; convective showers can miss a gauge that the models forecast correctly a few kilometres away.");
out("- Wind at COSMOS-UK sites is measured below 10 m, so wind is scored at airports and Met Office stations only.");
writeFileSync(join(process.cwd(), "docs", "mcp", OUT_FILE), lines.join("\n") + "\n");
console.log(`wrote docs/mcp/${OUT_FILE}`);
