import { drawLineChart } from "./charts.js";
import { elements, state } from "./context.js";
import {
  aqiLabel,
  dayKey,
  escapeHtml,
  formatDate,
  formatNumber,
  formatPressure,
  formatPrecip,
  formatSpeed,
  formatTemperature,
  temperatureSeries,
  usesCelsius,
  weatherCodeToIcon,
  weatherCodeToLabel,
} from "./formatters.js";
import { isOfflineSnapshot } from "./storage.js";

export function buildHourlyPulse(data) {
  const forecast = data.providers.openMeteo.forecast;
  const current = forecast.current;
  const hourly = forecast.hourly;
  const now = new Date();
  const firstFutureIndex = hourly.time.findIndex((time) => new Date(time) > now);
  const currentHourIndex = Math.max(0, firstFutureIndex === -1 ? hourly.time.length - 1 : firstFutureIndex - 1);
  const anchorTime = current.time || hourly.time[currentHourIndex];
  const items = [{
    shortLabel: "Now",
    timeLabel: formatDate(anchorTime, { hour: "numeric", minute: "2-digit" }),
    dayLabel: "Today",
    temperature: current.temperature_2m,
    weatherCode: current.weather_code,
    precipitationProbability: hourly.precipitation_probability[currentHourIndex] || 0,
    precipitationAmount: current.precipitation ?? hourly.precipitation[currentHourIndex] ?? 0,
    dayGroup: dayKey(anchorTime),
    isNow: true,
  }];

  for (let index = currentHourIndex + 1; index < hourly.time.length && items.length < 24; index += 1) {
    items.push({
      shortLabel: formatDate(hourly.time[index], { hour: "2-digit" }),
      timeLabel: formatDate(hourly.time[index], { hour: "numeric", minute: "2-digit" }),
      dayLabel: formatDate(hourly.time[index], { weekday: "short" }),
      temperature: hourly.temperature_2m[index],
      weatherCode: hourly.weather_code[index],
      precipitationProbability: hourly.precipitation_probability[index] || 0,
      precipitationAmount: hourly.precipitation[index] || 0,
      dayGroup: dayKey(hourly.time[index]),
      isNow: false,
    });
  }

  return items;
}

export function getForecastDayStartIndex(forecast) {
  const currentDay = (forecast.current.time || "").slice(0, 10);
  const matchIndex = forecast.daily.time.findIndex((time) => time === currentDay);
  return matchIndex >= 0 ? matchIndex : 0;
}

export function renderSavedLocations() {
  if (state.settings.savedLocations.length === 0) {
    elements.savedLocations.innerHTML = `<div class="saved-location"><div class="saved-location-meta">No saved locations yet. Search somewhere, then press Save.</div></div>`;
    return;
  }

  elements.savedLocations.innerHTML = state.settings.savedLocations
    .map((location, index) => `
      <div class="saved-location">
        <div>
          <div class="saved-location-name">${escapeHtml(location.name)}</div>
          <div class="saved-location-meta">${escapeHtml(location.timezone || "auto")} | ${formatNumber(location.latitude, 2)}, ${formatNumber(location.longitude, 2)}</div>
        </div>
        <div class="saved-location-actions">
          <button type="button" data-saved-load="${index}">Open</button>
          <button type="button" data-saved-remove="${index}">Remove</button>
        </div>
      </div>
    `)
    .join("");
}

function buildReportParams(location) {
  return new URLSearchParams({
    lat: location.latitude,
    lon: location.longitude,
    timezone: location.timezone || "auto",
    label: location.name,
  });
}

