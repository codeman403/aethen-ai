import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["framer-motion", "lucide-react"],
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // Store webpack's module graph on disk instead of in memory.
      // This is the single biggest webpack memory reduction — the cache
      // stays warm across restarts and hot-reloads don't rebuild from scratch.
      config.cache = { type: "filesystem" };
    }
    return config;
  },
};

export default nextConfig;
