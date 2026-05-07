import { elements, state } from "./context.js";
import { drawLineChart } from "./charts.js";
import {
  aqiLabel,
  formatDate,
  formatDistance,
  formatNumber,
  formatPrecip,
  formatPressure,
  formatSpeed,
  formatTemperature,
  speedUnitLabel,
  temperatureSeries,
  temperatureUnitLabel,
  usesCelsius,
  weatherCodeToLabel,
  weatherCodeToIcon,
} from "./formatters.js";
import { updateAppModeUi } from "./ui-status.js";
import { renderAirQuality, renderDaily, renderDocuments, renderHero, renderHourly, renderSavedLocations, syncSettingsTabUi, getForecastDayStartIndex } from "./render-primary.js";

export function syncHistoryPresetUi() {
  const buttons = elements.historyPresets.querySelectorAll("[data-range]");
  buttons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.range === state.history.mode);
  });
}

export function syncUnitToggleUi() {
  elements.tempUnitToggle.querySelectorAll("[data-temp-unit]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tempUnit === state.settings.temperatureUnit);
  });
  elements.speedUnitToggle.querySelectorAll("[data-speed-unit]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.speedUnit === state.settings.speedUnit);
  });
}

export function updateHistoryInputs() {
  elements.historyStart.value = state.history.start;
  elements.historyEnd.value = state.history.end;
}

export function buildHistoryParams(params) {
  if (state.history.mode === "custom" && state.history.start && state.history.end) {
    params.set("history_start", state.history.start);
    params.set("history_end", state.history.end);
  } else {
    params.set("history_days", String(state.history.days || 30));
  }
}

export function renderMetrics(data) {
  const forecast = data.providers.openMeteo.forecast;
  const current = forecast.current;
  const daily = forecast.daily;
  const hourly = forecast.hourly;
  const dayStartIndex = getForecastDayStartIndex(forecast);
  const latestUv = hourly.uv_index.find((value) => value !== null && value !== undefined);
  const metrics = [
    ["Wind gusts", formatSpeed(current.wind_gusts_10m)],
    ["Cloud cover", `${formatNumber(current.cloud_cover)}%`],
    ["Visibility", formatDistance(hourly.visibility[0], 1)],
    ["Surface pressure", formatPressure(current.surface_pressure)],
    ["UV index", formatNumber(latestUv, 1)],
    ["Soil moisture", `${formatNumber((hourly.soil_moisture_0_to_1cm[0] || 0) * 100, 0)}%`],
    ["Sunshine today", `${Math.round((daily.sunshine_duration[dayStartIndex] || 0) / 3600)} h`],
    ["Evapotranspiration", formatPrecip(daily.et0_fao_evapotranspiration[dayStartIndex], 1)],
  ];
  elements.metricsGrid.innerHTML = metrics.map(([label, value]) => `
    <article class="metric-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div></article>
  `).join("");
}

export function renderHistory(data) {
  const history = data.providers.openMeteo.history;
  const range = history.range || {};
  const labels = history.daily.time.map((time) => formatDate(time, { day: "numeric", month: "short" }));
  const temps = temperatureSeries(history.daily.temperature_2m_max);
  drawLineChart(elements.historyChart, labels, temps, { stroke: "#f4f4f4", strokeAlt: "#8e8e8e", fill: "rgba(255, 255, 255, 0.10)" });

  const maxTemp = Math.max(...history.daily.temperature_2m_max);
  const minTemp = Math.min(...history.daily.temperature_2m_min);
  const wettest = Math.max(...history.daily.precipitation_sum);
  const windiest = Math.max(...history.daily.wind_speed_10m_max);
  const totalRain = history.daily.precipitation_sum.reduce((sum, value) => sum + (value || 0), 0);

  elements.historyTitle.textContent = range.days ? `${range.days}-day history` : "Historical weather";
  elements.historySubtitle.textContent = range.startDate && range.endDate
    ? `${formatDate(range.startDate, { day: "numeric", month: "short", year: "numeric" })} to ${formatDate(range.endDate, { day: "numeric", month: "short", year: "numeric" })}`
    : "Archived weather observations";

  const stats = [
    ["Warmest day", `${formatTemperature(maxTemp, 0)} max`],
    ["Coolest night", `${formatTemperature(minTemp, 0)} min`],
    ["Wettest day", formatPrecip(wettest, 1)],
    ["Rain in range", formatPrecip(totalRain, 1)],
    ["Strongest wind", formatSpeed(windiest)],
  ];
  elements.historyStats.innerHTML = stats.map(([label, value]) => `
    <article class="history-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div></article>
  `).join("");
}

