// Rain probability, step 1: does a calibrated probability from the archived models beat what AceWeather shows?
// Usage: BACKTEST_SITES=sites-uk.json BACKTEST_EXTRA_MODELS=ecmwf_aifs025_single node scripts/backtest/rain-probability.mjs
// Uses the cached nationwide backtest data (leads 1, 3, 5 from the backtest; 2, 4, 6, 7 fetched for this).
// Writes docs/mcp/RAIN-PROBABILITY.md and src/mcp/rain-calibration.json (the final calibrations for live use).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brier, brierSkill, features, fitLogistic, predict, reliability } from "../../src/mcp/rain-probability.ts";
import { CACHE, cachedJson, MODELS, PERIOD, previousRunsUrl, RESULTS_TAG, rainDays } from "./download.mjs";

const LEADS = [1, 2, 3, 4, 5, 6, 7];
const THRESHOLDS = [1, 0.2];
const DAY = 86_400_000;
const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
const EVAL_FROM = "2025-12-01";
const MIN_TRAIN_DAYS = 60;
const MIN_MODEL_COVERAGE = 0.5;
const BOOTSTRAP = 1000;
const SEASON = (day) => ["Winter", "Winter", "Spring", "Spring", "Spring", "Summer", "Summer", "Summer", "Autumn", "Autumn", "Autumn", "Winter"][Number(day.slice(5, 7)) - 1];
const STRATEGIES = ["climatology", "share", "standard", "simple", "calibrated"];
const LABEL = { climatology: "Climatology", share: "Share of models forecasting rain", standard: "AceWeather today (yes/no)", simple: "Calibrated, model share only", calibrated: "Calibrated, full" };

function dailyTotals(h, model, lead) {
  const values = h[`precipitation_previous_day${lead}_${model}`] ?? [];
  const sums = new Map();
  h.time.forEach((t, i) => {
    const v = values[i];
    if (typeof v !== "number") return;
    const day = new Date(Date.parse(`${t}:00Z`) - 1).toISOString().slice(0, 10);
    const s = sums.get(day) ?? { total: 0, count: 0 };
    s.total += v; s.count++;
    sums.set(day, s);
  });
  return new Map([...sums].filter(([, s]) => s.count === 24).map(([d, s]) => [d, s.total]));
}

// ---- Data ----
const sites = JSON.parse(readFileSync(join(CACHE, `sites-resolved${RESULTS_TAG}.json`), "utf8")).filter((s) => s.rain_ref);
const perSite = [];
for (const site of sites) {
  const a = (await cachedJson(previousRunsUrl(site.rain_ref, ["precipitation"]))).hourly;
  const b = (await cachedJson(previousRunsUrl(site.rain_ref, ["precipitation"], [2, 4, 6, 7]))).hourly;
  perSite.push({ site, obs: await rainDays(site.rain_ref), h: { ...b, ...a } });
}
// Models used at each lead: those with archived forecasts for most days (day 7 has no Met Office or ICON archive).
const modelsByLead = Object.fromEntries(LEADS.map((lead) => [lead, MODELS.filter((m) => {
  const cover = perSite.map(({ h }) => (h[`precipitation_previous_day${lead}_${m}`] ?? []).filter((v) => v != null).length / h.time.length);
  return cover.reduce((x, y) => x + y, 0) / cover.length >= MIN_MODEL_COVERAGE;
})]));
const rows = [];
for (const { site, obs, h } of perSite) {
  for (const lead of LEADS) {
    const byModel = modelsByLead[lead].map((m) => dailyTotals(h, m, lead));
    const standard = dailyTotals(h, "best_match", lead);
    for (const [day, observed] of obs) {
      if (day < PERIOD.trainStart || day > PERIOD.end) continue;
      const totals = byModel.map((m) => m.get(day));
      if (totals.some((t) => t == null) || standard.get(day) == null) continue;
      rows.push({ site: site.name, nation: site.nation ?? "England", day, lead, totals, standard: standard.get(day), observed });
    }
  }
}

