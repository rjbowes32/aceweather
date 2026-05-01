const DEFAULT_HISTORY_RANGE = "30";
const STORAGE_KEY = "aceweather-settings-v1";

const state = {
  selectedLocation: {
    name: "London, United Kingdom",
    latitude: 51.5085,
    longitude: -0.1257,
    timezone: "Europe/London",
  },
  latestPayload: null,
  settings: {
    unitSystem: "metric",
    savedLocations: [],
  },
  history: {
    mode: DEFAULT_HISTORY_RANGE,
    days: 30,
    start: "",
    end: "",
  },
};

const weatherIcons = {
  0: "\u2600",
  1: "\u26C5",
  2: "\u26C5",
  3: "\u2601",
  45: "\u2248",
  48: "\u2248",
  51: "\u2055",
  53: "\u2055",
  55: "\u2055",
  56: "\u2744",
  57: "\u2744",
  61: "\u2055",
  63: "\u2055",
  65: "\u2055",
  66: "\u2744",
  67: "\u2744",
  71: "\u2744",
  73: "\u2744",
  75: "\u2744",
  77: "\u2744",
  80: "\u2055",
  81: "\u2055",
  82: "\u26A1",
  85: "\u2744",
  86: "\u2744",
  95: "\u26A1",
  96: "\u26A1",
  99: "\u26A1",
};

const weatherLabels = {
  0: "Clear sky",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Dense drizzle",
  56: "Freezing drizzle",
  57: "Heavy freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Heavy showers",
  82: "Violent showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Heavy thunderstorm with hail",
};

const $ = (selector) => document.querySelector(selector);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const elements = {
  heroEyebrow: $("#hero-eyebrow"),
  heroLocation: $("#hero-location"),
  heroSummary: $("#hero-summary"),
  heroTemp: $("#hero-temp"),
  heroIcon: $("#hero-icon"),
  heroChips: $("#hero-chips"),
  updateStamp: $("#update-stamp"),
  hourlyStrip: $("#hourly-strip"),
  dailyGrid: $("#daily-grid"),
  metricsGrid: $("#metrics-grid"),
  airQualityCurrent: $("#air-quality-current"),
  airQualityList: $("#air-quality-list"),
  historyTitle: $("#history-title"),
  historySubtitle: $("#history-subtitle"),
  historyStats: $("#history-stats"),
  historyPresets: $("#history-presets"),
  historyCustomForm: $("#history-custom-form"),
  historyStart: $("#history-start"),
  historyEnd: $("#history-end"),
  climateSummary: $("#climate-summary"),
  providerList: $("#provider-list"),
  agronomyGrid: $("#agronomy-grid"),
  diseaseGrid: $("#disease-grid"),
  agronomyDisclaimer: $("#agronomy-disclaimer"),
  exportHourlyChart: $("#export-hourly-chart"),
  exportHistoryChart: $("#export-history-chart"),
  copyAiReport: $("#copy-ai-report"),
  exportStatus: $("#export-status"),
  saveLocationButton: $("#save-location-button"),
  settingsStatus: $("#settings-status"),
  unitToggle: $("#unit-toggle"),
  savedLocations: $("#saved-locations"),
  searchForm: $("#search-form"),
  searchInput: $("#search-input"),
  searchResults: $("#search-results"),
  resultTemplate: $("#result-template"),
  modelVerifyPanel: $("#model-verify-panel"),
  modelVerifyGrid: $("#model-verify-grid"),
  modelVerifyStamp: $("#model-verify-stamp"),
  hourlyChart: $("#hourly-chart"),
  historyChart: $("#history-chart"),
};

function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(digits);
}

function formatDate(input, options) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(input));
}

function weatherCodeToIcon(code) {
  return weatherIcons[code] || "\u2601";
}

function weatherCodeToLabel(code) {
  return weatherLabels[code] || "Conditions unavailable";
}