export function renderClimate(data) {
  const climate = data.providers.openMeteo.climateWindow.daily;
  const summary = data.providers.openMeteo.climateWindow.summary || {};
  const highs = climate.temperature_2m_max.filter((value) => value !== null);
  const lows = climate.temperature_2m_min.filter((value) => value !== null);
  const rain = climate.precipitation_sum.filter((value) => value !== null);
  const avg = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const progressPct = summary.progressPct ?? 0;
  const progressLabel = progressPct > 100 ? `${formatNumber(progressPct, 0)}% of average` : `${formatNumber(progressPct, 0)}% of average monthly rain`;

  const cards = [
    ["Average high", formatTemperature(avg(highs), 1)],
    ["Average low", formatTemperature(avg(lows), 1)],
    ["Mean daily rain", formatPrecip(avg(rain), 1)],
    ["Usual monthly rain", formatPrecip(summary.averageMonthlyRain, 1)],
    ["Rain so far this month", formatPrecip(summary.currentMonthRain, 1)],
    ["Observed days", `${summary.observedDays ?? 0} day${summary.observedDays === 1 ? "" : "s"}`],
    ["Sample years", `${summary.sampleYears ?? 0} years`],
    ["Window", `${formatDate(climate.time[0], { month: "short", year: "numeric" })} to ${formatDate(climate.time.at(-1), { month: "short", year: "numeric" })}`],
  ];
  const cardsHtml = cards.map(([label, value]) => `
    <article class="climate-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div></article>
  `).join("");

  elements.climateSummary.innerHTML = `
    <article class="climate-card climate-tracker-card">
      <div class="metric-label">Monthly rainfall tracker</div>
      <div class="climate-tracker-headline">${formatPrecip(summary.currentMonthRain, 1)} / ${formatPrecip(summary.averageMonthlyRain, 1)}</div>
      <div class="climate-tracker-bar" aria-hidden="true"><div class="climate-tracker-fill" style="width: ${summary.progressPctCapped ?? 0}%"></div></div>
      <p class="daily-date">${progressLabel}</p>
    </article>
    ${cardsHtml}
  `;
}

export function renderModelVerification(data) {
  const ecmwf = data.providers?.ecmwf;
  if (!ecmwf?.enabled || !ecmwf.observation) {
    elements.modelVerifyPanel.hidden = true;
    return;
  }
  const obs = ecmwf.observation;
  elements.modelVerifyPanel.hidden = false;
  const currentTemp = data.providers.openMeteo.forecast.current.temperature_2m;
  const delta = obs.temperature_2m != null && currentTemp != null ? obs.temperature_2m - currentTemp : null;
  const deltaBadge = delta == null ? "" : `<span class="model-delta ${Math.abs(delta) <= 1 ? "agree" : Math.abs(delta) <= 2.5 ? "close" : "diverge"}">${delta > 0 ? "+" : ""}${formatNumber(delta, 1)} ${temperatureUnitLabel()}</span>`;
  const rows = [
    ["Temperature", obs.temperature_2m != null ? formatTemperature(obs.temperature_2m, 1) : "--", deltaBadge],
    ["Humidity", obs.relative_humidity_2m != null ? `${obs.relative_humidity_2m}%` : "--", ""],
    ["Wind", obs.wind_speed_10m != null ? formatSpeed(obs.wind_speed_10m) : "--", ""],
    ["Precipitation", obs.precipitation != null ? `${formatNumber(obs.precipitation, 1)} mm` : "--", ""],
    ["Cloud cover", obs.cloud_cover != null ? `${obs.cloud_cover}%` : "--", ""],
    ["Pressure", obs.pressure_msl != null ? `${formatNumber(obs.pressure_msl, 0)} hPa` : "--", ""],
    ["Condition", weatherCodeToLabel(obs.weather_code), ""],
  ];
  elements.modelVerifyGrid.innerHTML = rows.map(([label, value, badge]) => `
    <article class="verify-card"><div class="metric-label">${label}</div><div class="metric-value">${value}${badge}</div></article>
  `).join("");
  const obsTime = obs.time ? new Date(obs.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
  elements.modelVerifyStamp.textContent = `ECMWF IFS reading at ${obsTime} | Delta vs best-match blend`;
}

export function renderProviders(data) {
  const ecmwf = data.providers?.ecmwf;
  const ecmwfStatus = ecmwf?.enabled ? "live" : "";
  const ecmwfNote = ecmwf?.enabled
    ? `ECMWF IFS 0.25° reading at ${ecmwf.observation?.time ? new Date(ecmwf.observation.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "unknown"}.`
    : (ecmwf?.reason || "Unavailable.");
  const openMeteoCard = `
    <article class="provider-card"><div class="provider-title"><strong>Open-Meteo</strong><span class="status-dot live" aria-hidden="true"></span></div><p class="provider-meta">Forecast (best-match blend), archive, geocoding, and air quality active.</p></article>
    <article class="provider-card"><div class="provider-title"><strong>ECMWF IFS 0.25°</strong><span class="status-dot ${ecmwfStatus}" aria-hidden="true"></span></div><p class="provider-meta">${ecmwfNote}</p></article>
  `;
  const meteomatics = data.providers.meteomatics;
  const meteomaticsCard = `
    <article class="provider-card"><div class="provider-title"><strong>Meteomatics</strong><span class="status-dot ${meteomatics.enabled ? "live" : ""}" aria-hidden="true"></span></div><p class="provider-meta">${meteomatics.enabled ? "Credential-backed Python connector path is active." : meteomatics.reason}</p></article>
  `;
  elements.providerList.innerHTML = openMeteoCard + meteomaticsCard;
}
