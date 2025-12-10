import React from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { PortalLayout } from '../../../components/portal/PortalLayout';
import { getAllLaunchesWithMetrics } from '@/lib/portal/db';
import { withDbRetry } from '@/lib/prisma';
import type { LaunchSummary } from '../../../pages/api/portal/new-launches';

interface Props {
  launches: LaunchSummary[];
  error?: string;
}

export default function NewLaunchesPage({ launches, error }: Props) {
  return (
    <PortalLayout title="New Launches">
      {/* Error Banner */}
      {error && (
        <div className="neon-card border-red-500/30 bg-red-500/10 p-5 mb-8">
          <p className="text-sm text-red-400 font-semibold mb-2">
            <strong>Configuration Error:</strong> {error}
          </p>
          <p className="text-xs text-red-300/70">
            Create a <code className="bg-black/20 px-1.5 py-0.5 rounded">.env.local</code> file in the project root with <code className="bg-black/20 px-1.5 py-0.5 rounded">DATABASE_URL=your_connection_string</code>
          </p>
        </div>
      )}

      {/* Disclaimer Banner */}
      {!error && (
        <div className="neon-card neon-hover border-akari-neon-pink/30 bg-akari-neon-pink/5 p-4 mb-8">
          <p className="text-sm text-akari-muted">
            <strong className="text-akari-neon-pink">Community data.</strong> Not investment advice. ROI is illustrative, not a guarantee.
          </p>
        </div>
      )}

      {/* Header */}
      <section className="mb-10">
        <h1 className="text-3xl font-bold mb-3 text-gradient-pink">New Launches</h1>
        <p className="text-base text-akari-muted max-w-2xl leading-relaxed">
          Community-curated database of new token launches, IDOs, and airdrops with real-time price tracking.
        </p>
      </section>

      {/* Launches Grid */}
      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mb-12">
        {launches.map((launch) => {
          const roiPercent = launch.roiPercent;
          const salePrice = launch.salePriceUsd;
          const latestPrice = launch.latestPriceUsd;

          return (
            <Link
              key={launch.id}
              href={`/portal/new-launches/${launch.id}`}
              className="neon-card neon-hover p-6 group"
            >
              {/* Top: Platform + Chain */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  {launch.platformName && (
                    <span className="pill-neon text-xs text-akari-neon-teal bg-akari-neon-teal/15 border border-akari-neon-teal/30 px-3 py-1 font-semibold">
                      {launch.platformName}
                    </span>
                  )}
                  {launch.chain && (
                    <span className="pill-neon text-xs text-akari-muted bg-akari-cardSoft/50 border border-akari-neon-teal/20 px-3 py-1 font-medium">
                      {launch.chain}
                    </span>
                  )}
                </div>
                {launch.status && (
                  <span className="pill-neon text-[10px] text-akari-muted bg-akari-cardSoft/50 border border-akari-neon-teal/20 px-2.5 py-1 font-medium">
                    {launch.status}
                  </span>
                )}
              </div>

              {/* Token Name + Symbol */}
              <h3 className="text-lg font-bold mb-2 text-akari-text group-hover:text-gradient-pink transition-all duration-300">
                {launch.name}
              </h3>
              <p className="text-sm text-gradient-teal font-semibold mb-4">
                ${launch.tokenSymbol}
              </p>

              {/* Taxonomy chips */}
              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                {launch.category && (
                  <span className="pill-neon px-3 py-1 bg-akari-cardSoft/50 border border-akari-neon-teal/20 text-akari-muted font-medium">
                    {launch.category}
                  </span>
                )}
                {launch.platformName && (
                  <span className="pill-neon px-3 py-1 bg-akari-neon-teal/15 border border-akari-neon-teal/30 text-akari-neon-teal font-semibold">
                    {launch.platformName}
                  </span>
                )}
                {launch.listingPlatformName && (
                  <span className="pill-neon px-3 py-1 bg-akari-cardSoft/50 border border-akari-neon-teal/20 text-akari-muted font-medium">
                    {launch.listingPlatformName}
                  </span>
                )}
                {launch.leadInvestorName && (
                  <span className="pill-neon px-3 py-1 bg-akari-cardSoft/50 border border-akari-neon-teal/20 text-akari-muted font-medium">
                    {launch.leadInvestorName}
                  </span>
                )}
              </div>

              {/* Price Row */}
              <div className="mb-4 text-sm text-akari-muted">
                {salePrice && latestPrice ? (
                  <p>
                    Sale: <span className="text-akari-text font-semibold">${salePrice.toFixed(4)}</span> • Now:{' '}
                    <span className="text-akari-text font-semibold">${latestPrice.toFixed(4)}</span>
                  </p>
                ) : salePrice ? (
                  <p>
                    Sale: <span className="text-akari-text font-semibold">${salePrice.toFixed(4)}</span>
                  </p>
                ) : latestPrice ? (
                  <p>
                    Current: <span className="text-akari-text font-semibold">${latestPrice.toFixed(4)}</span>
                  </p>
                ) : (
                  <p className="text-akari-muted">Price data pending</p>
                )}
              </div>

              {/* ROI Badge */}
              <div className="flex items-center justify-between">
                {roiPercent !== null ? (
                  <span
                    className={`pill-neon text-xs font-semibold px-3 py-1.5 border ${
                      roiPercent > 0
                        ? 'bg-akari-profit/15 text-akari-profit border-akari-profit/30'
                        : 'bg-red-500/15 text-red-400 border-red-500/30'
                    }`}
                  >
                    {roiPercent > 0 ? '+' : ''}
                    {roiPercent.toFixed(1)}% ROI
                    {salePrice && latestPrice && (
                      <span className="ml-1.5 text-[10px]">
                        ({((latestPrice / salePrice).toFixed(2))}x)
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-xs text-akari-muted">Pending</span>
                )}
                <span className="text-xs text-akari-neon-teal font-semibold group-hover:text-gradient-teal transition-all duration-300">View details →</span>
              </div>
            </Link>
          );
        })}
      </div>

      {launches.length === 0 && (
        <div className="text-center py-12 text-akari-muted">
          <p className="text-sm">No launches found.</p>
        </div>
      )}

    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  if (!process.env.DATABASE_URL) {
    return {
      props: {
        launches: [],
        error: 'DATABASE_URL environment variable is not set. Please configure your .env file.',
      },
    };
  }

  try {
    const launches = await withDbRetry(() => getAllLaunchesWithMetrics());

    const summaries: LaunchSummary[] = launches.map((launch) => ({
      id: launch.id,
      name: launch.name,
      tokenSymbol: launch.tokenSymbol,
      category: launch.category,
      platformName:
        launch.primaryPlatform?.name ||
        launch.platform?.name ||
        null,
      platformKind: launch.primaryPlatform?.kind || null,
      listingPlatformName: launch.listingPlatform?.name || null,
      listingPlatformKind: launch.listingPlatform?.kind || null,
      leadInvestorName: launch.leadInvestor?.name || null,
      salePriceUsd: launch.salePriceUsd,
      latestPriceUsd: launch.latestSnapshot?.priceUsd || null,
      roiPercent: launch.roiPercent,
      chain: launch.chain,
      status: launch.status,
    }));

    return {
      props: {
        launches: summaries,
      },
    };
  } catch (error: any) {
    console.error('[New Launches] Error:', error);
    return {
      props: {
        launches: [],
        error: error?.message || 'Failed to load launches',
      },
    };
  }
};