function aqiLabel(value) {
  if (value == null) {
    return "Unavailable";
  }
  if (value <= 20) {
    return "Good";
  }
  if (value <= 40) {
    return "Fair";
  }
  if (value <= 60) {
    return "Moderate";
  }
  if (value <= 80) {
    return "Poor";
  }
  if (value <= 100) {
    return "Very poor";
  }
  return "Extremely poor";
}

function setExportStatus(message) {
  elements.exportStatus.textContent = message;
}

function setSettingsStatus(message) {
  elements.settingsStatus.textContent = message;
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (parsed.unitSystem === "metric" || parsed.unitSystem === "imperial") {
      state.settings.unitSystem = parsed.unitSystem;
    }
    if (Array.isArray(parsed.savedLocations)) {
      state.settings.savedLocations = parsed.savedLocations;
    }
  } catch (error) {
    setSettingsStatus("Could not read saved settings.");
  }
}

function isMetric() {
  return state.settings.unitSystem === "metric";
}

function formatTemperature(value, digits = 0) {
  if (value == null) {
    return "--";
  }
  const converted = isMetric() ? value : (value * 9) / 5 + 32;
  const suffix = isMetric() ? "C" : "F";
  return `${formatNumber(converted, digits)} ${suffix}`;
}

function temperatureSeries(values) {
  return values.map((value) => (value == null ? null : isMetric() ? value : (value * 9) / 5 + 32));
}

function formatPrecip(value, digits = 1) {
  if (value == null) {
    return "--";
  }
  const converted = isMetric() ? value : value / 25.4;
  const suffix = isMetric() ? "mm" : "in";
  return `${formatNumber(converted, digits)} ${suffix}`;
}

function formatSpeed(value, digits = 0) {
  if (value == null) {
    return "--";
  }
  const converted = isMetric() ? value : value * 0.621371;
  const suffix = isMetric() ? "km/h" : "mph";
  return `${formatNumber(converted, digits)} ${suffix}`;
}

function formatPressure(value, digits = 0) {
  if (value == null) {
    return "--";
  }
  if (isMetric()) {
    return `${formatNumber(value, digits)} hPa`;
  }
  return `${formatNumber(value * 0.0295299831, 2)} inHg`;
}

function formatDistance(valueMeters, digits = 1) {
  if (valueMeters == null) {
    return "--";
  }
  const converted = isMetric() ? valueMeters / 1000 : valueMeters / 1609.344;
  const suffix = isMetric() ? "km" : "mi";
  return `${formatNumber(converted, digits)} ${suffix}`;
}

function drawLineChart(canvas, labels, series, options = {}) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 24, right: 24, bottom: 36, left: 24 };
  const filteredSeries = series.map((value) => (value == null ? 0 : value));
  const min = Math.min(...filteredSeries);
  const max = Math.max(...filteredSeries);
  const range = max - min || 1;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(7, 14, 27, 0.88)";
  context.fillRect(0, 0, width, height);

  for (let index = 0; index < 4; index += 1) {
    const y = padding.top + ((height - padding.top - padding.bottom) / 3) * index;
    context.strokeStyle = "rgba(255,255,255,0.08)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(padding.left, y);
    context.lineTo(width - padding.right, y);
    context.stroke();
  }

  const points = filteredSeries.map((value, index) => {
    const x = padding.left + (index / Math.max(filteredSeries.length - 1, 1)) * (width - padding.left - padding.right);
    const y = padding.top + ((max - value) / range) * (height - padding.top - padding.bottom);
    return { x, y };
  });

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, options.stroke || "#8ce7ff");
  gradient.addColorStop(1, options.strokeAlt || "#ffb86a");

  context.strokeStyle = gradient;
  context.lineWidth = 4;
  context.beginPath();
  points.forEach((point, index) => {
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });
  context.stroke();

  context.fillStyle = options.fill || "rgba(140, 231, 255, 0.16)";
  context.beginPath();
  context.moveTo(points[0].x, height - padding.bottom);
  points.forEach((point) => context.lineTo(point.x, point.y));
  context.lineTo(points[points.length - 1].x, height - padding.bottom);
  context.closePath();
  context.fill();

  context.fillStyle = "#edf4ff";
  context.font = '12px "IBM Plex Mono"';
  const step = Math.max(Math.floor(labels.length / 6), 1);
  labels.forEach((label, index) => {
    if (index % step === 0 || index === labels.length - 1) {
      context.fillText(label, points[index].x - 12, height - 12);
    }
  });
}

