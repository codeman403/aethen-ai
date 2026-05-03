import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react"],
  },
  // Empty turbopack config — satisfies Next.js 16 which defaults to Turbopack.
  // The webpack filesystem cache block was dev-only and not needed in production.
  turbopack: {},
};

export default nextConfig;
