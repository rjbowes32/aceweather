// @ts-nocheck
"use client";

export const Stat = ({ k, v, u, sub }) => (
  <div className="aw2-hero-stat">
    <div className="k">{k}</div>
    <div className="v">{v}{u ? <small>{u}</small> : null}</div>
    <div className="sub">{sub}</div>
  </div>
);
