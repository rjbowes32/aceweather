"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./site-mode-tabs.module.css";

export function SiteModeTabs() {
  const pathname = usePathname();
  const atlas = pathname.startsWith("/atlas");

  return (
    <nav className={styles.tabs} aria-label="AceWeather modes">
      <Link className={`${styles.tab} ${!atlas ? styles.active : ""}`} href="/">Weather</Link>
      <Link className={`${styles.tab} ${atlas ? styles.active : ""}`} href="/atlas">Atlas</Link>
    </nav>
  );
}
