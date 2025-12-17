import React from 'react';
import Link from 'next/link';
import { PortalLayout } from '../components/portal/PortalLayout';

export default function Custom404() {
  return (
    <PortalLayout title="404 - Page Not Found">
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="max-w-md w-full">
          <div className="mb-6">
            <h1 className="text-6xl font-bold text-gradient-teal mb-4">404</h1>
            <h2 className="text-2xl font-semibold text-akari-text mb-2">
              Page Not Found
            </h2>
            <p className="text-akari-muted mb-8">
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/portal"
              className="pill-neon inline-flex items-center justify-center gap-2 bg-gradient-neon-teal px-6 py-3 text-sm font-semibold text-black shadow-neon-teal hover:shadow-akari-glow transition-all duration-300"
            >
              ← Back to Home
            </Link>
            <Link
              href="/portal/sentiment"
              className="pill-neon inline-flex items-center justify-center gap-2 border border-akari-neon-teal/40 px-6 py-3 text-sm font-medium text-akari-muted transition-all duration-300 hover:border-akari-neon-teal/60 hover:text-akari-neon-teal hover:bg-akari-neon-teal/5"
            >
              Explore Sentiment
            </Link>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}

