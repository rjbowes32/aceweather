import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.aceweather",
  appName: "AceWeather",
  webDir: "out",
  ios: {
    contentInset: "automatic",
  },
};

export default config;
