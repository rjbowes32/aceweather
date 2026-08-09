import styles from "./atlas.module.css";

const crops = [
  { crop: "Wheat", yield: 6.8, average: 7.9, anomaly: -13.9, harvest: 54 },
  { crop: "Winter barley", yield: 6.8, average: 6.9, anomaly: -1.4, harvest: 95 },
  { crop: "Spring barley", yield: 5.3, average: 5.7, anomaly: -7.0, harvest: 8 },
  { crop: "Winter OSR", yield: 3.9, average: 3.3, anomaly: 18.2, harvest: 73 },
  { crop: "Oats", yield: 4.9, average: 5.4, anomaly: -9.3, harvest: 32 },
];

const transect = [
  ["Sleaford", 4.8],
  ["Pocklington", 9.2],
  ["Scotch Corner", 9.2],
  ["Longhirst", 35.5],
  ["Berwick", 55.4],
] as const;

const sources = [
  ["AHDB harvest progress", "Current 2026 crop yields and harvest completion", "https://ahdb.org.uk/cereals-oilseeds/gb-harvest-progress"],
  ["Environment Agency drought report", "Water resources, river flows, groundwater and restrictions", "https://www.gov.uk/government/collections/dry-weather-and-drought-in-england"],
  ["Met Office climate series", "Observed regional rainfall and temperature history", "https://www.metoffice.gov.uk/research/climate/maps-and-data/uk-temperature-rainfall-and-sunshine-time-series"],
  ["AHDB winter wheat RL", "Modern genetics / control-variety benchmark", "https://ahdb.org.uk/knowledge-library/winter-wheat-recommended-and-candidate-lists"],
  ["AHDB Forage for Knowledge", "Current measured grass-growth evidence", "https://ahdb.org.uk/knowledge-library/forage-for-knowledge"],
  ["AceWeather", "Recent local weather transect across Crop Dynamics locations", "https://www.aceweather.app/"],
];

function anomalyClass(value: number) {
  if (value < -3) return styles.negative;
  if (value > 3) return styles.positive;
  return "";
}

export const metadata = {
  title: "UK Crop Weather Atlas | AceWeather",
  description: "A fact-led view of UK drought, weather and crop yield response.",
};

