// @ts-nocheck
"use client";

import { weatherConditionFor } from "./helpers";

export const WeatherIcon = ({ code }) => {
  const condition = weatherConditionFor(code);
  const common = {
    viewBox: "0 0 28 28",
    role: "img",
    "aria-label": condition.label,
    className: `aw2-weather-icon ${condition.key}`,
  };

  if (condition.key === "sun") {
    return (
      <svg {...common}>
        <circle cx="14" cy="14" r="4.5"/>
        {[0,45,90,135,180,225,270,315].map((a) => {
          const r = a * Math.PI / 180;
          return <line key={a} x1={14 + Math.cos(r) * 8} y1={14 + Math.sin(r) * 8} x2={14 + Math.cos(r) * 11} y2={14 + Math.sin(r) * 11}/>;
        })}
      </svg>
    );
  }

  if (condition.key === "partly") {
    return (
      <svg {...common}>
        <circle cx="10" cy="10" r="3.5"/>
        <path d="M6 18.5h15.5c1.8 0 3.2-1.2 3.2-2.9 0-1.5-1.1-2.7-2.6-2.9-.7-2.4-2.7-4-5.1-4-2.1 0-3.9 1.2-4.8 3-2.3.1-4.1 1.6-4.1 3.6"/>
      </svg>
    );
  }

  if (condition.key === "rain" || condition.key === "storm") {
    return (
      <svg {...common}>
        <path d="M5 15.5h16.5c1.8 0 3.2-1.2 3.2-2.9 0-1.5-1.1-2.7-2.6-2.9-.7-2.4-2.7-4-5.1-4-2.1 0-3.9 1.2-4.8 3-2.3.1-4.1 1.6-4.1 3.6"/>
        {condition.key === "storm" ? (
          <path d="M14 16.5l-2.4 4.2h3.1L13 25"/>
        ) : (
          <>
            <line x1="10" y1="19" x2="8.5" y2="23"/>
            <line x1="15" y1="19" x2="13.5" y2="23"/>
            <line x1="20" y1="19" x2="18.5" y2="23"/>
          </>
        )}
      </svg>
    );
  }

  if (condition.key === "snow") {
    return (
      <svg {...common}>
        <path d="M5 14h18M14 5v18M8 8l12 12M20 8L8 20"/>
        <circle cx="14" cy="14" r="2"/>
      </svg>
    );
  }

  if (condition.key === "fog") {
    return (
      <svg {...common}>
        <path d="M6 11.5h14.5c1.7 0 3-1.1 3-2.6 0-1.4-1-2.5-2.4-2.7-.7-2-2.4-3.3-4.6-3.3-1.9 0-3.5 1-4.3 2.6"/>
        <line x1="4" y1="16" x2="24" y2="16"/>
        <line x1="7" y1="20" x2="21" y2="20"/>
        <line x1="4" y1="24" x2="24" y2="24"/>
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M5 17h16.5c1.8 0 3.2-1.2 3.2-2.9 0-1.5-1.1-2.7-2.6-2.9-.7-2.4-2.7-4-5.1-4-2.1 0-3.9 1.2-4.8 3-2.3.1-4.1 1.6-4.1 3.6"/>
    </svg>
  );
};
