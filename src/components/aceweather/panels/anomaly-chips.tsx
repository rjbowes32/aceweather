// @ts-nocheck
"use client";

/* "Now vs normal" chips — derived from whatever climate fields the payload
   carries plus today's forecast. The data shape mirrors AW_FALLBACK.climate
   (monthly_mean_30y, monthly_mean_year, monthly_rain_30y, monthly_rain_year,
   monthly_rain_pct) so chips degrade gracefully when fields are missing. */

function classify(deltaPct: number): "warm" | "cool" | "neutral" {
  if (deltaPct > 8) return "warm";
  if (deltaPct < -8) return "cool";
  return "neutral";
}

function tempClass(deltaC: number): "warm" | "cool" | "neutral" {
  if (deltaC > 0.7) return "warm";
  if (deltaC < -0.7) return "cool";
  return "neutral";
}

function signed(value: number, digits = 1): string {
  const fixed = value.toFixed(digits);
  return value > 0 ? `+${fixed}` : fixed;
}

function dayLengthMinutes(sunrise?: string, sunset?: string): number | null {
  if (!sunrise || !sunset) return null;
  const sr = sunrise.includes("T") ? sunrise.split("T")[1].slice(0, 5) : sunrise;
  const ss = sunset.includes("T") ? sunset.split("T")[1].slice(0, 5) : sunset;
  const parse = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  return parse(ss) - parse(sr);
}

export function AnomalyChips({ data, todayIndex = 7 }) {
  const climate = data.climate ?? {};
  const daily = data.daily ?? {};
  const chips: { key: string; label: string; value: string; tone: string; sub?: string }[] = [];

  const todayMax = daily.temperature_2m_max?.[todayIndex];
  const todayMin = daily.temperature_2m_min?.[todayIndex];
  const monthlyMean30y = climate.monthly_mean_30y;

  if (todayMax != null && monthlyMean30y != null) {
    const todayMean = todayMin != null ? (todayMax + todayMin) / 2 : todayMax;
    const delta = todayMean - monthlyMean30y;
    chips.push({
      key: "temp-today",
      label: `Today vs ${climate.month_label ?? "month"} norm`,
      value: `${signed(delta)}°`,
      tone: tempClass(delta),
      sub: `${todayMean.toFixed(1)}° vs ${monthlyMean30y.toFixed(1)}°`,
    });
  }

  if (climate.monthly_rain_pct != null) {
    const tone = classify(climate.monthly_rain_pct - 100);
    chips.push({
      key: "rain-mtd",
      label: "Rain MTD vs norm",
      value: `${Math.round(climate.monthly_rain_pct)}%`,
      tone: tone === "warm" ? "wet" : tone === "cool" ? "dry" : "neutral",
      sub:
        climate.monthly_rain_year != null && climate.monthly_rain_30y != null
          ? `${climate.monthly_rain_year.toFixed(1)} / ${climate.monthly_rain_30y.toFixed(1)} mm`
          : undefined,
    });
  }

  const next7Rain = (daily.precipitation_sum ?? []).slice(todayIndex, todayIndex + 7);
  if (next7Rain.length && climate.monthly_rain_30y != null) {
    const sum = next7Rain.reduce((acc, v) => acc + (v || 0), 0);
    const weeklyNorm = climate.monthly_rain_30y * (7 / 30);
    const pct = weeklyNorm > 0 ? (sum / weeklyNorm) * 100 : 100;
    const tone = classify(pct - 100);
    chips.push({
      key: "rain-7d",
      label: "Rain next 7d vs norm",
      value: `${Math.round(pct)}%`,
      tone: tone === "warm" ? "wet" : tone === "cool" ? "dry" : "neutral",
      sub: `${sum.toFixed(1)} / ${weeklyNorm.toFixed(1)} mm`,
    });
  }

  if (climate.monthly_mean_year != null && monthlyMean30y != null) {
    const delta = climate.monthly_mean_year - monthlyMean30y;
    chips.push({
      key: "month-anomaly",
      label: `${climate.month_label ?? "Month"} anomaly`,
      value: `${signed(delta)}°`,
      tone: tempClass(delta),
      sub: `Running 30y norm ${monthlyMean30y.toFixed(1)}°`,
    });
  }

  const dl = dayLengthMinutes(daily.sunrise?.[todayIndex], daily.sunset?.[todayIndex]);
  if (dl != null) {
    chips.push({
      key: "daylight",
      label: "Daylight today",
      value: `${Math.floor(dl / 60)}h ${dl % 60}m`,
      tone: "neutral",
      sub: dl > 14 * 60 ? "Long day" : dl < 10 * 60 ? "Short day" : "",
    });
  }

  if (!chips.length) return null;

  return (
    <div className="aw2-chips" aria-label="Now vs normal">
      {chips.map((chip) => (
        <div key={chip.key} className={`aw2-chip aw2-chip-${chip.tone}`}>
          <div className="k">{chip.label}</div>
          <div className="v">{chip.value}</div>
          {chip.sub ? <div className="sub">{chip.sub}</div> : null}
        </div>
      ))}
    </div>
  );
}
