const buildId =
  process.env.NEXT_PUBLIC_BUILD_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  `${Date.now()}`;

// Capacitor builds produce a fully static bundle (out/) for the native iOS shell.
// Server-only pieces (middleware, /version, /share, the service-worker route) are
// stashed by scripts/build-capacitor.mjs before this config runs with CAPACITOR_BUILD=1.
const isCapacitorBuild = process.env.CAPACITOR_BUILD === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  generateBuildId: async () => buildId,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  ...(isCapacitorBuild
    ? {
        output: "export",
        images: { unoptimized: true },
      }
    : {
        async rewrites() {
          const apiBase = process.env.ACEWEATHER_API_PROXY_TARGET || "http://127.0.0.1:8000";

          return [
            {
              source: "/api/:path*",
              destination: `${apiBase}/api/:path*`,
            },
          ];
        },
      }),
};

export default nextConfig;
