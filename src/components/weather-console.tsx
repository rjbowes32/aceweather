'use client';

import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";

import type { WeatherPayload } from "@/lib/weather-types";

const DEFAULT_QUERY = "Pocklington";
const SETTINGS_KEY = "aceweather.settings.v2";
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type SkyMode = "clear-day" | "clear-night" | "storm" | "overcast";
type TempUnit = "c" | "f";
type SpeedUnit = "kph" | "mph";

type SearchResult = {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

type SavedLocation = {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

type SettingsState = {
  temperatureUnit: TempUnit;
  speedUnit: SpeedUnit;
  savedLocations: SavedLocation[];
};

type HourPoint = {
  label: string;
  shortLabel: string;
  dayLabel: string;
  temperature: number;
  weatherCode: number | null;
  precipitation: number;
  precipitationProbability: number;
  wind: number;
  isNow: boolean;
};

const WEATHER_LABELS = new Map<number, string>([
  [0, "Clear sky"],
  [1, "Mostly clear"],
  [2, "Partly cloudy"],
  [3, "Overcast"],
  [45, "Fog"],
  [48, "Rime fog"],
  [51, "Light drizzle"],
  [53, "Drizzle"],
  [55, "Dense drizzle"],
  [61, "Light rain"],
  [63, "Rain"],
  [65, "Heavy rain"],
  [71, "Light snow"],
  [73, "Snow"],
  [75, "Heavy snow"],
  [77, "Snow grains"],
  [80, "Showers"],
  [81, "Heavy showers"],
  [82, "Violent showers"],
  [95, "Thunderstorm"],
  [96, "Storm with hail"],
  [99, "Severe storm"],
]);

const WEATHER_ICONS = new Map<number, string>([
  [0, "\u2600"],
  [1, "\u26C5"],
  [2, "\u26C5"],
  [3, "\u2601"],
  [45, "\u2248"],
  [48, "\u2248"],
  [51, "\u2055"],
  [53, "\u2055"],
  [55, "\u2055"],
  [61, "\u2055"],
  [63, "\u2055"],
  [65, "\u2055"],
  [71, "\u2744"],
  [73, "\u2744"],
  [75, "\u2744"],
  [77, "\u2744"],
  [80, "\u2055"],
  [81, "\u2055"],
  [82, "\u26A1"],
  [95, "\u26A1"],
  [96, "\u26A1"],
  [99, "\u26A1"],
]);

function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_ACEWEATHER_API_BASE?.replace(/\/$/, "") || "";
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function searchLocations(query: string) {
  return fetchJson<{ results?: SearchResult[] }>(
    `${getApiBaseUrl()}/api/search?query=${encodeURIComponent(query)}`,
  );
}

async function resolveLocation(query: string) {
  const payload = await searchLocations(query);
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

async function fetchWeatherForCoordinates(
  latitude: number,
  longitude: number,
  timezone: string,
  label: string,
) {
  return fetchJson<WeatherPayload>(
    `${getApiBaseUrl()}/api/weather?lat=${latitude}&lon=${longitude}&timezone=${encodeURIComponent(timezone)}&label=${encodeURIComponent(label)}`,
  );
}

async function fetchWeatherForQuery(query: string) {
  const location = await resolveLocation(query);
  return fetchWeatherForCoordinates(location.latitude, location.longitude, location.timezone, location.label);
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value == null || Number.isNaN(value)) return "--";
  return value.toFixed(digits);
}

function weatherLabel(code: number | null | undefined) {
  if (code == null) return "Conditions unavailable";
  return WEATHER_LABELS.get(code) || "Mixed conditions";
}

function weatherIcon(code: number | null | undefined) {
  if (code == null) return "--";
  return WEATHER_ICONS.get(code) || "\u2601";
}

function deriveSkyMode(code: number | null | undefined, date = new Date()): SkyMode {
  const hour = date.getHours();
  const isDay = hour >= 6 && hour < 20;

  if (code != null && (code >= 95 || code === 82)) return "storm";
  if (code != null && ((code >= 51 && code <= 82) || code === 45 || code === 48 || code === 3)) return "overcast";
  return isDay ? "clear-day" : "clear-night";
}

function toDisplayTemp(value: number | null | undefined, unit: TempUnit) {
  if (value == null) return "--";
  const converted = unit === "c" ? value : (value * 9) / 5 + 32;
  return Math.round(converted).toString();
}

function formatTemperature(value: number | null | undefined, unit: TempUnit) {
  if (value == null) return "--";
  return `${toDisplayTemp(value, unit)}°${unit === "c" ? "C" : "F"}`;
}

function formatMm(value: number | null | undefined) {
  if (value == null) return "--";
  return `${value.toFixed(1)} mm`;
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "--";
  return `${Math.round(value)}%`;
}

function formatWind(value: number | null | undefined, unit: SpeedUnit) {
  if (value == null) return "--";
  const converted = unit === "kph" ? value : value * 0.621371;
  return `${Math.round(converted)} ${unit === "kph" ? "km/h" : "mph"}`;
}

function formatPressure(value: number | null | undefined) {
  if (value == null) return "--";
  return `${Math.round(value)} hPa`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function formatDay(value: string) {
  const date = new Date(value);
  return {
    dow: DAY_LABELS[date.getDay()],
    shortDate: formatShortDate(value),
  };
}

function qualityLevel(score: number | null | undefined) {
  if (score == null) return "hold";
  if (score >= 70) return "go";
  if (score >= 40) return "caution";
  return "hold";
}

function getSavedLocationKey(location: SavedLocation) {
  return `${location.latitude}:${location.longitude}:${location.name}`;
}

function loadSettings(): SettingsState {
  if (typeof window === "undefined") {
    return { temperatureUnit: "c", speedUnit: "kph", savedLocations: [] };
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { temperatureUnit: "c", speedUnit: "kph", savedLocations: [] };
    }
    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    return {
      temperatureUnit: parsed.temperatureUnit === "f" ? "f" : "c",
      speedUnit: parsed.speedUnit === "mph" ? "mph" : "kph",
      savedLocations: Array.isArray(parsed.savedLocations) ? parsed.savedLocations : [],
    };
  } catch {
    return { temperatureUnit: "c", speedUnit: "kph", savedLocations: [] };
  }
}

function drawHourlyTape(canvas: HTMLCanvasElement, points: HourPoint[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx || points.length === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 400;
  const height = canvas.clientHeight || 200;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const styles = getComputedStyle(canvas);
  const ink = styles.getPropertyValue("--ink").trim() || "#141210";
  const muted = styles.getPropertyValue("--muted").trim() || "#756f63";
  const accent = styles.getPropertyValue("--accent").trim() || "#b8722b";
  const tickFaint = styles.getPropertyValue("--tick-faint").trim() || "rgba(20,18,16,0.1)";

  const padL = 28;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const chartWidth = width - padL - padR;
  const chartHeight = height - padT - padB;
  const temperatures = points.map((point) => point.temperature);
  const winds = points.map((point) => point.wind);
  const precipitation = points.map((point) => point.precipitation);
  const minTemp = Math.floor(Math.min(...temperatures) - 1);
  const maxTemp = Math.ceil(Math.max(...temperatures) + 1);
  const maxWind = Math.max(1, ...winds);
  const maxRain = Math.max(1, ...precipitation);
  const barWidth = chartWidth / points.length;

  ctx.strokeStyle = tickFaint;
  ctx.lineWidth = 0.5;
  ctx.fillStyle = muted;
  ctx.font = "9px monospace";
  for (let index = 0; index <= 4; index += 1) {
    const y = padT + (chartHeight * index) / 4;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(width - padR, y);
    ctx.stroke();
    const tempValue = maxTemp - ((maxTemp - minTemp) * index) / 4;
    ctx.fillText(`${Math.round(tempValue)}°`, 2, y + 3);
  }

  precipitation.forEach((rain, index) => {
    if (rain <= 0) return;
    const barHeight = (rain / maxRain) * chartHeight * 0.4;
    const x = padL + index * barWidth + barWidth * 0.25;
    const y = padT + chartHeight - barHeight;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = ink;
    ctx.fillRect(x, y, barWidth * 0.5, barHeight);
    ctx.globalAlpha = 1;
  });

  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = padL + index * barWidth + barWidth / 2;
    const y = padT + chartHeight - ((point.temperature - minTemp) / Math.max(1, maxTemp - minTemp)) * chartHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = padL + index * barWidth + barWidth / 2;
    const y = padT + chartHeight - (point.wind / maxWind) * chartHeight * 0.7;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = muted;
  ctx.font = "9px monospace";
  points.forEach((point, index) => {
    if (index % 4 !== 0) return;
    const x = padL + index * barWidth + barWidth / 2;
    ctx.fillText(point.shortLabel, x - 8, height - 10);
  });
}

function drawHistoryTape(canvas: HTMLCanvasElement, labels: string[], temps: number[], rains: number[]) {
  const ctx = canvas.getContext("2d");
  if (!ctx || temps.length === 0) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 400;
  const height = canvas.clientHeight || 140;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const styles = getComputedStyle(canvas);
  const ink = styles.getPropertyValue("--ink").trim() || "#141210";
  const muted = styles.getPropertyValue("--muted").trim() || "#756f63";
  const tick = styles.getPropertyValue("--tick").trim() || "rgba(20,18,16,0.3)";

  const padL = 24;
  const padR = 10;
  const padT = 12;
  const padB = 22;
  const chartWidth = width - padL - padR;
  const chartHeight = height - padT - padB;
  const minTemp = Math.floor(Math.min(...temps) - 1);
  const maxTemp = Math.ceil(Math.max(...temps) + 1);
  const maxRain = Math.max(1, ...rains);
  const meanTemp = temps.reduce((sum, value) => sum + value, 0) / temps.length;
  const meanY = padT + chartHeight - ((meanTemp - minTemp) / Math.max(1, maxTemp - minTemp)) * chartHeight;
  const barWidth = chartWidth / temps.length;

  ctx.strokeStyle = tick;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  ctx.moveTo(padL, meanY);
  ctx.lineTo(width - padR, meanY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = muted;
  ctx.font = "8px monospace";
  ctx.fillText(`μ ${meanTemp.toFixed(1)}°`, padL + 3, meanY - 3);

  rains.forEach((rain, index) => {
    if (rain <= 0) return;
    const barHeight = (rain / maxRain) * chartHeight * 0.45;
    const x = padL + index * barWidth + barWidth * 0.2;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = ink;
    ctx.fillRect(x, padT + chartHeight - barHeight, barWidth * 0.6, barHeight);
    ctx.globalAlpha = 1;
  });

  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  temps.forEach((temp, index) => {
    const x = padL + index * barWidth + barWidth / 2;
    const y = padT + chartHeight - ((temp - minTemp) / Math.max(1, maxTemp - minTemp)) * chartHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const step = Math.max(1, Math.floor(labels.length / 6));
  labels.forEach((label, index) => {
    if (index % step !== 0) return;
    const x = padL + index * barWidth + barWidth / 2;
    ctx.fillText(label, x - 8, height - 6);
  });
}

export function WeatherConsole() {
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [payload, setPayload] = useState<WeatherPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"preferences" | "documents">("preferences");
  const [settings, setSettings] = useState<SettingsState>({ temperatureUnit: "c", speedUnit: "kph", savedLocations: [] });
  const [manualSky, setManualSky] = useState<SkyMode | null>(null);
  const [historyRange, setHistoryRange] = useState(30);
  const [status, setStatus] = useState("Stored in this browser");
  const [isPending, startTransition] = useTransition();
  const hourlyCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const historyCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    setSettings(loadSettings());
    startTransition(() => {
      fetchWeatherForQuery(DEFAULT_QUERY)
        .then((nextPayload) => {
          setPayload(nextPayload);
          setError(null);
        })
        .catch((nextError: Error) => {
          setError(nextError.message);
        });
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      searchLocations(query.trim())
        .then((result) => {
          setSuggestions(result.results?.slice(0, 6) || []);
          setShowSuggestions(true);
        })
        .catch(() => {
          setSuggestions([]);
          setShowSuggestions(false);
        });
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [query]);

  const current = payload?.providers.openMeteo.forecast.current;
  const hourly = payload?.providers.openMeteo.forecast.hourly;
  const daily = payload?.providers.openMeteo.forecast.daily;
  const history = payload?.providers.openMeteo.history.daily;
  const climate = payload?.providers.openMeteo.climateWindow.summary;
  const air = payload?.providers.openMeteo.airQuality.current;
  const agronomy = payload?.agronomy;

  const skyMode = manualSky || deriveSkyMode(current?.weather_code);

  const hourlyPoints = useMemo<HourPoint[]>(() => {
    if (!hourly || !current) return [];
    const points: HourPoint[] = [];
    for (let index = 0; index < Math.min(24, hourly.time.length); index += 1) {
      points.push({
        label: formatTime(hourly.time[index]),
        shortLabel: new Date(hourly.time[index]).toLocaleTimeString("en-GB", { hour: "2-digit" }),
        dayLabel: DAY_LABELS[new Date(hourly.time[index]).getDay()],
        temperature: hourly.temperature_2m[index] ?? current.temperature_2m,
        weatherCode: hourly.weather_code[index] ?? current.weather_code,
        precipitation: hourly.precipitation[index] ?? 0,
        precipitationProbability: hourly.precipitation_probability?.[index] ?? 0,
        wind: current.wind_speed_10m,
        isNow: index === 0,
      });
    }
    return points;
  }, [current, hourly]);

  const historySlice = useMemo(() => {
    if (!history) return { labels: [] as string[], temps: [] as number[], rains: [] as number[], rows: [] as string[] };
    const start = Math.max(0, history.time.length - historyRange);
    const labels = history.time.slice(start).map((time) =>
      new Date(time).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    );
    const temps = history.time.slice(start).map((_, index) => {
      const actualIndex = start + index;
      const high = history.temperature_2m_max[actualIndex] ?? 0;
      const low = history.temperature_2m_min[actualIndex] ?? 0;
      return (high + low) / 2;
    });
    const rains = history.precipitation_sum.slice(start).map((value) => value ?? 0);
    return { labels, temps, rains, rows: history.time.slice(start) };
  }, [history, historyRange]);

  useEffect(() => {
    if (hourlyCanvasRef.current && hourlyPoints.length > 0) {
      drawHourlyTape(hourlyCanvasRef.current, hourlyPoints);
    }
  }, [hourlyPoints, skyMode]);

  useEffect(() => {
    if (historyCanvasRef.current && historySlice.temps.length > 0) {
      drawHistoryTape(historyCanvasRef.current, historySlice.labels, historySlice.temps, historySlice.rains);
    }
  }, [historySlice, skyMode]);

  const heroChips = useMemo(() => {
    if (!payload || !current) return [];
    return [
      { label: "Humidity", value: formatPercent(current.relative_humidity_2m), unit: "" },
      { label: "Wind", value: formatWind(agronomy?.summary.windNow ?? current.wind_speed_10m, settings.speedUnit), unit: "" },
      { label: "Pressure", value: formatPressure(current.pressure_msl), unit: "" },
      { label: "Rain next 7d", value: `${formatNumber(agronomy?.summary.rainNext7Days, 1)}`, unit: "mm" },
    ];
  }, [agronomy, current, payload, settings.speedUnit]);

  const historyStats = useMemo(() => {
    if (historySlice.temps.length === 0) return [];
    const meanTemp = historySlice.temps.reduce((sum, value) => sum + value, 0) / historySlice.temps.length;
    const totalRain = historySlice.rains.reduce((sum, value) => sum + value, 0);
    const wettest = Math.max(...historySlice.rains);
    return [
      { label: "Mean temp", value: formatTemperature(meanTemp, settings.temperatureUnit) },
      { label: "Rain total", value: formatMm(totalRain) },
      { label: "Wettest day", value: formatMm(wettest) },
    ];
  }, [historySlice, settings.temperatureUnit]);

  function refreshForCurrentPayload() {
    if (!payload) return;
    startTransition(() => {
      fetchWeatherForCoordinates(
        payload.location.latitude,
        payload.location.longitude,
        payload.location.timezone,
        payload.location.name,
      )
        .then((nextPayload) => {
          setPayload(nextPayload);
          setError(null);
          setStatus(`Updated ${new Date(nextPayload.generatedAt).toLocaleString("en-GB")}`);
        })
        .catch((nextError: Error) => setError(nextError.message));
    });
  }

  function saveCurrentLocation() {
    if (!payload) return;
    const location: SavedLocation = {
      name: payload.location.name,
      latitude: payload.location.latitude,
      longitude: payload.location.longitude,
      timezone: payload.location.timezone,
    };
    setSettings((previous) => {
      const exists = previous.savedLocations.some((item) => getSavedLocationKey(item) === getSavedLocationKey(location));
      if (exists) {
        setStatus("That location is already saved");
        return previous;
      }
      const next = {
        ...previous,
        savedLocations: [location, ...previous.savedLocations].slice(0, 12),
      };
      setStatus(`Saved ${location.name}`);
      return next;
    });
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not available in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const nextPayload = await fetchWeatherForCoordinates(
            position.coords.latitude,
            position.coords.longitude,
            "auto",
            "Current location",
          );
          setPayload(nextPayload);
          setError(null);
          setStatus("GPS fix loaded");
        } catch (nextError) {
          setError(nextError instanceof Error ? nextError.message : "Location lookup failed.");
        }
      },
      () => setError("Could not access your current location."),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowSuggestions(false);
    startTransition(() => {
      fetchWeatherForQuery(query)
        .then((nextPayload) => {
          setPayload(nextPayload);
          setError(null);
          setStatus(`Loaded ${nextPayload.location.name}`);
        })
        .catch((nextError: Error) => setError(nextError.message));
    });
  }

  function selectSuggestion(result: SearchResult) {
    const label = [result.name, result.admin1, result.country].filter(Boolean).join(", ");
    setQuery(label);
    setShowSuggestions(false);
    startTransition(() => {
      fetchWeatherForCoordinates(result.latitude, result.longitude, result.timezone || "auto", label)
        .then((nextPayload) => {
          setPayload(nextPayload);
          setError(null);
          setStatus(`Loaded ${label}`);
        })
        .catch((nextError: Error) => setError(nextError.message));
    });
  }

  async function copyAiReport() {
    if (!payload) return;
    const params = new URLSearchParams({
      lat: payload.location.latitude.toString(),
      lon: payload.location.longitude.toString(),
      timezone: payload.location.timezone,
      label: payload.location.name,
    });
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/report?${params.toString()}`);
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      setStatus(`Copied AI report for ${payload.location.name}`);
    } catch {
      setStatus("Could not copy AI report");
    }
  }

  function exportCanvas(canvas: HTMLCanvasElement | null, filename: string) {
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = filename;
    link.click();
    setStatus(`Downloaded ${filename}`);
  }

  const rainHistory = useMemo(() => {
    const times = history?.time || [];
    const recentValues = history?.precipitation_sum || [];
    const recent = recentValues.slice(-7).map((value, index, array) => ({
      day: DAY_LABELS[new Date(times[times.length - array.length + index] || new Date().toISOString()).getDay()].slice(0, 1),
      value: value ?? 0,
    }));
    while (recent.length < 7) {
      recent.unshift({ day: "–", value: 0 });
    }
    return recent;
  }, [history]);

  const rainForecast = useMemo(() => {
    return (daily?.time.slice(0, 7) || []).map((time, index) => ({
      day: DAY_LABELS[new Date(time).getDay()].slice(0, 1),
      value: daily?.precipitation_sum[index] ?? 0,
      probability: daily?.precipitation_probability_max?.[index] ?? 0,
    }));
  }, [daily]);

  const rainHistoryMax = Math.max(1, ...rainHistory.map((item) => item.value));
  const rainForecastMax = Math.max(1, ...rainForecast.map((item) => item.value));
  const currentMonthRain = climate?.currentMonthRain ?? 0;
  const averageMonthRain = climate?.averageMonthlyRain ?? 0;
  const last24Rain = current?.precipitation ?? 0;

  return (
    <main className="aw" data-sky={skyMode}>
      <header className="aw-head">
        <div className="aw-head-row">
          <div className="brand">
            <span className="brand-mark">AceWeather</span>
            <span className="brand-sub">/ Mk II</span>
          </div>
          <div className="aw-head-actions">
            <button type="button" className="aw-btn" onClick={useCurrentLocation}>GPS</button>
            <button type="button" className="aw-btn" onClick={saveCurrentLocation} disabled={!payload}>Save</button>
            <button type="button" className="aw-btn" onClick={refreshForCurrentPayload} disabled={!payload || isPending}>
              {isPending ? "Busy" : "Refresh"}
            </button>
            <button type="button" className="aw-btn aw-btn-icon" onClick={() => setSettingsOpen((open) => !open)} aria-expanded={settingsOpen}>
              ⚙
            </button>
          </div>
        </div>

        <div className="location-row">
          <div className="location">
            {payload?.location.name || "Loading weather…"}
            {payload ? <small>{payload.location.latitude.toFixed(3)}, {payload.location.longitude.toFixed(3)}</small> : null}
          </div>
          <div className="serial">
            <div>
              OBS <b>{payload ? new Date(payload.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "--"}</b>
            </div>
          </div>
        </div>

        <form className="aw-search-row" autoComplete="off" onSubmit={onSubmit}>
          <div className="search-wrap">
            <div className="search-field">
              <input
                type="search"
                value={query}
                placeholder="Search a city, town, or postcode..."
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => setShowSuggestions(suggestions.length > 0)}
              />
            </div>
            {showSuggestions && suggestions.length > 0 ? (
              <div className="search-results">
                {suggestions.map((result) => (
                  <button
                    key={`${result.latitude}-${result.longitude}-${result.name}`}
                    type="button"
                    className="result-item"
                    onClick={() => selectSuggestion(result)}
                  >
                    <strong>{result.name}</strong>
                    <span>{[result.admin1, result.country].filter(Boolean).join(", ")}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button type="submit" className="aw-btn">Search</button>
        </form>

        <div className="mode-switch" role="tablist" aria-label="Sky condition">
          {(["clear-day", "clear-night", "storm", "overcast"] as SkyMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={skyMode === mode}
              onClick={() => setManualSky(mode)}
            >
              {mode.replace("-", " ")}
            </button>
          ))}
        </div>
      </header>

      <section className="section">
        <div className="section-head">
          <span className="num">01</span>
          <span className="title">Primary readout</span>
          <span>{error ? "Attention" : "Live"}</span>
        </div>
        <div className="primary">
          <div>
            <div className="temp-block">
              <div className="temp-figure">{toDisplayTemp(current?.temperature_2m, settings.temperatureUnit)}</div>
              <div className="temp-deg">°{settings.temperatureUnit.toUpperCase()}</div>
            </div>
            <div className="temp-feels">
              FEELS LIKE <b>{formatTemperature(current?.apparent_temperature, settings.temperatureUnit)}</b>
            </div>
          </div>
          <div className="condition-stamp">
            <div className="glyph">{weatherIcon(current?.weather_code)}</div>
            <div className="condition-text">
              <b>{weatherLabel(current?.weather_code)}</b>
              <span>Observed</span>
            </div>
          </div>
        </div>
        <p className={`summary-line${error ? " error-inline" : ""}`}>
          {error
            ? error
            : current
              ? `${weatherLabel(current.weather_code)} with ${formatPercent(current.relative_humidity_2m)} humidity, ${formatWind(current.wind_speed_10m, settings.speedUnit)} wind, and ${formatMm(current.precipitation)} currently falling.`
              : "Fetching forecast, air quality, and historical context."}
        </p>

        <div className="chips">
          {heroChips.map((chip) => (
            <div key={chip.label} className="chip">
              <div className="chip-k">{chip.label}</div>
              <div className="chip-v">
                {chip.value}
                {chip.unit ? <span className="chip-u">{chip.unit}</span> : null}
              </div>
            </div>
          ))}
        </div>

        <div className="dial rain-gauge" style={{ marginTop: 14 }}>
          <div className="dial-label">
            <span>Rain Gauge</span>
            <span>{agronomy?.summary.dataSources.rainLast7Days === "observed" ? "Observed" : "Model blend"}</span>
          </div>
          <div className="rg-top">
            <div>
              <svg viewBox="0 0 38 104" preserveAspectRatio="xMidYMid meet" className="rg-cyl-svg">
                <path d="M 4 2 L 34 2 L 26 10 L 12 10 Z" fill="none" stroke="var(--rule)" strokeWidth="0.5" />
                <rect x="12" y="10" width="14" height="92" fill="none" stroke="var(--rule)" strokeWidth="0.5" />
                <rect
                  x="12"
                  y={10 + (100 - Math.min(100, (last24Rain / 25) * 100)) * 0.92}
                  width="14"
                  height={Math.min(100, (last24Rain / 25) * 100) * 0.92}
                  fill="var(--ink)"
                  opacity="0.85"
                />
              </svg>
            </div>
            <div className="rg-readout">
              <div className="rg-now">
                <div className="rg-now-k">NOW</div>
                <div className="rg-now-v">{formatNumber(last24Rain, 1)}<small>mm</small></div>
                <div className="rg-now-rate">Current precip signal · {formatPercent(hourly?.precipitation_probability?.[0] ?? 0)}</div>
              </div>
              <div className="rg-stats">
                <div>
                  <div className="rg-stat-k">7D</div>
                  <div className="rg-stat-v">{formatNumber(agronomy?.summary.rainLast7Days, 1)}<small>mm</small></div>
                </div>
                <div>
                  <div className="rg-stat-k">Month</div>
                  <div className="rg-stat-v">{formatNumber(currentMonthRain, 1)}<small>mm</small></div>
                  <div className="rg-stat-sub">
                    {averageMonthRain ? `${currentMonthRain >= averageMonthRain ? "+" : ""}${(currentMonthRain - averageMonthRain).toFixed(1)} vs norm` : "Awaiting climate normal"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rg-section">
            <div className="rg-section-head">
              <span>Past 7 days</span>
              <b>Σ {formatNumber(rainHistory.reduce((sum, item) => sum + item.value, 0), 1)} mm</b>
            </div>
            <div className="rg-bars">
              {rainHistory.map((item, index) => (
                <div key={`${item.day}-${index}`} className="rg-bar-col">
                  <div className="rg-bar">
                    <div className="rg-bar-fill" style={{ height: `${(item.value / rainHistoryMax) * 100}%` }} />
                  </div>
                  <div className="rg-bar-mm">{item.value > 0 ? item.value.toFixed(1) : "·"}</div>
                  <div className="rg-bar-d">{item.day}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rg-section">
            <div className="rg-section-head">
              <span>Next 7 days</span>
              <b>Σ {formatNumber(rainForecast.reduce((sum, item) => sum + item.value, 0), 1)} mm fcst</b>
            </div>
            <div className="rg-bars">
              {rainForecast.map((item, index) => (
                <div key={`${item.day}-${index}`} className="rg-bar-col">
                  <div className="rg-bar">
                    <div className="rg-bar-fill dashed" style={{ height: `${(item.value / rainForecastMax) * 100}%` }} />
                    <div className="rg-bar-pct" style={{ height: `${item.probability}%` }} />
                  </div>
                  <div className="rg-bar-mm">{item.value > 0 ? item.value.toFixed(1) : "·"}</div>
                  <div className="rg-bar-pct-label">{item.probability}%</div>
                  <div className="rg-bar-d">{item.day}</div>
                </div>
              ))}
            </div>
            <div className="rg-legend">
              <span><i className="bar-solid" />MM</span>
              <span><i className="bar-line" />% CHANCE</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="num">02</span>
          <span className="title">Deep conditions</span>
          <span>Atmosphere</span>
        </div>
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-label">Humidity</div>
            <div className="metric-value">{formatPercent(current?.relative_humidity_2m)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Wind</div>
            <div className="metric-value">{formatWind(agronomy?.summary.windNow ?? current?.wind_speed_10m, settings.speedUnit)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Gusts</div>
            <div className="metric-value">{formatWind(agronomy?.summary.gustNow ?? current?.wind_gusts_10m, settings.speedUnit)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Pressure</div>
            <div className="metric-value">{formatPressure(current?.pressure_msl)}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Surface moisture</div>
            <div className="metric-value">{agronomy?.summary.soilMoistureSurface?.toFixed(2) ?? "--"}</div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Input quality</div>
            <div className="metric-value">{agronomy?.inputQuality.label || "--"}</div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="num">03</span>
          <span className="title">24-hour pulse</span>
          <span>Δt 1h</span>
        </div>
        <div className="tape-wrap">
          <div className="tape-legend">
            <span><i />TEMP</span>
            <span><i className="dashed" />WIND</span>
            <span><i className="bar" />PRECIP</span>
          </div>
          <canvas ref={hourlyCanvasRef} className="tape-canvas" />
        </div>
        <div className="hourly-strip">
          {hourlyPoints.map((point, index) => (
            <div key={`${point.label}-${index}`} className={`hour-pill${point.isNow ? " is-now" : ""}`}>
              <div className="hour-day-label">{index === 0 ? "Now" : point.dayLabel}</div>
              <time>{point.label}</time>
              <div className="hour-temp">{formatTemperature(point.temperature, settings.temperatureUnit)}</div>
              <div className="hour-icon">{weatherIcon(point.weatherCode)}</div>
              <div className="hour-rain">{formatMm(point.precipitation)}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="num">04</span>
          <span className="title">Field decisions</span>
          <span>Agronomy</span>
        </div>
        <div className="agro-grid">
          <div className="agro">
            <div className="agro-head">
              <span>Field access</span>
              <span className="lvl" data-lvl={qualityLevel(agronomy?.summary.fieldAccessScore)}>{agronomy?.summary.fieldAccessLabel || "--"}</span>
            </div>
            <div className="agro-name">{agronomy ? `${agronomy.summary.fieldAccessScore}/100` : "--"}</div>
            <div className="agro-meter">
              <div className="agro-meter-fill" style={{ width: `${agronomy?.summary.fieldAccessScore ?? 0}%` }} />
            </div>
            <div className="agro-foot">
              <span>Rain last 7d</span>
              <b>{formatNumber(agronomy?.summary.rainLast7Days, 1)} mm</b>
            </div>
          </div>
          <div className="agro">
            <div className="agro-head">
              <span>Spray window</span>
              <span className="lvl" data-lvl={qualityLevel((agronomy?.sprayWindow.openHoursNext24 ?? 0) * 4)}>{agronomy?.sprayWindow.riskLabel || "--"}</span>
            </div>
            <div className="agro-name">{agronomy ? `${agronomy.sprayWindow.openHoursNext24}h open` : "--"}</div>
            <div className="agro-meter">
              <div className="agro-meter-fill" style={{ width: `${Math.min(100, (agronomy?.sprayWindow.openHoursNext24 ?? 0) / 24 * 100)}%` }} />
            </div>
            <div className="agro-foot">
              <span>Longest run</span>
              <b>{agronomy?.sprayWindow.longestBlockHours ?? "--"}h</b>
            </div>
          </div>
        </div>
        <div className="disease-grid">
          <div className="disease-card">
            <div className="metric-label">General fungal pressure</div>
            <div className="risk-badge">{agronomy?.diseaseModels.generalFungalPressure.label || "--"}</div>
            <p className="daily-date">{agronomy?.diseaseModels.generalFungalPressure.basis || "Awaiting data"}</p>
          </div>
          <div className="disease-card">
            <div className="metric-label">Late blight Smith proxy</div>
            <div className="risk-badge">{agronomy?.diseaseModels.lateBlightSmithProxy.label || "--"}</div>
            <p className="daily-date">{agronomy?.diseaseModels.lateBlightSmithProxy.basis || "Awaiting data"}</p>
          </div>
          <div className="disease-card">
            <div className="metric-label">Septoria proxy</div>
            <div className="risk-badge">{agronomy?.diseaseModels.septoriaProxy.label || "--"}</div>
            <p className="daily-date">{agronomy?.diseaseModels.septoriaProxy.basis || "Awaiting data"}</p>
          </div>
          <div className="disease-card">
            <div className="metric-label">Confidence drivers</div>
            <div className="risk-badge">{agronomy?.inputQuality.label || "--"}</div>
            <p className="daily-date">{agronomy?.inputQuality.drivers.join(" · ") || "Awaiting data"}</p>
          </div>
        </div>
        <p className="agronomy-disclaimer">{agronomy?.disclaimer}</p>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="num">05</span>
          <span className="title">14-day outlook</span>
          <span>HI · LO · mm</span>
        </div>
        <div className="daily">
          {(daily?.time.slice(0, 10) || []).map((time, index) => {
            const { dow, shortDate } = formatDay(time);
            const max = daily?.temperature_2m_max[index] ?? 0;
            const min = daily?.temperature_2m_min[index] ?? 0;
            const range = Math.max(1, max - min);
            return (
              <div key={time} className="daily-row">
                <div className="daily-day"><b>{dow}</b>{shortDate}</div>
                <div className="daily-icon">{weatherIcon(daily?.weather_code[index])}</div>
                <div className="daily-bar">
                  <div className="daily-fill" style={{ left: `${Math.max(0, min + 10) * 2}%`, width: `${range * 4}%` }} />
                </div>
                <div className="daily-temps">
                  {formatTemperature(max, settings.temperatureUnit)} <small>{formatMm(daily?.precipitation_sum[index])}</small>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="num">06</span>
          <span className="title">Historical lens</span>
          <span>Archive</span>
        </div>
        <div className="history">
          <div className="history-head">
            <span>Daily mean · precip</span>
            <div className="range-pills" role="tablist">
              {[7, 14, 30, 90].map((range) => (
                <button
                  key={range}
                  type="button"
                  aria-pressed={historyRange === range}
                  onClick={() => setHistoryRange(range)}
                >
                  {range}D
                </button>
              ))}
            </div>
          </div>
          <canvas ref={historyCanvasRef} className="history-canvas" />
          <div className="history-stats">
            {historyStats.map((stat) => (
              <div key={stat.label} className="history-stat">
                <div className="k">{stat.label}</div>
                <div className="v">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="num">07</span>
          <span className="title">Air quality</span>
          <span>Air and light</span>
        </div>
        <div className="air-quality-current">
          <div className="aqi-hero">
            <div className="metric-label">European AQI</div>
            <div className="aqi-value">{air?.european_aqi ?? "--"}</div>
            <div className="section-note">{air?.european_aqi != null ? "Regional signal" : "Unavailable"}</div>
          </div>
          <div className="aqi-hero">
            <div className="metric-label">US AQI</div>
            <div className="aqi-value">{air?.us_aqi ?? "--"}</div>
            <div className="section-note">{air?.us_aqi != null ? "Cross-checked scale" : "Unavailable"}</div>
          </div>
        </div>
        <div className="air-quality-list">
          <div className="air-card">PM2.5: {air?.pm2_5 ?? "--"}</div>
          <div className="air-card">PM10: {air?.pm10 ?? "--"}</div>
          <div className="air-card">NO2: {air?.nitrogen_dioxide ?? "--"}</div>
          <div className="air-card">O3: {air?.ozone ?? "--"}</div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="num">08</span>
          <span className="title">Seasonal memory</span>
          <span>Month comparison</span>
        </div>
        <div className="climate-summary">
          <div className="climate-card">
            <div className="metric-label">Average monthly rain</div>
            <div className="metric-value">{averageMonthRain ? `${averageMonthRain.toFixed(1)} mm` : "--"}</div>
          </div>
          <div className="climate-card">
            <div className="metric-label">Current month rain</div>
            <div className="metric-value">{currentMonthRain ? `${currentMonthRain.toFixed(1)} mm` : "--"}</div>
          </div>
          <div className="climate-card">
            <div className="metric-label">Sample years</div>
            <div className="metric-value">{climate?.sampleYears ?? "--"}</div>
          </div>
          <div className="climate-card climate-tracker-card">
            <div className="metric-label">Month tracker</div>
            <div className="climate-tracker-headline">
              {climate ? `${climate.currentMonthRain.toFixed(1)} mm vs ${climate.averageMonthlyRain.toFixed(1)} mm usual` : "--"}
            </div>
            <div className="climate-tracker-bar">
              <div className="climate-tracker-fill" style={{ width: `${climate?.progressPctCapped ?? 0}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="num">09</span>
          <span className="title">Source status</span>
          <span>Providers</span>
        </div>
        <div className="provider-list">
          <div className="provider-card">
            <div className="provider-title"><span className="status-dot live" />Open-Meteo core</div>
            <p className="provider-meta">Forecast, history, air quality, and climate window are live.</p>
          </div>
          <div className="provider-card">
            <div className="provider-title"><span className={`status-dot${payload?.providers.ecmwf.enabled ? " live" : ""}`} />ECMWF cross-check</div>
            <p className="provider-meta">{payload?.providers.ecmwf.enabled ? "Enabled" : payload?.providers.ecmwf.reason || "Unavailable"}</p>
          </div>
          <div className="provider-card">
            <div className="provider-title"><span className={`status-dot${payload?.providers.meteomatics.enabled ? " live" : ""}`} />Meteomatics</div>
            <p className="provider-meta">{payload?.providers.meteomatics.enabled ? "Enabled" : payload?.providers.meteomatics.reason || "Unavailable"}</p>
          </div>
          <div className="provider-card">
            <div className="provider-title"><span className={`status-dot${agronomy?.summary.dataSources.rainLast7Days === "observed" ? " live" : ""}`} />Observed rainfall signal</div>
            <p className="provider-meta">{agronomy?.summary.dataSources.rainLast7Days === "observed" ? "Manual gauge or station values are in use." : "Model archive currently drives rainfall context."}</p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span className="num">10</span>
          <span className="title">Export</span>
          <span>Charts for slides</span>
        </div>
        <div className="export-grid">
          <button type="button" className="export-card" onClick={() => exportCanvas(hourlyCanvasRef.current, "aceweather-24h-forecast.png")}>
            <strong>Export 24-hour forecast</strong>
            <span>PNG from the pulse chart</span>
          </button>
          <button type="button" className="export-card" onClick={() => exportCanvas(historyCanvasRef.current, `aceweather-history-${historyRange}d.png`)}>
            <strong>Export historical chart</strong>
            <span>PNG using the selected archive range</span>
          </button>
          <button type="button" className="export-card" onClick={copyAiReport}>
            <strong>Copy AI weather report</strong>
            <span>Paste into Claude for a longer agronomy brief</span>
          </button>
        </div>
        <p className="export-status">{status}</p>
      </section>

      <footer className="aw-foot">
        <div className="signature">An instrument for reading sky.</div>
        <div>AceWeather Mk II · ECMWF · UKMO · OpenMeteo</div>
      </footer>

      {settingsOpen ? (
        <aside className="settings-popover">
          <div className="settings-popover-header">
            <div>
              <p className="eyebrow">Settings</p>
              <h3>Preferences and documents</h3>
            </div>
            <button type="button" className="aw-btn aw-btn-icon" onClick={() => setSettingsOpen(false)}>✕</button>
          </div>

          <div className="settings-tabs" role="tablist">
            <button type="button" className={`settings-tab${settingsTab === "preferences" ? " is-active" : ""}`} aria-selected={settingsTab === "preferences"} onClick={() => setSettingsTab("preferences")}>
              Preferences
            </button>
            <button type="button" className={`settings-tab${settingsTab === "documents" ? " is-active" : ""}`} aria-selected={settingsTab === "documents"} onClick={() => setSettingsTab("documents")}>
              Documents
            </button>
          </div>

          <p className="section-note">{status}</p>

          {settingsTab === "preferences" ? (
            <div className="settings-grid">
              <section>
                <div className="metric-label">Temperature</div>
                <div className="range-pills">
                  <button type="button" className={settings.temperatureUnit === "c" ? "is-active" : ""} onClick={() => setSettings((currentSettings) => ({ ...currentSettings, temperatureUnit: "c" }))}>°C</button>
                  <button type="button" className={settings.temperatureUnit === "f" ? "is-active" : ""} onClick={() => setSettings((currentSettings) => ({ ...currentSettings, temperatureUnit: "f" }))}>°F</button>
                </div>
              </section>
              <section>
                <div className="metric-label">Wind speed</div>
                <div className="range-pills">
                  <button type="button" className={settings.speedUnit === "kph" ? "is-active" : ""} onClick={() => setSettings((currentSettings) => ({ ...currentSettings, speedUnit: "kph" }))}>km/h</button>
                  <button type="button" className={settings.speedUnit === "mph" ? "is-active" : ""} onClick={() => setSettings((currentSettings) => ({ ...currentSettings, speedUnit: "mph" }))}>mph</button>
                </div>
              </section>
              <section>
                <div className="metric-label">Saved locations</div>
                <div className="saved-locations">
                  {settings.savedLocations.length === 0 ? (
                    <div className="section-note">No saved locations yet.</div>
                  ) : (
                    settings.savedLocations.map((location, index) => (
                      <div key={getSavedLocationKey(location)} className="saved-location">
                        <div>
                          <div className="saved-location-name">{location.name}</div>
                          <div className="saved-location-meta">{location.latitude.toFixed(3)}, {location.longitude.toFixed(3)}</div>
                        </div>
                        <div className="saved-location-actions">
                          <button
                            type="button"
                            onClick={() => {
                              setSettingsOpen(false);
                              startTransition(() => {
                                fetchWeatherForCoordinates(location.latitude, location.longitude, location.timezone, location.name)
                                  .then((nextPayload) => {
                                    setPayload(nextPayload);
                                    setError(null);
                                    setStatus(`Loaded ${location.name}`);
                                  })
                                  .catch((nextError: Error) => setError(nextError.message));
                              });
                            }}
                          >
                            Load
                          </button>
                          <button
                            type="button"
                            onClick={() => setSettings((currentSettings) => ({
                              ...currentSettings,
                              savedLocations: currentSettings.savedLocations.filter((_, savedIndex) => savedIndex !== index),
                            }))}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="documents-menu">
              <div className="document-card">
                <div className="document-card-header">
                  <h4>Developer-facing docs</h4>
                </div>
                <p>Quick links for the API spec, AI crawler notes, and report endpoint usage.</p>
                <div className="document-link-list">
                  <a className="document-link" href="/openapi.json" target="_blank" rel="noreferrer">
                    <strong>OpenAPI</strong>
                    <span>Structured API description</span>
                  </a>
                  <a className="document-link" href="/llms.txt" target="_blank" rel="noreferrer">
                    <strong>LLM notes</strong>
                    <span>Agent-readable instructions</span>
                  </a>
                  <a className="document-link" href="/report-api.md" target="_blank" rel="noreferrer">
                    <strong>Report API</strong>
                    <span>How the longer weather brief is generated</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </aside>
      ) : null}
    </main>
  );
}
