import type { NextConfig } from "next";

// No `output: "export"`: pages are statically rendered at build time, but keeping the Node runtime
// leaves room for middleware-based auth (password gate) later without changing the data flow.
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // ESLint is intentionally not a dependency (keeps the install small); nothing to run here.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
