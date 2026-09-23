const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  `${Date.now()}`;

// `npm run build:native` sets this. The app build is plain files for the
// phone to hold, so anything that needs a live server is left out.
const isNativeApp = process.env.ACEWEATHER_TARGET === "native";

const webConfig = {
  // Files named *.web.ts(x) need a live server, so only the website gets them.
  pageExtensions: ["tsx", "ts", "jsx", "js", "web.tsx", "web.ts"],
  async rewrites() {
    const apiBase = process.env.ACEWEATHER_API_PROXY_TARGET || "http://127.0.0.1:8000";

    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/api/:path*`,
      },
    ];
  },
};

const nativeConfig = {
  output: "export",
  pageExtensions: ["tsx", "ts", "jsx", "js"],
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  reactStrictMode: true,
  generateBuildId: async () => buildId,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_ACEWEATHER_API_BASE:
      process.env.NEXT_PUBLIC_ACEWEATHER_API_BASE ||
      (isNativeApp ? "https://www.aceweather.app" : ""),
  },
  ...(isNativeApp ? nativeConfig : webConfig),
};

export default nextConfig;
