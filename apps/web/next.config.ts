import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,
  transpilePackages: ['react-markdown'],
};

export default nextConfig;