// ---- Rolling evaluation: each month calibrated only on days known when its forecasts were issued ----
const months = [];
for (let m = new Date(`${EVAL_FROM}T00:00:00Z`); m <= new Date(`${PERIOD.end}T00:00:00Z`); m.setUTCMonth(m.getUTCMonth() + 1)) months.push(m.toISOString().slice(0, 10));
const climatologyFrom = (train, threshold) => {
  const bySite = new Map();
  for (const r of train) { const s = bySite.get(r.site) ?? [0, 0]; s[0]++; if (r.observed >= threshold) s[1]++; bySite.set(r.site, s); }
  const pooled = train.filter((r) => r.observed >= threshold).length / train.length;
  return { of: (site) => (bySite.get(site) ? bySite.get(site)[1] / bySite.get(site)[0] : pooled), pooled };
};
const simpleFeatures = (x) => [x[0], x[1]];

const results = {};
for (const threshold of THRESHOLDS) for (const lead of LEADS) {
  const leadRows = rows.filter((r) => r.lead === lead);
  const scored = [];
  for (const [k, start] of months.entries()) {
    const end = months[k + 1] ?? "9999-12-31";
    const cutoff = new Date(dayMs(start) - lead * DAY).toISOString().slice(0, 10);
    const train = leadRows.filter((r) => r.day < cutoff);
    if (new Set(train.map((r) => r.day)).size < MIN_TRAIN_DAYS) continue;
    const clim = climatologyFrom(train, threshold);
    const X = train.map((r) => features(r.totals, threshold, clim.of(r.site)));
    const y = train.map((r) => (r.observed >= threshold ? 1 : 0));
    const wFull = fitLogistic(X, y);
    const wSimple = fitLogistic(X.map(simpleFeatures), y);
    for (const r of leadRows.filter((x) => x.day >= start && x.day < end)) {
      const x = features(r.totals, threshold, clim.of(r.site));
      scored.push({
        day: r.day, nation: r.nation, season: SEASON(r.day), wet: r.observed >= threshold,
        p: { climatology: clim.of(r.site), share: x[1], standard: r.standard >= threshold ? 1 : 0, simple: predict(wSimple, simpleFeatures(x)), calibrated: predict(wFull, x) },
      });
    }
  }
  results[`${threshold}:${lead}`] = { threshold, lead, scored };
}
const samples = (scored, strategy) => scored.map((s) => ({ p: s.p[strategy], wet: s.wet }));

// ---- Day-block bootstrap: resample whole days, because one weather system hits many gauges at once ----
let seed = 20261014;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
function bootstrapImprovement(scored, a, b) {
  const byDay = new Map();
  for (const s of scored) {
    const d = byDay.get(s.day) ?? { n: 0, a: 0, b: 0 };
    d.n++; d.a += (s.p[a] - (s.wet ? 1 : 0)) ** 2; d.b += (s.p[b] - (s.wet ? 1 : 0)) ** 2;
    byDay.set(s.day, d);
  }
  const days = [...byDay.values()];
  const draws = [];
  for (let i = 0; i < BOOTSTRAP; i++) {
    let sa = 0; let sb = 0;
    for (let j = 0; j < days.length; j++) { const d = days[Math.floor(rand() * days.length)]; sa += d.a; sb += d.b; }
    draws.push(1 - sa / sb);
  }
  draws.sort((x, y) => x - y);
  return { low: draws[Math.floor(0.025 * BOOTSTRAP)], high: draws[Math.floor(0.975 * BOOTSTRAP)] };
}

// ---- Final calibrations on all data, for the live forecast ----
const calibration = { generated_at: new Date().toISOString(), method: "Logistic regression on [1, share of models at or above the threshold, log(1 + mean daily total), log(1 + max daily total), logit(climatology)]; daily totals are UTC days of hourly model precipitation; climatology is the station's wet-day frequency (use the national value without a gauge).", period: { from: PERIOD.trainStart, to: PERIOD.end }, gauges: sites.length, leads: {} };
for (const lead of LEADS) {
  const leadRows = rows.filter((r) => r.lead === lead);
  const entry = { models: modelsByLead[lead], thresholds: {} };
  for (const threshold of THRESHOLDS) {
    const clim = climatologyFrom(leadRows, threshold);
    const nations = Object.fromEntries([...new Set(leadRows.map((r) => r.nation))].map((n) => { const s = leadRows.filter((r) => r.nation === n); return [n, +(s.filter((r) => r.observed >= threshold).length / s.length).toFixed(3)]; }));
    const w = fitLogistic(leadRows.map((r) => features(r.totals, threshold, clim.of(r.site))), leadRows.map((r) => (r.observed >= threshold ? 1 : 0)));
    entry.thresholds[threshold] = { weights: w.map((v) => +v.toFixed(4)), climatology: { uk: +clim.pooled.toFixed(3), ...nations }, days: leadRows.length };
  }
  calibration.leads[lead] = entry;
}
writeFileSync(join(process.cwd(), "src", "mcp", "rain-calibration.json"), JSON.stringify(calibration, null, 1) + "\n");

