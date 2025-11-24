/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    VERCEL_URL: process.env.VERCEL_URL,
  },
  webpack: (config, { isServer }) => {
    // Ignore bot modules during build - they're imported dynamically at runtime
    if (isServer) {
      // For server-side, use externals to prevent bundling
      config.externals = config.externals || [];
      config.externals.push({
        '../../bot/src': 'commonjs ../../bot/src',
        '../../../bot/src': 'commonjs ../../../bot/src',
      });
    }
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

