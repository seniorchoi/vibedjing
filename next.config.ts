import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // Bypass ESLint errors/warnings
  },
  typescript: {
    ignoreBuildErrors: true, // Bypass TypeScript errors
  },
};

export default nextConfig;