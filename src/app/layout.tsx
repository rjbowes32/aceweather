import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { PwaBootstrap } from "@/components/pwa-bootstrap";

import "./aceweather-x.css";
import "./aceweather-x-cards.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0b0d" },
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
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/aceweather-icon.svg", type: "image/svg+xml" },
      { url: "/icons/aceweather-icon-maskable.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    other: [{ rel: "mask-icon", url: "/icons/aceweather-icon-mono.svg", color: "#0a0b0d" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-awx="1" data-theme="dark" className={inter.variable}>
      <head>
        <link rel="apple-touch-startup-image" href="/icons/icon-512.png" />
      </head>
      <body>
        <PwaBootstrap />
        {children}
      </body>
    </html>
  );
}
