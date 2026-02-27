import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude agent directory from TypeScript compilation
  // The agent is a separate Blaxel deployment
  onDemandEntries: {
    // Make sure agent files aren't cached
    maxInactiveAge: 0,
  },
};

export default nextConfig;
