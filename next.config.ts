import type { NextConfig } from "next";

const nextConfig: NextConfig = {

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 't0.gstatic.com' },
    ],
  },
  async rewrites() {
    return [
      // Serve manifest at both .json and .webmanifest URLs from the same source
      { source: '/manifest.webmanifest', destination: '/manifest.json' },
    ]
  },
};

export default nextConfig;
