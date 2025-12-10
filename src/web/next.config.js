/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Only use standalone output on Vercel, not on local Windows dev
  // This prevents symlink errors (EPERM) on Windows during local builds
  output: process.env.VERCEL ? 'standalone' : undefined,
  env: {
    VERCEL_URL: process.env.VERCEL_URL,
  },
  // Allow external images from Twitter CDN
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'pbs.twimg.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'abs.twimg.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.twimg.com',
        pathname: '/**',
      },
    ],
    // Also support unoptimized images for external URLs
    unoptimized: false,
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

    // Transpile TypeScript files from src/server directory
    // These are imported by API routes but are outside the Next.js build context
    config.module.rules.push({
      test: /\.ts$/,
      include: [
        /src[\\/]server/,
      ],
      use: {
        loader: 'ts-loader',
        options: {
          transpileOnly: true,
          compilerOptions: {
            module: 'esnext',
          },
        },
      },
    });

    return config;
  },
};

module.exports = nextConfig;

