import { RainMap } from "./rain-map";
import styles from "./atlas.module.css";

const crops = [
  { crop: "Wheat", yield: 6.7, average: 7.9, anomaly: -15.2, harvest: 85 },
  { crop: "Winter barley", yield: 6.8, average: 6.9, anomaly: -1.4, harvest: 98 },
  { crop: "Spring barley", yield: 4.1, average: 5.7, anomaly: -28.1, harvest: 54 },
  { crop: "Winter OSR", yield: 3.9, average: 3.3, anomaly: 18.2, harvest: 95 },
  { crop: "Oats", yield: 4.2, average: 5.4, anomaly: -22.2, harvest: 80 },
];

const sources = [
  ["AHDB harvest", "https://ahdb.org.uk/cereals-oilseeds/gb-harvest-progress"],
  ["Environment Agency drought", "https://www.gov.uk/government/collections/dry-weather-and-drought-in-england"],
  ["Met Office climate", "https://www.metoffice.gov.uk/research/climate/maps-and-data/uk-temperature-rainfall-and-sunshine-time-series"],
  ["AHDB wheat RL", "https://ahdb.org.uk/knowledge-library/winter-wheat-recommended-and-candidate-lists"],
  ["AHDB forage", "https://ahdb.org.uk/knowledge-library/forage-for-knowledge"],
  ["OpenStreetMap", "https://www.openstreetmap.org/"],
];

function anomalyClass(value: number) {
  if (value < -3) return styles.negative;
  if (value > 3) return styles.positive;
  return "";
}

export const metadata = {
  title: "UK Crop Weather Atlas | AceWeather",
  description: "UK drought, weather and crop yield data.",
};

export default function AtlasPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>UK Crop Weather Atlas</p>
            <h1>2026</h1>
          </div>
          <span>Updated 14 Aug · harvest data provisional</span>
        </header>

        <section className={styles.grid4} aria-label="Headline signals">
          <article className={styles.metric}>
            <span>England July rain</span>
            <strong className={styles.negative}>6.5 mm</strong>
            <small>Driest July on record</small>
          </article>
          <article className={styles.metric}>
            <span>Wheat</span>
            <strong className={styles.negative}>6.7 t/ha</strong>
            <small>−15.2% vs 10-y avg</small>
          </article>
          <article className={styles.metric}>
            <span>Reservoir storage</span>
            <strong>66%</strong>
            <small>≈14 pts below seasonal norm</small>
          </article>
          <article className={styles.metric}>
            <span>East Anglia spring rain</span>
            <strong className={styles.negative}>44.8 mm</strong>
            <small>Mar–May</small>
          </article>
        </section>

        <section className={styles.statusGrid} aria-label="Drought status">
          <div><span>Weather</span><strong className={styles.negative}>Exceptional</strong></div>
          <div><span>Soil / crops</span><strong>Regional</strong></div>
          <div><span>Water resources</span><strong>Serious</strong></div>
          <div><span>Yield impact</span><strong>Mixed</strong></div>
        </section>

        <section className={styles.statusGrid} aria-label="Water resource indicators">
          <div><span>England in drought</span><strong>71.3%</strong></div>
          <div><span>Low river flows</span><strong>85%</strong></div>
          <div><span>Groundwater</span><strong>Local lows</strong></div>
          <div><span>Abstraction restrictions</span><strong>1,395</strong></div>
        </section>

        <section className={styles.grid2}>
          <article className={styles.panel}>
            <div className={styles.sectionHead}><h2>Arable yields</h2><span>AHDB · to 10 Aug</span></div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Crop</th><th>2026</th><th>10-y</th><th>Δ</th><th>Cut</th></tr></thead>
                <tbody>
                  {crops.map((row) => (
                    <tr key={row.crop}>
                      <td>{row.crop}</td>
                      <td>{row.yield.toFixed(1)}</td>
                      <td>{row.average.toFixed(1)}</td>
                      <td className={anomalyClass(row.anomaly)}>{row.anomaly > 0 ? "+" : ""}{row.anomaly.toFixed(1)}%</td>
                      <td>{row.harvest}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>OSR: recent average is CSFB-affected; do not attribute the uplift to drought.</p>
          </article>

          <RainMap />
        </section>

        <section className={styles.grid3}>
          <article className={styles.stat}>
            <span>Wheat RL controls</span>
            <strong className={styles.negative}>−9.7%</strong>
            <small>10.01 vs 11.09 t/ha</small>
          </article>
          <article className={styles.stat}>
            <span>Grass · Somerset</span>
            <strong className={styles.negative}>5</strong>
            <small>kg DM/ha/day</small>
          </article>
          <article className={styles.stat}>
            <span>Grass · Ayrshire</span>
            <strong className={styles.positive}>50</strong>
            <small>kg DM/ha/day</small>
          </article>
        </section>

        <details className={styles.sources}>
          <summary>Sources</summary>
          <div>
            {sources.map(([name, href]) => (
              <a key={href} href={href} target="_blank" rel="noreferrer">{name}</a>
            ))}
          </div>
        </details>
      </div>
    </main>
  );
}
