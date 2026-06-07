import type { MetadataRoute } from "next";

type ExtendedManifest = MetadataRoute.Manifest & {
  id?: string;
  share_target?: {
    action: string;
    method: "GET" | "POST";
    enctype?: string;
    params: { title?: string; text?: string; url?: string };
  };
  protocol_handlers?: { protocol: string; url: string }[];
  launch_handler?: { client_mode: string | string[] };
  display_override?: string[];
  shortcuts?: {
    name: string;
    short_name?: string;
    url: string;
    description?: string;
    icons?: { src: string; sizes?: string; type?: string }[];
  }[];
};

export default function manifest(): ExtendedManifest {
  return {
    id: "/",
    name: "AceWeather",
    short_name: "AceWeather",
    description:
      "Minimalist field-weather console with live radar, rainfall, seasonal context, and agronomy guidance.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#0a0b0d",
    theme_color: "#0a0b0d",
    lang: "en",
    dir: "ltr",
    categories: ["weather", "productivity", "utilities"],
    prefer_related_applications: false,
    share_target: {
      action: "/share",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    },
    protocol_handlers: [
      { protocol: "geo", url: "/share?text=%s" },
      { protocol: "web+aceweather", url: "/share?text=%s" },
    ],
    launch_handler: { client_mode: "focus-existing" },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/aceweather-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/aceweather-icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/icons/aceweather-icon-mono.svg", sizes: "any", type: "image/svg+xml", purpose: "monochrome" },
    ],
    shortcuts: [
      {
        name: "Live radar",
        short_name: "Radar",
        url: "/?focus=radar",
        description: "Jump to live radar for your saved location.",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Seasonal context",
        short_name: "Seasonal",
        url: "/?focus=seasonal",
        description: "Open seasonal rainfall and temperature context.",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Field guidance",
        short_name: "Field",
        url: "/?focus=field",
        description: "Open spray, disease, and soil water guidance.",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
