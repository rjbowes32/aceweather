"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RefreshIcon } from "@/components/aceweather-x/icons";
import { apiUrl } from "@/lib/api-base";

import { RainMap } from "./rain-map";
import styles from "./atlas.module.css";
import { classifyAtlasTrust, isAtlasPayload, type AtlasPayload } from "./types";

type LoadState = "loading" | "fresh" | "cached" | "error";

const CROP_LABELS: Record<string, string> = {
  wheat: "Wheat",
  winter_barley: "Winter barley",
  spring_barley: "Spring barley",
  winter_osr: "Winter OSR",
  oats: "Oats",
};

function formatDate(value?: string | null) {
  if (!value) return "Unknown";
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function titleCase(value: string) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "—";
}

function anomalyClass(value: number) {
  if (value < -3) return styles.negative;
  if (value > 3) return styles.positive;
  return "";
}

function signalTone(value: string) {
  const normalized = value.toLowerCase();
  if (["exceptional", "serious", "high", "poor"].some((term) => normalized.includes(term))) return styles.risk;
  if (["regional", "mixed", "watch", "moderate"].some((term) => normalized.includes(term))) return styles.warn;
  return styles.cool;
}

function LoadingAtlas() {
  return (
    <div className={styles.loading} role="status" aria-live="polite" aria-label="Loading Atlas">
      <div className={styles.loadingHeader} />
      <div className={styles.loadingHero} />
      <div className={styles.loadingGrid}>
        <div /><div /><div /><div />
      </div>
      <div className={styles.loadingPanels}><div /><div /></div>
    </div>
  );
}

