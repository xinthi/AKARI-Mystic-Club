/**
 * New Launches List Page
 */

import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { PortalLayout } from '../../../components/portal/PortalLayout';

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
    <PortalLayout>
      <Head>
        <title>New Launches - Akari Mystic Club</title>
      </Head>

      {/* Header */}
      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">🚀 New Launches</h2>
        <p className="text-sm text-akari-muted max-w-2xl">
          Community-curated database of new token launches, IDOs, and airdrops with real-time price tracking.
        </p>
      </section>

      {/* Filters */}
      <div className="rounded-2xl border border-akari-border bg-akari-card p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-xs text-akari-muted mb-2 font-medium">Platform</label>
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="bg-akari-cardSoft text-akari-text px-4 py-2 rounded-lg border border-akari-border text-sm"
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
            <label className="block text-xs text-akari-muted mb-2 font-medium">Type</label>
            <select
              value={showWithPlatform === null ? 'all' : showWithPlatform ? 'with' : 'without'}
              onChange={(e) => {
                const val = e.target.value;
                setShowWithPlatform(val === 'all' ? null : val === 'with');
              }}
              className="bg-akari-cardSoft text-akari-text px-4 py-2 rounded-lg border border-akari-border text-sm"
            >
              <option value="all">All Launches</option>
              <option value="with">With Platform</option>
              <option value="without">No Platform</option>
            </select>
          </div>
        </div>
      </div>

      {/* Launches Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {filteredLaunches.map((launch) => {
          const latestPrice = launch.priceSnapshots[0]?.priceUsd;
          const roi = launch.salePriceUsd && latestPrice
            ? ((latestPrice / launch.salePriceUsd) * 100).toFixed(1)
            : null;

          return (
            <Link
              key={launch.id}
              href={`/portal/new-launches/${launch.id}`}
              className="rounded-2xl border border-akari-border bg-akari-card p-4 hover:border-akari-primary/50 transition-all"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-sm font-semibold mb-1">{launch.name}</h3>
                  <p className="text-akari-primary text-xs font-medium">{launch.tokenSymbol}</p>
                </div>
                {launch.status && (
                  <span className="px-2 py-0.5 bg-akari-cardSoft text-akari-muted text-[10px] rounded-full">
                    {launch.status}
                  </span>
                )}
              </div>

              <div className="space-y-1.5 text-xs text-akari-muted">
                {launch.platform && (
                  <p>
                    <span className="text-akari-muted/70">Platform:</span> {launch.platform.name}
                  </p>
                )}
                {launch.chain && (
                  <p>
                    <span className="text-akari-muted/70">Chain:</span> {launch.chain}
                  </p>
                )}
                {launch.salePriceUsd && (
                  <p>
                    <span className="text-akari-muted/70">Sale:</span> ${launch.salePriceUsd.toFixed(4)}
                  </p>
                )}
                {latestPrice && (
                  <p>
                    <span className="text-akari-muted/70">Current:</span> ${latestPrice.toFixed(4)}
                  </p>
                )}
                {roi && (
                  <p className={parseFloat(roi) >= 100 ? 'text-akari-profit' : 'text-akari-danger'}>
                    <span className="text-akari-muted/70">ROI:</span> {roi}%
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {filteredLaunches.length === 0 && (
        <div className="text-center py-12 text-akari-muted">
          <p className="text-sm">No launches found matching your filters.</p>
        </div>
      )}

      {/* Disclaimer */}
      <div className="rounded-2xl border border-akari-profit/30 bg-akari-cardSoft p-4 mt-8">
        <p className="text-xs text-akari-muted">
          <strong className="text-akari-profit">Disclaimer:</strong> All launch data is community-contributed and may be incomplete or inaccurate.
          Nothing here is financial advice. Always do your own research.
        </p>
      </div>
    </PortalLayout>
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