export function renderDocuments() {
  if (!elements.documentsMenu) {
    return;
  }
  const selectedLocation = state.selectedLocation;
  const origin = window.location.origin;
  const reportUrl = `${origin}/api/report?${buildReportParams(selectedLocation).toString()}`;
  const searchReportUrl = `${origin}/api/report?query=${encodeURIComponent(selectedLocation.name)}`;
  const explainerUrl = `${origin}/report-api.md`;

  elements.documentsMenu.innerHTML = `
    <article class="document-card">
      <div class="document-card-header"><div><p class="eyebrow">Weather report API</p><h4>Open the current place report</h4></div></div>
      <p>Use the selected location in the app to open the full text weather report directly.</p>
      <div class="document-link-list">
        <a class="document-link" href="${reportUrl}" target="_blank" rel="noreferrer"><strong>Current place report</strong><span>${escapeHtml(selectedLocation.name)}</span></a>
        <a class="document-link" href="${searchReportUrl}" target="_blank" rel="noreferrer"><strong>Query by place name</strong><span><code>/api/report?query=${escapeHtml(selectedLocation.name)}</code></span></a>
      </div>
    </article>
    <article class="document-card">
      <div class="document-card-header"><div><p class="eyebrow">Explainer</p><h4>Markdown reference</h4></div></div>
      <p>A short explainer for the report endpoint, examples, and how to swap in other places.</p>
      <div class="document-link-list">
        <a class="document-link" href="${explainerUrl}" target="_blank" rel="noreferrer"><strong>Open report API explainer</strong><span><code>/report-api.md</code></span></a>
      </div>
    </article>
  `;
}

export function syncSettingsTabUi() {
  const activeTab = state.ui.settingsTab;
  const buttons = elements.settingsTabs?.querySelectorAll("[data-settings-tab]") || [];
  buttons.forEach((button) => {
    const isActive = button.dataset.settingsTab === activeTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  elements.settingsPanels.forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== activeTab;
  });
}