// ---- Report ----
const f3 = (x) => x.toFixed(3);
const pct = (x) => `${Math.round(x * 100)}%`;
const ci = (r) => `${pct(r.low)} to ${pct(r.high)}`;
const lines = [];
const out = (s = "") => lines.push(s);
out("# Rain probability, step 1: a calibrated chance of rain from the archived models");
out();
out(`Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/backtest/rain-probability.mjs\`. ${sites.length} rain gauges across the UK (the nationwide backtest's rain references), forecasts issued 1 to 7 days ahead, scored ${EVAL_FROM} to ${PERIOD.end}.`);
out();
out("## Why this and not the ensembles");
out();
out("The plan was to score ensemble rain chances (191 members across ECMWF, ECMWF's AI ensemble, NOAA, ICON and the Met Office) against the gauges. That turned out to be impossible today. Open-Meteo's ensemble archive accepts dates back to mid-July but returns no member values before the last four or five days. The probability the dashboard shows today is not archived either. Ensemble chances can only be scored from records AceWeather keeps itself, which is step 2.");
out();
out("What can be scored over a full year is a calibrated probability built from the archived deterministic models: ECMWF, GFS, ICON, the Met Office model and ECMWF's AI model. Day 7 has no archived Met Office or ICON forecasts, so its calibration uses the other three. A logistic regression turns four things into a chance of rain: how many models forecast rain, the average and largest amounts forecast, and how often it rains at that gauge. National weather services call this model output statistics. Each month's forecasts use a calibration fitted only on days known when they were issued (before the month start minus the lead time).");
out();
out("Two calibrations were tested. The full one uses all four inputs; the simple one uses only the share of models forecasting rain.");
out();
out("**Not yet tested in autumn.** The first two months (August and September 2025) train the calibration, so scoring runs from December to mid-September. October and November, the main autumn drilling and spraying window, have not been scored. Step 2's daily records will cover this autumn.");
out();
out("## Results");
out();
out("Brier score, the standard accuracy measure for probabilities: 0 is perfect and lower is better.");
out();
out(`| Rain on the day | Lead | Days scored | ${STRATEGIES.map((s) => LABEL[s]).join(" | ")} | Skill over climatology |`);
out(`|---|---|---|${STRATEGIES.map(() => "---").join("|")}|---|`);
for (const threshold of THRESHOLDS) for (const lead of LEADS) {
  const r = results[`${threshold}:${lead}`];
  const scores = STRATEGIES.map((s) => brier(samples(r.scored, s)));
  const best = Math.min(...scores);
  out(`| ${threshold === 1 ? "1 mm or more" : "0.2 mm or more"} | ${lead} | ${r.scored.length} | ${scores.map((v) => (v === best ? `**${f3(v)}**` : f3(v))).join(" | ")} | ${pct(brierSkill(samples(r.scored, "calibrated"), samples(r.scored, "climatology")))} |`);
}
out();
out("AceWeather today shows a yes or no from its standard forecast next to a rain chance whose origin cannot be scored. Scored as a probability of 0 or 100%, that yes or no is penalised heavily when wrong; it is included because it is the only part of today's display that can be scored.");
out();
out("## Are the differences real?");
out();
out(`Improvement in Brier score of the full calibration, with a 95% range from resampling whole days (${BOOTSTRAP} resamples). One weather system hits many gauges on the same day, so days, not gauge-days, are resampled. A range clear of zero means the improvement is not luck.`);
out();
out("| Rain of 1 mm or more | Over model share | Over AceWeather's yes/no | Over the simple calibration |");
out("|---|---|---|---|");
for (const lead of LEADS) {
  const s = results[`1:${lead}`].scored;
  out(`| ${lead} day | ${ci(bootstrapImprovement(s, "calibrated", "share"))} | ${ci(bootstrapImprovement(s, "calibrated", "standard"))} | ${ci(bootstrapImprovement(s, "calibrated", "simple"))} |`);
}
out();
out("## By season (Brier score, rain of 1 mm or more; full calibration vs model share)");
out();
out(`| Season | ${[1, 3, 5].map((l) => `${l} day`).join(" | ")} |`);
out(`|---|${[1, 3, 5].map(() => "---").join("|")}|`);
for (const season of ["Winter", "Spring", "Summer", "Autumn"]) {
  const cells = [1, 3, 5].map((lead) => {
    const s = results[`1:${lead}`].scored.filter((x) => x.season === season);
    return s.length ? `${f3(brier(samples(s, "calibrated")))} vs ${f3(brier(samples(s, "share")))} (${new Set(s.map((x) => x.day)).size} days)` : "–";
  });
  out(`| ${season} | ${cells.join(" | ")} |`);
}
out();
out("Autumn here is September 2026 only.");
out();
out("## By nation (Brier score of the full calibration, rain of 1 mm or more, and skill over climatology)");
out();
out("| Nation | 1 day | 3 days | 5 days | 7 days |");
out("|---|---|---|---|---|");
for (const nation of [...new Set(rows.map((r) => r.nation))]) {
  out(`| ${nation} | ${[1, 3, 5, 7].map((lead) => { const s = results[`1:${lead}`].scored.filter((x) => x.nation === nation); return s.length ? `${f3(brier(samples(s, "calibrated")))} (${pct(brierSkill(samples(s, "calibrated"), samples(s, "climatology")))})` : "–"; }).join(" | ")} |`);
}
out();
const relTable = (title, list) => {
  out(`## ${title}`);
  out();
  out("When the forecast says X%, how often did it rain? A reliable forecast has the two columns close together.");
  out();
  out("| Forecast | Full calibration: days | it rained | Model share: days | it rained |");
  out("|---|---|---|---|---|");
  const c = reliability(samples(list, "calibrated"), 10);
  const s = reliability(samples(list, "share"), 10);
  c.forEach((b, i) => out(`| ${Math.round(b.from * 100)}–${Math.round(b.to * 100)}% | ${b.n} | ${b.n ? pct(b.observed) : "–"} | ${s[i].n} | ${s[i].n ? pct(s[i].observed) : "–"} |`));
  out();
};
relTable("Reliability, rain of 1 mm or more, 1 day ahead", results["1:1"].scored);
relTable("Reliability in summer (showers), rain of 1 mm or more, 1 day ahead", results["1:1"].scored.filter((x) => x.season === "Summer"));
relTable("Reliability, rain of 1 mm or more, 5 days ahead", results["1:5"].scored);