export function AtlasExperience() {
  const [payload, setPayload] = useState<AtlasPayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const payloadRef = useRef<AtlasPayload | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    setRefreshFailed(false);
    try {
      const response = await fetch(apiUrl("/api/atlas?schema=atlas.v1"), { cache: "no-cache" });
      if (!response.ok) throw new Error(`Atlas request failed: ${response.status}`);
      const raw: unknown = await response.json();
      if (!isAtlasPayload(raw)) throw new Error("Atlas response does not match atlas.v1");

      const cacheSource = response.headers.get("x-aw-cache-source");
      const cachedAt = response.headers.get("x-aw-cached-at");
      const cacheAge = cachedAt ? Date.now() - Date.parse(cachedAt) : 0;
      const generatedAge = Date.now() - Date.parse(raw.generated_at);
      const repeatedSnapshot = payloadRef.current?.generated_at === raw.generated_at;
      const trustState = classifyAtlasTrust({ cacheSource, cacheAgeMs: cacheAge, generatedAgeMs: generatedAge, repeatedSnapshot });
      const servedFromCache = trustState === "cached";
      setRefreshFailed(Boolean(payloadRef.current && servedFromCache));
      payloadRef.current = raw;
      setPayload(raw);
      setLoadState(servedFromCache ? "cached" : "fresh");
    } catch {
      setPayload((current) => {
        setLoadState(current ? "cached" : "error");
        setRefreshFailed(Boolean(current));
        return current;
      });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const forage = useMemo(
    () => new Map(payload?.forage.map((row) => [row.location, row.grass_growth_kg_dm_ha_day]) ?? []),
    [payload],
  );

  if (!payload && loadState === "loading") {
    return <LoadingAtlas />;
  }

  if (!payload) {
    return (
      <section className={styles.errorState} role="alert">
        <span className={styles.errorDot} aria-hidden="true" />
        <div><strong>Atlas unavailable</strong><small>No current snapshot</small></div>
        <button type="button" onClick={() => void load()} disabled={refreshing}>Retry</button>
      </section>
    );
  }

  const snapshotDate = payload.freshness?.snapshot?.as_of || payload.updated;
  const statusLabel = refreshFailed
    ? `Refresh failed · ${titleCase(payload.status)}`
    : loadState === "cached" ? `Cached · ${titleCase(payload.status)}` : titleCase(payload.status);
  const signals = [
    ["Weather", payload.drought.meteorological.status],
    ["Soil / crops", payload.drought.agricultural.status],
    ["Water", payload.drought.hydrological.status],
    ["Yield", payload.drought.measured_yield_impact.status],
  ];

  return (
    <div className={styles.shell} aria-busy={refreshing}>
      <header className={styles.header}>
        <div className={styles.identity}>
          <span className={styles.brandMark} aria-hidden="true" />
          <div>
            <span className={styles.eyebrow}>UK Crop Weather Atlas</span>
            <h1>{payload.edition}</h1>
          </div>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.dataStatus} ${loadState === "cached" ? styles.isCached : ""}`} role="status" aria-live="polite">
            {statusLabel} · {formatDate(snapshotDate)}
          </span>
          <button
            type="button"
            className={`${styles.refresh} ${refreshing ? styles.isRefreshing : ""}`}
            onClick={() => void load()}
            disabled={refreshing}
            aria-label={refreshing ? "Refreshing Atlas" : "Refresh Atlas"}
          >
            <RefreshIcon />
          </button>
        </div>
      </header>

      <section className={styles.hero} aria-label="Atlas headline signals">
        <div className={styles.heroLead}>
          <span className={styles.heroIcon} aria-hidden="true"><i /></span>
          <div>
            <span className={styles.eyebrow}>Season status</span>
            <strong>{titleCase(payload.drought.meteorological.status)}</strong>
            <small>{payload.drought.england_area_pct}% of England in drought</small>
          </div>
        </div>
        <div className={styles.keyMetrics}>
          <div><span>July rain</span><strong className={styles.negative}>{payload.headline.england_july_rain_mm}<small> mm</small></strong></div>
          <div><span>Wheat</span><strong className={styles.negative}>{payload.headline.wheat_yield_t_ha}<small> t/ha</small></strong></div>
          <div><span>Reservoirs</span><strong>{payload.headline.reservoir_storage_pct}<small>%</small></strong></div>
          <div><span>Recovery rain</span><strong>{payload.headline.recovery_rainfall_pct_lta}<small>% LTA</small></strong></div>
        </div>
      </section>

      <section className={styles.signalGrid} aria-label="Drought signals">
        {signals.map(([label, value]) => (
          <div key={label} className={signalTone(value)}>
            <span>{label}</span>
            <strong>{titleCase(value)}</strong>
          </div>
        ))}
      </section>

      <section className={styles.waterStrip} aria-label="Water resources">
        <div><span>England in drought</span><strong>{payload.drought.england_area_pct}%</strong></div>
        <div><span>Low river sites</span><strong>{payload.drought.river_flows_below_normal_or_lower_pct}%</strong></div>
        <div><span>Restrictions</span><strong>{payload.drought.abstraction_restrictions.toLocaleString("en-GB")}</strong></div>
        <div><span>Groundwater</span><strong>{payload.drought.groundwater_exceptionally_low_sites} exceptional</strong></div>
      </section>

      <section className={styles.mainGrid}>
        <article className={styles.panel}>
          <div className={styles.sectionHead}>
            <div><span>Arable yields</span><small>Provisional · {formatDate(snapshotDate)}</small></div>
            <i className={styles.tickRisk} aria-hidden="true" />
          </div>
          <div className={styles.tableWrap} role="region" aria-label="Arable yield table" tabIndex={0}>
            <table className={styles.table}>
              <thead><tr><th>Crop</th><th>{payload.edition}</th><th>10-y</th><th>Δ</th><th>Cut</th></tr></thead>
              <tbody>
                {payload.crops.map((row) => (
                  <tr key={row.crop}>
                    <td>{CROP_LABELS[row.crop] || titleCase(row.crop.replaceAll("_", " "))}</td>
                    <td>{row.yield_t_ha.toFixed(1)}</td>
                    <td>{row.ten_year_avg_t_ha.toFixed(1)}</td>
                    <td className={anomalyClass(row.anomaly_pct)}>{row.anomaly_pct > 0 ? "+" : ""}{row.anomaly_pct.toFixed(1)}%</td>
                    <td>{row.harvested_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <RainMap data={payload.recent_rain} freshness={payload.freshness?.recent_rain} />
      </section>

      <section className={styles.contextGrid} aria-label="Crop context">
        <article><span>Wheat RL controls</span><strong className={styles.negative}>{payload.wheat_genetics.anomaly_pct.toFixed(1)}%</strong><small>{payload.wheat_genetics["2026_t_ha"]} vs {payload.wheat_genetics.five_year_mean_t_ha} t/ha</small></article>
        <article><span>Grass · Somerset</span><strong className={styles.negative}>{forage.get("Somerset") ?? "—"}</strong><small>kg DM/ha/day</small></article>
        <article><span>Grass · Ayrshire</span><strong className={styles.positive}>{forage.get("Ayrshire") ?? "—"}</strong><small>kg DM/ha/day</small></article>
      </section>

      <details className={styles.details}>
        <summary>Details</summary>
        <div className={styles.detailBody}>
          <div className={styles.caveats}>
            <p>{payload.drought.recovery_outlook.context}</p>
            <p>{payload.caveats["2026_yields"]}</p>
            <p>{payload.caveats.oilseed_rape}</p>
          </div>
          <div className={styles.sourceLinks}>
            {payload.source_details.map((source) => (
              <a key={source.key} href={source.url} target="_blank" rel="noreferrer">
                <span><b>{source.label}</b><small>{source.licence}</small></span>
              </a>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