function syncHistoryPresetUi() {
  const buttons = elements.historyPresets.querySelectorAll("[data-range]");
  buttons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.range === state.history.mode);
  });
}

function syncUnitToggleUi() {
  const buttons = elements.unitToggle.querySelectorAll("[data-unit-system]");
  buttons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.unitSystem === state.settings.unitSystem);
  });
}

function updateHistoryInputs() {
  elements.historyStart.value = state.history.start;
  elements.historyEnd.value = state.history.end;
}

function buildHistoryParams(params) {
  if (state.history.mode === "custom" && state.history.start && state.history.end) {
    params.set("history_start", state.history.start);
    params.set("history_end", state.history.end);
  } else {
    params.set("history_days", String(state.history.days || 30));
  }
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = filename;
  link.click();
}

function renderSavedLocations() {
  if (state.settings.savedLocations.length === 0) {
    elements.savedLocations.innerHTML = `<div class="saved-location"><div class="saved-location-meta">No saved locations yet. Search somewhere, then press Save.</div></div>`;
    return;
  }

  elements.savedLocations.innerHTML = state.settings.savedLocations
    .map(
      (location, index) => `
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
      `
    )
    .join("");
}

function renderHero(data) {
  const forecast = data.providers.openMeteo.forecast;
  const current = forecast.current;
  const daily = forecast.daily;
  const nextRain = forecast.hourly.precipitation_probability.slice(0, 12).reduce((max, item) => Math.max(max, item || 0), 0);

  elements.heroEyebrow.textContent = current.is_day ? "Daytime now" : "Night watch";
  elements.heroLocation.textContent = data.location.name;
  elements.heroSummary.textContent = `${weatherCodeToLabel(current.weather_code)} with ${formatNumber(nextRain)}% peak rain chance in the next 12 hours.`;
  elements.heroTemp.textContent = formatTemperature(current.temperature_2m, 0);
  elements.heroIcon.textContent = weatherCodeToIcon(current.weather_code);

  const chips = [
    ["Feels like", formatTemperature(current.apparent_temperature, 0)],
    ["Humidity", `${formatNumber(current.relative_humidity_2m)}%`],
    ["Wind", formatSpeed(current.wind_speed_10m)],
    ["Pressure", formatPressure(current.pressure_msl)],
    ["Sunrise", formatDate(daily.sunrise[0], { hour: "2-digit", minute: "2-digit" })],
    ["Sunset", formatDate(daily.sunset[0], { hour: "2-digit", minute: "2-digit" })],
  ];

  elements.heroChips.innerHTML = chips
    .map(
      ([label, value]) => `
        <div class="chip">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join("");

  elements.updateStamp.textContent = `Updated ${formatDate(data.generatedAt, {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
  })}`;
}

function renderHourly(data) {
  const hourly = data.providers.openMeteo.forecast.hourly;
  const times = hourly.time.slice(0, 12);
  const temperatures = temperatureSeries(hourly.temperature_2m.slice(0, 12));
  drawLineChart(elements.hourlyChart, times.map((time) => formatDate(time, { hour: "2-digit" })), temperatures, {
    stroke: "#8ce7ff",
    strokeAlt: "#6e7dff",
  });

  elements.hourlyStrip.innerHTML = times
    .map((time, index) => {
      const code = hourly.weather_code[index];
      return `
        <article class="hour-pill">
          <time>${formatDate(time, { hour: "2-digit", minute: "2-digit" })}</time>
          <div class="daily-icon">${weatherCodeToIcon(code)}</div>
          <strong>${formatTemperature(hourly.temperature_2m[index], 0)}</strong>
          <div class="daily-date">${formatNumber(hourly.precipitation_probability[index])}% rain</div>
        </article>
      `;
    })
    .join("");
}

function renderDaily(data) {
  const daily = data.providers.openMeteo.forecast.daily;
  elements.dailyGrid.innerHTML = daily.time
    .slice(0, 14)
    .map(
      (time, index) => `
        <article class="daily-card">
          <div class="daily-date">${formatDate(time, { weekday: "short", day: "numeric", month: "short" })}</div>
          <div class="daily-icon">${weatherCodeToIcon(daily.weather_code[index])}</div>
          <div class="daily-temp">${formatTemperature(daily.temperature_2m_max[index], 0)} / ${formatTemperature(daily.temperature_2m_min[index], 0)}</div>
          <p class="daily-date">${weatherCodeToLabel(daily.weather_code[index])}</p>
          <p class="daily-date">${formatNumber(daily.precipitation_probability_max[index])}% rain | ${formatSpeed(daily.wind_speed_10m_max[index])} wind</p>
          <p class="daily-date">${Math.round((daily.daylight_duration[index] || 0) / 3600)}h daylight</p>
        </article>
      `
    )
    .join("");
}

function renderMetrics(data) {
  const forecast = data.providers.openMeteo.forecast;
  const current = forecast.current;
  const daily = forecast.daily;
  const hourly = forecast.hourly;
  const latestUv = hourly.uv_index.find((value) => value !== null && value !== undefined);
  const metrics = [
    ["Wind gusts", formatSpeed(current.wind_gusts_10m)],
    ["Cloud cover", `${formatNumber(current.cloud_cover)}%`],
    ["Visibility", formatDistance(hourly.visibility[0], 1)],
    ["Surface pressure", formatPressure(current.surface_pressure)],
    ["UV index", formatNumber(latestUv, 1)],
    ["Soil moisture", `${formatNumber((hourly.soil_moisture_0_to_1cm[0] || 0) * 100, 0)}%`],
    ["Sunshine today", `${Math.round((daily.sunshine_duration[0] || 0) / 3600)} h`],
    ["Evapotranspiration", formatPrecip(daily.et0_fao_evapotranspiration[0], 1)],
  ];

  elements.metricsGrid.innerHTML = metrics
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${value}</div>
        </article>
      `
    )
    .join("");
}