export default function AtlasPage() {
  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.panel}>
            <p className={styles.eyebrow}>UK Crop Weather Atlas</p>
            <h1 className={styles.title}>Strip out the drought noise. Measure the agricultural effect.</h1>
            <p className={styles.lede}>
              Weather severity, agricultural drought, hydrological drought and crop loss are not the same thing.
              This atlas keeps them separate, then asks which weather stress actually coincided with yield formation.
            </p>
          </div>
          <div className={`${styles.panel} ${styles.asOf}`}>
            <div>
              <p className={styles.eyebrow}>Current edition</p>
              <strong>2026 harvest</strong>
            </div>
            <span>Data snapshot: 9 August 2026. Harvest figures remain provisional and will be refreshed as AHDB and Environment Agency updates land.</span>
          </div>
        </section>

        <section className={styles.grid4} aria-label="Key 2026 signals">
          <article className={styles.metric}>
            <span className={styles.metricLabel}>England July rainfall</span>
            <strong className={`${styles.metricValue} ${styles.negative}`}>6.5 mm</strong>
            <span className={styles.metricSub}>Record-low July rainfall for England. Meteorologically exceptional.</span>
          </article>
          <article className={styles.metric}>
            <span className={styles.metricLabel}>2026 wheat yield</span>
            <strong className={`${styles.metricValue} ${styles.negative}`}>6.8 t/ha</strong>
            <span className={styles.metricSub}>About 14% below the current 10-year benchmark; only 54% harvested in the snapshot.</span>
          </article>
          <article className={styles.metric}>
            <span className={styles.metricLabel}>Reservoir storage</span>
            <strong className={styles.metricValue}>69%</strong>
            <span className={styles.metricSub}>Below normal, but still better than the same point in 2022 and 2025.</span>
          </article>
          <article className={styles.metric}>
            <span className={styles.metricLabel}>East Anglia spring rain</span>
            <strong className={`${styles.metricValue} ${styles.negative}`}>44.8 mm</strong>
            <span className={styles.metricSub}>The eastern arable belt entered the hot finish with a much tighter water balance.</span>
          </article>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Drought reality check</h2>
            <p>Four different questions, four different datasets</p>
          </div>
          <div className={styles.realityGrid}>
            <article className={styles.reality}>
              <h3>1 · Meteorological</h3>
              <p><strong>Yes, exceptional.</strong> July rainfall and summer heat are historically unusual, especially across England and the south/east.</p>
            </article>
            <article className={styles.reality}>
              <h3>2 · Agricultural</h3>
              <p><strong>Strongly regional.</strong> Root-zone water, soil type and crop stage determine whether low rainfall becomes crop stress.</p>
            </article>
            <article className={styles.reality}>
              <h3>3 · Hydrological</h3>
              <p><strong>Serious, not unprecedented.</strong> River flows are poor in many catchments, while reservoir position is not worse than recent drought years.</p>
            </article>
            <article className={styles.reality}>
              <h3>4 · Agricultural loss</h3>
              <p><strong>Mixed.</strong> Wheat is weak, winter barley close to normal, OSR strong, and forage response varies sharply by geography.</p>
            </article>
          </div>
        </section>

        <section className={styles.callout}>
          <h2>Current narrative</h2>
          <p>
            2026 is better described as <strong>weather whiplash</strong> than a uniformly dry year: a wet winter was followed by rapid spring drying,
            exceptional warmth and record July dryness. The agricultural outcome is a divergence story. The same national weather headline has produced
            very different outcomes according to crop development stage, rooting depth, available soil water and latitude.
          </p>
        </section>

        <section className={styles.grid2}>
          <article className={styles.panel}>
            <div className={styles.sectionHead}><h2>2026 arable yield signal</h2><p>AHDB snapshot</p></div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Crop</th><th>2026</th><th>10-y avg</th><th>Anomaly</th><th>Harvested</th></tr></thead>
                <tbody>
                  {crops.map((row) => (
                    <tr key={row.crop}>
                      <td>{row.crop}</td><td>{row.yield.toFixed(1)}</td><td>{row.average.toFixed(1)}</td>
                      <td className={anomalyClass(row.anomaly)}>{row.anomaly > 0 ? "+" : ""}{row.anomaly.toFixed(1)}%</td><td>{row.harvest}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.note}>
              OSR needs special care: its +18% comparison is against a recent 10-year period heavily affected by cabbage stem flea beetle and contraction of the UK crop area.
              Strong 2026 performance should not be presented as evidence that drought increased OSR yield.
            </p>
          </article>

          <article className={styles.panel}>
            <div className={styles.sectionHead}><h2>AceWeather northward transect</h2><p>29 days to 8 Aug</p></div>
            <div className={styles.barList}>
              {transect.map(([place, rain]) => (
                <div className={styles.barRow} key={place}>
                  <span>{place}</span>
                  <div className={styles.track}><div className={styles.fill} style={{ width: `${Math.min(100, rain / 60 * 100)}%` }} /></div>
                  <strong>{rain.toFixed(1)} mm</strong>
                </div>
              ))}
            </div>
            <p className={styles.note}>The recent rainfall gradient from Lincolnshire through Yorkshire to Northumberland/Borders is one reason a single “UK drought” label hides useful agronomic geography.</p>
          </article>
        </section>

        <section className={styles.grid2}>
          <article className={styles.panel}>
            <div className={styles.sectionHead}><h2>Wheat: weather after genetics</h2><p>Recommended List controls</p></div>
            <p className={styles.lede} style={{ marginTop: 0 }}>
              Fungicide-treated RL control varieties are currently around <strong>9.89 t/ha</strong> versus an <strong>11.08 t/ha</strong> five-year mean — roughly a 10.7% deficit.
              That is a cleaner near-term weather benchmark than mechanically adding a fixed annual “genetic inflation” factor to old farm yields.
            </p>
          </article>
          <article className={styles.panel}>
            <div className={styles.sectionHead}><h2>Forage: the live drought indicator</h2><p>AHDB grass growth</p></div>
            <p className={styles.lede} style={{ marginTop: 0 }}>
              Current monitored grass growth ranges from about <strong>5 kg DM/ha/day in Somerset</strong> to <strong>50 kg DM/ha/day in Ayrshire</strong>.
              Grass is useful because it continuously reflects the current root-zone water balance rather than escaping drought by reaching maturity.
            </p>
          </article>
        </section>

        <section className={styles.section}>
          <article className={styles.panel}>
            <div className={styles.sectionHead}><h2>Primary sources</h2><p>Facts before headlines</p></div>
            <div className={styles.sources}>
              {sources.map(([name, detail, href]) => (
                <a key={href} href={href} target="_blank" rel="noreferrer"><strong>{name}</strong><span>{detail}</span></a>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}
