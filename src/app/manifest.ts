import type { MetadataRoute } from "next";

type ExtendedManifest = MetadataRoute.Manifest & {
  share_target?: {
    action: string;
    method: "GET" | "POST";
    enctype?: string;
    params: { title?: string; text?: string; url?: string };
  };
  protocol_handlers?: { protocol: string; url: string }[];
  launch_handler?: { client_mode: string | string[] };
};

export default function manifest(): ExtendedManifest {
  return {
    name: "AceWeather",
    short_name: "AceWeather",
    description: "Synoptic weather + farm intelligence",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f5f1e8",
    theme_color: "#f5f1e8",
    categories: ["weather", "productivity", "utilities"],
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
    protocol_handlers: [
      { protocol: "geo", url: "/share?text=%s" },
      { protocol: "web+aceweather", url: "/share?text=%s" },
    ],
    launch_handler: { client_mode: "focus-existing" },
    icons: [
      {
        src: "/icons/aceweather-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/aceweather-icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/icons/aceweather-icon-mono.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "monochrome",
      },
    ],
  };
}
