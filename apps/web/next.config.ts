import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every app screen is behind sign-in, so Cache Components' static shell buys little here.
  transpilePackages: ["@brandloop/ui", "@brandloop/db", "@brandloop/ai", "@brandloop/knowledge", "@brandloop/agent"],
  serverExternalPackages: ["pg"],
  // Document parsing runs in a worker thread loaded by path, which file tracing can't see.
  outputFileTracingIncludes: {
    "/*": [
      "../../packages/knowledge/src/extract/*.mjs",
      "../../packages/knowledge/node_modules/{mammoth,unpdf,read-excel-file}/**/*",
    ],
  },
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
