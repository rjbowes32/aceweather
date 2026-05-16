// @ts-nocheck
"use client";

function classify(code, isDay) {
  if (code == null) return null;
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99].includes(code)) return "rain";
  if ([71,73,75,77,85,86].includes(code)) return "snow";
  if ([45,48,3].includes(code)) return "overcast";
  if ([2].includes(code)) return "partly";
  if ([0,1].includes(code)) return isDay ? "sun" : "clear-night";
  return null;
}

function RainFx() {
  const drops = Array.from({ length: 14 });
  return (
    <div className="aw2-fx aw2-fx-rain" aria-hidden="true">
      {drops.map((_, i) => (
        <span key={i} className="drop" style={{
          left: `${(i * 7.3) % 100}%`,
          animationDelay: `${(i * 0.17) % 1.6}s`,
          animationDuration: `${0.9 + ((i * 13) % 7) / 10}s`,
        }} />
      ))}
    </div>
  );
}

function SunFx() {
  return (
    <div className="aw2-fx aw2-fx-sun" aria-hidden="true">
      <span className="sun-core" />
      <span className="sun-rays" />
    </div>
  );
}

function CloudFx({ variant }) {
  return (
    <div className={`aw2-fx aw2-fx-cloud ${variant}`} aria-hidden="true">
      <span className="puff p1" />
      <span className="puff p2" />
    </div>
  );
}

function SnowFx() {
  const flakes = Array.from({ length: 10 });
  return (
    <div className="aw2-fx aw2-fx-snow" aria-hidden="true">
      {flakes.map((_, i) => (
        <span key={i} className="flake" style={{
          left: `${(i * 10.7) % 100}%`,
          animationDelay: `${(i * 0.31) % 2.4}s`,
          animationDuration: `${2.4 + ((i * 7) % 9) / 5}s`,
        }}>·</span>
      ))}
    </div>
  );
}

function NightFx() {
  return (
    <div className="aw2-fx aw2-fx-night" aria-hidden="true">
      <span className="star s1" />
      <span className="star s2" />
      <span className="star s3" />
    </div>
  );
}

export const NowFx = ({ code, isDay }) => {
  const kind = classify(code, isDay);
  if (kind === "rain") return <RainFx />;
  if (kind === "snow") return <SnowFx />;
  if (kind === "sun") return <SunFx />;
  if (kind === "partly") return <CloudFx variant="partly" />;
  if (kind === "overcast") return <CloudFx variant="overcast" />;
  if (kind === "clear-night") return <NightFx />;
  return null;
};
