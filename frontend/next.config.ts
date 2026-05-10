import type { NextConfig } from "next";

// withSentryConfig removed — it injects Edge-incompatible code into the
// middleware bundle, causing MIDDLEWARE_INVOCATION_FAILED on Vercel.
// Sentry error capture still works via sentry.client.config.ts,
// sentry.server.config.ts, and sentry.edge.config.ts (loaded automatically
// by @sentry/nextjs without the build-time wrapper).

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react"],
  },
  turbopack: {},
};

export default nextConfig;
