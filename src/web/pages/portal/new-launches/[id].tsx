/**
 * New Launch Detail Page
 */

import Head from 'next/head';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PortalLayout } from '../../../components/portal/PortalLayout';

interface NewLaunch {
  id: string;
  name: string;
  tokenSymbol: string;
  tokenName: string | null;
  chain: string | null;
  category: string | null;
  status: string | null;
  salePriceUsd: number | null;
  tokensForSale: number | null;
  totalRaiseUsd: number | null;
  airdropPercent: number | null;
  airdropValueUsd: number | null;
  vestingInfo: any;
  tokenAddress: string | null;
  priceSource: string | null;
  platform: {
    id: string;
    name: string;
    slug: string;
  } | null;
  priceSnapshots: Array<{
    priceUsd: number;
    volume24h: number | null;
    liquidity: number | null;
    source: string;
    fetchedAt: string;
  }>;
}

interface Props {
  launch: NewLaunch | null;
}

export default function LaunchDetailPage({ launch }: Props) {
  if (!launch) {
    return (
      <PortalLayout>
        <Head>
          <title>Launch Not Found - Akari Mystic Club</title>
        </Head>
        <div className="text-center py-12">
          <h1 className="text-xl font-semibold mb-4">Launch Not Found</h1>
          <Link href="/portal/new-launches" className="text-akari-primary hover:text-akari-accent text-sm">
            ← Back to Launches
          </Link>
        </div>
      </PortalLayout>
    );
  }

  const latestSnapshot = launch.priceSnapshots[0];
  const roi = launch.salePriceUsd && latestSnapshot?.priceUsd
    ? ((latestSnapshot.priceUsd / launch.salePriceUsd) * 100).toFixed(1)
    : null;

  return (
    <PortalLayout>
      <Head>
        <title>{launch.name} - Akari Mystic Club</title>
      </Head>

      {/* Header */}
      <section className="mb-6">
        <Link href="/portal/new-launches" className="text-akari-primary hover:text-akari-accent mb-4 inline-block text-sm">
          ← Back to Launches
        </Link>
        <h1 className="text-2xl font-semibold mb-2">{launch.name}</h1>
        <p className="text-lg text-akari-primary font-medium">{launch.tokenSymbol}</p>
        {launch.tokenName && <p className="text-sm text-akari-muted mt-1">{launch.tokenName}</p>}
      </section>

      {/* Main Info Card */}
      <div className="rounded-2xl border border-akari-border bg-akari-card p-6 mb-6">
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold mb-4 text-akari-primary uppercase tracking-[0.1em]">Basic Information</h2>
            <div className="space-y-2 text-sm">
              {launch.chain && (
                <p>
                  <span className="text-akari-muted/70">Chain:</span> <span className="text-akari-text">{launch.chain}</span>
                </p>
              )}
              {launch.category && (
                <p>
                  <span className="text-akari-muted/70">Category:</span> <span className="text-akari-text">{launch.category}</span>
                </p>
              )}
              {launch.status && (
                <p>
                  <span className="text-akari-muted/70">Status:</span> <span className="text-akari-text">{launch.status}</span>
                </p>
              )}
              {launch.platform ? (
                <p>
                  <span className="text-akari-muted/70">Platform:</span> <span className="text-akari-text">{launch.platform.name}</span>
                </p>
              ) : (
                <p>
                  <span className="text-akari-muted/70">Platform:</span> <span className="text-akari-text">Direct / No Launchpad</span>
                </p>
              )}
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold mb-4 text-akari-primary uppercase tracking-[0.1em]">Sale Parameters</h2>
            <div className="space-y-2 text-sm">
              {launch.salePriceUsd && (
                <p>
                  <span className="text-akari-muted/70">Sale Price:</span> <span className="text-akari-text">${launch.salePriceUsd.toFixed(4)} USD</span>
                </p>
              )}
              {launch.tokensForSale && (
                <p>
                  <span className="text-akari-muted/70">Tokens for Sale:</span>{' '}
                  <span className="text-akari-text">{launch.tokensForSale.toLocaleString()}</span>
                </p>
              )}
              {launch.totalRaiseUsd && (
                <p>
                  <span className="text-akari-muted/70">Total Raise:</span> <span className="text-akari-text">${launch.totalRaiseUsd.toLocaleString()} USD</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Airdrop Info */}
      {(launch.airdropPercent || launch.airdropValueUsd) && (
        <div className="rounded-2xl border border-akari-border bg-akari-card p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4 text-akari-accent uppercase tracking-[0.1em]">Airdrop Information</h2>
          <div className="space-y-2 text-sm">
            {launch.airdropPercent && (
              <p>
                <span className="text-akari-muted/70">Airdrop %:</span> <span className="text-akari-text">{launch.airdropPercent}%</span>
              </p>
            )}
            {launch.airdropValueUsd && (
              <p>
                <span className="text-akari-muted/70">Estimated Airdrop Value:</span> <span className="text-akari-text">${launch.airdropValueUsd.toLocaleString()} USD</span>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Vesting Info */}
      {launch.vestingInfo && (
        <div className="rounded-2xl border border-akari-border bg-akari-card p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4 text-akari-primary uppercase tracking-[0.1em]">Vesting Schedule</h2>
          <pre className="bg-akari-cardSoft p-4 rounded-lg text-xs overflow-x-auto text-akari-muted">
            {JSON.stringify(launch.vestingInfo, null, 2)}
          </pre>
        </div>
      )}

      {/* Price Tracking */}
      {latestSnapshot && (
        <div className="rounded-2xl border border-akari-border bg-akari-card p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4 text-akari-profit uppercase tracking-[0.1em]">Price Tracking</h2>
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-akari-muted/70">Current Price:</span> <span className="text-akari-text">${latestSnapshot.priceUsd.toFixed(4)} USD</span>
            </p>
            {latestSnapshot.volume24h && (
              <p>
                <span className="text-akari-muted/70">24h Volume:</span> <span className="text-akari-text">${latestSnapshot.volume24h.toLocaleString()}</span>
              </p>
            )}
            {latestSnapshot.liquidity && (
              <p>
                <span className="text-akari-muted/70">Liquidity:</span> <span className="text-akari-text">${latestSnapshot.liquidity.toLocaleString()}</span>
              </p>
            )}
            <p>
              <span className="text-akari-muted/70">Source:</span> <span className="text-akari-text">{latestSnapshot.source}</span>
            </p>
            {roi && (
              <p className={parseFloat(roi) >= 100 ? 'text-akari-profit font-semibold' : 'text-akari-danger font-semibold'}>
                <span className="text-akari-muted/70">ROI vs Sale Price:</span> {roi}%
              </p>
            )}
            <p className="text-akari-muted text-xs mt-2">
              Last updated: {new Date(latestSnapshot.fetchedAt).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Edit Button (for L2/ADMIN - will be implemented with auth) */}
      {/* TODO: Add auth check and edit button */}
    </PortalLayout>
  );
}

export async function getServerSideProps({ params }: { params: { id: string } }) {
  try {
    const launch = await prisma.newLaunch.findUnique({
      where: { id: params.id },
      include: {
        platform: {
          select: { id: true, name: true, slug: true },
        },
        priceSnapshots: {
          orderBy: { fetchedAt: 'desc' },
          take: 1,
        },
      },
    });

    return {
      props: {
        launch: launch ? JSON.parse(JSON.stringify(launch)) : null,
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
}