function renderAirQuality(data) {
  const air = data.providers.openMeteo.airQuality;
  const current = air.current;

  elements.airQualityCurrent.innerHTML = `
    <article class="aqi-hero">
      <div class="metric-label">European AQI</div>
      <div class="aqi-value">${formatNumber(current.european_aqi)}</div>
      <p class="daily-date">${aqiLabel(current.european_aqi)}</p>
    </article>
    <article class="aqi-hero">
      <div class="metric-label">US AQI</div>
      <div class="aqi-value">${formatNumber(current.us_aqi)}</div>
      <p class="daily-date">${aqiLabel(current.us_aqi)}</p>
    </article>
  `;

  const pollutantCards = [
    ["PM2.5", current.pm2_5, "ug/m3"],
    ["PM10", current.pm10, "ug/m3"],
    ["NO2", current.nitrogen_dioxide, "ug/m3"],
    ["O3", current.ozone, "ug/m3"],
  ];

  elements.airQualityList.innerHTML = pollutantCards
    .map(
      ([label, value, unit]) => `
        <article class="air-card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${formatNumber(value, 1)}</div>
          <div class="daily-date">${unit}</div>
        </article>
      `
    )
    .join("");
}

function renderHistory(data) {
  const history = data.providers.openMeteo.history;
  const range = history.range || {};
  const labels = history.daily.time.map((time) => formatDate(time, { day: "numeric", month: "short" }));
  const temps = temperatureSeries(history.daily.temperature_2m_max);
  drawLineChart(elements.historyChart, labels, temps, {
    stroke: "#ffb86a",
    strokeAlt: "#8ce7ff",
    fill: "rgba(255, 184, 106, 0.14)",
  });

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

  elements.historyStats.innerHTML = stats
    .map(
      ([label, value]) => `
        <article class="history-card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${value}</div>
        </article>
      `
    )
    .join("");
}

