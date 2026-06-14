import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  reactCompiler: true,
  transpilePackages: ["@handshake/types", "siwe"],
  webpack: (config) => {
    // @wagmi/connectors resolves @base-org/account with 'node' condition → index.node.js
    // which imports from ox with ESM exports webpack can't analyze.
    // Force browser entry (dist/index.js) to avoid the broken node build.
    // @base-org/account is hoisted via .npmrc public-hoist-pattern so this path is stable.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": path.resolve(
        __dirname,
        "../../node_modules/@base-org/account/dist/index.js"
      ),
    };

    // Suppress warnings for optional native/RN packages not used in browser context.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };

    return config;
  },
};

export default nextConfig;
