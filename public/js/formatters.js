import { state, weatherIcons, weatherLabels } from "./context.js";

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatNumber(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(digits);
}

export function formatDate(input, options) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(input));
}

export function weatherCodeToIcon(code) {
  return weatherIcons[code] || "\u2601";
}

export function weatherCodeToLabel(code) {
  return weatherLabels[code] || "Conditions unavailable";
}

export function aqiLabel(value) {
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

export function usesCelsius() {
  return state.settings.temperatureUnit === "c";
}

export function usesMetricSpeed() {
  return state.settings.speedUnit === "kph";
}

export function usesMetricAuxiliaryUnits() {
  return usesCelsius();
}

export function temperatureUnitLabel() {
  return usesCelsius() ? "C" : "F";
}

export function speedUnitLabel() {
  return usesMetricSpeed() ? "km/h" : "mph";
}

export function formatTemperature(value, digits = 0) {
  if (value == null) {
    return "--";
  }
  const converted = usesCelsius() ? value : (value * 9) / 5 + 32;
  const suffix = usesCelsius() ? "C" : "F";
  return `${formatNumber(converted, digits)} ${suffix}`;
}

export function temperatureSeries(values) {
  return values.map((value) => (value == null ? null : usesCelsius() ? value : (value * 9) / 5 + 32));
}

export function formatPrecip(value, digits = 1) {
  if (value == null) {
    return "--";
  }
  const converted = usesMetricAuxiliaryUnits() ? value : value / 25.4;
  const suffix = usesMetricAuxiliaryUnits() ? "mm" : "in";
  return `${formatNumber(converted, digits)} ${suffix}`;
}

export function formatSpeed(value, digits = 0) {
  if (value == null) {
    return "--";
  }
  const converted = usesMetricSpeed() ? value : value * 0.621371;
  const suffix = usesMetricSpeed() ? "km/h" : "mph";
  return `${formatNumber(converted, digits)} ${suffix}`;
}

export function formatPressure(value, digits = 0) {
  if (value == null) {
    return "--";
  }
  if (usesMetricAuxiliaryUnits()) {
    return `${formatNumber(value, digits)} hPa`;
  }
  return `${formatNumber(value * 0.0295299831, 2)} inHg`;
}

export function formatDistance(valueMeters, digits = 1) {
  if (valueMeters == null) {
    return "--";
  }
  const converted = usesMetricAuxiliaryUnits() ? valueMeters / 1000 : valueMeters / 1609.344;
  const suffix = usesMetricAuxiliaryUnits() ? "km" : "mi";
  return `${formatNumber(converted, digits)} ${suffix}`;
}

export function dayKey(input) {
  const date = new Date(input);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}