function renderClimate(data) {
  const climate = data.providers.openMeteo.climateWindow.daily;
  const highs = climate.temperature_2m_max.filter((value) => value !== null);
  const lows = climate.temperature_2m_min.filter((value) => value !== null);
  const rain = climate.precipitation_sum.filter((value) => value !== null);
  const avg = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const totalRain = rain.reduce((sum, value) => sum + value, 0);

  const cards = [
    ["Average high", formatTemperature(avg(highs), 1)],
    ["Average low", formatTemperature(avg(lows), 1)],
    ["Mean daily rain", formatPrecip(avg(rain), 1)],
    ["Total samples", `${climate.time.length} days`],
    ["Cumulative rain", formatPrecip(totalRain, 1)],
    ["Window", `${formatDate(climate.time[0], { month: "short", year: "numeric" })} to ${formatDate(climate.time.at(-1), { month: "short", year: "numeric" })}`],
  ];

  elements.climateSummary.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="climate-card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${value}</div>
        </article>
      `
    )
    .join("");
}

function renderModelVerification(data) {
  const ecmwf = data.providers?.ecmwf;
  if (!ecmwf?.enabled || !ecmwf.observation) {
    elements.modelVerifyPanel.hidden = true;
    return;
  }
  elements.modelVerifyPanel.hidden = false;

  const obs = ecmwf.observation;
  const cur = data.providers.openMeteo.forecast.current;

  const tempDelta = (obs.temperature_2m != null && cur.temperature_2m != null)
    ? (obs.temperature_2m - cur.temperature_2m)
    : null;
  const windDelta = (obs.wind_speed_10m != null && cur.wind_speed_10m != null)
    ? (obs.wind_speed_10m - cur.wind_speed_10m)
    : null;

  function deltaChip(value, unit) {
    if (value === null) return "";
    const sign = value >= 0 ? "+" : "";
    const cls = Math.abs(value) < 1 ? "agree" : Math.abs(value) < 3 ? "close" : "diverge";
    return `<span class="model-delta ${cls}">${sign}${value.toFixed(1)}${unit}</span>`;
  }

  const rows = [
    ["Temperature", formatTemperature(obs.temperature_2m, 1), deltaChip(tempDelta, "°")],
    ["Humidity", obs.relative_humidity_2m != null ? `${obs.relative_humidity_2m}%` : "--", ""],
    ["Wind speed", obs.wind_speed_10m != null ? `${formatNumber(obs.wind_speed_10m, 0)} km/h` : "--", deltaChip(windDelta, " km/h")],
    ["Gusts", obs.wind_gusts_10m != null ? `${formatNumber(obs.wind_gusts_10m, 0)} km/h` : "--", ""],
    ["Precipitation", obs.precipitation != null ? `${formatNumber(obs.precipitation, 1)} mm` : "--", ""],
    ["Cloud cover", obs.cloud_cover != null ? `${obs.cloud_cover}%` : "--", ""],
    ["Pressure", obs.pressure_msl != null ? `${formatNumber(obs.pressure_msl, 0)} hPa` : "--", ""],
    ["Condition", weatherCodeToLabel(obs.weather_code), ""],
  ];

  elements.modelVerifyGrid.innerHTML = rows.map(([label, value, delta]) => `
    <article class="verify-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${value}${delta}</div>
    </article>
  `).join("");

  const obsTime = obs.time ? new Date(obs.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
  elements.modelVerifyStamp.textContent = `ECMWF IFS reading at ${obsTime} | Delta vs best-match blend`;
}

function renderProviders(data) {
  const ecmwf = data.providers?.ecmwf;
  const ecmwfStatus = ecmwf?.enabled ? "live" : "";
  const ecmwfNote = ecmwf?.enabled
    ? `ECMWF IFS 0.25° reading at ${ecmwf.observation?.time ? new Date(ecmwf.observation.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "unknown"}.`
    : (ecmwf?.reason || "Unavailable.");

  const openMeteoCard = `
    <article class="provider-card">
      <div class="provider-title">
        <strong>Open-Meteo</strong>
        <span class="status-dot live" aria-hidden="true"></span>
      </div>
      <p class="provider-meta">Forecast (best-match blend), archive, geocoding, and air quality active.</p>
    </article>
    <article class="provider-card">
      <div class="provider-title">
        <strong>ECMWF IFS 0.25°</strong>
        <span class="status-dot ${ecmwfStatus}" aria-hidden="true"></span>
      </div>
      <p class="provider-meta">${ecmwfNote}</p>
    </article>
  `;

  const meteomatics = data.providers.meteomatics;
  const meteomaticsCard = `
    <article class="provider-card">
      <div class="provider-title">
        <strong>Meteomatics</strong>
        <span class="status-dot ${meteomatics.enabled ? "live" : ""}" aria-hidden="true"></span>
      </div>
      <p class="provider-meta">${meteomatics.enabled ? "Credential-backed Python connector path is active." : meteomatics.reason}</p>
    </article>
  `;

  elements.providerList.innerHTML = openMeteoCard + meteomaticsCard;
}

function renderAgronomy(data) {
  const agronomy = data.agronomy;
  const summary = agronomy.summary;
  const spray = agronomy.sprayWindow;
  const disease = agronomy.diseaseModels;

  const summaryCards = [
    ["Surface soil temp", formatTemperature(summary.soilTemperature0cm, 1), "0 cm soil layer"],
    ["Surface soil moisture", `${formatNumber((summary.soilMoistureSurface || 0) * 100, 0)}%`, "Top 1 cm"],
    ["Rain last 7 days", formatPrecip(summary.rainLast7Days, 1), "Observed archive total"],
    ["Rain next 7 days", formatPrecip(summary.rainNext7Days, 1), "Forecast total"],
    ["Field access score", `${formatNumber(summary.fieldAccessScore)} / 100`, summary.fieldAccessLabel],
    ["Sprayable hours", `${formatNumber(spray.openHoursNext24)} h`, `${formatNumber(spray.longestBlockHours)} h longest block`],
  ];

  elements.agronomyGrid.innerHTML = summaryCards
    .map(
      ([label, value, detail]) => `
        <article class="agro-card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${value}</div>
          <div class="daily-date">${detail}</div>
        </article>
      `
    )
    .join("");

  const diseaseCards = [
    ["General fungal pressure", disease.generalFungalPressure.label, `Score ${formatNumber(disease.generalFungalPressure.score, 2)} | ${disease.generalFungalPressure.basis}`],
    ["Late blight Smith proxy", disease.lateBlightSmithProxy.label, disease.lateBlightSmithProxy.basis],
    ["Septoria proxy", disease.septoriaProxy.label, `Score ${formatNumber(disease.septoriaProxy.score, 2)} | ${disease.septoriaProxy.basis}`],
    ["Spray window risk", spray.riskLabel, "Uses wind, gust, rain chance, rain amount, and temperature over the next 24 hours."],
  ];

  elements.diseaseGrid.innerHTML = diseaseCards
    .map(
      ([label, badge, detail]) => `
        <article class="disease-card">
          <div class="metric-label">${label}</div>
          <div class="risk-badge">${badge}</div>
          <p class="daily-date">${detail}</p>
        </article>
      `
    )
    .join("");

  elements.agronomyDisclaimer.textContent = agronomy.disclaimer;
}

function renderSettings() {
  syncUnitToggleUi();
  renderSavedLocations();
  setSettingsStatus(`${state.settings.unitSystem === "metric" ? "Metric" : "Imperial"} units | ${state.settings.savedLocations.length} saved location${state.settings.savedLocations.length === 1 ? "" : "s"}`);
}

function renderAll(data) {
  renderHero(data);
  renderHourly(data);
  renderDaily(data);
  renderMetrics(data);
  renderAirQuality(data);
  renderHistory(data);
  renderClimate(data);
  renderModelVerification(data);
  renderProviders(data);
  renderAgronomy(data);
  renderSettings();
}

async function fetchJson(url) {
  const response = await fetch(url);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Unexpected server response (${response.status} ${response.statusText})`);
  }
  const payload = await response.json();
  if (!response.ok || payload.error) {
    throw new Error(payload.message || "Request failed");
  }
  return payload;
}

