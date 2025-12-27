/**
 * Page: /portal/arc/gamified/[projectId]
 * 
 * Quest Leaderboard
 * Shows leaderboard and quests for active arena
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';
import { getQuestCategory, getQuestCategoryInfo, calculateLevelFromScore } from '@/lib/arc-ui-helpers';

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
  name?: string; // Quest name (may correspond to mission_id)
  narrative_focus?: string | null;
}

interface RecentActivityItem {
  mission_id: string;
  completed_at: string;
  creator_username: string;
  proof_url: string | null;
}

type RankBadge = 'Bronze' | 'Silver' | 'Gold' | 'Legend';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Calculate level and XP from total points
 * Level = floor(points / 100), XP = points % 100
 */
function calculateLevelAndXP(points: number): { level: number; xp: number; xpForNextLevel: number } {
  const pointsPerLevel = 100;
  const level = Math.floor(points / pointsPerLevel);
  const xp = points % pointsPerLevel;
  return {
    level: Math.max(1, level), // Minimum level 1
    xp,
    xpForNextLevel: pointsPerLevel,
  };
}

/**
 * Calculate rank badge from total points
 */
function calculateRankBadge(points: number): RankBadge {
  if (points >= 10000) return 'Legend';
  if (points >= 2000) return 'Gold';
  if (points >= 500) return 'Silver';
  return 'Bronze';
}

/**
 * Get rank badge color
 */
