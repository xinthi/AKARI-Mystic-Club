/**
 * Page: /portal/arc/gamified/[projectId]
 * 
 * Option 3: Gamified Leaderboard (Minimal MVP)
 * Shows leaderboard and quests for active arena
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';

// =============================================================================
// TYPES
// =============================================================================

interface LeaderboardEntry {
  creator_profile_id: string;
  twitter_username: string;
  avatar_url: string | null;
  effective_points: number;
  rank: number;
  base_points: number;
  ring: 'core' | 'momentum' | 'discovery' | null;
}

interface Quest {
  id: string;
  arena_id: string;
  title: string;
  description: string | null;
  points_reward: number;
  status: 'active' | 'completed' | 'locked';
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function GamifiedLeaderboardPage() {
  const router = useRouter();
  const { projectId } = router.query;
  const akariUser = useAkariUser();
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [arenaName, setArenaName] = useState<string | null>(null);

  // Fetch leaderboard and quests
  useEffect(() => {
    async function fetchData() {
      if (!projectId || typeof projectId !== 'string') {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch leaderboard
        const leaderboardRes = await fetch(`/api/portal/arc/leaderboard/${projectId}`);
        const leaderboardData = await leaderboardRes.json();

        if (leaderboardRes.ok && leaderboardData.ok) {
          setLeaderboardEntries(leaderboardData.entries || []);
          setArenaName(leaderboardData.arenaName || null);
        } else {
          throw new Error(leaderboardData.error || 'Failed to load leaderboard');
        }

        // Fetch quests for active arena
        if (leaderboardData.arenaId) {
          const questsRes = await fetch(`/api/portal/arc/quests?arenaId=${leaderboardData.arenaId}`);
          const questsData = await questsRes.json();

          if (questsRes.ok && questsData.ok) {
            setQuests(questsData.quests || []);
          }
        }
      } catch (err: any) {
        console.error('[GamifiedLeaderboardPage] Error:', err);
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [projectId]);

  if (loading) {
    return (
      <PortalLayout title="Gamified Leaderboard">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-4" />
            <p className="text-akari-muted">Loading...</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  if (error) {
    return (
      <PortalLayout title="Gamified Leaderboard">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <Link
            href="/portal/arc"
            className="text-red-400 hover:text-red-300 text-sm underline"
          >
            Back to ARC Home
          </Link>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Gamified Leaderboard">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link href="/portal/arc" className="hover:text-akari-primary transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <span className="text-white/80">Gamified</span>
        </div>

        {/* Header */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <h1 className="text-3xl font-bold text-white mb-2">Gamified Leaderboard</h1>
          {arenaName && (
            <p className="text-white/60">Active Arena: {arenaName}</p>
          )}
        </div>

        {/* Leaderboard Section */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Leaderboard</h2>

          {leaderboardEntries.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-8 text-center">
              <div className="text-4xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-white mb-2">No creators yet</h3>
              <p className="text-white/60 text-sm">
                Creators will appear here once they join the arena.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl overflow-hidden shadow-[0_0_30px_rgba(0,246,162,0.1)]">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5">
                      <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-teal">Rank</th>
                      <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-teal">Creator</th>
                      <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Points</th>
                      <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Ring</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardEntries.map((entry) => (
                      <tr
                        key={entry.creator_profile_id}
                        className="border-b border-akari-neon-teal/10 last:border-0 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5"
                      >
                        <td className="py-4 px-5 text-akari-text font-semibold">
                          {entry.rank <= 3 ? (
                            <span className="text-lg">{['🥇', '🥈', '🥉'][entry.rank - 1]}</span>
                          ) : (
                            <span className="text-white/60">#{entry.rank}</span>
                          )}
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-3">
                            {entry.avatar_url && (
                              <img
                                src={entry.avatar_url}
                                alt={entry.twitter_username}
                                className="w-8 h-8 rounded-full border border-white/10 flex-shrink-0"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            )}
                            <div className="text-sm font-semibold text-white">
                              @{entry.twitter_username}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-akari-text font-semibold">
                          {entry.effective_points.toLocaleString()}
                        </td>
                        <td className="py-4 px-5">
                          {entry.ring ? (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              entry.ring === 'core' 
                                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                                : entry.ring === 'momentum'
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                                : 'bg-green-500/20 text-green-400 border border-green-500/50'
                            }`}>
                              {entry.ring}
                            </span>
                          ) : (
                            <span className="text-akari-muted/60 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Quests Section */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Quests</h2>

          {quests.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-black/20 p-8 text-center">
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="text-lg font-semibold text-white mb-2">No quests available</h3>
              <p className="text-white/60 text-sm">
                Quests will appear here when they are created for this arena.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {quests.map((quest) => (
                <div
                  key={quest.id}
                  className="rounded-lg border border-white/10 bg-black/20 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-white mb-1">{quest.title}</h3>
                      {quest.description && (
                        <p className="text-xs text-white/60 mb-2">{quest.description}</p>
                      )}
                      <div className="flex items-center gap-3">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/50">
                          +{quest.points_reward} points
                        </span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          quest.status === 'active'
                            ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                            : quest.status === 'completed'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                            : 'bg-gray-500/20 text-gray-400 border border-gray-500/50'
                        }`}>
                          {quest.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