async function loadWeather(location = state.selectedLocation) {
  state.selectedLocation = location;
  const params = new URLSearchParams({
    lat: location.latitude,
    lon: location.longitude,
    timezone: location.timezone || "auto",
    label: location.name,
  });
  buildHistoryParams(params);

  try {
    const data = await fetchJson(`/api/weather?${params.toString()}`);
    state.latestPayload = data;
    renderAll(data);
    setExportStatus(`Ready to export charts for ${data.location.name}.`);
  } catch (error) {
    elements.heroLocation.textContent = "Unable to load weather";
    elements.heroSummary.textContent = error.message;
    setExportStatus(error.message);
  }
}

function clearResults() {
  elements.searchResults.hidden = true;
  elements.searchResults.innerHTML = "";
}

async function handleSearch(event) {
  event.preventDefault();
  const query = elements.searchInput.value.trim();
  if (query.length < 2) {
    clearResults();
    return;
  }

  try {
    const payload = await fetchJson(`/api/search?query=${encodeURIComponent(query)}`);
    const results = payload.results || [];
    if (results.length === 0) {
      elements.searchResults.hidden = false;
      elements.searchResults.innerHTML = `<div class="result-item">No places matched that search.</div>`;
      return;
    }

    elements.searchResults.hidden = false;
    elements.searchResults.innerHTML = "";

    results.forEach((result) => {
      const button = elements.resultTemplate.content.firstElementChild.cloneNode(true);
      const admin = [result.admin1, result.country].filter(Boolean).join(", ");
      const strong = document.createElement("strong");
      strong.textContent = result.name;
      const br = document.createElement("br");
      const span = document.createElement("span");
      span.textContent = admin;
      button.replaceChildren(strong, br, span);
      button.addEventListener("click", () => {
        clearResults();
        elements.searchInput.value = `${result.name}, ${result.country}`;
        loadWeather({
          name: [result.name, result.admin1, result.country].filter(Boolean).join(", "),
          latitude: result.latitude,
          longitude: result.longitude,
          timezone: result.timezone || "auto",
        });
      });
      elements.searchResults.appendChild(button);
    });
  } catch (error) {
    elements.searchResults.hidden = false;
    const errDiv = document.createElement("div");
    errDiv.className = "result-item";
    errDiv.textContent = error.message;
    elements.searchResults.replaceChildren(errDiv);
  }
}

