import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A production build and a running dev server must never share an output
  // directory — the build overwrites the dev server's chunk manifest and every
  // route starts failing with "Cannot find module './vendor-chunks/…'".
  // Verification builds set NEXT_DIST_DIR=.next-build; dev keeps .next.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Flyers are drawn server-side from the bundled fonts. On serverless,
  // public/ is served as static assets and is NOT inside the function
  // filesystem, so the font files must be traced into the bundle explicitly.
  outputFileTracingIncludes: {
    "/**": ["./public/fonts/**"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
