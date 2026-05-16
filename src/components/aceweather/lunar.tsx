// @ts-nocheck
"use client";

const SYNODIC = 29.530588853;
const REF_NEW_MOON_JD = 2451550.1;

function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

function moonPhase(date = new Date()) {
  const age = ((julianDay(date) - REF_NEW_MOON_JD) % SYNODIC + SYNODIC) % SYNODIC;
  const frac = age / SYNODIC;
  const illum = (1 - Math.cos(2 * Math.PI * frac)) / 2;
  let name = "New moon";
  if (frac < 0.03 || frac >= 0.97) name = "New moon";
  else if (frac < 0.22) name = "Waxing crescent";
  else if (frac < 0.28) name = "First quarter";
  else if (frac < 0.47) name = "Waxing gibbous";
  else if (frac < 0.53) name = "Full moon";
  else if (frac < 0.72) name = "Waning gibbous";
  else if (frac < 0.78) name = "Last quarter";
  else name = "Waning crescent";
  return { frac, illum, name, ageDays: age };
}

function MoonGlyph({ frac, illum }) {
  // Render a 28x28 moon. Use two arcs to carve the shadow based on phase.
  const r = 12;
  const waxing = frac < 0.5;
  const lit = illum;
  const rx = Math.max(0.1, Math.abs(1 - 2 * lit)) * r;
  const sweep = waxing ? (lit < 0.5 ? 1 : 0) : (lit < 0.5 ? 0 : 1);
  return (
    <svg width="28" height="28" viewBox="-14 -14 28 28" className="aw2-moon-glyph" aria-hidden="true">
      <circle r={r} fill="var(--rule-faint)" />
      <path
        d={`M 0 -${r} A ${rx} ${r} 0 1 ${sweep} 0 ${r} A ${r} ${r} 0 1 ${waxing ? 0 : 1} 0 -${r} Z`}
        fill="var(--ink)"
      />
    </svg>
  );
}

export const LunarChip = () => {
  const { frac, illum, name, ageDays } = moonPhase();
  const pct = Math.round(illum * 100);
  return (
    <div className="aw2-m-now-chip aw2-m-moon" title={`${name} · ${ageDays.toFixed(1)}d old`}>
      <div className="k">Moon</div>
      <div className="v aw2-m-moon-v">
        <MoonGlyph frac={frac} illum={illum} />
        <span>{pct}<small>%</small></span>
      </div>
      <div className="sub">{name}</div>
    </div>
  );
};
