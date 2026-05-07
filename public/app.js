const DEFAULT_HISTORY_RANGE = "30";
const STORAGE_KEY = "aceweather-settings-v1";
const PULL_REFRESH_TRIGGER_PX = 84;
const PULL_REFRESH_MAX_PX = 128;

const state = {
  selectedLocation: {
    name: "London, United Kingdom",
    latitude: 51.5085,
    longitude: -0.1257,
    timezone: "Europe/London",
  },
  latestPayload: null,
  settings: {
    temperatureUnit: "c",
    speedUnit: "mph",
    savedLocations: [],
  },
  history: {
    mode: DEFAULT_HISTORY_RANGE,
    days: 30,
    start: "",
    end: "",
  },
  ui: {
    settingsTab: "preferences",
  },
  isRefreshing: false,
  pullRefresh: {
    active: false,
    pulling: false,
    startY: 0,
    distance: 0,
  },
};

// === SKY MODE ===
let manualSkyOverride = false;

function deriveSkyMode(code, isDay) {
  if (code >= 95) return "storm";
  if (code === 82 || (code >= 85 && code <= 86)) return "storm";
  if (code >= 51 && code <= 82) return "overcast";
  if (code >= 45 && code <= 48) return "overcast";
  if (code === 3) return "overcast";
  return isDay ? "clear-day" : "clear-night";
}

function setSkyMode(mode) {
  if (elements.awRoot) elements.awRoot.dataset.sky = mode;
  const buttons = document.querySelectorAll("#sky-mode-switch [data-sky-mode]");
  buttons.forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.dataset.skyMode === mode ? "true" : "false");
  });
}

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
  awRoot: $("#aw-root"),
  heroEyebrow: $("#hero-eyebrow"),
  heroLocation: $("#hero-location"),
  heroCoords: $("#hero-coords"),
  heroSummary: $("#hero-summary"),
  heroTemp: $("#hero-temp"),
  heroUnit: $("#hero-unit"),
  heroFeels: $("#hero-feels"),
  heroIcon: $("#hero-icon"),
  heroCondition: $("#hero-condition"),
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
  exportReport: $("#export-report"),
  exportHistoryChart: $("#export-history-chart"),
  copyAiReport: $("#copy-ai-report"),
  exportStatus: $("#export-status"),
  currentLocationButton: $("#current-location-button"),
  saveLocationButton: $("#save-location-button"),
  shareButton: $("#share-button"),
  shareMenu: $("#share-menu"),
  settingsButton: $("#settings-button"),
  settingsCloseButton: $("#settings-close-button"),
  settingsPopover: $("#settings-popover"),
  settingsStatus: $("#settings-status"),
  settingsTabs: $("#settings-tabs"),
  settingsPanels: document.querySelectorAll("[data-settings-panel]"),
  tempUnitToggle: $("#temp-unit-toggle"),
  speedUnitToggle: $("#speed-unit-toggle"),
  savedLocations: $("#saved-locations"),
  documentsMenu: $("#documents-menu"),
  searchForm: $("#search-form"),
  searchInput: $("#search-input"),
  searchResults: $("#search-results"),
  resultTemplate: $("#result-template"),
  modelVerifyPanel: $("#model-verify-panel"),
  modelVerifyGrid: $("#model-verify-grid"),
  modelVerifyStamp: $("#model-verify-stamp"),
  hourlyChart: $("#hourly-chart"),
  historyChart: $("#history-chart"),
  pullRefreshIndicator: $("#pull-refresh-indicator"),
  pullRefreshLabel: $("#pull-refresh-label"),
};

function isAtTopOfPage() {
  return window.scrollY <= 0;
}

function updateRefreshUi(message = "", isRefreshing = false) {
  if (elements.shareButton) {
    elements.shareButton.disabled = isRefreshing;
  }
  if (!elements.pullRefreshIndicator || !elements.pullRefreshLabel) {
    return;
  }
  if (message) {
    elements.pullRefreshIndicator.hidden = false;
    elements.pullRefreshLabel.textContent = message;
  } else if (!state.pullRefresh.pulling && !isRefreshing) {
    elements.pullRefreshIndicator.hidden = true;
    elements.pullRefreshLabel.textContent = "Pull to refresh";
  }
}

function setPullRefreshDistance(distance) {
  if (!elements.pullRefreshIndicator) {
    return;
  }
  const boundedDistance = Math.max(0, Math.min(distance, PULL_REFRESH_MAX_PX));
  elements.pullRefreshIndicator.style.setProperty("--pull-offset", `${boundedDistance}px`);
}

function resetPullRefreshUi() {
  state.pullRefresh.active = false;
  state.pullRefresh.pulling = false;
  state.pullRefresh.startY = 0;
  state.pullRefresh.distance = 0;
  setPullRefreshDistance(0);
  if (!state.isRefreshing && elements.pullRefreshIndicator) {
    elements.pullRefreshIndicator.hidden = true;
  }
  if (elements.pullRefreshLabel && !state.isRefreshing) {
    elements.pullRefreshLabel.textContent = "Pull to refresh";
  }
}

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
    if (parsed.temperatureUnit === "c" || parsed.temperatureUnit === "f") {
      state.settings.temperatureUnit = parsed.temperatureUnit;
    } else if (parsed.unitSystem === "metric" || parsed.unitSystem === "imperial") {
      state.settings.temperatureUnit = parsed.unitSystem === "imperial" ? "f" : "c";
    }
    if (parsed.speedUnit === "kph" || parsed.speedUnit === "mph") {
      state.settings.speedUnit = parsed.speedUnit;
    } else if (parsed.unitSystem === "metric" || parsed.unitSystem === "imperial") {
      state.settings.speedUnit = parsed.unitSystem === "imperial" ? "mph" : "kph";
    }
    if (Array.isArray(parsed.savedLocations)) {
      state.settings.savedLocations = parsed.savedLocations;
    }
  } catch (error) {
    setSettingsStatus("Could not read saved settings.");
  }
}

function usesCelsius() {
  return state.settings.temperatureUnit === "c";
}

function usesMetricSpeed() {
  return state.settings.speedUnit === "kph";
}

function usesMetricAuxiliaryUnits() {
  return usesCelsius();
}

function temperatureUnitLabel() {
  return usesCelsius() ? "°C" : "°F";
}

function speedUnitLabel() {
  return usesMetricSpeed() ? "km/h" : "mph";
}

function formatTemperature(value, digits = 0) {
  if (value == null) {
    return "--";
  }
  const converted = usesCelsius() ? value : (value * 9) / 5 + 32;
  const suffix = usesCelsius() ? "C" : "F";
  return `${formatNumber(converted, digits)} ${suffix}`;
}

function temperatureSeries(values) {
  return values.map((value) => (value == null ? null : usesCelsius() ? value : (value * 9) / 5 + 32));
}

function formatPrecip(value, digits = 1) {
  if (value == null) {
    return "--";
  }
  const converted = usesMetricAuxiliaryUnits() ? value : value / 25.4;
  const suffix = usesMetricAuxiliaryUnits() ? "mm" : "in";
  return `${formatNumber(converted, digits)} ${suffix}`;
}

function formatSpeed(value, digits = 0) {
  if (value == null) {
    return "--";
  }
  const converted = usesMetricSpeed() ? value : value * 0.621371;
  const suffix = usesMetricSpeed() ? "km/h" : "mph";
  return `${formatNumber(converted, digits)} ${suffix}`;
}

function formatPressure(value, digits = 0) {
  if (value == null) {
    return "--";
  }
  if (usesMetricAuxiliaryUnits()) {
    return `${formatNumber(value, digits)} hPa`;
  }
  return `${formatNumber(value * 0.0295299831, 2)} inHg`;
}

function formatDistance(valueMeters, digits = 1) {
  if (valueMeters == null) {
    return "--";
  }
  const converted = usesMetricAuxiliaryUnits() ? valueMeters / 1000 : valueMeters / 1609.344;
  const suffix = usesMetricAuxiliaryUnits() ? "km" : "mi";
  return `${formatNumber(converted, digits)} ${suffix}`;
}

