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
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 mb-6">
          <p className="text-sm text-red-400">
            <strong>Configuration Error:</strong> {error}
          </p>
          <p className="text-xs text-red-300/70 mt-2">
            Create a <code className="bg-black/20 px-1 rounded">.env.local</code> file in the project root with <code className="bg-black/20 px-1 rounded">DATABASE_URL=your_connection_string</code>
          </p>
        </div>
      )}

      {/* Disclaimer Banner */}
      {!error && (
        <div className="rounded-2xl border border-akari-profit/30 bg-akari-cardSoft p-3 mb-6">
          <p className="text-xs text-akari-muted">
            <strong className="text-akari-profit">Community data.</strong> Not investment advice. ROI is illustrative, not a guarantee.
          </p>
        </div>
      )}

      {/* Header */}
      <section className="mb-6">
        <h1 className="text-2xl font-semibold mb-2 text-akari-text">New launches</h1>
        <p className="text-sm text-akari-muted max-w-2xl">
          Community-curated database of new token launches, IDOs, and airdrops with real-time price tracking.
        </p>
      </section>

      {/* Launches Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        {launches.map((launch) => {
          const roiPercent = launch.roiPercent;
          const salePrice = launch.salePriceUsd;
          const latestPrice = launch.latestPriceUsd;

          return (
            <Link
              key={launch.id}
              href={`/portal/new-launches/${launch.id}`}
              className="rounded-2xl border border-akari-border bg-akari-card p-4 hover:border-akari-primary/60 transition-all"
            >
              {/* Top: Platform + Chain */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {launch.platformName && (
                    <span className="text-xs text-akari-primary bg-akari-primary/10 px-2 py-0.5 rounded-full">
                      {launch.platformName}
                    </span>
                  )}
                  {launch.chain && (
                    <span className="text-xs text-akari-muted bg-akari-cardSoft px-2 py-0.5 rounded-full">
                      {launch.chain}
                    </span>
                  )}
                </div>
                {launch.status && (
                  <span className="text-[10px] text-akari-muted bg-akari-cardSoft px-2 py-0.5 rounded-full">
                    {launch.status}
                  </span>
                )}
              </div>

              {/* Token Name + Symbol */}
              <h3 className="text-sm font-semibold mb-2 text-akari-text">
                {launch.name}
              </h3>
              <p className="text-xs text-akari-primary font-medium mb-3">
                ${launch.tokenSymbol}
              </p>

              {/* Taxonomy chips */}
              <div className="mb-3 flex flex-wrap gap-1.5 text-[10px]">
                {launch.category && (
                  <span className="px-2 py-0.5 rounded-full bg-akari-cardSoft text-akari-muted">
                    {launch.category}
                  </span>
                )}
                {launch.platformName && (
                  <span className="px-2 py-0.5 rounded-full bg-akari-primary/10 text-akari-primary">
                    {launch.platformName}
                  </span>
                )}
                {launch.listingPlatformName && (
                  <span className="px-2 py-0.5 rounded-full bg-akari-cardSoft text-akari-muted">
                    {launch.listingPlatformName}
                  </span>
                )}
                {launch.leadInvestorName && (
                  <span className="px-2 py-0.5 rounded-full bg-akari-cardSoft text-akari-muted">
                    {launch.leadInvestorName}
                  </span>
                )}
              </div>

              {/* Price Row */}
              <div className="mb-3 text-xs text-akari-muted">
                {salePrice && latestPrice ? (
                  <p>
                    Sale: <span className="text-akari-text">${salePrice.toFixed(4)}</span> • Now:{' '}
                    <span className="text-akari-text">${latestPrice.toFixed(4)}</span>
                  </p>
                ) : salePrice ? (
                  <p>
                    Sale: <span className="text-akari-text">${salePrice.toFixed(4)}</span>
                  </p>
                ) : latestPrice ? (
                  <p>
                    Current: <span className="text-akari-text">${latestPrice.toFixed(4)}</span>
                  </p>
                ) : (
                  <p className="text-akari-muted">Price data pending</p>
                )}
              </div>

              {/* ROI Badge */}
              <div className="flex items-center justify-between">
                {roiPercent !== null ? (
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      roiPercent > 0
                        ? 'bg-akari-profit/15 text-akari-profit'
                        : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {roiPercent > 0 ? '+' : ''}
                    {roiPercent.toFixed(1)}% ROI
                    {salePrice && latestPrice && (
                      <span className="ml-1 text-[10px]">
                        ({((latestPrice / salePrice).toFixed(2))}x)
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-xs text-akari-muted">Pending</span>
                )}
                <span className="text-xs text-akari-primary">View details →</span>
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
