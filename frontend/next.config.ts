import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react"],
    // instrumentation.ts is auto-discovered in Next.js 15+
  },
};

export default nextConfig;
