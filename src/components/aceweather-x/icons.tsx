/* Phosphor Regular icons (256x256, filled with currentColor). Size comes from CSS; colour from `color`. */
import type { ConditionKey } from "@/lib/aceweather/format";
import { weatherIconText, type IconKey, type WeatherIcon as WeatherIconData } from "@/lib/aceweather/weather-icons";
import { PH, type PhName } from "./phosphor-paths";

function Ph({ name, className }: { name: PhName; className?: string }) {
  return (
    <svg className={"awx-ph" + (className ? " " + className : "")} viewBox="0 0 256 256" aria-hidden="true">
      <path d={PH[name]} />
    </svg>
  );
}

const NAV: Record<string, PhName> = {
  humidity: "drop",
  wind: "wind",
  thermometer: "thermometer",
  umbrella: "umbrella",
  overview: "house",
  now: "sun",
  rain: "cloud-rain",
  radar: "globe-simple",
  field: "grains",
  outlook: "calendar-blank",
  seasonal: "plant",
  about: "info",
  more: "dots-three",
};

export function NavIcon({ name }: { name: string }) {
  return <Ph name={NAV[name] ?? NAV.overview} />;
}

const COND: Record<ConditionKey, PhName> = {
  clear: "sun",
  cloud: "cloud",
  fog: "cloud-fog",
  rain: "cloud-rain",
  snow: "cloud-snow",
  storm: "cloud-lightning",
};

export function ConditionIcon({ k, className }: { k: ConditionKey; className?: string }) {
  return <Ph name={COND[k] ?? COND.cloud} className={className} />;
}

/* Phosphor has no drizzle icon, so drizzle shares the rain cloud; the label still says Drizzle. */
const RULE: Record<IconKey, PhName> = {
  storm: "cloud-lightning",
  snow: "cloud-snow",
  rain: "cloud-rain",
  drizzle: "cloud-rain",
  fog: "cloud-fog",
  cloud: "cloud",
  partly: "cloud-sun",
  "partly-night": "cloud-moon",
  clear: "sun",
  night: "moon",
};

/** Main condition icon from pickWeatherIcon, plus small frost and gust badges. */
export function WeatherIcon({ icon, className }: { icon: WeatherIconData; className?: string }) {
  const text = weatherIconText(icon);
  return (
    <span className={"awx-wicon" + (className ? " " + className : "")} role="img" aria-label={text} title={text}>
      <Ph name={RULE[icon.key] ?? RULE.partly} />
      {icon.frost || icon.gust ? (
        <span className="awx-wicon-badges" aria-hidden="true">
          {icon.frost === "frost" ? <Ph name="snowflake" className="awx-badge awx-badge-frost" /> : null}
          {icon.frost === "risk" ? <Ph name="thermometer-cold" className="awx-badge awx-badge-frost is-risk" /> : null}
          {icon.gust ? <Ph name="wind" className="awx-badge awx-badge-gust" /> : null}
        </span>
      ) : null}
    </span>
  );
}

export const ChevronIcon = () => <Ph name="caret-down" />;
export const SearchIcon = () => <Ph name="magnifying-glass" />;
export const ShareIcon = () => <Ph name="export" />;
export const GpsIcon = () => <Ph name="crosshair" />;
export const RefreshIcon = () => <Ph name="arrows-clockwise" />;
export const SettingsIcon = () => <Ph name="gear" />;
export const BellIcon = () => <Ph name="bell" />;
export const DocsIcon = () => <Ph name="file-text" />;

export function CloseIcon() {
  return <Ph name="x" className="awx-close-icon" />;
}
