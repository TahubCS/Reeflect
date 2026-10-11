import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // A workspace package shipped as TypeScript source (ADR-032).
  transpilePackages: ["@reeflect/agent-protocol"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        // CSS Modules must stay modules: `as: "*.css"` would turn them into
        // global CSS and drop their class names (ADR-046).
        condition: { not: { path: "*.module.css" } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
