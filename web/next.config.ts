import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    reactStrictMode: true,
    // Keep dev and prod build outputs separate so `next build` can't clobber a running `next dev`.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next" : ".next-prod",
    // Ensure workspace packages are watched and bundled in dev when they change.
    transpilePackages: ["pro-harness-shared", "pro-harness-core"],
  };
}