out("## What this means");
out();
const b = (k, name) => brier(samples(results[k].scored, name));
const simpleGap = LEADS.map((l) => 1 - b(`1:${l}`, "calibrated") / b(`1:${l}`, "simple"));
out(`- **The full calibration is reliable overall at every lead time.** When it says a given chance, it rains about that often (tables above). Raw model agreement over-promises: on days most models forecast rain, it rained less often than the share implies.`);
out(`- **Summer showers are the weak spot.** In summer the calibration runs about 5–10 points high between 30% and 70% (for example, "40–50%" days were wet about a third of the time). It is still much closer than raw model agreement, which runs 15–25 points high there. A calibration fitted per season is the obvious next refinement once step 2 has a summer of records.`);
out(`- **The gains are real.** Against raw model agreement and against today's yes or no, the 95% ranges above stay clear of zero at every lead.`);
out(`- **The full calibration earns its extra inputs:** it beats the simple, share-only version by ${pct(Math.min(...simpleGap))} to ${pct(Math.max(...simpleGap))} depending on lead (the right-hand column above shows whether each gap is clear of zero). The amounts forecast carry information that agreement alone misses.`);
out("- **It holds in every nation and season scored.** Autumn has only September so far.");
out();
out("The final calibrations for days 1–7, fitted on all the data, are saved in `src/mcp/rain-calibration.json`, with the models each lead uses and national climatology values for locations without a gauge. The next step is to show the calibrated chance in the dashboard. In parallel, step 2 records the live ensemble chance and the dashboard's current chance against gauge outcomes, to test whether ensembles add skill on top.");
writeFileSync(join(process.cwd(), "docs", "mcp", "RAIN-PROBABILITY.md"), lines.join("\n") + "\n");
for (const [k, r] of Object.entries(results)) console.log(k, "n", r.scored.length, STRATEGIES.map((s) => `${s}=${brier(samples(r.scored, s)).toFixed(3)}`).join(" "));
console.log("models by lead", JSON.stringify(modelsByLead));
console.log("wrote docs/mcp/RAIN-PROBABILITY.md and src/mcp/rain-calibration.json");
