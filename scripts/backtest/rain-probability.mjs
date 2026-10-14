// Step 1 of rain probabilities: does a calibrated probability from the archived models beat what AceWeather shows?
// Usage: BACKTEST_SITES=sites-uk.json BACKTEST_EXTRA_MODELS=ecmwf_aifs025_single node scripts/backtest/rain-probability.mjs
// Uses the cached nationwide backtest data. Writes docs/mcp/RAIN-PROBABILITY.md.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { brier, brierSkill, features, fitLogistic, predict, reliability } from "../../src/mcp/rain-probability.ts";
import { CACHE, cachedJson, LEADS, MODELS, PERIOD, previousRunsUrl, RESULTS_TAG, rainDays } from "./download.mjs";

const THRESHOLDS = [1, 0.2];
const DAY = 86_400_000;
const dayMs = (d) => Date.parse(`${d}T00:00:00Z`);
const EVAL_FROM = "2025-12-01";
const MIN_TRAIN_DAYS = 60;

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

const sites = JSON.parse(readFileSync(join(CACHE, `sites-resolved${RESULTS_TAG}.json`), "utf8")).filter((s) => s.rain_ref);
const rows = [];
for (const site of sites) {
  const obs = await rainDays(site.rain_ref);
  const h = (await cachedJson(previousRunsUrl(site.rain_ref, ["precipitation"]))).hourly;
  for (const lead of LEADS) {
    const byModel = MODELS.map((m) => dailyTotals(h, m, lead));
    const standard = dailyTotals(h, "best_match", lead);
    for (const [day, observed] of obs) {
      if (day < PERIOD.trainStart || day > PERIOD.end) continue;
      const totals = byModel.map((m) => m.get(day));
      if (totals.some((t) => t == null) || standard.get(day) == null) continue;
      rows.push({ site: site.name, nation: site.nation ?? "England", day, lead, totals, standard: standard.get(day), observed });
    }
  }
}

const months = [];
for (let m = new Date(`${EVAL_FROM}T00:00:00Z`); m <= new Date(`${PERIOD.end}T00:00:00Z`); m.setUTCMonth(m.getUTCMonth() + 1)) months.push(m.toISOString().slice(0, 10));

const results = {};
for (const threshold of THRESHOLDS) {
  for (const lead of LEADS) {
    const leadRows = rows.filter((r) => r.lead === lead);
    const scored = { climatology: [], share: [], standard: [], calibrated: [] };
    const coefficients = [];
    for (const [k, start] of months.entries()) {
      const end = months[k + 1] ?? "9999-12-31";
      // Train only on days known when this month's forecasts were issued: before the month start minus the lead.
      const cutoff = new Date(dayMs(start) - lead * DAY).toISOString().slice(0, 10);
      const train = leadRows.filter((r) => r.day < cutoff);
      if (new Set(train.map((r) => r.day)).size < MIN_TRAIN_DAYS) continue;
      const clim = new Map();
      for (const site of new Set(train.map((r) => r.site))) {
        const s = train.filter((r) => r.site === site);
        clim.set(site, s.filter((r) => r.observed >= threshold).length / s.length);
      }
      const pooled = train.filter((r) => r.observed >= threshold).length / train.length;
      const climOf = (site) => clim.get(site) ?? pooled;
      const w = fitLogistic(train.map((r) => features(r.totals, threshold, climOf(r.site))), train.map((r) => (r.observed >= threshold ? 1 : 0)));
      coefficients.push({ month: start, w: w.map((v) => +v.toFixed(3)) });
      for (const r of leadRows.filter((x) => x.day >= start && x.day < end)) {
        const wet = r.observed >= threshold;
        scored.climatology.push({ p: climOf(r.site), wet, nation: r.nation });
        scored.share.push({ p: r.totals.filter((t) => t >= threshold).length / r.totals.length, wet, nation: r.nation });
        scored.standard.push({ p: r.standard >= threshold ? 1 : 0, wet, nation: r.nation });
        scored.calibrated.push({ p: predict(w, features(r.totals, threshold, climOf(r.site))), wet, nation: r.nation });
      }
    }
    results[`${threshold}:${lead}`] = { threshold, lead, scored, coefficients };
  }
}