function getRankBadgeColor(rank: RankBadge): string {
  switch (rank) {
    case 'Legend':
      return 'from-purple-500 to-pink-500';
    case 'Gold':
      return 'from-yellow-400 to-yellow-600';
    case 'Silver':
      return 'from-gray-300 to-gray-500';
    case 'Bronze':
      return 'from-orange-400 to-orange-600';
  }
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
  const [arenaId, setArenaId] = useState<string | null>(null);
  const [userEntry, setUserEntry] = useState<LeaderboardEntry | null>(null);
  const [userCompletions, setUserCompletions] = useState<Array<{ completed_at: string; mission_id?: string }>>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivityItem[]>([]);
  const [leaderboardView, setLeaderboardView] = useState<'score' | 'impact' | 'consistency'>('score');
  const [completingQuestId, setCompletingQuestId] = useState<string | null>(null);
  const [completionSuccess, setCompletionSuccess] = useState<string | null>(null);

  // Refetch completions and recent activity (defined early for useEffect dependency)
  const refetchCompletionsAndActivity = useCallback(async (arenaIdToUse?: string) => {
    const targetArenaId = arenaIdToUse || arenaId;
    if (!targetArenaId || !akariUser.isLoggedIn) {
      return;
    }

    try {
      // Fetch user completions
      const completionsRes = await fetch(
        `/api/portal/arc/quests/completions?arenaId=${encodeURIComponent(targetArenaId)}`,
        { credentials: 'include' }
      );
      if (completionsRes.ok) {
        const completionsData = await completionsRes.json();
        if (completionsData.ok) {
          setUserCompletions(completionsData.completions || []);
        }
      }

      // Fetch recent activity
      const activityRes = await fetch(
        `/api/portal/arc/quests/recent-activity?arenaId=${encodeURIComponent(targetArenaId)}`,
        { credentials: 'include' }
      );
      if (activityRes.ok) {
        const activityData = await activityRes.json();
        if (activityData.ok) {
          setRecentActivity(activityData.activities || []);
        }
      }

      // Also refetch leaderboard to update user's points/rank
      if (projectId && typeof projectId === 'string') {
        const gamifiedRes = await fetch(`/api/portal/arc/gamified/${projectId}`, {
          credentials: 'include',
        });
        const gamifiedData = await gamifiedRes.json();
        if (gamifiedRes.ok && gamifiedData.ok) {
          setLeaderboardEntries(gamifiedData.entries || []);
          if (akariUser.isLoggedIn && akariUser.user?.xUsername) {
            const userUsername = akariUser.user.xUsername.toLowerCase().replace('@', '');
            const userEntry = gamifiedData.entries?.find((e: LeaderboardEntry) =>
              e.twitter_username?.toLowerCase().replace('@', '') === userUsername
            );
            setUserEntry(userEntry || null);
          }
        }
      }
    } catch (err) {
      console.error('[GamifiedLeaderboardPage] Error refetching data:', err);
    }
  }, [arenaId, projectId, akariUser.isLoggedIn, akariUser.user?.xUsername]);

  // Fetch leaderboard, quests, user completions, and recent activity
  useEffect(() => {
    async function fetchData() {
      if (!projectId || typeof projectId !== 'string') {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch gamified data (leaderboard + quests)
        const gamifiedRes = await fetch(`/api/portal/arc/gamified/${projectId}`, {
          credentials: 'include',
        });
        const gamifiedData = await gamifiedRes.json();

        if (gamifiedRes.ok && gamifiedData.ok) {
          setLeaderboardEntries(gamifiedData.entries || []);
          setArenaName(gamifiedData.arena?.name || null);
          setArenaId(gamifiedData.arena?.id || null);
          // Map quests: API returns 'name' but component expects 'title'
          const mappedQuests = (gamifiedData.quests || []).map((q: any) => ({
            ...q,
            title: q.name || q.title || 'Untitled Quest',
            description: q.narrative_focus || q.description || null,
            points_reward: q.reward_desc ? parseInt(q.reward_desc) || 0 : 0,
            status: q.status === 'active' ? 'active' : q.status === 'completed' ? 'completed' : 'locked',
          }));
          setQuests(mappedQuests);

          // Find user's entry if logged in
          if (akariUser.isLoggedIn && akariUser.user?.xUsername) {
            const userUsername = akariUser.user.xUsername.toLowerCase().replace('@', '');
            const userEntry = gamifiedData.entries?.find((e: LeaderboardEntry) =>
              e.twitter_username?.toLowerCase().replace('@', '') === userUsername
            );
            setUserEntry(userEntry || null);
          }

          // Fetch user completions and recent activity
          if (gamifiedData.arena?.id && akariUser.isLoggedIn) {
            // Set arena ID first, then refetch will use it
            setArenaId(gamifiedData.arena.id);
          }
        } else {
          throw new Error(gamifiedData.error || 'Failed to load gamified leaderboard');
        }
      } catch (err: any) {
        console.error('[GamifiedLeaderboardPage] Error:', err);
        setError(err.message || 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [projectId, akariUser.isLoggedIn, akariUser.user?.xUsername, refetchCompletionsAndActivity]);

  // Fetch completions when arenaId is set
  useEffect(() => {
    if (arenaId && akariUser.isLoggedIn) {
      refetchCompletionsAndActivity(arenaId);
    }
  }, [arenaId, akariUser.isLoggedIn, refetchCompletionsAndActivity]);

  // Handle quest completion
  const handleCompleteQuest = async (missionId: string) => {
    if (!arenaId || !akariUser.isLoggedIn || completingQuestId) {
      return;
    }

    setCompletingQuestId(missionId);
    setCompletionSuccess(null);

    try {
      const res = await fetch('/api/portal/arc/quests/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          arenaId,
          missionId,
        }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        // Show success message
        setCompletionSuccess(`Quest completed! +${data.pointsAwarded || 0} points`);
        setTimeout(() => setCompletionSuccess(null), 3000);

        // Immediately refetch completions and activity to update recommended quest
        await refetchCompletionsAndActivity();
      } else {
        alert(data.error || 'Failed to complete quest');
      }
    } catch (err: any) {
      console.error('[GamifiedLeaderboardPage] Error completing quest:', err);
      alert(err.message || 'Failed to complete quest');
    } finally {
      setCompletingQuestId(null);
    }
  };

  if (loading) {
    return (
      <ArcPageShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/60 border-t-transparent mx-auto mb-4" />
            <p className="text-white/60">Loading...</p>
          </div>
        </div>
      </ArcPageShell>
    );
  }

  if (error) {
    return (
      <ArcPageShell>
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-6">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <Link
            href="/portal/arc"
            className="text-red-400 hover:text-red-300 text-sm underline"
          >
            Back to ARC Home
          </Link>
        </div>
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell>
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
          <h1 className="text-3xl font-bold text-white mb-2">Quest Leaderboard</h1>
          {arenaName && (
            <p className="text-white/60">Active Arena: {arenaName}</p>
          )}
        </div>

        {/* Completion Success Message */}
        {completionSuccess && (
          <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3 mb-4">
            <p className="text-sm text-green-400">{completionSuccess}</p>
          </div>
        )}

        {/* User Progression Card */}
        {(() => {
          const userProgression = userEntry
            ? {
                level: calculateLevelAndXP(userEntry.effective_points).level,
                xp: calculateLevelAndXP(userEntry.effective_points).xp,
                xpForNextLevel: calculateLevelAndXP(userEntry.effective_points).xpForNextLevel,
                rankBadge: calculateRankBadge(userEntry.effective_points),
              }
            : null;

          // Calculate streak (consecutive days with >=1 completion in current arena)
          const streak = (() => {
            if (!userCompletions.length || !arenaId) return 0;

            // Group completions by date (UTC date string)
            const completionsByDate = new Map<string, number>();
            userCompletions.forEach((c: { completed_at: string }) => {
              const dateStr = new Date(c.completed_at).toISOString().split('T')[0];
              completionsByDate.set(dateStr, (completionsByDate.get(dateStr) || 0) + 1);
            });

            // Calculate consecutive days from today backwards
            let streakCount = 0;
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);

            for (let i = 0; i < 365; i++) {
              const checkDate = new Date(today);
              checkDate.setUTCDate(checkDate.getUTCDate() - i);
              const dateStr = checkDate.toISOString().split('T')[0];

              if (completionsByDate.has(dateStr)) {
                streakCount++;
              } else {
                break; // Streak broken
              }
            }

            return streakCount;
          })();

          if (!userProgression) return null;

          return (
            <div className="rounded-xl border border-white/10 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Your Progress</h2>
                <div className={`px-4 py-2 rounded-lg bg-gradient-to-r ${getRankBadgeColor(userProgression.rankBadge)} text-white font-semibold text-sm`}>
                  {userProgression.rankBadge}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Level & XP */}
                <div className="bg-black/40 rounded-lg p-4 border border-white/10">
                  <div className="text-xs text-white/60 mb-2">Level</div>
                  <div className="text-2xl font-bold text-white mb-2">{userProgression.level}</div>
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-akari-neon-teal to-akari-neon-blue transition-all"
                      style={{
                        width: `${(userProgression.xp / userProgression.xpForNextLevel) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="text-xs text-white/60 mt-1">
                    {userProgression.xp} / {userProgression.xpForNextLevel} XP
                  </div>
                </div>

                {/* Total Points */}
                <div className="bg-black/40 rounded-lg p-4 border border-white/10">
                  <div className="text-xs text-white/60 mb-2">Total Points</div>
                  <div className="text-2xl font-bold text-white">{userEntry!.effective_points.toLocaleString()}</div>
                  <div className="text-xs text-white/60 mt-1">Rank #{userEntry!.rank}</div>
                </div>

                {/* Streak */}
                <div className="bg-black/40 rounded-lg p-4 border border-white/10">
                  <div className="text-xs text-white/60 mb-2">Streak</div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🔥</span>
                    <div className="text-2xl font-bold text-white">{streak}</div>
                  </div>
                  <div className="text-xs text-white/60 mt-1">consecutive days</div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Leaderboard Section */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Leaderboard</h2>
            
            {/* View Toggle Tabs */}
            <div className="flex gap-2 bg-white/5 border border-white/10 rounded-lg p-1">
              <button
                onClick={() => setLeaderboardView('score')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  leaderboardView === 'score'
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                Score
              </button>
              <button
                onClick={() => {}}
                disabled
                className="px-3 py-1.5 text-xs font-medium rounded-md text-white/40 cursor-not-allowed relative"
                title="Coming soon"
              >
                Impact
              </button>
              <button
                onClick={() => {}}
                disabled
                className="px-3 py-1.5 text-xs font-medium rounded-md text-white/40 cursor-not-allowed relative"
                title="Coming soon"
              >
                Consistency
              </button>
            </div>
          </div>

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
                      <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Score</th>
                      <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Level</th>
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
                              @{entry.twitter_username.replace(/^@+/, '')}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-5 text-akari-text font-semibold">
                          {entry.effective_points.toLocaleString()}
                        </td>
                        <td className="py-4 px-5">
                          {(() => {
                            const levelData = calculateLevelFromScore(entry.effective_points);
                            return (
                              <span className="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/50">
                                L{levelData.level}
                              </span>
                            );
                          })()}
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
          ) : (() => {
            // Map quest data: use name as mission_id for categorization
            // Known mission IDs from completion endpoint: intro-thread, meme-drop, signal-boost, deep-dive
            const knownMissionIdMap: Record<string, string> = {
              'intro-thread': 'intro-thread',
              'intro thread': 'intro-thread',
              'meme-drop': 'meme-drop',
              'meme drop': 'meme-drop',
              'signal-boost': 'signal-boost',
              'signal boost': 'signal-boost',
              'deep-dive': 'deep-dive',
              'deep dive': 'deep-dive',
            };
            
            const questsWithMissionId = quests.map(q => {
              // Try to match quest name/title to known mission IDs
              const questKey = (q.name || q.title || '').toLowerCase().trim();
              const matchedMissionId = knownMissionIdMap[questKey] || 
                                      knownMissionIdMap[q.title?.toLowerCase().trim() || ''] ||
                                      q.name || 
                                      null;
              
              return {
                ...q,
                mission_id: matchedMissionId || 'other',
              };
            });

            // Get user's completed mission IDs
            const completedMissionIds = new Set(
              userCompletions.map((c: any) => c.mission_id || c.missionId).filter(Boolean)
            );

            // Find recommended quest: first incomplete quest
            const recommendedQuest = questsWithMissionId.find(
              q => q.status === 'active' && !completedMissionIds.has(q.mission_id)
            );

            // Group quests by category
            const groupedQuests = new Map<string, typeof questsWithMissionId>();
            questsWithMissionId.forEach(quest => {
              const category = getQuestCategory(quest.mission_id);
              const categoryKey = category;
              if (!groupedQuests.has(categoryKey)) {
                groupedQuests.set(categoryKey, []);
              }
              groupedQuests.get(categoryKey)!.push(quest);
            });

            // Check if user has joined leaderboard
            const hasJoined = !!userEntry;

            return (
              <div className="space-y-6">
                {/* Recommended Quest */}
                {recommendedQuest && hasJoined && (
                  <div className="rounded-lg border-2 border-akari-neon-teal/50 bg-gradient-to-br from-akari-neon-teal/10 to-black/40 p-4 mb-6">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 text-2xl">⭐</div>
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-akari-neon-teal mb-1">
                          Recommended next quest
                        </h3>
                        <h4 className="text-base font-semibold text-white mb-1">
                          {recommendedQuest.title}
                        </h4>
                        {recommendedQuest.description && (
                          <p className="text-xs text-white/60 mb-2">{recommendedQuest.description}</p>
                        )}
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/50">
                            +{recommendedQuest.points_reward} points
                          </span>
                          <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/50">
                            active
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Show CTA if user not joined */}
                {!hasJoined && akariUser.isLoggedIn && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 mb-6">
                    <p className="text-sm text-yellow-400">
                      Join the leaderboard to see your quest progression and recommended quests.
                    </p>
                  </div>
                )}

                {/* Grouped Quests */}
                {Array.from(groupedQuests.entries()).map(([category, categoryQuests]) => {
                  const categoryInfo = getQuestCategoryInfo(category as 'Quick' | 'Signal' | 'Weekly Boss' | 'Other');
                  return (
                    <div key={category} className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{categoryInfo.icon}</span>
                        <h3 className={`text-sm font-semibold ${categoryInfo.color.split(' ')[2]}`}>
                          {categoryInfo.name}
                        </h3>
                      </div>
                      {categoryQuests.map((quest) => {
                        // Use mission_id from mapped quest (already computed above)
                        const questMissionId = quest.mission_id;
                        const isCompleted = completedMissionIds.has(questMissionId);
                        // Only allow completion if mission_id is in whitelist (not 'other')
                        const canComplete = quest.status === 'active' && !isCompleted && hasJoined && !completingQuestId && questMissionId !== 'other';

                        return (
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
                                    isCompleted || quest.status === 'completed'
                                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                                      : quest.status === 'active'
                                      ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                      : 'bg-gray-500/20 text-gray-400 border border-gray-500/50'
                                  }`}>
                                    {isCompleted ? 'completed' : quest.status}
                                  </span>
                                </div>
                              </div>
                              {canComplete && (
                                <button
                                  onClick={() => handleCompleteQuest(questMissionId)}
                                  disabled={completingQuestId === questMissionId}
                                  className="ml-4 px-3 py-1.5 text-xs font-medium bg-akari-neon-teal/20 text-akari-neon-teal border border-akari-neon-teal/50 rounded-lg hover:bg-akari-neon-teal/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {completingQuestId === questMissionId ? 'Completing...' : 'Complete'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>

        {/* Recent Activity Panel */}
        {arenaId && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Recent Activity</h2>

            {recentActivity.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-8 text-center">
                <div className="text-4xl mb-4">⚡</div>
                <h3 className="text-lg font-semibold text-white mb-2">No activity yet</h3>
                <p className="text-white/60 text-sm">
                  Quest completions will appear here as creators complete missions.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentActivity.map((activity, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg border border-white/10 bg-black/20 hover:bg-black/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-akari-neon-teal/20 flex items-center justify-center text-xs font-semibold text-akari-neon-teal">
                        ✓
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white">
                          @{(activity.creator_username || '').replace(/^@+/, '')}
                        </div>
                        <div className="text-xs text-white/60">
                          completed <span className="font-medium">{activity.mission_id}</span>
                        </div>
                      </div>
                      {activity.proof_url && (
                        <a
                          href={activity.proof_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 text-xs text-akari-neon-teal hover:text-akari-neon-blue transition-colors"
                        >
                          View Proof →
                        </a>
                      )}
                    </div>
                    <div className="text-xs text-white/40 ml-4">
                      {new Date(activity.completed_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </ArcPageShell>
  );
}
