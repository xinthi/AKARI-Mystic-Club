/**
 * ARC Leaderboards Page
 * 
 * Modern leaderboard interface similar to KAITO/XREET but optimized for ARC theme
 * Shows global or project-specific creator leaderboards with time period filters
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import Image from 'next/image';

interface LeaderboardEntry {
  rank: number;
  twitter_username: string;
  avatar_url: string | null;
  arc_points: number;
  mindshare?: number;
  followers?: number;
  smart_followers?: number;
  ring: 'core' | 'momentum' | 'discovery' | null;
  style: string | null;
  project_name?: string;
  project_slug?: string;
}

type TimePeriod = '7D' | '30D' | '3M' | '6M' | '12M' | 'ALL';

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function formatPercentage(num: number): string {
  return num.toFixed(2) + '%';
}

function getRingColor(ring: string | null): string {
  switch (ring) {
    case 'core':
      return 'bg-purple-500';
    case 'momentum':
      return 'bg-yellow-400';
    case 'discovery':
      return 'bg-blue-400';
    default:
      return 'bg-gray-500';
  }
}

function getRingLabel(ring: string | null): string {
  switch (ring) {
    case 'core':
      return 'Core';
    case 'momentum':
      return 'Momentum';
    case 'discovery':
      return 'Discovery';
    default:
      return 'Unknown';
  }
}

function ComparisonBar({ 
  leftValue, 
  rightValue, 
  leftLabel, 
  rightLabel,
  leftColor = 'bg-blue-500',
  rightColor = 'bg-green-500'
}: {
  leftValue: number;
  rightValue: number;
  leftLabel: string;
  rightLabel: string;
  leftColor?: string;
  rightColor?: string;
}) {
  const total = leftValue + rightValue;
  const leftPercent = total > 0 ? (leftValue / total) * 100 : 50;
  const rightPercent = total > 0 ? (rightValue / total) * 100 : 50;

  return (
    <div className="w-full">
      <div className="flex h-6 rounded-lg overflow-hidden bg-black/20 border border-white/10">
        <div
          className={`${leftColor} flex items-center justify-start px-2 text-xs font-medium text-white`}
          style={{ width: `${leftPercent}%` }}
        >
          {leftPercent > 15 && leftLabel}
        </div>
        <div
          className={`${rightColor} flex items-center justify-end px-2 text-xs font-medium text-white`}
          style={{ width: `${rightPercent}%` }}
        >
          {rightPercent > 15 && rightLabel}
        </div>
      </div>
      <div className="flex justify-between text-[10px] text-akari-muted mt-1">
        <span>{leftLabel}: {leftValue}</span>
        <span>{rightLabel}: {rightValue}</span>
      </div>
    </div>
  );
}

export default function ArcLeaderboardsPage() {
  const router = useRouter();
  const { projectSlug } = router.query;
  
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('7D');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function loadLeaderboard() {
      setLoading(true);
      setError(null);

      try {
        // For now, we'll use a placeholder API endpoint
        // You'll need to create this endpoint to fetch leaderboard data
        const url = projectSlug 
          ? `/api/portal/arc/leaderboard/${projectSlug}?period=${timePeriod}`
          : `/api/portal/arc/leaderboards?period=${timePeriod}`;
        
        const res = await fetch(url, {
          credentials: 'include',
        });

        const data = await res.json();

        if (data.ok && data.entries) {
          // Map API response to our format
          const mappedEntries: LeaderboardEntry[] = data.entries.map((entry: any, index: number) => ({
            rank: index + 1,
            twitter_username: entry.twitter_username || '',
            avatar_url: entry.avatar_url || null,
            arc_points: entry.score || entry.arc_points || entry.base_points || 0,
            mindshare: entry.mindshare || undefined,
            followers: entry.followers || undefined,
            smart_followers: entry.smart_followers || undefined,
            ring: entry.ring || null,
            style: entry.style || null,
            project_name: entry.project_name || undefined,
            project_slug: entry.project_slug || undefined,
          }));

          setEntries(mappedEntries);
        } else {
          setError(data.error || 'Failed to load leaderboard');
        }
      } catch (err: any) {
        console.error('[ArcLeaderboardsPage] Error loading leaderboard:', err);
        setError(err.message || 'Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    }

    loadLeaderboard();
  }, [timePeriod, projectSlug]);

  const filteredEntries = entries.filter(entry => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      entry.twitter_username.toLowerCase().includes(query) ||
      entry.project_name?.toLowerCase().includes(query)
    );
  });

  const timePeriods: TimePeriod[] = ['7D', '30D', '3M', '6M', '12M', 'ALL'];

  return (
    <PortalLayout title="ARC Leaderboards">
      <div className="px-4 py-4 md:px-6 lg:px-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Creator Leaderboard</h1>
          <p className="text-sm text-akari-muted">
            {projectSlug ? 'Project-specific leaderboard' : 'Global ARC creator rankings'}
          </p>
        </div>

        {/* Filters and Search */}
        <div className="mb-6 space-y-4">
          {/* Time Period Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {timePeriods.map((period) => (
              <button
                key={period}
                onClick={() => setTimePeriod(period)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  timePeriod === period
                    ? 'bg-akari-neon-teal/20 text-akari-neon-teal border border-akari-neon-teal/50 shadow-[0_0_20px_rgba(0,246,162,0.2)]'
                    : 'bg-akari-card/60 text-akari-muted border border-akari-border hover:border-akari-neon-teal/30 hover:text-akari-text'
                }`}
              >
                {period}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search for user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-akari-card/60 border border-akari-border text-white placeholder-akari-muted focus:outline-none focus:ring-2 focus:ring-akari-neon-teal/50 focus:border-akari-neon-teal/50"
            />
            <svg
              className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-akari-muted"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-neon-teal border-t-transparent" />
            <span className="ml-3 text-akari-muted">Loading leaderboard...</span>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="rounded-xl border border-akari-danger/30 bg-akari-card/60 p-6 text-center">
            <p className="text-sm text-akari-danger">{error}</p>
          </div>
        )}

        {/* Leaderboard Table */}
        {!loading && !error && (
          <div className="rounded-2xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl overflow-hidden shadow-[0_0_30px_rgba(0,246,162,0.1)]">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-akari-neon-teal/20 bg-akari-card/40">
                    <th className="py-3 px-4 text-left text-xs font-semibold text-akari-muted uppercase tracking-wider">
                      #
                    </th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-akari-muted uppercase tracking-wider">
                      Name
                    </th>
                    {entries[0]?.mindshare !== undefined && (
                      <th className="py-3 px-4 text-left text-xs font-semibold text-akari-muted uppercase tracking-wider">
                        Mindshare
                      </th>
                    )}
                    {entries[0]?.smart_followers !== undefined && (
                      <th className="py-3 px-4 text-left text-xs font-semibold text-akari-muted uppercase tracking-wider">
                        Smart Followers
                      </th>
                    )}
                    {entries[0]?.followers !== undefined && (
                      <th className="py-3 px-4 text-left text-xs font-semibold text-akari-muted uppercase tracking-wider">
                        Followers
                      </th>
                    )}
                    <th className="py-3 px-4 text-left text-xs font-semibold text-akari-muted uppercase tracking-wider">
                      ARC Points
                    </th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-akari-muted uppercase tracking-wider">
                      Ring
                    </th>
                    {entries[0]?.ring && (
                      <>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-akari-muted uppercase tracking-wider">
                          Core vs Momentum
                        </th>
                        <th className="py-3 px-4 text-left text-xs font-semibold text-akari-muted uppercase tracking-wider">
                          Style Distribution
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-akari-muted">
                        No creators found
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((entry) => {
                      // Calculate ring distribution based on current ring
                      // In a real implementation, this would aggregate points by ring across all arenas
                      let corePoints = 0;
                      let momentumPoints = 0;
                      let discoveryPoints = 0;
                      
                      if (entry.ring === 'core') {
                        corePoints = entry.arc_points * 0.7;
                        momentumPoints = entry.arc_points * 0.15;
                        discoveryPoints = entry.arc_points * 0.15;
                      } else if (entry.ring === 'momentum') {
                        corePoints = entry.arc_points * 0.15;
                        momentumPoints = entry.arc_points * 0.7;
                        discoveryPoints = entry.arc_points * 0.15;
                      } else if (entry.ring === 'discovery') {
                        corePoints = entry.arc_points * 0.15;
                        momentumPoints = entry.arc_points * 0.15;
                        discoveryPoints = entry.arc_points * 0.7;
                      } else {
                        // Equal distribution if no ring
                        corePoints = entry.arc_points * 0.33;
                        momentumPoints = entry.arc_points * 0.33;
                        discoveryPoints = entry.arc_points * 0.34;
                      }

                      // Style distribution (simplified - in real implementation, parse style field)
                      // Assuming style might contain "creative", "curator", "hardcore", etc.
                      const isCreative = entry.style?.toLowerCase().includes('creative') || !entry.style;
                      const isCurator = entry.style?.toLowerCase().includes('curator');
                      const isHardcore = entry.style?.toLowerCase().includes('hardcore');
                      
                      const creativePoints = isCreative ? entry.arc_points * 0.5 : entry.arc_points * 0.25;
                      const curatorPoints = isCurator ? entry.arc_points * 0.5 : entry.arc_points * 0.25;
                      const hardcorePoints = isHardcore ? entry.arc_points * 0.5 : entry.arc_points * 0.25;

                      const isTopThree = entry.rank <= 3;
                      const rankBgColor = 
                        entry.rank === 1 ? 'bg-gradient-to-r from-yellow-500/20 to-yellow-400/10 border-yellow-400/50' :
                        entry.rank === 2 ? 'bg-gradient-to-r from-gray-400/20 to-gray-300/10 border-gray-300/50' :
                        entry.rank === 3 ? 'bg-gradient-to-r from-orange-500/20 to-orange-400/10 border-orange-400/50' :
                        'bg-akari-card/40 border-akari-border';

                      return (
                        <tr
                          key={entry.twitter_username}
                          className={`border-b border-akari-neon-teal/10 last:border-0 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 ${isTopThree ? rankBgColor : ''}`}
                        >
                          <td className="py-3 px-4 text-akari-muted text-sm font-medium">
                            {entry.rank}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {entry.avatar_url ? (
                                <Image
                                  src={entry.avatar_url}
                                  alt={entry.twitter_username}
                                  width={40}
                                  height={40}
                                  className="rounded-full border border-akari-neon-teal/30"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-akari-card border border-akari-border flex items-center justify-center">
                                  <span className="text-akari-muted text-xs">
                                    {entry.twitter_username.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                              )}
                              <div>
                                <div className="flex items-center gap-2">
                                  <Link
                                    href={`/portal/arc/creator/${encodeURIComponent(entry.twitter_username.replace('@', ''))}`}
                                    className="text-white font-medium hover:text-akari-neon-teal transition-colors"
                                  >
                                    @{entry.twitter_username.replace(/^@+/, '')}
                                  </Link>
                                  {entry.project_name && (
                                    <span className="text-xs text-akari-muted">
                                      {entry.project_name}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          {entry.mindshare !== undefined && (
                            <td className="py-3 px-4 text-akari-text text-sm">
                              {formatPercentage(entry.mindshare)}
                            </td>
                          )}
                          {entry.smart_followers !== undefined && (
                            <td className="py-3 px-4 text-akari-text text-sm">
                              {formatNumber(entry.smart_followers)}
                            </td>
                          )}
                          {entry.followers !== undefined && (
                            <td className="py-3 px-4 text-akari-text text-sm">
                              {formatNumber(entry.followers)}
                            </td>
                          )}
                          <td className="py-3 px-4">
                            <span className="text-akari-neon-teal font-semibold">
                              {formatNumber(entry.arc_points)}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {entry.ring && (
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  entry.ring === 'core'
                                    ? 'bg-purple-500/20 text-purple-400 border-purple-500/50'
                                    : entry.ring === 'momentum'
                                    ? 'bg-yellow-400/20 text-yellow-400 border-yellow-400/50'
                                    : 'bg-blue-400/20 text-blue-400 border-blue-400/50'
                                }`}
                              >
                                {getRingLabel(entry.ring)}
                              </span>
                            )}
                          </td>
                          {entry.ring && (
                            <>
                              <td className="py-3 px-4 min-w-[120px]">
                                <ComparisonBar
                                  leftValue={corePoints}
                                  rightValue={momentumPoints}
                                  leftLabel="Core"
                                  rightLabel="Momentum"
                                  leftColor="bg-purple-500"
                                  rightColor="bg-yellow-400"
                                />
                              </td>
                              <td className="py-3 px-4 min-w-[120px]">
                                <ComparisonBar
                                  leftValue={creativePoints}
                                  rightValue={curatorPoints}
                                  leftLabel="Creative"
                                  rightLabel="Curator"
                                  leftColor="bg-blue-500"
                                  rightColor="bg-purple-500"
                                />
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer Info */}
        {!loading && !error && filteredEntries.length > 0 && (
          <div className="mt-6 text-center text-xs text-akari-muted">
            Showing {filteredEntries.length} of {entries.length} creators
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