export function renderHero(data) {
  const forecast = data.providers.openMeteo.forecast;
  const current = forecast.current;
  const daily = forecast.daily;
  const dayStartIndex = getForecastDayStartIndex(forecast);
  const nextRain = forecast.hourly.time.map((time, index) => ({
    time,
    probability: forecast.hourly.precipitation_probability[index] || 0,
    amount: forecast.hourly.precipitation[index] || 0,
  })).find((entry) => entry.probability > 0 || entry.amount > 0);

  const nextRainSummary = nextRain
    ? `Next rain ${formatDate(nextRain.time, { hour: "numeric", minute: "2-digit" })} with ${formatNumber(nextRain.probability)}% chance and ${formatNumber(nextRain.amount, 1)} mm forecast.`
    : "No rain currently forecast in the upcoming hours.";

  const liveLabel = current.is_day ? "Daytime now" : "Night watch";
  elements.heroEyebrow.textContent = isOfflineSnapshot() ? "Offline snapshot" : liveLabel;
  elements.heroLocation.textContent = data.location.name;
  elements.heroSummary.textContent = `${weatherCodeToLabel(current.weather_code)}. ${nextRainSummary}`;
  elements.heroTemp.textContent = formatTemperature(current.temperature_2m, 0);
  elements.heroIcon.textContent = weatherCodeToIcon(current.weather_code);

  const chips = [
    ["Feels like", formatTemperature(current.apparent_temperature, 0)],
    ["Rain now", `${formatNumber(current.precipitation, 1)} mm`],
    ["Humidity", `${formatNumber(current.relative_humidity_2m)}%`],
    ["Wind", formatSpeed(current.wind_speed_10m)],
    ["Pressure", formatPressure(current.pressure_msl)],
    ["Sunrise", formatDate(daily.sunrise[dayStartIndex], { hour: "2-digit", minute: "2-digit" })],
    ["Sunset", formatDate(daily.sunset[dayStartIndex], { hour: "2-digit", minute: "2-digit" })],
  ];

  elements.heroChips.innerHTML = chips.map(([label, value]) => `
    <div class="chip"><span>${label}</span><strong>${value}</strong></div>
  `).join("");

  const updatedLabel = formatDate(data.generatedAt, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" });
  elements.updateStamp.textContent = isOfflineSnapshot()
    ? `Offline snapshot from ${formatDate(state.ui.cachedAt || data.generatedAt, { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}`
    : `Updated ${updatedLabel}`;
}

export function renderHourly(data) {
  const items = buildHourlyPulse(data);
  const temperatures = temperatureSeries(items.map((item) => item.temperature));
  drawLineChart(elements.hourlyChart, items.map((item) => item.shortLabel), temperatures, {
    stroke: "#ffffff",
    strokeAlt: "#8e8e8e",
    xAxisTitle: "Next 24 hours",
    yAxisTitle: `Temperature (${usesCelsius() ? "C" : "F"})`,
  });

  elements.hourlyStrip.innerHTML = items.map((item, index) => {
    const previousDay = items[index - 1]?.dayGroup;
    const showDayLabel = index === 0 || item.dayGroup !== previousDay;
    return `
      <article class="hour-pill ${item.isNow ? "is-now" : ""}">
        ${showDayLabel ? `<div class="hour-day-label">${item.dayLabel}</div>` : ""}
        <time>${item.shortLabel}</time>
        <div class="daily-date">${item.timeLabel}</div>
        <div class="daily-icon">${weatherCodeToIcon(item.weatherCode)}</div>
        <strong>${formatTemperature(item.temperature, 0)}</strong>
        <div class="hour-rain">${formatNumber(item.precipitationProbability)}% rain</div>
        <div class="daily-date">${formatNumber(item.precipitationAmount, 1)} mm forecast</div>
      </article>
    `;
  }).join("");
}

export function renderDaily(data) {
  const forecast = data.providers.openMeteo.forecast;
  const daily = forecast.daily;
  const dayStartIndex = getForecastDayStartIndex(forecast);
  elements.dailyGrid.innerHTML = daily.time.slice(dayStartIndex, dayStartIndex + 14).map((time, index) => {
    const actualIndex = dayStartIndex + index;
    return `
      <article class="daily-card">
        <div class="daily-date">${formatDate(time, { weekday: "short", day: "numeric", month: "short" })}</div>
        <div class="daily-icon">${weatherCodeToIcon(daily.weather_code[actualIndex])}</div>
        <div class="daily-temp">${formatTemperature(daily.temperature_2m_max[actualIndex], 0)} / ${formatTemperature(daily.temperature_2m_min[actualIndex], 0)}</div>
        <p class="daily-date">${weatherCodeToLabel(daily.weather_code[actualIndex])}</p>
        <p class="daily-date">${formatNumber(daily.precipitation_probability_max[actualIndex])}% rain | ${formatSpeed(daily.wind_speed_10m_max[actualIndex])} wind</p>
        <p class="daily-date">${Math.round((daily.daylight_duration[actualIndex] || 0) / 3600)}h daylight</p>
      </article>
    `;
  }).join("");
}

export function renderAirQuality(data) {
  const air = data.providers.openMeteo.airQuality;
  const current = air.current;
  elements.airQualityCurrent.innerHTML = `
    <article class="aqi-hero"><div class="metric-label">European AQI</div><div class="aqi-value">${formatNumber(current.european_aqi)}</div><p class="daily-date">${aqiLabel(current.european_aqi)}</p></article>
    <article class="aqi-hero"><div class="metric-label">US AQI</div><div class="aqi-value">${formatNumber(current.us_aqi)}</div><p class="daily-date">${aqiLabel(current.us_aqi)}</p></article>
  `;
  const pollutantCards = [
    ["PM2.5", current.pm2_5, "ug/m3"],
    ["PM10", current.pm10, "ug/m3"],
    ["NO2", current.nitrogen_dioxide, "ug/m3"],
    ["O3", current.ozone, "ug/m3"],
  ];
  elements.airQualityList.innerHTML = pollutantCards.map(([label, value, unit]) => `
    <article class="air-card"><div class="metric-label">${label}</div><div class="metric-value">${formatNumber(value, 1)}</div><div class="daily-date">${unit}</div></article>
  `).join("");
}
