/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Only use standalone output on Vercel, not on local Windows dev
  // This prevents symlink errors (EPERM) on Windows during local builds
  output: process.env.VERCEL ? 'standalone' : undefined,
  env: {
    VERCEL_URL: process.env.VERCEL_URL,
  },
  // Allow external images from Twitter CDN and Supabase Storage
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
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/**',
      },
    ],
    // Also support unoptimized images for external URLs
    unoptimized: false,
  },
  webpack: (config, { isServer, defaultLoaders }) => {
    // Client-side fallbacks
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }

    // Add alias for server directory
    config.resolve.alias = {
      ...config.resolve.alias,
      '@/server': require('path').resolve(__dirname, '../../server'),
    };

    // Transpile TypeScript files from src/server directory
    // These files are imported by API routes but are outside the Next.js build context
    // Use Next.js's default babel loader to handle TypeScript (same as it uses for app files)
    config.module.rules.push({
      test: /\.tsx?$/,
      include: [
        /src[\\/]server/,
      ],
      use: defaultLoaders.babel,
    });

    return config;
  },
};

module.exports = nextConfig;

