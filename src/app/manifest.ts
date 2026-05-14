import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
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
