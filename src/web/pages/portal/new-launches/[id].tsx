import React from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { PortalLayout } from '../../../components/portal/PortalLayout';
import { getLaunchByIdWithMetrics } from '@/lib/portal/db';
import { withDbRetry } from '@/lib/prisma';
import type { LaunchDetail } from '../../../pages/api/portal/new-launches/[id]';

interface Props {
  launch: LaunchDetail | null;
}

export default function LaunchDetailPage({ launch }: Props) {
  if (!launch) {
    return (
      <PortalLayout title="Launch Not Found">
        <div className="text-center py-12">
          <h1 className="text-xl font-semibold mb-4">Launch Not Found</h1>
          <Link
            href="/portal/new-launches"
            className="text-akari-primary hover:text-akari-accent text-sm"
          >
            ← Back to Launches
          </Link>
        </div>
      </PortalLayout>
    );
  }

  const roiPercent = launch.roiPercent;
  const salePrice = launch.salePriceUsd;
  const latestPrice = launch.latestPriceUsd;

  return (
    <PortalLayout title={launch.name}>
      {/* Header */}
      <section className="mb-6">
        <Link
          href="/portal/new-launches"
          className="text-akari-primary hover:text-akari-accent mb-4 inline-block text-sm"
        >
          ← Back to Launches
        </Link>
        <h1 className="text-2xl font-semibold mb-2">{launch.name}</h1>
        <p className="text-lg text-akari-primary font-medium">${launch.tokenSymbol}</p>
        {launch.tokenName && (
          <p className="text-sm text-akari-muted mt-1">{launch.tokenName}</p>
        )}
      </section>

      {/* Key Metrics Card */}
      <div className="rounded-2xl border border-akari-border bg-akari-card p-6 mb-6">
        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-akari-muted mb-1">Sale Price</p>
            <p className="text-lg font-semibold text-akari-text">
              {salePrice ? `$${salePrice.toFixed(4)}` : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-akari-muted mb-1">Current Price</p>
            <p className="text-lg font-semibold text-akari-text">
              {latestPrice ? `$${latestPrice.toFixed(4)}` : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-akari-muted mb-1">ROI</p>
            {roiPercent !== null ? (
              <p
                className={`text-lg font-semibold ${
                  roiPercent > 0 ? 'text-akari-profit' : 'text-red-400'
                }`}
              >
                {roiPercent > 0 ? '+' : ''}
                {roiPercent.toFixed(1)}%
              </p>
            ) : (
              <p className="text-lg font-semibold text-akari-muted">Pending</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Info Card */}
      <div className="rounded-2xl border border-akari-border bg-akari-card p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4 text-akari-primary uppercase tracking-[0.1em]">
          Basic Information
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2 text-sm">
            {launch.chain && (
              <p>
                <span className="text-akari-muted/70">Chain:</span>{' '}
                <span className="text-akari-text">{launch.chain}</span>
              </p>
            )}
            {launch.category && (
              <p>
                <span className="text-akari-muted/70">Category:</span>{' '}
                <span className="text-akari-text">{launch.category}</span>
              </p>
            )}
            {launch.status && (
              <p>
                <span className="text-akari-muted/70">Status:</span>{' '}
                <span className="text-akari-text">{launch.status}</span>
              </p>
            )}
            {launch.platformName ? (
              <p>
                <span className="text-akari-muted/70">Platform:</span>{' '}
                <span className="text-akari-text">{launch.platformName}</span>
              </p>
            ) : (
              <p>
                <span className="text-akari-muted/70">Platform:</span>{' '}
                <span className="text-akari-text">Direct / No Launchpad</span>
              </p>
            )}
          </div>

          <div className="space-y-2 text-sm">
            {launch.totalRaiseUsd && (
              <p>
                <span className="text-akari-muted/70">Total Raise:</span>{' '}
                <span className="text-akari-text">
                  ${launch.totalRaiseUsd.toLocaleString()} USD
                </span>
              </p>
            )}
            {launch.tokensForSale && (
              <p>
                <span className="text-akari-muted/70">Tokens for Sale:</span>{' '}
                <span className="text-akari-text">
                  {launch.tokensForSale.toLocaleString()}
                </span>
              </p>
            )}
            {launch.tokenAddress && (
              <p>
                <span className="text-akari-muted/70">Token Address:</span>{' '}
                <span className="text-akari-text font-mono text-xs break-all">
                  {launch.tokenAddress}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Airdrop Info */}
      {(launch.airdropPercent || launch.airdropValueUsd) && (
        <div className="rounded-2xl border border-akari-border bg-akari-card p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4 text-akari-accent uppercase tracking-[0.1em]">
            Airdrop Information
          </h2>
          <div className="space-y-2 text-sm">
            {launch.airdropPercent && (
              <p>
                <span className="text-akari-muted/70">Airdrop %:</span>{' '}
                <span className="text-akari-text">{launch.airdropPercent}%</span>
              </p>
            )}
            {launch.airdropValueUsd && (
              <p>
                <span className="text-akari-muted/70">Estimated Airdrop Value:</span>{' '}
                <span className="text-akari-text">
                  ${launch.airdropValueUsd.toLocaleString()} USD
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Vesting Info */}
      {launch.vestingInfo && (
        <div className="rounded-2xl border border-akari-border bg-akari-card p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4 text-akari-primary uppercase tracking-[0.1em]">
            Vesting Schedule
          </h2>
          <pre className="bg-akari-cardSoft p-4 rounded-lg text-xs overflow-x-auto text-akari-muted">
            {JSON.stringify(launch.vestingInfo, null, 2)}
          </pre>
        </div>
      )}

      {/* Price Tracking */}
      {launch.latestSnapshot && (
        <div className="rounded-2xl border border-akari-border bg-akari-card p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4 text-akari-profit uppercase tracking-[0.1em]">
            Price Tracking
          </h2>
          <div className="space-y-2 text-sm">
            {launch.latestSnapshot.volume24h && (
              <p>
                <span className="text-akari-muted/70">24h Volume:</span>{' '}
                <span className="text-akari-text">
                  ${launch.latestSnapshot.volume24h.toLocaleString()}
                </span>
              </p>
            )}
            {launch.latestSnapshot.liquidity && (
              <p>
                <span className="text-akari-muted/70">Liquidity:</span>{' '}
                <span className="text-akari-text">
                  ${launch.latestSnapshot.liquidity.toLocaleString()}
                </span>
              </p>
            )}
            <p>
              <span className="text-akari-muted/70">Source:</span>{' '}
              <span className="text-akari-text">{launch.latestSnapshot.source}</span>
            </p>
            <p className="text-akari-muted text-xs mt-2">
              Last updated: {new Date(launch.latestSnapshot.fetchedAt).toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { id } = context.params || {};

  if (!id || typeof id !== 'string') {
    return {
      props: {
        launch: null,
      },
    };
  }

  try {
    const launch = await withDbRetry(() => getLaunchByIdWithMetrics(id));

    if (!launch) {
      return { props: { launch: null } };
    }

    const detail: LaunchDetail = {
      id: launch.id,
      name: launch.name,
      tokenSymbol: launch.tokenSymbol,
      tokenName: launch.tokenName,
      platformName: launch.platform?.name || null,
      salePriceUsd: launch.salePriceUsd,
      latestPriceUsd: launch.latestSnapshot?.priceUsd || null,
      roiPercent: launch.roiPercent,
      chain: launch.chain,
      category: launch.category,
      status: launch.status,
      totalRaiseUsd: launch.totalRaiseUsd,
      tokensForSale: launch.tokensForSale,
      airdropPercent: launch.airdropPercent,
      airdropValueUsd: launch.airdropValueUsd,
      vestingInfo: launch.vestingInfo,
      tokenAddress: launch.tokenAddress,
      priceSource: launch.priceSource,
      latestSnapshot: launch.latestSnapshot
        ? {
            priceUsd: launch.latestSnapshot.priceUsd,
            volume24h: launch.latestSnapshot.volume24h,
            liquidity: launch.latestSnapshot.liquidity,
            source: launch.latestSnapshot.source,
            fetchedAt: launch.latestSnapshot.fetchedAt.toISOString(),
          }
        : null,
      createdAt: launch.createdAt.toISOString(),
      updatedAt: launch.updatedAt.toISOString(),
    };

    return {
      props: {
        launch: detail,
      },
    };
  } catch (error) {
    console.error('[Launch Detail] Error:', error);
    return {
      props: {
        launch: null,
      },
    };
  }
};
