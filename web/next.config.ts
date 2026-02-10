import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ensure workspace packages are watched and recompiled in dev when they change.
  transpilePackages: ["pro-harness-shared", "pro-harness-core"],
  experimental: {
    externalDir: true,
  },
};

export default nextConfig;
