/**
 * New Launches List Page
 */

import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { prisma } from '../../../lib/prisma';

interface NewLaunch {
  id: string;
  name: string;
  tokenSymbol: string;
  chain: string | null;
  category: string | null;
  status: string | null;
  salePriceUsd: number | null;
  totalRaiseUsd: number | null;
  platform: {
    name: string;
  } | null;
  priceSnapshots: Array<{
    priceUsd: number;
    fetchedAt: string;
  }>;
}

interface Props {
  launches: NewLaunch[];
  platforms: Array<{ id: string; name: string; slug: string }>;
}

export default function NewLaunchesPage({ launches: initialLaunches, platforms }: Props) {
  const [launches] = useState(initialLaunches);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [showWithPlatform, setShowWithPlatform] = useState<boolean | null>(null);

  // Filter launches
  const filteredLaunches = launches.filter((launch) => {
    if (selectedPlatform !== 'all' && launch.platform?.name !== selectedPlatform) {
      return false;
    }
    if (showWithPlatform === true && !launch.platform) {
      return false;
    }
    if (showWithPlatform === false && launch.platform) {
      return false;
    }
    return true;
  });

  return (
    <>
      <Head>
        <title>New Launches - Akari Mystic Club</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-cyan-900 to-slate-900 text-white">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-8">
            <Link href="/portal" className="text-cyan-400 hover:text-cyan-300 mb-4 inline-block">
              ← Back to Home
            </Link>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">🚀 New Launches</h1>
            <p className="text-gray-300">Community-curated database of new token launches</p>
          </div>

          {/* Filters */}
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg p-4 mb-8 border border-cyan-500/20">
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="block text-sm font-semibold mb-2">Platform</label>
                <select
                  value={selectedPlatform}
                  onChange={(e) => setSelectedPlatform(e.target.value)}
                  className="bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600"
                >
                  <option value="all">All Platforms</option>
                  {platforms.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-2">Type</label>
                <select
                  value={showWithPlatform === null ? 'all' : showWithPlatform ? 'with' : 'without'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setShowWithPlatform(val === 'all' ? null : val === 'with');
                  }}
                  className="bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-600"
                >
                  <option value="all">All Launches</option>
                  <option value="with">With Platform</option>
                  <option value="without">No Platform</option>
                </select>
              </div>
            </div>
          </div>

          {/* Launches Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {filteredLaunches.map((launch) => {
              const latestPrice = launch.priceSnapshots[0]?.priceUsd;
              const roi = launch.salePriceUsd && latestPrice
                ? ((latestPrice / launch.salePriceUsd) * 100).toFixed(1)
                : null;

              return (
                <Link
                  key={launch.id}
                  href={`/portal/new-launches/${launch.id}`}
                  className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-cyan-500/20 hover:border-cyan-500/40 transition-all"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-xl font-bold mb-1">{launch.name}</h3>
                      <p className="text-cyan-400 font-semibold">{launch.tokenSymbol}</p>
                    </div>
                    {launch.status && (
                      <span className="px-2 py-1 bg-cyan-900/50 text-cyan-300 text-xs rounded">
                        {launch.status}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 text-sm text-gray-300">
                    {launch.platform && (
                      <p>
                        <span className="text-gray-500">Platform:</span> {launch.platform.name}
                      </p>
                    )}
                    {launch.chain && (
                      <p>
                        <span className="text-gray-500">Chain:</span> {launch.chain}
                      </p>
                    )}
                    {launch.salePriceUsd && (
                      <p>
                        <span className="text-gray-500">Sale Price:</span> ${launch.salePriceUsd.toFixed(4)}
                      </p>
                    )}
                    {latestPrice && (
                      <p>
                        <span className="text-gray-500">Current Price:</span> ${latestPrice.toFixed(4)}
                      </p>
                    )}
                    {roi && (
                      <p className={parseFloat(roi) >= 100 ? 'text-green-400' : 'text-red-400'}>
                        <span className="text-gray-500">ROI:</span> {roi}%
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {filteredLaunches.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p>No launches found matching your filters.</p>
            </div>
          )}

          {/* Disclaimer */}
          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-6 mt-12">
            <p className="text-yellow-200 text-sm">
              <strong>Disclaimer:</strong> All launch data is community-contributed and may be incomplete or inaccurate.
              Nothing here is financial advice. Always do your own research.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

export async function getServerSideProps() {
  try {
    const launches = await prisma.newLaunch.findMany({
      include: {
        platform: {
          select: { name: true },
        },
        priceSnapshots: {
          orderBy: { fetchedAt: 'desc' },
          take: 1,
          select: {
            priceUsd: true,
            fetchedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const platforms = await prisma.launchPlatform.findMany({
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });

    return {
      props: {
        launches: JSON.parse(JSON.stringify(launches)),
        platforms,
      },
    };
  } catch (error) {
    console.error('[New Launches] Error:', error);
    return {
      props: {
        launches: [],
        platforms: [],
      },
    };
  }
}

