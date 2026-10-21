import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every app screen is behind sign-in, so Cache Components' static shell buys little here.
  transpilePackages: ["@brandloop/ui", "@brandloop/db", "@brandloop/ai"],
  serverExternalPackages: ["pg"],
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