function getCssVar(element, name) {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

function drawHourlyTape(canvas, data) {
  if (!canvas || !data.length) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 400;
  const H = canvas.clientHeight || 200;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const ink = getCssVar(canvas, "--ink") || "#141210";
  const muted = getCssVar(canvas, "--muted") || "#756f63";
  const tickFaint = getCssVar(canvas, "--tick-faint") || "rgba(20,18,16,0.10)";
  const accent = getCssVar(canvas, "--accent") || "#b8722b";

  const padL = 28, padR = 12, padT = 16, padB = 28;
  const w = W - padL - padR;
  const h = H - padT - padB;

  const temps = data.map((d) => d.temperature ?? 0);
  const tMin = Math.floor(Math.min(...temps) - 1);
  const tMax = Math.ceil(Math.max(...temps) + 1);
  const pMax = Math.max(1, Math.max(...data.map((d) => d.precipitationAmount || 0)) * 1.4);
  const wMax = Math.max(1, Math.max(...data.map((d) => d.wind || 0)) * 1.1);

  // grid lines
  ctx.strokeStyle = tickFaint; ctx.lineWidth = 0.5;
  ctx.font = "9px JetBrains Mono"; ctx.fillStyle = muted;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (h * i) / 4;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    const v = tMax - ((tMax - tMin) * i) / 4;
    ctx.fillText(Math.round(v) + "°", 2, y + 3);
  }

  const bw = w / data.length;

  // precip bars
  data.forEach((d, i) => {
    if ((d.precipitationAmount || 0) > 0) {
      const bh = ((d.precipitationAmount || 0) / pMax) * h * 0.5;
      const x = padL + i * bw + bw * 0.25;
      const y = padT + h - bh;
      ctx.fillStyle = ink; ctx.globalAlpha = 0.15;
      ctx.fillRect(x, y, bw * 0.5, bh);
      ctx.globalAlpha = 1;
    }
  });

  // temp line
  ctx.strokeStyle = ink; ctx.lineWidth = 1.4;
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = padL + i * bw + bw / 2;
    const y = padT + h - ((( d.temperature ?? 0) - tMin) / (tMax - tMin)) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // temp dots
  data.forEach((d, i) => {
    const x = padL + i * bw + bw / 2;
    const y = padT + h - (((d.temperature ?? 0) - tMin) / (tMax - tMin)) * h;
    ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
  });

  // wind dashed line
  if (wMax > 1) {
    ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = padL + i * bw + bw / 2;
      const y = padT + h - ((d.wind || 0) / wMax) * h * 0.7;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // x ticks every 4h
  ctx.fillStyle = muted; ctx.font = "9px JetBrains Mono";
  data.forEach((d, i) => {
    if (i % 4 === 0) {
      const x = padL + i * bw + bw / 2;
      ctx.fillText(d.shortLabel || String(i), x - 6, H - 10);
      ctx.strokeStyle = tickFaint; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(x, padT + h); ctx.lineTo(x, padT + h + 3); ctx.stroke();
    }
  });
}

function drawHistoryTape(canvas, labels, temps, precips) {
  if (!canvas || !temps.length) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 400;
  const H = canvas.clientHeight || 140;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d"); ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const ink = getCssVar(canvas, "--ink") || "#141210";
  const muted = getCssVar(canvas, "--muted") || "#756f63";
  const tick = getCssVar(canvas, "--tick") || "rgba(20,18,16,0.30)";
  const tickFaint = getCssVar(canvas, "--tick-faint") || "rgba(20,18,16,0.10)";

  const padL = 24, padR = 10, padT = 12, padB = 22;
  const w = W - padL - padR; const h = H - padT - padB;

  const filtered = temps.map((v) => v ?? 0);
  const tMin = Math.floor(Math.min(...filtered) - 1);
  const tMax = Math.ceil(Math.max(...filtered) + 1);
  const pMax = Math.max(1, Math.max(...(precips || [0])) * 1.3);
  const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
  const meanY = padT + h - ((mean - tMin) / (tMax - tMin)) * h;

  // mean reference
  ctx.strokeStyle = tick; ctx.lineWidth = 0.5; ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(padL, meanY); ctx.lineTo(W - padR, meanY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = muted; ctx.font = "8px JetBrains Mono";
  ctx.fillText("μ " + mean.toFixed(1) + "°", padL + 3, meanY - 3);
  ctx.fillText(tMax + "°", 2, padT + 6);
  ctx.fillText(tMin + "°", 2, padT + h);

  const bw = w / filtered.length;

  // precip bars
  (precips || []).forEach((p, i) => {
    if ((p || 0) > 0) {
      const bh = (p / pMax) * h * 0.5;
      const x = padL + i * bw + bw * 0.2;
      ctx.fillStyle = ink; ctx.globalAlpha = 0.18;
      ctx.fillRect(x, padT + h - bh, bw * 0.6, bh);
      ctx.globalAlpha = 1;
    }
  });

  // area fill
  ctx.beginPath();
  filtered.forEach((t, i) => {
    const x = padL + i * bw + bw / 2;
    const y = padT + h - ((t - tMin) / (tMax - tMin)) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(padL + (filtered.length - 1) * bw + bw / 2, padT + h);
  ctx.lineTo(padL + bw / 2, padT + h);
  ctx.closePath();
  ctx.fillStyle = ink; ctx.globalAlpha = 0.06; ctx.fill(); ctx.globalAlpha = 1;

  // temp line
  ctx.strokeStyle = ink; ctx.lineWidth = 1.2;
  ctx.beginPath();
  filtered.forEach((t, i) => {
    const x = padL + i * bw + bw / 2;
    const y = padT + h - ((t - tMin) / (tMax - tMin)) * h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // x labels
  ctx.fillStyle = muted; ctx.font = "8px JetBrains Mono";
  const step = Math.max(1, Math.floor(filtered.length / 6));
  labels.forEach((label, i) => {
    if (i % step === 0) {
      const x = padL + i * bw + bw / 2;
      ctx.fillText(label, x - 8, H - 6);
    }
  });
}

// Keep for compatibility — no longer used for main charts
function drawLineChart(canvas, labels, series, options = {}) {
  if (!canvas) return;
  drawHistoryTape(canvas, labels, series, []);
}

function syncHistoryPresetUi() {
  const buttons = elements.historyPresets.querySelectorAll("[data-range]");
  buttons.forEach((button) => {
    const active = button.dataset.range === state.history.mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
  if (elements.historyCustomForm) {
    elements.historyCustomForm.classList.toggle("is-visible", state.history.mode === "custom");
  }
}

function syncUnitToggleUi() {
  const tempButtons = elements.tempUnitToggle.querySelectorAll("[data-temp-unit]");
  tempButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tempUnit === state.settings.temperatureUnit);
  });
  const speedButtons = elements.speedUnitToggle.querySelectorAll("[data-speed-unit]");
  speedButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.speedUnit === state.settings.speedUnit);
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

function dayKey(input) {
  const date = new Date(input);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function buildHourlyPulse(data) {
  const forecast = data.providers.openMeteo.forecast;
  const current = forecast.current;
  const hourly = forecast.hourly;
  const now = new Date();
  const firstFutureIndex = hourly.time.findIndex((time) => new Date(time) > now);
  const currentHourIndex = Math.max(0, firstFutureIndex === -1 ? hourly.time.length - 1 : firstFutureIndex - 1);
  const anchorTime = current.time || hourly.time[currentHourIndex];
  const items = [
    {
      shortLabel: "Now",
      timeLabel: formatDate(anchorTime, { hour: "numeric", minute: "2-digit" }),
      dayLabel: "Today",
      temperature: current.temperature_2m,
      weatherCode: current.weather_code,
      precipitationProbability: hourly.precipitation_probability[currentHourIndex] || 0,
      precipitationAmount: current.precipitation ?? hourly.precipitation[currentHourIndex] ?? 0,
      dayGroup: dayKey(anchorTime),
      isNow: true,
    },
  ];

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

function getForecastDayStartIndex(forecast) {
  const currentDay = (forecast.current.time || "").slice(0, 10);
  const matchIndex = forecast.daily.time.findIndex((time) => time === currentDay);
  return matchIndex >= 0 ? matchIndex : 0;
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

function buildReportParams(location) {
  return new URLSearchParams({
    lat: location.latitude,
    lon: location.longitude,
    timezone: location.timezone || "auto",
    label: location.name,
  });
}

function renderDocuments() {
  if (!elements.documentsMenu) {
    return;
  }

  const selectedLocation = state.selectedLocation;
  const origin = window.location.origin;
  const reportParams = buildReportParams(selectedLocation);
  const reportUrl = `${origin}/api/report?${reportParams.toString()}`;
  const searchReportUrl = `${origin}/api/report?query=${encodeURIComponent(selectedLocation.name)}`;
  const explainerUrl = `${origin}/report-api.md`;

  elements.documentsMenu.innerHTML = `
    <article class="document-card">
      <div class="document-card-header">
        <div>
          <p class="eyebrow">Weather report API</p>
          <h4>Open the current place report</h4>
        </div>
      </div>
      <p>Use the selected location in the app to open the full text weather report directly.</p>
      <div class="document-link-list">
        <a class="document-link" href="${reportUrl}" target="_blank" rel="noreferrer">
          <strong>Current place report</strong>
          <span>${escapeHtml(selectedLocation.name)}</span>
        </a>
        <a class="document-link" href="${searchReportUrl}" target="_blank" rel="noreferrer">
          <strong>Query by place name</strong>
          <span><code>/api/report?query=${escapeHtml(selectedLocation.name)}</code></span>
        </a>
      </div>
    </article>
    <article class="document-card">
      <div class="document-card-header">
        <div>
          <p class="eyebrow">Explainer</p>
          <h4>Markdown reference</h4>
        </div>
      </div>
      <p>A short explainer for the report endpoint, examples, and how to swap in other places.</p>
      <div class="document-link-list">
        <a class="document-link" href="${explainerUrl}" target="_blank" rel="noreferrer">
          <strong>Open report API explainer</strong>
          <span><code>/report-api.md</code></span>
        </a>
      </div>
    </article>
  `;
}

function syncSettingsTabUi() {
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

function renderHero(data) {
  const forecast = data.providers.openMeteo.forecast;
  const current = forecast.current;
  const daily = forecast.daily;
  const dayStartIndex = getForecastDayStartIndex(forecast);

  // Auto-derive sky mode unless manually overridden
  if (!manualSkyOverride) {
    setSkyMode(deriveSkyMode(current.weather_code, current.is_day));
  }

  const nextRain = forecast.hourly.time
    .map((time, index) => ({
      time,
      probability: forecast.hourly.precipitation_probability[index] || 0,
      amount: forecast.hourly.precipitation[index] || 0,
    }))
    .find((entry) => entry.probability > 0 || entry.amount > 0);

  const nextRainSummary = nextRain
    ? `Next rain ${formatDate(nextRain.time, { hour: "numeric", minute: "2-digit" })} with ${formatNumber(nextRain.probability)}% chance and ${formatNumber(nextRain.amount, 1)} mm forecast.`
    : "No rain currently forecast in the upcoming hours.";

  if (elements.heroEyebrow) elements.heroEyebrow.textContent = current.is_day ? "Daytime" : "Night watch";
  elements.heroLocation.textContent = data.location.name;
  if (elements.heroCoords) {
    const lat = formatNumber(Math.abs(data.location.latitude), 4);
    const lon = formatNumber(Math.abs(data.location.longitude), 4);
    const ns = data.location.latitude >= 0 ? "N" : "S";
    const ew = data.location.longitude >= 0 ? "E" : "W";
    elements.heroCoords.textContent = ` ${lat}° ${ns} · ${lon}° ${ew}`;
  }
  elements.heroSummary.textContent = `${weatherCodeToLabel(current.weather_code)}. ${nextRainSummary}`;

  // Temperature — number only, unit separately
  const tempVal = usesCelsius()
    ? Math.round(current.temperature_2m)
    : Math.round(current.temperature_2m * 9 / 5 + 32);
  elements.heroTemp.textContent = tempVal;
  if (elements.heroUnit) elements.heroUnit.textContent = usesCelsius() ? "°C" : "°F";

  // Feels like
  if (elements.heroFeels) {
    const feelsVal = usesCelsius()
      ? Math.round(current.apparent_temperature)
      : Math.round(current.apparent_temperature * 9 / 5 + 32);
    elements.heroFeels.textContent = `${feelsVal}${usesCelsius() ? "°" : "°F"}`;
  }

  elements.heroIcon.textContent = weatherCodeToIcon(current.weather_code);
  if (elements.heroCondition) elements.heroCondition.textContent = weatherCodeToLabel(current.weather_code).toUpperCase();

  const chips = [
    { k: "Wind", v: formatSpeed(current.wind_speed_10m) },
    { k: "Humidity", v: `${formatNumber(current.relative_humidity_2m)}%` },
    { k: "Pressure", v: formatPressure(current.pressure_msl) },
    { k: "UV Index", v: formatNumber(forecast.hourly.uv_index?.[0], 1) },
  ];

  elements.heroChips.innerHTML = chips
    .map((c) => `
      <div class="chip">
        <div class="chip-k">${c.k}</div>
        <div class="chip-v">${c.v}</div>
      </div>
    `)
    .join("");

  elements.updateStamp.textContent = formatDate(data.generatedAt, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderHourly(data) {
  const items = buildHourlyPulse(data);
  const forecast = data.providers.openMeteo.forecast;

  // Map items to tape format (wind from hourly data)
  const tapeData = items.map((item, index) => ({
    shortLabel: item.shortLabel,
    temperature: usesCelsius() ? item.temperature : (item.temperature * 9 / 5 + 32),
    precipitationAmount: item.precipitationAmount,
    wind: forecast.hourly.wind_speed_10m?.[index] ?? 0,
  }));

  const cnv = elements.hourlyChart;
  if (cnv) {
    drawHourlyTape(cnv, tapeData);
    const ro = cnv._resizeObserver;
    if (ro) ro.disconnect();
    cnv._resizeObserver = new ResizeObserver(() => drawHourlyTape(cnv, tapeData));
    cnv._resizeObserver.observe(cnv);
  }

  elements.hourlyStrip.innerHTML = items
    .map((item, index) => {
      const previousDay = items[index - 1]?.dayGroup;
      const showDayLabel = index === 0 || item.dayGroup !== previousDay;
      const tempFormatted = usesCelsius()
        ? `${Math.round(item.temperature ?? 0)}°`
        : `${Math.round((item.temperature ?? 0) * 9 / 5 + 32)}°`;
      return `
        <article class="hour-pill ${item.isNow ? "is-now" : ""}">
          ${showDayLabel ? `<div class="hour-day-label">${escapeHtml(item.dayLabel)}</div>` : ""}
          <time>${escapeHtml(item.shortLabel)}</time>
          <div class="hour-icon">${weatherCodeToIcon(item.weatherCode)}</div>
          <div class="hour-temp">${tempFormatted}</div>
          <div class="hour-rain">${formatNumber(item.precipitationProbability)}%</div>
        </article>
      `;
    })
    .join("");
}

function renderDaily(data) {
  const forecast = data.providers.openMeteo.forecast;
  const daily = forecast.daily;
  const dayStartIndex = getForecastDayStartIndex(forecast);
  const days = daily.time.slice(dayStartIndex, dayStartIndex + 14);

  // Compute temp range across all days for the range bars
  const allLo = days.map((_, i) => {
    const v = daily.temperature_2m_min[dayStartIndex + i];
    return usesCelsius() ? v : (v * 9 / 5 + 32);
  });
  const allHi = days.map((_, i) => {
    const v = daily.temperature_2m_max[dayStartIndex + i];
    return usesCelsius() ? v : (v * 9 / 5 + 32);
  });
  const overallMin = Math.min(...allLo);
  const overallMax = Math.max(...allHi);
  const span = Math.max(overallMax - overallMin, 1);

  elements.dailyGrid.innerHTML = days
    .map((time, index) => {
      const ai = dayStartIndex + index;
      const lo = allLo[index];
      const hi = allHi[index];
      const left = ((lo - overallMin) / span) * 100;
      const width = ((hi - lo) / span) * 100;
      const dayAbbr = formatDate(time, { weekday: "short" }).toUpperCase().slice(0, 3);
      const dateNum = formatDate(time, { day: "2-digit" });
      const precip = +(daily.precipitation_sum?.[ai] ?? 0).toFixed(1);
      const precipPct = Math.round(daily.precipitation_probability_max?.[ai] ?? 0);
      const wind = formatSpeed(daily.wind_speed_10m_max?.[ai] ?? 0);
      return `
        <div class="daily-row">
          <div class="daily-day">${escapeHtml(dayAbbr)}<b>${escapeHtml(dateNum)}</b></div>
          <div class="daily-icon">${weatherCodeToIcon(daily.weather_code[ai])}</div>
          <div class="daily-bar"><div class="daily-fill" style="left:${left.toFixed(1)}%;width:${Math.max(width, 2).toFixed(1)}%"></div></div>
          <div class="daily-temps">${Math.round(hi)}°<small> / ${Math.round(lo)}°</small></div>
          <div class="daily-meta">
            <span>💧 <span class="rain-pct">${precipPct}%</span> · <b>${precip} mm</b></span>
            <span>💨 <b>${wind}</b></span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderMetrics(data) {
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
  const precips = history.daily.precipitation_sum;

  const cnv = elements.historyChart;
  if (cnv) {
    drawHistoryTape(cnv, labels, temps, precips);
    const ro = cnv._resizeObserver;
    if (ro) ro.disconnect();
    cnv._resizeObserver = new ResizeObserver(() => drawHistoryTape(cnv, labels, temps, precips));
    cnv._resizeObserver.observe(cnv);
  }

  const maxTemp = Math.max(...history.daily.temperature_2m_max);
  const minTemp = Math.min(...history.daily.temperature_2m_min);
  const totalRain = history.daily.precipitation_sum.reduce((sum, value) => sum + (value || 0), 0);
  const meanTemp = history.daily.temperature_2m_max.reduce((s, v) => s + (v || 0), 0) / Math.max(history.daily.temperature_2m_max.length, 1);

  elements.historyTitle.textContent = range.days ? `${range.days}-day history` : "Historical lens";
  elements.historySubtitle.textContent = range.startDate && range.endDate
    ? `${formatDate(range.startDate, { day: "numeric", month: "short" })} – ${formatDate(range.endDate, { day: "numeric", month: "short" })}`
    : "Archive";

  const stats = [
    { k: "Mean", v: formatTemperature(meanTemp, 1) },
    { k: "Range", v: `${Math.round(usesCelsius() ? minTemp : (minTemp * 9/5 + 32))}–${Math.round(usesCelsius() ? maxTemp : (maxTemp * 9/5 + 32))}°` },
    { k: "Σ Precip", v: formatPrecip(totalRain, 1) },
  ];

  elements.historyStats.innerHTML = stats
    .map((s) => `
      <div class="history-stat">
        <div class="k">${escapeHtml(s.k)}</div>
        <div class="v">${escapeHtml(s.v)}</div>
      </div>
    `)
    .join("");
}

function renderClimate(data) {
  const climateWindow = data.providers.openMeteo.climateWindow;
  const climate = climateWindow.daily;
  const summary = climateWindow.summary || {};
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

  const cardsHtml = cards
    .map(
      ([label, value]) => `
        <article class="climate-card">
          <div class="metric-label">${label}</div>
          <div class="metric-value">${value}</div>
        </article>
      `
    )
    .join("");

  elements.climateSummary.innerHTML = `
    <article class="climate-card climate-tracker-card">
      <div class="metric-label">Monthly rainfall tracker</div>
      <div class="climate-tracker-headline">${formatPrecip(summary.currentMonthRain, 1)} / ${formatPrecip(summary.averageMonthlyRain, 1)}</div>
      <div class="climate-tracker-bar" aria-hidden="true">
        <div class="climate-tracker-fill" style="width: ${summary.progressPctCapped ?? 0}%"></div>
      </div>
      <p class="daily-date">${progressLabel}</p>
    </article>
    ${cardsHtml}
  `;
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

function riskToLevel(label) {
  const l = (label || "").toLowerCase();
  if (l.includes("low") || l.includes("good") || l.includes("firm") || l.includes("open")) return "go";
  if (l.includes("high") || l.includes("very") || l.includes("severe") || l.includes("closed")) return "hold";
  return "caution";
}

function renderAgronomy(data) {
  const agronomy = data.agronomy;
  const summary = agronomy.summary;
  const spray = agronomy.sprayWindow;
  const disease = agronomy.diseaseModels;

  const fieldScore = Math.round(summary.fieldAccessScore ?? 0);
  const sprayScore = spray.openHoursNext24 != null ? Math.round((spray.openHoursNext24 / 24) * 100) : 0;
  const soilMoisturePct = Math.round((summary.soilMoistureSurface || 0) * 100);
  const rainNext7 = summary.rainNext7Days ?? 0;

  const agroItems = [
    {
      name: "Spray window",
      lvl: riskToLevel(spray.riskLabel),
      val: sprayScore,
      k: spray.riskLabel || "–",
      v: `${formatNumber(spray.openHoursNext24)} h open next 24h`,
    },
    {
      name: "Field access",
      lvl: riskToLevel(summary.fieldAccessLabel),
      val: fieldScore,
      k: summary.fieldAccessLabel || "–",
      v: `Score ${fieldScore} / 100`,
    },
    {
      name: "Soil moisture",
      lvl: soilMoisturePct > 80 ? "hold" : soilMoisturePct > 50 ? "caution" : "go",
      val: soilMoisturePct,
      k: "Top 1 cm surface",
      v: `${soilMoisturePct}%`,
    },
    {
      name: "Rain next 7d",
      lvl: rainNext7 > 20 ? "hold" : rainNext7 > 8 ? "caution" : "go",
      val: Math.min(100, Math.round(rainNext7 * 3)),
      k: "Forecast total",
      v: formatPrecip(rainNext7, 1),
    },
    {
      name: "Soil temp",
      lvl: "go",
      val: 50,
      k: "0 cm layer",
      v: formatTemperature(summary.soilTemperature0cm, 1),
    },
    {
      name: "Rain last 7d",
      lvl: "go",
      val: 50,
      k: "Observed archive",
      v: formatPrecip(summary.rainLast7Days, 1),
    },
  ];

  elements.agronomyGrid.innerHTML = agroItems
    .map((a) => `
      <div class="agro">
        <div class="agro-head">
          <span>${escapeHtml(a.name)}</span>
          <span class="lvl" data-lvl="${a.lvl}">${a.lvl}</span>
        </div>
        <div class="agro-name">${escapeHtml(a.v)}</div>
        <div class="agro-meter"><div class="agro-meter-fill" style="width:${a.val}%"></div></div>
        <div class="agro-foot"><span>${escapeHtml(a.k)}</span><b>${a.val}</b></div>
      </div>
    `)
    .join("");

  const diseaseCards = [
    ["General fungal", disease.generalFungalPressure.label, `Score ${formatNumber(disease.generalFungalPressure.score, 2)}`],
    ["Late blight", disease.lateBlightSmithProxy.label, disease.lateBlightSmithProxy.basis],
    ["Septoria", disease.septoriaProxy.label, `Score ${formatNumber(disease.septoriaProxy.score, 2)}`],
    ["Spray risk", spray.riskLabel, "Wind · rain · temp next 24h"],
  ];

  elements.diseaseGrid.innerHTML = diseaseCards
    .map(([label, badge, detail]) => `
      <article class="disease-card">
        <div class="metric-label">${escapeHtml(label)}</div>
        <div class="risk-badge">${escapeHtml(badge || "–")}</div>
        <p class="daily-date">${escapeHtml(detail || "")}</p>
      </article>
    `)
    .join("");

  elements.agronomyDisclaimer.textContent = agronomy.disclaimer;
}

function renderSettings() {
  syncUnitToggleUi();
  renderSavedLocations();
  renderDocuments();
  syncSettingsTabUi();
  setSettingsStatus(`${temperatureUnitLabel()} temp | ${speedUnitLabel()} wind | ${state.settings.savedLocations.length} saved location${state.settings.savedLocations.length === 1 ? "" : "s"}`);
}

function precipStatus(code) {
  if (code >= 95) return "STORM";
  if (code >= 80) return "SHOWERS";
  if (code >= 61) return "RAIN";
  if (code >= 51) return "DRIZZLE";
  return "DRY";
}

function renderRainGauge(data) {
  const wrap = document.getElementById("rain-gauge-wrap");
  if (!wrap) return;

  const forecast = data.providers.openMeteo.forecast;
  const current = forecast.current;
  const hourly = forecast.hourly;
  const daily = forecast.daily;
  const history = data.providers.openMeteo.history;
  const climate = data.providers.openMeteo.climateWindow;

  // Current conditions
  const nowMm = current.precipitation ?? 0;
  const dayStartIndex = getForecastDayStartIndex(forecast);
  const now = new Date();
  const currentHourIndex = Math.max(0, hourly.time.findIndex((t) => new Date(t) > now) - 1);
  const nowProb = hourly.precipitation_probability?.[currentHourIndex] ?? 0;
  const nowRate = hourly.precipitation?.[currentHourIndex] ?? 0;
  const status = precipStatus(current.weather_code);

  // 24h total — sum next 24 hourly values
  const next24 = hourly.precipitation?.slice(currentHourIndex, currentHourIndex + 24) ?? [];
  const last24Mm = next24.reduce((s, v) => s + (v || 0), 0);

  // Month totals
  const monthMm = Math.round(data.agronomy?.summary?.rainLast7Days ?? 0); // rough proxy
  const monthNorm = Math.round(climate?.summary?.averageMonthlyRain ?? 42);
  const currentMonthMm = Math.round(climate?.summary?.currentMonthRain ?? monthMm);

  // Past 7 days from history
  const DAY_ABBR = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
  const past7 = [];
  if (history?.daily?.time) {
    const days = history.daily.time.slice(-7);
    days.forEach((t, i) => {
      const idx = history.daily.time.length - 7 + i;
      past7.push({
        d: DAY_ABBR[new Date(t).getDay()].slice(0, 1),
        mm: +(history.daily.precipitation_sum?.[idx] ?? 0).toFixed(1),
      });
    });
  }
  while (past7.length < 7) past7.unshift({ d: "–", mm: 0 });

  // Next 7 days from forecast
  const next7 = daily.time.slice(dayStartIndex, dayStartIndex + 7).map((t, i) => {
    const ai = dayStartIndex + i;
    return {
      d: DAY_ABBR[new Date(t).getDay()].slice(0, 1),
      mm: +(daily.precipitation_sum?.[ai] ?? 0).toFixed(1),
      pct: daily.precipitation_probability_max?.[ai] ?? 0,
    };
  });

  const SCALE = 25;
  const fillPct = Math.min(100, (last24Mm / SCALE) * 100);
  const past7Max = Math.max(1, ...past7.map((p) => p.mm));
  const next7Max = Math.max(1, ...next7.map((p) => p.mm));
  const past7Sum = past7.reduce((a, b) => a + b.mm, 0).toFixed(1);
  const next7Sum = next7.reduce((a, b) => a + b.mm, 0).toFixed(1);

  // SVG cylinder ticks
  const ticks = Array.from({ length: 26 }, (_, i) => {
    const isMajor = i % 5 === 0;
    const x2 = isMajor ? 8 : 4;
    const sw = isMajor ? 0.6 : 0.3;
    return `<line x1="0" x2="${x2}" y1="${i * 4}" y2="${i * 4}" stroke="var(--tick)" stroke-width="${sw}"/>`;
  }).join("");
  const tickLabels = [0, 5, 10, 15, 20, 25].map((v) =>
    `<text x="11" y="${(SCALE - v) * 4 + 2.5}" font-size="5" fill="var(--muted)" font-family="JetBrains Mono">${v}</text>`
  ).join("");
  const cylFillH = fillPct * 0.92;
  const cylFillY = 10 + (100 - fillPct) * 0.92;
  const levelY = (10 + (100 - fillPct) * 0.92).toFixed(1);

  const pastBars = past7.map((d) => `
    <div class="rg-bar-col">
      <div class="rg-bar">
        <div class="rg-bar-fill" style="height:${d.mm > 0 ? (d.mm / past7Max * 100).toFixed(1) : 0}%"></div>
      </div>
      <div class="rg-bar-mm">${d.mm > 0 ? d.mm : "·"}</div>
      <div class="rg-bar-d">${d.d}</div>
    </div>`).join("");

  const nextBars = next7.map((d) => `
    <div class="rg-bar-col">
      <div class="rg-bar">
        <div class="rg-bar-fill dashed" style="height:${d.mm > 0 ? (d.mm / next7Max * 100).toFixed(1) : 0}%"></div>
        <div class="rg-bar-pct" style="height:${d.pct}%"></div>
      </div>
      <div class="rg-bar-mm">${d.mm > 0 ? d.mm : "·"}</div>
      <div class="rg-bar-pct-label">${d.pct}%</div>
      <div class="rg-bar-d">${d.d}</div>
    </div>`).join("");

  const normDiff = currentMonthMm - monthNorm;
  const normStr = `${normDiff >= 0 ? "+" : ""}${normDiff} vs norm`;

  wrap.innerHTML = `
    <div class="dial rain-gauge" style="margin-top:14px">
      <div class="dial-label"><span>Rain Gauge</span><span>${escapeHtml(status)}</span></div>
      <div class="rg-top">
        <div>
          <svg viewBox="0 0 38 104" preserveAspectRatio="xMidYMid meet" class="rg-cyl-svg">
            <path d="M 4 2 L 34 2 L 26 10 L 12 10 Z" fill="none" stroke="var(--rule)" stroke-width="0.5"/>
            <rect x="12" y="10" width="14" height="92" fill="none" stroke="var(--rule)" stroke-width="0.5"/>
            <rect x="12" y="${cylFillY.toFixed(1)}" width="14" height="${cylFillH.toFixed(1)}" fill="var(--ink)" opacity="0.85"/>
            <g transform="translate(28,10)">${ticks}${tickLabels}</g>
            <line x1="12" x2="26" y1="${levelY}" y2="${levelY}" stroke="var(--accent)" stroke-width="0.8"/>
          </svg>
        </div>
        <div class="rg-readout">
          <div class="rg-now">
            <div class="rg-now-k">NOW</div>
            <div class="rg-now-v">${nowMm.toFixed(1)}<small>mm</small></div>
            <div class="rg-now-rate">${nowRate.toFixed(1)} mm/h · ${nowProb}%</div>
          </div>
          <div class="rg-stats">
            <div>
              <div class="rg-stat-k">24H</div>
              <div class="rg-stat-v">${last24Mm.toFixed(1)}<small>mm</small></div>
            </div>
            <div>
              <div class="rg-stat-k">Month</div>
              <div class="rg-stat-v">${currentMonthMm}<small>mm</small></div>
              <div class="rg-stat-sub">${escapeHtml(normStr)}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="rg-section">
        <div class="rg-section-head"><span>Past 7 days</span><b>Σ ${past7Sum} mm</b></div>
        <div class="rg-bars">${pastBars}</div>
      </div>
      <div class="rg-section">
        <div class="rg-section-head"><span>Next 7 days</span><b>Σ ${next7Sum} mm fcst</b></div>
        <div class="rg-bars">${nextBars}</div>
        <div class="rg-legend">
          <span><i class="bar-solid"></i>MM</span>
          <span><i class="bar-line"></i>% CHANCE</span>
        </div>
      </div>
    </div>`;
}

function buildAgronomyText(data) {
  const loc = data.location;
  const forecast = data.providers.openMeteo.forecast;
  const agronomy = data.agronomy;
  const cur = forecast.current;
  const hourlyItems = buildHourlyPulse(data);
  const hourly = forecast.hourly;
  const daily = forecast.daily;
  const dayStartIndex = getForecastDayStartIndex(forecast);
  const now = new Date();
  const stamp = now.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const toTemp = (v) => v == null ? "--" : (usesCelsius() ? `${Math.round(v)}°C` : `${Math.round(v * 9 / 5 + 32)}°F`);
  const ag = agronomy.summary;
  const spray = agronomy.sprayWindow;
  const disease = agronomy.diseaseModels;
  const SEP = "─".repeat(52);

  const lines = [
    `ACEWEATHER · AGRONOMY BRIEF`,
    `${loc.name}`,
    `${stamp} | ${loc.latitude.toFixed(4)}°N ${Math.abs(loc.longitude).toFixed(4)}°${loc.longitude >= 0 ? "E" : "W"}`,
    ``,
    SEP,
    `CURRENT CONDITIONS`,
    SEP,
    `Temp:      ${toTemp(cur.temperature_2m)}  (feels ${toTemp(cur.apparent_temperature)})`,
    `Condition: ${weatherCodeToLabel(cur.weather_code)}`,
    `Wind:      ${formatSpeed(cur.wind_speed_10m)}  (gusts ${formatSpeed(cur.wind_gusts_10m)})`,
    `Humidity:  ${cur.relative_humidity_2m}%   Pressure: ${Math.round(cur.pressure_msl)} hPa`,
    `Rain now:  ${(cur.precipitation ?? 0).toFixed(1)} mm`,
    ``,
    SEP,
    `24-HOUR OUTLOOK`,
    SEP,
    `${"TIME".padEnd(7)} ${"".padEnd(3)} ${"TEMP".padEnd(7)} ${"WIND".padEnd(10)} ${"RAIN%".padEnd(7)} MM`,
  ];

  let lastDay = null;
  hourlyItems.slice(0, 25).forEach((item, i) => {
    const wind = hourly.wind_speed_10m?.[i] ?? 0;
    if (item.dayGroup !== lastDay && !item.isNow) {
      lines.push(`── ${item.dayLabel.toUpperCase()} ────────────────────────────────────`);
      lastDay = item.dayGroup;
    } else if (item.isNow) {
      lastDay = item.dayGroup;
    }
    const time = item.shortLabel.padEnd(7);
    const icon = weatherCodeToIcon(item.weatherCode).padEnd(3);
    const temp = toTemp(item.temperature).padEnd(7);
    const windFmt = formatSpeed(wind).padEnd(10);
    const pct = `${Math.round(item.precipitationProbability)}%`.padEnd(7);
    const mm = item.precipitationAmount.toFixed(1);
    lines.push(`${time} ${icon} ${temp} ${windFmt} ${pct} ${mm}`);
  });

  lines.push(``);
  lines.push(SEP);
  lines.push(`FIELD DECISIONS`);
  lines.push(SEP);
  lines.push(`Spray window:  ${spray.riskLabel || "–"} — ${formatNumber(spray.openHoursNext24)} h open / ${formatNumber(spray.longestBlockHours)} h longest block`);
  lines.push(`Field access:  ${ag.fieldAccessLabel || "–"} — score ${Math.round(ag.fieldAccessScore ?? 0)}/100`);
  lines.push(`Rain last 7d:  ${formatPrecip(ag.rainLast7Days, 1)} observed`);
  lines.push(`Rain next 7d:  ${formatPrecip(ag.rainNext7Days, 1)} forecast`);
  lines.push(`Soil moisture: ${Math.round((ag.soilMoistureSurface || 0) * 100)}%  (surface 0–1 cm)`);
  lines.push(`Soil temp:     ${formatTemperature(ag.soilTemperature0cm, 1)}`);
  lines.push(``);
  lines.push(SEP);
  lines.push(`DISEASE RISK`);
  lines.push(SEP);
  lines.push(`General fungal: ${disease.generalFungalPressure.label} (score ${formatNumber(disease.generalFungalPressure.score, 2)})`);
  lines.push(`Late blight:    ${disease.lateBlightSmithProxy.triggered ? "TRIGGERED" : "Not triggered"} — ${disease.lateBlightSmithProxy.basis || ""}`);
  lines.push(`Septoria:       ${disease.septoriaProxy.label} (score ${formatNumber(disease.septoriaProxy.score, 2)})`);
  lines.push(`Spray risk:     ${spray.riskLabel || "–"}`);
  lines.push(``);
  lines.push(SEP);
  lines.push(`7-DAY FORECAST`);
  lines.push(SEP);
  lines.push(`${"DATE".padEnd(7)} ${"CONDITION".padEnd(22)} ${"HI".padEnd(6)} ${"LO".padEnd(6)} ${"RAIN%".padEnd(7)} ${"MM".padEnd(6)} WIND`);

  for (let i = 0; i < Math.min(7, daily.time.length - dayStartIndex); i++) {
    const ai = dayStartIndex + i;
    const d = daily.time[ai];
    const dayAbbr = formatDate(d, { weekday: "short" });
    const dateNum = formatDate(d, { day: "2-digit" });
    const cond = weatherCodeToLabel(daily.weather_code[ai]).slice(0, 22);
    const hi = toTemp(daily.temperature_2m_max[ai]);
    const lo = toTemp(daily.temperature_2m_min[ai]);
    const pct = `${Math.round(daily.precipitation_probability_max?.[ai] ?? 0)}%`;
    const mm = (daily.precipitation_sum?.[ai] ?? 0).toFixed(1);
    const wind = formatSpeed(daily.wind_speed_10m_max?.[ai] ?? 0);
    lines.push(`${(dayAbbr + " " + dateNum).padEnd(7)} ${cond.padEnd(22)} ${hi.padEnd(6)} ${lo.padEnd(6)} ${pct.padEnd(7)} ${mm.padEnd(6)} ${wind}`);
  }

  lines.push(``);
  lines.push(SEP);
  lines.push(`${agronomy.disclaimer}`);
  lines.push(``);
  lines.push(`Generated by AceWeather — aceweather.app`);

  return lines.join("\n");
}

function buildAgronomyBriefHtml(data) {
  const loc = data.location;
  const forecast = data.providers.openMeteo.forecast;
  const agronomy = data.agronomy;
  const cur = forecast.current;
  const hourlyItems = buildHourlyPulse(data);
  const hourly = forecast.hourly;
  const daily = forecast.daily;
  const dayStartIndex = getForecastDayStartIndex(forecast);
  const now = new Date();
  const stamp = now.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const toTemp = (v) => v == null ? "--" : (usesCelsius() ? `${Math.round(v)}°C` : `${Math.round(v * 9 / 5 + 32)}°F`);
  const ag = agronomy.summary;
  const spray = agronomy.sprayWindow;
  const disease = agronomy.diseaseModels;

  // Current conditions chips
  const currentChips = [
    { k: "TEMP", v: toTemp(cur.temperature_2m) },
    { k: "FEELS", v: toTemp(cur.apparent_temperature) },
    { k: "WIND", v: formatSpeed(cur.wind_speed_10m) },
    { k: "GUSTS", v: formatSpeed(cur.wind_gusts_10m) },
    { k: "HUMIDITY", v: `${cur.relative_humidity_2m}%` },
    { k: "PRESSURE", v: `${Math.round(cur.pressure_msl)} hPa` },
    { k: "RAIN NOW", v: `${(cur.precipitation ?? 0).toFixed(1)} mm` },
    { k: "CONDITION", v: weatherCodeToLabel(cur.weather_code).toUpperCase() },
  ];

  // 24h table rows
  let lastDay = null;
  const tableRows = hourlyItems.slice(0, 25).map((item, i) => {
    const wind = hourly.wind_speed_10m?.[i] ?? 0;
    let daySep = "";
    if (item.dayGroup !== lastDay && !item.isNow) {
      daySep = `<tr class="day-sep"><td colspan="6">${escapeHtml(item.dayLabel.toUpperCase())}</td></tr>`;
      lastDay = item.dayGroup;
    } else if (item.isNow) {
      lastDay = item.dayGroup;
    }
    const pctClass = item.precipitationProbability >= 70 ? ' style="color:var(--accent)"' : "";
    return `${daySep}<tr${item.isNow ? ' class="is-now"' : ""}>
      <td>${escapeHtml(item.shortLabel)}</td>
      <td class="col-icon">${weatherCodeToIcon(item.weatherCode)}</td>
      <td class="col-temp">${escapeHtml(toTemp(item.temperature))}</td>
      <td>${escapeHtml(formatSpeed(wind))}</td>
      <td class="col-pct"${pctClass}>${Math.round(item.precipitationProbability)}%</td>
      <td class="col-mm">${item.precipitationAmount.toFixed(1)} mm</td>
    </tr>`;
  }).join("");

  // Field decisions
  const fieldItems = [
    { label: "Spray window", value: `${formatNumber(spray.openHoursNext24)} h open`, badge: spray.riskLabel || "–", lvl: riskToLevel(spray.riskLabel) },
    { label: "Field access", value: `Score ${Math.round(ag.fieldAccessScore ?? 0)}/100`, badge: ag.fieldAccessLabel || "–", lvl: riskToLevel(ag.fieldAccessLabel) },
    { label: "Soil moisture", value: `${Math.round((ag.soilMoistureSurface || 0) * 100)}%`, badge: "Surface", lvl: (ag.soilMoistureSurface || 0) > 0.8 ? "hold" : (ag.soilMoistureSurface || 0) > 0.5 ? "caution" : "go" },
    { label: "Rain last 7d", value: formatPrecip(ag.rainLast7Days, 1), badge: "Observed", lvl: "go" },
    { label: "Rain next 7d", value: formatPrecip(ag.rainNext7Days, 1), badge: "Forecast", lvl: (ag.rainNext7Days ?? 0) > 20 ? "hold" : (ag.rainNext7Days ?? 0) > 8 ? "caution" : "go" },
    { label: "Soil temp", value: formatTemperature(ag.soilTemperature0cm, 1), badge: "0 cm", lvl: "go" },
  ];

  const fieldHtml = fieldItems.map(f => `
    <div class="agro-brief-field" data-lvl="${f.lvl}">
      <span class="label">${escapeHtml(f.label)}</span>
      <span class="value">${escapeHtml(f.value)}</span>
      <span class="badge">${escapeHtml(f.badge)}</span>
    </div>`).join("");

  // Disease
  const diseaseItems = [
    { label: "General fungal", badge: disease.generalFungalPressure.label, detail: `Score ${formatNumber(disease.generalFungalPressure.score, 2)}` },
    { label: "Late blight", badge: disease.lateBlightSmithProxy.triggered ? "TRIGGERED" : "Not triggered", detail: disease.lateBlightSmithProxy.triggered ? (disease.lateBlightSmithProxy.basis || "").split(".")[0] : "Smith Period not met" },
    { label: "Septoria", badge: disease.septoriaProxy.label, detail: `Score ${formatNumber(disease.septoriaProxy.score, 2)}` },
    { label: "Spray risk", badge: spray.riskLabel || "–", detail: "Wind · rain · temp next 24h" },
  ];

  const diseaseHtml = diseaseItems.map(d => `
    <div class="agro-brief-field" data-lvl="${riskToLevel(d.badge)}">
      <span class="label">${escapeHtml(d.label)}</span>
      <span class="value">${escapeHtml(d.badge || "–")}</span>
      <span class="badge">${escapeHtml(d.detail)}</span>
    </div>`).join("");

  // 7-day
  const dailyHtml = Array.from({ length: Math.min(7, daily.time.length - dayStartIndex) }, (_, i) => {
    const ai = dayStartIndex + i;
    const d = daily.time[ai];
    const dayAbbr = formatDate(d, { weekday: "short" }).toUpperCase().slice(0, 3);
    const dateNum = formatDate(d, { day: "2-digit" });
    const hi = toTemp(daily.temperature_2m_max[ai]);
    const lo = toTemp(daily.temperature_2m_min[ai]);
    const pct = Math.round(daily.precipitation_probability_max?.[ai] ?? 0);
    const mm = (daily.precipitation_sum?.[ai] ?? 0).toFixed(1);
    const wind = formatSpeed(daily.wind_speed_10m_max?.[ai] ?? 0);
    return `
      <div class="agro-brief-day">
        <span>${escapeHtml(dayAbbr)}<br><b>${escapeHtml(dateNum)}</b></span>
        <span>${weatherCodeToIcon(daily.weather_code[ai])}</span>
        <span class="temps">${escapeHtml(hi)}<br><small>${escapeHtml(lo)}</small></span>
        <span class="meta">💧 <span style="color:var(--accent)">${pct}%</span> · <b>${mm} mm</b></span>
        <span class="meta">💨 <b>${escapeHtml(wind)}</b></span>
      </div>`;
  }).join("");

  return `
    <div class="agro-brief-head">
      <span class="agro-brief-place">${escapeHtml(loc.name)}</span>
      <span class="agro-brief-stamp">${escapeHtml(stamp)}</span>
    </div>
    <div class="agro-brief-block">
      <div class="agro-brief-label">Current conditions</div>
      <div class="agro-brief-chips">${currentChips.map(c => `
        <div class="agro-brief-chip"><span class="k">${escapeHtml(c.k)}</span><span class="v">${escapeHtml(c.v)}</span></div>`).join("")}
      </div>
    </div>
    <div class="agro-brief-block">
      <div class="agro-brief-label">24-hour outlook</div>
      <div class="agro-24h-wrap">
        <table class="agro-24h-table">
          <thead><tr><th>TIME</th><th></th><th>TEMP</th><th>WIND</th><th>RAIN%</th><th>MM</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>
    <div class="agro-brief-block">
      <div class="agro-brief-label">Field decisions</div>
      <div class="agro-brief-field-grid">${fieldHtml}</div>
    </div>
    <div class="agro-brief-block">
      <div class="agro-brief-label">Disease risk</div>
      <div class="agro-brief-field-grid">${diseaseHtml}</div>
    </div>
    <div class="agro-brief-block">
      <div class="agro-brief-label">7-day forecast</div>
      <div class="agro-brief-daily">${dailyHtml}</div>
    </div>
    <div class="agro-brief-footer">
      <a href="https://aceweather.app" target="_blank" rel="noopener">aceweather.app</a>
    </div>
  `;
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
  renderRainGauge(data);
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

async function loadWeather(location = state.selectedLocation, options = {}) {
  const { preserveScroll = false } = options;
  if (state.isRefreshing) {
    return;
  }

  state.selectedLocation = location;
  const params = new URLSearchParams({
    lat: location.latitude,
    lon: location.longitude,
    timezone: location.timezone || "auto",
    label: location.name,
  });
  buildHistoryParams(params);

  const previousScrollY = window.scrollY;
  state.isRefreshing = true;
  updateRefreshUi("Refreshing weather...", true);

  try {
    const data = await fetchJson(`/api/weather?${params.toString()}`);
    state.latestPayload = data;
    renderAll(data);
    setExportStatus(`Ready to export charts for ${data.location.name}.`);
    if (preserveScroll) {
      window.scrollTo({ top: previousScrollY });
    }
  } catch (error) {
    elements.heroLocation.textContent = "Unable to load weather";
    elements.heroSummary.textContent = error.message;
    setExportStatus(error.message);
  } finally {
    state.isRefreshing = false;
    updateRefreshUi("", false);
    resetPullRefreshUi();
  }
}

function handleManualRefresh() {
  void loadWeather(state.selectedLocation, { preserveScroll: true });
}

function canUseGeolocation() {
  return "geolocation" in navigator;
}

async function requestCurrentLocation(options = {}) {
  const { preserveScroll = false, fallbackToSelected = false } = options;
  if (!canUseGeolocation()) {
    setSettingsStatus("Current location is not available in this browser.");
    return;
  }

  elements.heroLocation.textContent = "Detecting your location…";
  elements.heroSummary.textContent = "Requesting GPS position.";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      const name = await reverseGeocode(latitude, longitude);
      void loadWeather({ name, latitude, longitude, timezone: "auto" }, { preserveScroll });
    },
    () => {
      elements.heroLocation.textContent = state.selectedLocation.name;
      elements.heroSummary.textContent = "Could not get your current location.";
      setSettingsStatus("Location access was denied or unavailable.");
      if (fallbackToSelected) {
        void loadWeather(state.selectedLocation, { preserveScroll });
      }
    },
    { timeout: 8000, maximumAge: 60000 },
  );
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
      setSettingsPopoverOpen(false);
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

function rerenderAfterSettingsChange(message) {
  saveSettings();
  if (state.latestPayload) {
    renderAll(state.latestPayload);
  } else {
    renderSettings();
  }
  setSettingsStatus(message);
}

function handleTempUnitToggleClick(event) {
  const button = event.target.closest("[data-temp-unit]");
  if (!button) {
    return;
  }
  const nextUnit = button.dataset.tempUnit;
  if (!nextUnit || nextUnit === state.settings.temperatureUnit) {
    return;
  }

  state.settings.temperatureUnit = nextUnit;
  rerenderAfterSettingsChange(`Switched temperature to ${temperatureUnitLabel()}.`);
}

function handleSpeedUnitToggleClick(event) {
  const button = event.target.closest("[data-speed-unit]");
  if (!button) {
    return;
  }
  const nextUnit = button.dataset.speedUnit;
  if (!nextUnit || nextUnit === state.settings.speedUnit) {
    return;
  }

  state.settings.speedUnit = nextUnit;
  rerenderAfterSettingsChange(`Switched wind speed to ${speedUnitLabel()}.`);
}

function handleSettingsTabClick(event) {
  const button = event.target.closest("[data-settings-tab]");
  if (!button) {
    return;
  }
  const nextTab = button.dataset.settingsTab;
  if (!nextTab || nextTab === state.ui.settingsTab) {
    return;
  }
  state.ui.settingsTab = nextTab;
  syncSettingsTabUi();
}

function setSettingsPopoverOpen(isOpen) {
  if (!elements.settingsPopover || !elements.settingsButton) {
    return;
  }
  elements.settingsPopover.hidden = !isOpen;
  elements.settingsButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function toggleSettingsPopover() {
  setSettingsPopoverOpen(elements.settingsPopover.hidden);
}

function hydrateSettings() {
  loadSettings();
  syncUnitToggleUi();
  renderSavedLocations();
  renderDocuments();
  syncSettingsTabUi();
}

function shouldPreferSavedDesktopLocation() {
  return state.settings.savedLocations.length > 0
    && window.matchMedia("(min-width: 761px) and (pointer:fine)").matches;
}

function loadInitialWeather() {
  if (shouldPreferSavedDesktopLocation()) {
    void loadWeather(state.settings.savedLocations[0]);
    return;
  }
  if (canUseGeolocation()) {
    void requestCurrentLocation({ fallbackToSelected: true });
    return;
  }
  void loadWeather();
}

function handleTouchStart(event) {
  if (state.isRefreshing || !isAtTopOfPage() || event.touches.length !== 1) {
    resetPullRefreshUi();
    return;
  }
  state.pullRefresh.active = true;
  state.pullRefresh.startY = event.touches[0].clientY;
  state.pullRefresh.distance = 0;
}

function handleTouchMove(event) {
  if (!state.pullRefresh.active || state.isRefreshing || event.touches.length !== 1) {
    return;
  }

  const distance = event.touches[0].clientY - state.pullRefresh.startY;
  if (distance <= 0) {
    if (!state.pullRefresh.pulling) {
      resetPullRefreshUi();
    }
    return;
  }

  if (!isAtTopOfPage()) {
    resetPullRefreshUi();
    return;
  }

  state.pullRefresh.pulling = true;
  state.pullRefresh.distance = distance;
  setPullRefreshDistance(distance);
  updateRefreshUi(distance >= PULL_REFRESH_TRIGGER_PX ? "Release to refresh" : "Pull to refresh", false);
  event.preventDefault();
}

function handleTouchEnd() {
  if (!state.pullRefresh.active && !state.pullRefresh.pulling) {
    return;
  }

  const shouldRefresh = state.pullRefresh.distance >= PULL_REFRESH_TRIGGER_PX;
  resetPullRefreshUi();
  if (shouldRefresh) {
    void loadWeather(state.selectedLocation, { preserveScroll: true });
  }
}

document.addEventListener("click", (event) => {
  if (!elements.searchForm.contains(event.target)) {
    clearResults();
  }
  if (elements.settingsPopover.hidden) {
    return;
  }
  if (!elements.settingsPopover.contains(event.target) && !elements.settingsButton.contains(event.target)) {
    setSettingsPopoverOpen(false);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setSettingsPopoverOpen(false);
  }
});

// Sky mode manual override
const skyModeSwitch = document.getElementById("sky-mode-switch");
if (skyModeSwitch) {
  skyModeSwitch.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-sky-mode]");
    if (!btn) return;
    manualSkyOverride = true;
    setSkyMode(btn.dataset.skyMode);
  });
}

elements.searchForm.addEventListener("submit", handleSearch);
elements.historyPresets.addEventListener("click", handleHistoryPresetClick);
elements.historyCustomForm.addEventListener("submit", handleCustomHistorySubmit);
elements.currentLocationButton.addEventListener("click", () => {
  void requestCurrentLocation({ preserveScroll: true });
});
elements.saveLocationButton.addEventListener("click", handleSaveCurrentLocation);
elements.settingsButton.addEventListener("click", toggleSettingsPopover);

// Share menu
function setShareMenuOpen(open) {
  elements.shareMenu.hidden = !open;
  if (open) {
    const rect = elements.shareButton.getBoundingClientRect();
    elements.shareMenu.style.setProperty("top", `${rect.bottom + 6}px`);
    elements.shareMenu.style.setProperty("right", `${document.documentElement.clientWidth - rect.right}px`);
  }
}
elements.shareButton.addEventListener("click", (e) => {
  e.stopPropagation();
  setShareMenuOpen(elements.shareMenu.hidden);
});
document.addEventListener("click", (e) => {
  if (!elements.shareMenu.hidden && !elements.shareMenu.contains(e.target)) {
    setShareMenuOpen(false);
  }
});

// Bottom tab bar
const tabPanels = document.querySelectorAll(".tab-panel");
const tabButtons = document.querySelectorAll(".aw-tab");
function switchTab(tabName) {
  tabPanels.forEach(p => { p.hidden = p.dataset.panel !== tabName; });
  tabButtons.forEach(b => {
    const active = b.dataset.tab === tabName;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  // Redraw canvases that may have been hidden
  window.dispatchEvent(new Event("resize"));
}
document.querySelector(".aw-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".aw-tab");
  if (btn) switchTab(btn.dataset.tab);
});
elements.settingsCloseButton.addEventListener("click", () => setSettingsPopoverOpen(false));
elements.settingsTabs?.addEventListener("click", handleSettingsTabClick);
elements.savedLocations.addEventListener("click", handleSavedLocationsClick);
elements.tempUnitToggle.addEventListener("click", handleTempUnitToggleClick);
elements.speedUnitToggle.addEventListener("click", handleSpeedUnitToggleClick);
elements.exportReport.addEventListener("click", () => {
  if (!state.latestPayload) {
    setExportStatus("No data loaded yet.");
    return;
  }
  const skyMode = elements.awRoot?.dataset.sky || "clear-day";
  const briefInner = buildAgronomyBriefHtml(state.latestPayload);
  const w = window.open("", "_blank");
  w.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AceWeather · Agronomy Brief · ${escapeHtml(state.latestPayload.location.name)}</title>
  <base href="${window.location.origin}/">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Sora:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
  <style>
    body { margin: 0; }
    .report-page { max-width: 720px; margin: 0 auto; padding: 24px; }
    .report-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 0.5px solid var(--rule); }
    .report-header .brand { font-family: "Sora", sans-serif; font-size: 16px; font-weight: 700; }
    .report-header .sub { font-size: 11px; color: var(--muted); }
    .print-btn { position: fixed; top: 16px; right: 16px; background: var(--ink); color: var(--paper); border: none; padding: 8px 16px; font: 11px/1 "JetBrains Mono", monospace; letter-spacing: 0.08em; cursor: pointer; }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <div class="aw report-page" data-sky="${escapeHtml(skyMode)}">
    <div class="report-header">
      <span class="brand">AceWeather</span>
      <span class="sub">/ Agronomy Brief</span>
    </div>
    <div class="agronomy-brief" style="display:block">${briefInner}</div>
  </div>
  <button class="print-btn" onclick="window.print()">PRINT / SAVE PDF</button>
</body>
</html>`);
  w.document.close();
  setExportStatus(`Opened agronomy brief for ${state.latestPayload.location.name}.`);
});
elements.exportHistoryChart.addEventListener("click", () => {
  const suffix = state.history.mode === "custom" ? `${state.history.start}-to-${state.history.end}` : `${state.history.days}d`;
  downloadCanvas(elements.historyChart, `aceweather-history-${suffix}.png`);
  setExportStatus("Downloaded the historical weather chart.");
  setShareMenuOpen(false);
});

elements.copyAiReport.addEventListener("click", async () => {
  if (!state.latestPayload) {
    setExportStatus("No data loaded yet — wait for weather to load.");
    return;
  }
  setExportStatus("Building report…");
  try {
    const text = buildAgronomyText(state.latestPayload);
    await navigator.clipboard.writeText(text);
    setExportStatus(`Copied agronomy brief for ${state.latestPayload.location.name} — paste into Claude.`);
    setShareMenuOpen(false);
  } catch {
    setExportStatus("Could not copy report. Try again.");
  }
});

initHistoryDefaults();
hydrateSettings();
renderSettings();
updateRefreshUi();

document.addEventListener("touchstart", handleTouchStart, { passive: true });
document.addEventListener("touchmove", handleTouchMove, { passive: false });
document.addEventListener("touchend", handleTouchEnd, { passive: true });
document.addEventListener("touchcancel", handleTouchEnd, { passive: true });

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

loadInitialWeather();
