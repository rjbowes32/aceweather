import type { Metadata, Viewport } from "next";
import Script from "next/script";

import { PwaBootstrap } from "@/components/pwa-bootstrap";
import { iconUrl } from "@/lib/aceweather/icon-rev";

import "./aceweather-x.css";
import "./aceweather-x-cards.css";
import "./spray-card.css";
import "./typography.css";
import "./design-tokens.css";
import "./shared-surfaces.css";
import "./weather-dashboard.css";
import "./ui-tidy.css";
import "./card-tidy.css";

const themeBootstrap = `try{const theme=localStorage.getItem("awx-theme");if(theme==="light"||theme==="dark")document.documentElement.dataset.theme=theme}catch{}`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0B1220" },
  ],
};

export const metadata: Metadata = {
  title: "AceWeather - Field weather console",
  description:
    "Calm, premium field-weather intelligence: rainfall, radar, temperatures, 14-day outlook, agronomy and seasonal context. Powered by Open-Meteo.",
  applicationName: "AceWeather",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "AceWeather",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: iconUrl("/favicon.svg"), type: "image/svg+xml" },
      { url: iconUrl("/favicon-32.png"), sizes: "32x32", type: "image/png" },
      { url: iconUrl("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
      { url: iconUrl("/icons/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: iconUrl("/apple-touch-icon.png"), sizes: "180x180", type: "image/png" }],
    other: [{ rel: "mask-icon", url: iconUrl("/icons/aceweather-icon-mono.svg"), color: "#0a0b0d" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-awx="1" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-startup-image" href={iconUrl("/icons/icon-512.png")} />
      </head>
      <body>
        <Script id="aw-theme-bootstrap" strategy="beforeInteractive">{themeBootstrap}</Script>
        <PwaBootstrap />
        {children}
      </body>
    </html>
  );
}
