'use client';

import { FormEvent, useEffect, useState, useTransition } from "react";

import type { WeatherPayload } from "@/lib/weather-types";

const DEFAULT_QUERY = "Pocklington";

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_ACEWEATHER_API_BASE?.replace(/\/$/, "") || "";
}

async function resolveLocation(query: string) {
  const response = await fetch(
    `${getApiBaseUrl()}/api/search?query=${encodeURIComponent(query)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error("Location search failed.");
  }

  const payload = (await response.json()) as {
    results?: Array<{
      name: string;
      admin1?: string;
      country?: string;
      latitude: number;
      longitude: number;
      timezone?: string;
    }>;
  };

  const first = payload.results?.[0];
  if (!first) {
    throw new Error(`No location found for "${query}".`);
  }

  return {
    label: [first.name, first.admin1, first.country].filter(Boolean).join(", "),
    latitude: first.latitude,
    longitude: first.longitude,
    timezone: first.timezone || "auto",
  };
}

async function fetchWeather(query: string) {
  const location = await resolveLocation(query);
  const response = await fetch(
    `${getApiBaseUrl()}/api/weather?lat=${location.latitude}&lon=${location.longitude}&timezone=${encodeURIComponent(location.timezone)}&label=${encodeURIComponent(location.label)}`,
    { cache: "no-store" },
  );
  if (!response.ok) {
    throw new Error("Weather request failed.");
  }
  return (await response.json()) as WeatherPayload;
}

function formatSigned(value: number, digits = 1) {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}`;
}

export function WeatherConsole() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [activeQuery, setActiveQuery] = useState(DEFAULT_QUERY);
  const [payload, setPayload] = useState<WeatherPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(() => {
      fetchWeather(DEFAULT_QUERY)
        .then((nextPayload) => {
          setPayload(nextPayload);
          setError(null);
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        });
    });
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => {
      fetchWeather(query)
        .then((nextPayload) => {
          setPayload(nextPayload);
          setActiveQuery(query);
          setError(null);
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        });
    });
  }

  const current = payload?.providers.openMeteo.forecast.current;
  const daily = payload?.providers.openMeteo.forecast.daily;
  const summary = payload?.agronomy.summary;
  const sprayWindow = payload?.agronomy.sprayWindow;
  const disease = payload?.agronomy.diseaseModels;

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">AceWeather Observatory</p>
          <h1>Build the farmer-first front end on top of the weather engine you already trust.</h1>
          <p className="lede">
            This Next.js shell talks to the existing Python API today, so we can migrate the old
            dashboard into a proper product app without pausing backend progress.
          </p>
          <form className="search-form" onSubmit={onSubmit}>
            <label className="sr-only" htmlFor="location-search">
              Search for a place
            </label>
            <input
              id="location-search"
              name="location-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a farm, town, or field base"
            />
            <button type="submit" disabled={isPending}>
              {isPending ? "Loading..." : "Load field brief"}
            </button>
          </form>
          <div className="status-row">
            <span className="status-chip">Frontend: Next.js 16 App Router</span>
            <span className="status-chip">Backend: Python weather engine</span>
            <span className="status-chip">Location: {payload?.location.name || activeQuery}</span>
          </div>
          {error ? <p className="error-banner">{error}</p> : null}
        </div>
        <div className="hero-panel">
          <p className="panel-label">Current field picture</p>
          <div className="hero-metric">
            <span>{current ? `${current.temperature_2m.toFixed(1)}C` : "--"}</span>
            <small>Feels like {current ? `${current.apparent_temperature.toFixed(1)}C` : "--"}</small>
          </div>
          <dl className="stacked-stats">
            <div>
              <dt>Humidity</dt>
              <dd>{current ? `${current.relative_humidity_2m}%` : "--"}</dd>
            </div>
            <div>
              <dt>Wind / gusts</dt>
              <dd>
                {current
                  ? `${current.wind_speed_10m.toFixed(0)} / ${current.wind_gusts_10m.toFixed(0)} km/h`
                  : "--"}
              </dd>
            </div>
            <div>
              <dt>Rain right now</dt>
              <dd>{current ? `${current.precipitation.toFixed(1)} mm` : "--"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="content-grid">
        <article className="panel decision-panel">
          <p className="panel-label">Decision layer</p>
          <h2>Operational summary</h2>
          <div className="metric-grid">
            <div className="metric-card warm">
              <span>Field access</span>
              <strong>{summary ? `${summary.fieldAccessScore}/100` : "--"}</strong>
              <small>{summary?.fieldAccessLabel || "Waiting for data"}</small>
            </div>
            <div className="metric-card cool">
              <span>Spray window</span>
              <strong>{sprayWindow ? `${sprayWindow.openHoursNext24}h` : "--"}</strong>
              <small>{sprayWindow?.riskLabel || "Waiting for data"}</small>
            </div>
            <div className="metric-card rain">
              <span>Rain balance</span>
              <strong>
                {summary
                  ? `${summary.rainLast7Days.toFixed(1)} / ${summary.rainNext7Days.toFixed(1)}`
                  : "--"}
              </strong>
              <small>Last 7d / next 7d mm</small>
            </div>
          </div>
        </article>

        <article className="panel disease-panel">
          <p className="panel-label">Disease proxies</p>
          <h2>Weather-driven crop pressure</h2>
          <div className="disease-list">
            <div>
              <span>General fungal pressure</span>
              <strong>{disease?.generalFungalPressure.label || "--"}</strong>
              <small>
                Score {disease ? formatSigned(disease.generalFungalPressure.score, 2) : "--"}
              </small>
            </div>
            <div>
              <span>Late blight Smith proxy</span>
              <strong>{disease?.lateBlightSmithProxy.label || "--"}</strong>
              <small>
                {disease?.lateBlightSmithProxy.triggered
                  ? "Triggered across consecutive forecast days"
                  : "Not currently triggered"}
              </small>
            </div>
            <div>
              <span>Septoria proxy</span>
              <strong>{disease?.septoriaProxy.label || "--"}</strong>
              <small>
                Score {disease ? formatSigned(disease.septoriaProxy.score, 2) : "--"}
              </small>
            </div>
          </div>
        </article>

        <article className="panel">
          <p className="panel-label">Forecast strip</p>
          <h2>Next 5 days</h2>
          <div className="forecast-strip">
            {daily?.time.slice(0, 5).map((day, index) => (
              <div className="forecast-day" key={day}>
                <span>{day}</span>
                <strong>{daily.temperature_2m_max[index]?.toFixed(0) ?? "--"}C</strong>
                <small>{daily.precipitation_sum[index]?.toFixed(1) ?? "--"} mm rain</small>
              </div>
            )) || <p className="empty-copy">Forecast data will appear here once the API responds.</p>}
          </div>
        </article>

        <article className="panel">
          <p className="panel-label">Migration notes</p>
          <h2>Next steps now that the shell is live</h2>
          <ul className="plain-list">
            <li>Split the current Python weather engine into provider, normalization, and agronomy modules.</li>
            <li>Add saved farms and fields behind auth once we want persistent user state.</li>
            <li>Introduce manual rain gauge entry before cloud station integrations.</li>
            <li>Replace this temporary fetch layer with typed API routes or server components as the backend matures.</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
