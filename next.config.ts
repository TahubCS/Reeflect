import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  experimental: {
    serverActions: {
      // Statement PDFs may be up to 10 MB (ADR-044), plus the form's own
      // overhead. Vercel still caps a request body at 4.5 MB (ADR-053).
      bodySizeLimit: "11mb",
    },
  },
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
