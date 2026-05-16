import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";

import { PwaBootstrap } from "@/components/pwa-bootstrap";

import "./globals.css";
import "./aceweather-v2.css";
import "./radar.css";
import "./chips.css";
import "./onthisday.css";
import "./models.css";

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "AceWeather v2 · Synoptic",
  description: "Synoptic weather and farm intelligence.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AceWeather",
  },
  icons: {
    icon: [
      { url: "/icons/aceweather-icon.svg", type: "image/svg+xml" },
      { url: "/icons/aceweather-icon-maskable.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/aceweather-icon.svg" }],
    other: [{ rel: "mask-icon", url: "/icons/aceweather-icon-mono.svg", color: "#14140f" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${newsreader.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}>
      <body>
        <PwaBootstrap />
        {children}
      </body>
    </html>
  );
}