function handleHistoryPresetClick(event) {
  const button = event.target.closest("[data-range]");
  if (!button) {
    return;
  }

  const range = button.dataset.range;
  if (range === "custom") {
    state.history.mode = "custom";
  } else {
    state.history.mode = range;
    state.history.days = Number(range);
  }

  syncHistoryPresetUi();
  if (state.history.mode !== "custom") {
    void loadWeather();
  }
}

function handleCustomHistorySubmit(event) {
  event.preventDefault();
  const start = elements.historyStart.value;
  const end = elements.historyEnd.value;
  if (!start || !end) {
    setExportStatus("Choose both a start and end date for a custom historical range.");
    return;
  }

  state.history.mode = "custom";
  state.history.start = start;
  state.history.end = end;
  syncHistoryPresetUi();
  void loadWeather();
}

function initHistoryDefaults() {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  state.history.start = start.toISOString().slice(0, 10);
  state.history.end = end.toISOString().slice(0, 10);
  updateHistoryInputs();
  syncHistoryPresetUi();
}

function savedLocationKey(location) {
  return `${location.latitude}:${location.longitude}:${location.name}`;
}

function handleSaveCurrentLocation() {
  const location = state.selectedLocation;
  const exists = state.settings.savedLocations.some((item) => savedLocationKey(item) === savedLocationKey(location));
  if (exists) {
    setSettingsStatus("That location is already saved.");
    return;
  }

  state.settings.savedLocations.unshift({
    name: location.name,
    latitude: location.latitude,
    longitude: location.longitude,
    timezone: location.timezone || "auto",
  });
  state.settings.savedLocations = state.settings.savedLocations.slice(0, 12);
  saveSettings();
  renderSettings();
  setSettingsStatus(`Saved ${location.name}.`);
}

