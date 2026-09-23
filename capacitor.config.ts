import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Store identity. Permanent once the app is uploaded to either store.
  appId: "app.aceweather",
  appName: "AceWeather",
  // Where `npm run build:native` puts the finished website files.
  webDir: "out",
};

export default config;
