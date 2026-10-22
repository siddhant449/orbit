import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every app screen is behind sign-in, so Cache Components' static shell buys little here.
  transpilePackages: ["@brandloop/ui", "@brandloop/db", "@brandloop/ai", "@brandloop/knowledge", "@brandloop/agent", "@brandloop/storage"],
  serverExternalPackages: ["pg", "sharp"],
  // Document parsing runs in a worker thread loaded by path, which file tracing can't see. Only the
  // routes that ingest documents need it (the parse worker is reached via @/lib/knowledge's startIngest).
  outputFileTracingIncludes: Object.fromEntries(
    ["/api/upload", "/api/knowledge-base", "/api/knowledge-base/*"].map((route) => [
      route,
      [
        "../../packages/knowledge/src/extract/*.mjs",
        "../../packages/knowledge/node_modules/{mammoth,unpdf,read-excel-file}/**/*",
      ],
    ]),
  ),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