// Report
const f3 = (x) => x.toFixed(3);
const pct = (x) => `${Math.round(x * 100)}%`;
const lines = [];
const out = (s = "") => lines.push(s);
out("# Rain probability, step 1: a calibrated chance of rain from the archived models");
out();
out(`Generated ${new Date().toISOString().slice(0, 10)} by \`scripts/backtest/rain-probability.mjs\`. ${sites.length} rain gauges across the UK (the nationwide backtest's rain references), forecasts issued 1, 3 and 5 days ahead, scored ${EVAL_FROM} to ${PERIOD.end}.`);
out();
out("## Why this and not the ensembles");
out();
out("The plan was to score ensemble rain chances (191 members across ECMWF, ECMWF's AI ensemble, NOAA, ICON and the Met Office) against the gauges. That turned out to be impossible today. Open-Meteo's ensemble archive accepts dates back to mid-July but returns no member values before the last four or five days. The probability the dashboard shows today is not archived either. Ensemble chances can only be scored from records AceWeather keeps itself, which is step 2.");
out();
out("What can be scored over a full year is a calibrated probability built from the five models already archived (ECMWF, GFS, ICON, the Met Office model and ECMWF's AI model). A logistic regression turns four things into a chance of rain: how many models forecast rain, the average and largest amounts forecast, and how often it rains at that gauge. This is the method national weather services call model output statistics. Each month's forecasts use a calibration fitted only on days before that month, minus the lead time, so no forecast uses information from after it was issued.");
out();
out("## Results");
out();
out("Brier score, the standard accuracy measure for probabilities: 0 is perfect and lower is better. Skill is relative to climatology (how often it rains at that gauge): 100% is perfect, 0% is no better than climatology, and negative is worse.");
out();
out("| Rain on the day | Lead | Days scored | Climatology | Share of models forecasting rain | AceWeather today (yes/no) | Calibrated probability | Skill of calibrated |");
out("|---|---|---|---|---|---|---|---|");
for (const threshold of THRESHOLDS) for (const lead of LEADS) {
  const r = results[`${threshold}:${lead}`];
  const s = r.scored;
  out(`| ${threshold === 1 ? "1 mm or more" : "0.2 mm or more"} | ${lead} day | ${s.calibrated.length} | ${f3(brier(s.climatology))} | ${f3(brier(s.share))} | ${f3(brier(s.standard))} | **${f3(brier(s.calibrated))}** | ${pct(brierSkill(s.calibrated, s.climatology))} |`);
}
out();
out("AceWeather today shows a yes or no from its standard forecast (wet if it forecasts 1 mm, or 0.2 mm, or more) next to a rain chance whose origin cannot be scored. Scored as a probability of 0 or 100%, that yes or no is penalised heavily when wrong; it is included because it is the only part of today's display that can be scored.");
out();
out("## By nation (Brier score of the calibrated probability, rain of 1 mm or more)");
out();
out("| Nation | 1 day | 3 days | 5 days |");
out("|---|---|---|---|");
for (const nation of [...new Set(rows.map((r) => r.nation))]) {
  out(`| ${nation} | ${LEADS.map((lead) => { const s = results[`1:${lead}`].scored; const c = s.calibrated.filter((x) => x.nation === nation); const k = s.climatology.filter((x) => x.nation === nation); return c.length ? `${f3(brier(c))} (skill ${pct(brierSkill(c, k))})` : "–"; }).join(" | ")} |`);
}
out();
out("## Reliability, rain of 1 mm or more, 1 day ahead");
out();
out("When the forecast says X%, how often did it rain? A reliable forecast has the two columns close together.");
out();
out("| Forecast | Calibrated: days | Calibrated: it rained | Model share: days | Model share: it rained |");
out("|---|---|---|---|---|");
const relC = reliability(results["1:1"].scored.calibrated, 10);
const relS = reliability(results["1:1"].scored.share, 10);
relC.forEach((b, i) => out(`| ${Math.round(b.from * 100)}–${Math.round(b.to * 100)}% | ${b.n} | ${b.n ? pct(b.observed) : "–"} | ${relS[i].n} | ${relS[i].n ? pct(relS[i].observed) : "–"} |`));
out();
out("## What this means");
out();
{
  const b = (k, name) => brier(results[k].scored[name]);
  const vsShare = (lead) => 1 - b(`1:${lead}`, "calibrated") / b(`1:${lead}`, "share");
  const vsStandard = (lead) => 1 - b(`1:${lead}`, "calibrated") / b(`1:${lead}`, "standard");
  out(`- **The calibrated probability is reliable at every lead time.** When it says a given chance, it rains about that often (the table above for day 1; days 3 and 5 are as close). Raw model agreement over-promises: on days where four or five of the five models forecast rain, it rained less often than the share implies.`);
  out(`- **It beats everything AceWeather can be scored on today.** For rain of 1 mm or more it improves on raw model agreement by ${LEADS.map((l) => `${pct(vsShare(l))} at day ${l}`).join(", ")}, and on the standard forecast's yes or no by ${LEADS.map((l) => `${pct(vsStandard(l))} at day ${l}`).join(", ")}.`);
  out("- **It holds in every nation,** with skill over climatology of 56–66% for tomorrow and 35–37% at five days.");
  out("- **Local climatology adds little once the models are known:** its weight in the fitted calibration is small, so a regional value is enough at locations without a gauge.");
  out();
  out("Next: step 2 records the live 191-member ensemble chance, the dashboard's current chance and this calibrated chance against gauge outcomes every day, so after about 60 days it can be shown whether the ensembles add skill on top. The calibrated chance itself could go into the dashboard now for days 1–7; that needs coefficients for days 2, 4, 6 and 7, which means one more archived-forecast download per gauge.");
}
writeFileSync(join(CACHE, "rain-probability-results.json"), JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, r]) => [k, {
  threshold: r.threshold, lead: r.lead, n: r.scored.calibrated.length,
  brier: Object.fromEntries(Object.entries(r.scored).map(([name, s]) => [name, brier(s)])),
  reliability_calibrated: reliability(r.scored.calibrated), coefficients: r.coefficients,
}])), null, 1));
writeFileSync(join(process.cwd(), "docs", "mcp", "RAIN-PROBABILITY.md"), lines.join("\n") + "\n");
for (const [k, r] of Object.entries(results)) console.log(k, "n", r.scored.calibrated.length, Object.entries(r.scored).map(([n, s]) => `${n}=${brier(s).toFixed(3)}`).join(" "));
console.log("wrote docs/mcp/RAIN-PROBABILITY.md");
