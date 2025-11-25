/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Only use standalone output on Vercel, not on local Windows dev
  // This prevents symlink errors (EPERM) on Windows during local builds
  output: process.env.VERCEL ? 'standalone' : undefined,
  env: {
    VERCEL_URL: process.env.VERCEL_URL,
  },
  webpack: (config, { isServer }) => {
    // Client-side fallbacks
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;

