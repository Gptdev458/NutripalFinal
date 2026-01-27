// Trigger redeploy after making repo public
// Remove type-only import
// import type { NextConfig } from "next";

const nextConfig = {
  /* config options here */
  transpilePackages: ['shared'],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
