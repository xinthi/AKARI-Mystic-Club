/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    VERCEL_URL: process.env.VERCEL_URL,
  },
  webpack: (config, { isServer }) => {
    // Ignore bot modules during build - they're imported dynamically at runtime
    config.resolve.alias = {
      ...config.resolve.alias,
      '../../bot': false,
      '../../../bot': false,
    };
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

