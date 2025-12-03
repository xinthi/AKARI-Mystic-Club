/**
 * New Launch Detail Page
 */

import Head from 'next/head';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';

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
      <>
        <Head>
          <title>Launch Not Found - Akari Mystic Club</title>
        </Head>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-cyan-900 to-slate-900 text-white flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">Launch Not Found</h1>
            <Link href="/portal/new-launches" className="text-cyan-400 hover:text-cyan-300">
              ← Back to Launches
            </Link>
          </div>
        </div>
      </>
    );
  }

  const latestSnapshot = launch.priceSnapshots[0];
  const roi = launch.salePriceUsd && latestSnapshot?.priceUsd
    ? ((latestSnapshot.priceUsd / launch.salePriceUsd) * 100).toFixed(1)
    : null;

  return (
    <>
      <Head>
        <title>{launch.name} - Akari Mystic Club</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-cyan-900 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          {/* Header */}
          <div className="mb-8">
            <Link href="/portal/new-launches" className="text-cyan-400 hover:text-cyan-300 mb-4 inline-block">
              ← Back to Launches
            </Link>
            <h1 className="text-4xl md:text-5xl font-bold mb-2">{launch.name}</h1>
            <p className="text-2xl text-cyan-400 font-semibold">{launch.tokenSymbol}</p>
            {launch.tokenName && <p className="text-gray-300 mt-1">{launch.tokenName}</p>}
          </div>

          {/* Main Info Card */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 mb-6 border border-cyan-500/20">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h2 className="text-xl font-bold mb-4">Basic Information</h2>
                <div className="space-y-2 text-sm">
                  {launch.chain && (
                    <p>
                      <span className="text-gray-500">Chain:</span> {launch.chain}
                    </p>
                  )}
                  {launch.category && (
                    <p>
                      <span className="text-gray-500">Category:</span> {launch.category}
                    </p>
                  )}
                  {launch.status && (
                    <p>
                      <span className="text-gray-500">Status:</span> {launch.status}
                    </p>
                  )}
                  {launch.platform ? (
                    <p>
                      <span className="text-gray-500">Platform:</span> {launch.platform.name}
                    </p>
                  ) : (
                    <p>
                      <span className="text-gray-500">Platform:</span> Direct / No Launchpad
                    </p>
                  )}
                </div>
              </div>

              <div>
                <h2 className="text-xl font-bold mb-4">Sale Parameters</h2>
                <div className="space-y-2 text-sm">
                  {launch.salePriceUsd && (
                    <p>
                      <span className="text-gray-500">Sale Price:</span> ${launch.salePriceUsd.toFixed(4)} USD
                    </p>
                  )}
                  {launch.tokensForSale && (
                    <p>
                      <span className="text-gray-500">Tokens for Sale:</span>{' '}
                      {launch.tokensForSale.toLocaleString()}
                    </p>
                  )}
                  {launch.totalRaiseUsd && (
                    <p>
                      <span className="text-gray-500">Total Raise:</span> ${launch.totalRaiseUsd.toLocaleString()} USD
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Airdrop Info */}
          {(launch.airdropPercent || launch.airdropValueUsd) && (
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 mb-6 border border-cyan-500/20">
              <h2 className="text-xl font-bold mb-4">Airdrop Information</h2>
              <div className="space-y-2 text-sm">
                {launch.airdropPercent && (
                  <p>
                    <span className="text-gray-500">Airdrop %:</span> {launch.airdropPercent}%
                  </p>
                )}
                {launch.airdropValueUsd && (
                  <p>
                    <span className="text-gray-500">Estimated Airdrop Value:</span> ${launch.airdropValueUsd.toLocaleString()} USD
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Vesting Info */}
          {launch.vestingInfo && (
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 mb-6 border border-cyan-500/20">
              <h2 className="text-xl font-bold mb-4">Vesting Schedule</h2>
              <pre className="bg-slate-900/50 p-4 rounded text-xs overflow-x-auto">
                {JSON.stringify(launch.vestingInfo, null, 2)}
              </pre>
            </div>
          )}

          {/* Price Tracking */}
          {latestSnapshot && (
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 mb-6 border border-cyan-500/20">
              <h2 className="text-xl font-bold mb-4">Price Tracking</h2>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-gray-500">Current Price:</span> ${latestSnapshot.priceUsd.toFixed(4)} USD
                </p>
                {latestSnapshot.volume24h && (
                  <p>
                    <span className="text-gray-500">24h Volume:</span> ${latestSnapshot.volume24h.toLocaleString()}
                  </p>
                )}
                {latestSnapshot.liquidity && (
                  <p>
                    <span className="text-gray-500">Liquidity:</span> ${latestSnapshot.liquidity.toLocaleString()}
                  </p>
                )}
                <p>
                  <span className="text-gray-500">Source:</span> {latestSnapshot.source}
                </p>
                {roi && (
                  <p className={parseFloat(roi) >= 100 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                    <span className="text-gray-500">ROI vs Sale Price:</span> {roi}%
                  </p>
                )}
                <p className="text-gray-500 text-xs mt-2">
                  Last updated: {new Date(latestSnapshot.fetchedAt).toLocaleString()}
                </p>
              </div>
            </div>
          )}

          {/* Edit Button (for L2/ADMIN - will be implemented with auth) */}
          {/* TODO: Add auth check and edit button */}
        </div>
      </div>
    </>
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

