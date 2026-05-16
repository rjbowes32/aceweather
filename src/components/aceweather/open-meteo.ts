// @ts-nocheck
/* Open-Meteo live fetch + merge-into-fallback helper. */

import { AW_LOCATION } from "./sample-data";

export async function awFetchLive(lat = AW_LOCATION.lat, lon = AW_LOCATION.lon, signal, timezone = AW_LOCATION.tz) {
  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    timezone: timezone || "auto",
    past_days: 7,
    forecast_days: 14,
    current: [
      "temperature_2m","apparent_temperature","relative_humidity_2m","dew_point_2m",
      "pressure_msl","cloud_cover","wind_speed_10m","wind_gusts_10m","wind_direction_10m",
      "precipitation","visibility","uv_index","weather_code","is_day",
    ].join(","),
    hourly: [
      "temperature_2m","precipitation","precipitation_probability","wind_speed_10m",
      "wind_gusts_10m","wind_direction_10m","cloud_cover","relative_humidity_2m",
      "pressure_msl","soil_temperature_0cm","soil_temperature_6cm",
      "soil_temperature_18cm","soil_temperature_54cm",
      "soil_moisture_0_to_1cm","soil_moisture_1_to_3cm","soil_moisture_3_to_9cm",
      "soil_moisture_9_to_27cm","soil_moisture_27_to_81cm",
    ].join(","),
    daily: [
      "temperature_2m_max","temperature_2m_min","precipitation_sum","precipitation_probability_max",
      "wind_speed_10m_max","wind_direction_10m_dominant","weather_code",
      "sunrise","sunset","uv_index_max","shortwave_radiation_sum",
    ].join(","),
    wind_speed_unit: "kmh",
  });
  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error("OpenMeteo " + r.status);
  return r.json();
}

export function mergeOpenMeteo(fallback, om) {
  const out = { ...fallback };
  if (om.current) {
    out.current = {
      ...fallback.current,
      ...om.current,
      visibility_km: (om.current.visibility ?? 22000) / 1000,
      time: om.current.time?.slice(11, 16) ?? fallback.current.time,
    };
  }
  if (om.hourly) {
    out.hourly = { ...fallback.hourly };
    Object.keys(om.hourly).forEach((k) => { if (om.hourly[k]) out.hourly[k] = om.hourly[k]; });
  }
  if (om.daily) {
    out.daily = { ...fallback.daily };
    Object.keys(om.daily).forEach((k) => { if (om.daily[k]) out.daily[k] = om.daily[k]; });
    out.daily.weekday = (om.daily.time || []).map(t =>
      new Date(t).toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()
    );
    out.daily.date = (om.daily.time || []).map(t => t.slice(8, 10));
  }
  return out;
}
