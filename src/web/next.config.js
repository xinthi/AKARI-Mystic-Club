/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  env: {
    VERCEL_URL: process.env.VERCEL_URL,
  },
};

module.exports = nextConfig;

