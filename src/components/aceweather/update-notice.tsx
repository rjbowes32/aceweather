// @ts-nocheck
"use client";

import { useEffect, useState } from "react";

export const UpdateNotice = () => {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    let initialBuildId = null;

    const fetchBuildId = async () => {
      try {
        const r = await fetch("/version", { cache: "no-store" });
        if (!r.ok) return null;
        const j = await r.json();
        return typeof j.buildId === "string" ? j.buildId : null;
      } catch {
        return null;
      }
    };

    const check = async () => {
      const current = await fetchBuildId();
      if (cancelled || !current) return;
      if (initialBuildId == null) {
        initialBuildId = current;
      } else if (current !== initialBuildId) {
        setUpdateReady(true);
      }
    };

    check();
    const interval = window.setInterval(check, 5 * 60 * 1000);
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <button
      type="button"
      className="aw2-m-update"
      onClick={() => window.location.reload()}
      aria-label="A new version is available — tap to refresh"
    >
      <span className="dot" aria-hidden="true" />
      Update
    </button>
  );
};
