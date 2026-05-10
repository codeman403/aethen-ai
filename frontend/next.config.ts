import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react"],
  },
  turbopack: {},
};

export default withSentryConfig(nextConfig, {
  // Only enable Sentry plugin when DSN is configured
  silent: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  disableLogger: true,
  // Don't upload source maps unless SENTRY_AUTH_TOKEN is set
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Disabled — autoInstrument wraps Edge Runtime middleware with Node.js
  // APIs unavailable in the Edge Runtime, causing MIDDLEWARE_INVOCATION_FAILED.
  // Errors in API routes and server components are still captured via
  // sentry.server.config.ts and sentry.edge.config.ts.
  autoInstrumentServerFunctions: false,
  widenClientFileUpload: false,
});
