import { elements, state } from "./context.js";
import { formatNumber, formatPrecip, formatSpeed, formatTemperature, speedUnitLabel, temperatureUnitLabel } from "./formatters.js";
import { updateAppModeUi } from "./ui-status.js";
import { renderAirQuality, renderDaily, renderDocuments, renderHero, renderHourly, renderSavedLocations, syncSettingsTabUi } from "./render-primary.js";
import { renderClimate, renderHistory, renderMetrics, renderModelVerification, renderProviders, syncUnitToggleUi } from "./render-secondary.js";

export function renderAgronomy(data) {
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
  elements.agronomyGrid.innerHTML = summaryCards.map(([label, value, detail]) => `
    <article class="agro-card"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="daily-date">${detail}</div></article>
  `).join("");

  const diseaseCards = [
    ["General fungal pressure", disease.generalFungalPressure.label, `Score ${formatNumber(disease.generalFungalPressure.score, 2)} | ${disease.generalFungalPressure.basis}`],
    ["Late blight Smith proxy", disease.lateBlightSmithProxy.label, disease.lateBlightSmithProxy.basis],
    ["Septoria proxy", disease.septoriaProxy.label, `Score ${formatNumber(disease.septoriaProxy.score, 2)} | ${disease.septoriaProxy.basis}`],
    ["Spray window risk", spray.riskLabel, "Uses wind, gust, rain chance, rain amount, and temperature over the next 24 hours."],
  ];
  elements.diseaseGrid.innerHTML = diseaseCards.map(([label, badge, detail]) => `
    <article class="disease-card"><div class="metric-label">${label}</div><div class="risk-badge">${badge}</div><p class="daily-date">${detail}</p></article>
  `).join("");
  elements.agronomyDisclaimer.textContent = agronomy.disclaimer;
}

export function renderSettings() {
  syncUnitToggleUi();
  renderSavedLocations();
  renderDocuments();
  syncSettingsTabUi();
  elements.settingsStatus.textContent = `${temperatureUnitLabel()} temp | ${speedUnitLabel()} wind | ${state.settings.savedLocations.length} saved location${state.settings.savedLocations.length === 1 ? "" : "s"}`;
  updateAppModeUi();
}

export function renderAll(data) {
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