function handleSavedLocationsClick(event) {
  const loadButton = event.target.closest("[data-saved-load]");
  const removeButton = event.target.closest("[data-saved-remove]");

  if (loadButton) {
    const location = state.settings.savedLocations[Number(loadButton.dataset.savedLoad)];
    if (location) {
      void loadWeather(location);
    }
    return;
  }

  if (removeButton) {
    const index = Number(removeButton.dataset.savedRemove);
    const [removed] = state.settings.savedLocations.splice(index, 1);
    saveSettings();
    renderSettings();
    setSettingsStatus(removed ? `Removed ${removed.name}.` : "Saved location removed.");
  }
}

function handleUnitToggleClick(event) {
  const button = event.target.closest("[data-unit-system]");
  if (!button) {
    return;
  }
  const nextSystem = button.dataset.unitSystem;
  if (!nextSystem || nextSystem === state.settings.unitSystem) {
    return;
  }

  state.settings.unitSystem = nextSystem;
  saveSettings();
  if (state.latestPayload) {
    renderAll(state.latestPayload);
  } else {
    renderSettings();
  }
  setSettingsStatus(`Switched to ${nextSystem} units.`);
}

function hydrateSettings() {
  loadSettings();
  syncUnitToggleUi();
  renderSavedLocations();
}

document.addEventListener("click", (event) => {
  if (!elements.searchForm.contains(event.target)) {
    clearResults();
  }
});

elements.searchForm.addEventListener("submit", handleSearch);
elements.historyPresets.addEventListener("click", handleHistoryPresetClick);
elements.historyCustomForm.addEventListener("submit", handleCustomHistorySubmit);
elements.saveLocationButton.addEventListener("click", handleSaveCurrentLocation);
elements.savedLocations.addEventListener("click", handleSavedLocationsClick);
elements.unitToggle.addEventListener("click", handleUnitToggleClick);
elements.exportHourlyChart.addEventListener("click", () => {
  downloadCanvas(elements.hourlyChart, "aceweather-24h-forecast.png");
  setExportStatus("Downloaded the 24-hour forecast chart.");
});
elements.exportHistoryChart.addEventListener("click", () => {
  const suffix = state.history.mode === "custom" ? `${state.history.start}-to-${state.history.end}` : `${state.history.days}d`;
  downloadCanvas(elements.historyChart, `aceweather-history-${suffix}.png`);
  setExportStatus("Downloaded the historical weather chart.");
});

elements.copyAiReport.addEventListener("click", async () => {
  const loc = state.selectedLocation;
  const params = new URLSearchParams({
    lat: loc.latitude,
    lon: loc.longitude,
    timezone: loc.timezone || "auto",
    label: loc.name,
  });
  setExportStatus("Generating AI report…");
  try {
    const response = await fetch(`/api/report?${params.toString()}`);
    const text = await response.text();
    await navigator.clipboard.writeText(text);
    setExportStatus(`Copied report for ${loc.name} — paste it into Claude.`);
  } catch {
    setExportStatus("Could not copy report. Try again.");
  }
});

initHistoryDefaults();
hydrateSettings();
renderSettings();

async function reverseGeocode(latitude, longitude) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const data = await res.json();
    const addr = data.address || {};
    const name = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.county || data.display_name?.split(",")[0] || "My Location";
    const region = addr.state || addr.county || "";
    const country = addr.country || "";
    return [name, region, country].filter(Boolean).join(", ");
  } catch {
    return "My Location";
  }
}

if ("geolocation" in navigator) {
  elements.heroLocation.textContent = "Detecting your location…";
  elements.heroSummary.textContent = "Requesting GPS position.";
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const name = await reverseGeocode(latitude, longitude);
      loadWeather({ name, latitude, longitude, timezone: "auto" });
    },
    () => {
      loadWeather();
    },
    { timeout: 8000, maximumAge: 60000 },
  );
} else {
  loadWeather();
}
