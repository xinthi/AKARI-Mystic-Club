/**
 * Leaderboard Page
 * 
 * Shows top users by aXP (points), MYST spent, or referral earnings.
 * 
 * IMPORTANT: Shows "Reward Eligible" badges but NEVER shows future reward amounts.
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../lib/telegram-webapp';

interface LeaderboardEntry {
  rank: number;
  odIndex: string;
  username?: string;
  tier?: string;
  points: number;
  mystSpent?: number;
  referralEarnings?: number;
  credibilityScore?: number;
  positiveReviews?: number;
  completions?: number;
  rewardEligible?: boolean;
}

type LeaderboardType = 'points' | 'myst_spent' | 'referrals';
type Period = 'all' | 'week';

export default function LeaderboardPage() {
  const router = useRouter();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<LeaderboardType>('myst_spent');
  const [period, setPeriod] = useState<Period>('week');

  // Telegram BackButton - navigate to home
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.BackButton) return;

    let isNavigating = false;

    const handleBack = () => {
      if (isNavigating) return; // Prevent multiple navigations
      isNavigating = true;
      
      router.replace('/').catch((err) => {
        console.error('[Leaderboard] Navigation error:', err);
        isNavigating = false;
      });
    };

    tg.BackButton.show();
    tg.BackButton.onClick(handleBack);

    return () => {
      try {
        tg.BackButton.offClick(handleBack);
        tg.BackButton.hide();
      } catch (_) {}
    };
  }, [router]);

  useEffect(() => {
    const WebApp = getWebApp();
    if (WebApp) {
      try {
        WebApp.ready();
        WebApp.expand();
      } catch (e) {
        console.error('Telegram WebApp SDK not available', e);
      }
    }
  }, []);

  const loadLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      let initData = '';
      if (typeof window !== 'undefined') {
        const WebApp = getWebApp();
        if (WebApp) {
          initData = (WebApp as any).initData || '';
        }
      }

      const url = `/api/leaderboard?type=${type}&period=${period}`;

      const response = await fetch(url, {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to load leaderboard');
      }

      const data = await response.json();
      setLeaderboard(data.leaderboard || []);
      setLoading(false);
      setError(null);
    } catch (err: any) {
      console.error('Error loading leaderboard:', err);
      setLeaderboard([]);
      setError(err.message || 'Failed to load data');
      setLoading(false);
    }
  }, [type, period]);

  const getTypeLabel = (t: LeaderboardType): string => {
    switch (t) {
      case 'points':
        return 'aXP';
      case 'myst_spent':
        return 'MYST Spent';
      case 'referrals':
        return 'Referrals';
    }
  };

  const getValueDisplay = (entry: LeaderboardEntry): string => {
    switch (type) {
      case 'points':
        return `${entry.points.toLocaleString()} aXP`;
      case 'myst_spent':
        return `${(entry.mystSpent || 0).toFixed(2)} MYST`;
      case 'referrals':
        return `${(entry.referralEarnings || 0).toFixed(2)} MYST`;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-black to-purple-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          <div className="text-purple-200 text-sm">Loading leaderboard...</div>
        </div>
      </div>
    );
  }

  const showError = error && leaderboard.length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-black to-purple-950 text-white">
      <div className="px-4 pt-5 pb-6">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-white">🏆 Leaderboard</h1>
          <p className="text-xs text-purple-300 mt-1">
            🌟 Weekly Recognition - Top 10 players are highlighted every Tuesday.
          </p>
        </div>

        {/* Type Selector */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
          {(['myst_spent', 'referrals', 'points'] as LeaderboardType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap border transition-all ${
                type === t
                  ? 'bg-purple-500 text-white border-purple-400'
                  : 'bg-black/40 text-purple-200 border-white/5 hover:border-purple-500/30'
              }`}
            >
              {getTypeLabel(t)}
            </button>
          ))}
        </div>

        {/* Period Selector */}
        {(type === 'myst_spent' || type === 'referrals') && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setPeriod('week')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                period === 'week'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-900/30 text-purple-300'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setPeriod('all')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                period === 'all'
                  ? 'bg-purple-600 text-white'
                  : 'bg-purple-900/30 text-purple-300'
              }`}
            >
              All Time
            </button>
          </div>
        )}

        {/* Recognition Info Banner */}
        {period === 'week' && (type === 'myst_spent' || type === 'referrals') && (
          <div className="mb-4 bg-gradient-to-r from-purple-900/30 to-purple-800/20 border border-purple-500/20 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🌟</span>
              <div>
                <div className="text-xs font-medium text-purple-200">
                  Weekly Recognition
                </div>
                <div className="text-[10px] text-purple-300/70">
                  Top 10 players are highlighted every Tuesday. Keep playing to stay on top!
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {showError && (
          <div className="bg-red-900/30 rounded-xl p-4 border border-red-500/20 mb-4">
            <div className="text-sm text-red-200 mb-2">{error}</div>
            <button
              onClick={loadLeaderboard}
              className="text-xs px-3 py-1.5 bg-red-600 rounded-lg hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {leaderboard.length === 0 && !showError && (
          <div className="bg-black/40 border border-white/5 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-3">🔮</div>
            <div className="text-sm font-medium text-white mb-1">No rankings yet</div>
            <div className="text-xs text-purple-300">
              {type === 'myst_spent'
                ? 'Be the first to spend MYST on predictions!'
                : type === 'referrals'
                ? 'Invite friends to start earning referral rewards!'
                : 'Be the first to earn aXP!'}
            </div>
          </div>
        )}

        {/* Leaderboard List */}
        {leaderboard.length > 0 && (
          <div className="space-y-2">
            {leaderboard.map((entry) => {
              const isTopThree = entry.rank <= 3;
              const medal =
                entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;

              return (
                <div
                  key={entry.odIndex}
                  className={`bg-black/40 border rounded-xl p-3 ${
                    isTopThree
                      ? 'border-amber-500/30 bg-amber-900/10'
                      : 'border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank */}
                    <div className="text-xl font-bold w-10 text-center shrink-0">
                      {medal || `#${entry.rank}`}
                    </div>

                    {/* User Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">
                          {entry.username || 'Anonymous'}
                        </span>
                        {entry.tier && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded">
                            {entry.tier}
                          </span>
                        )}
                        {/* Reward Eligible Badge - NEVER shows amount */}
                        {entry.rewardEligible && period === 'week' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded-full">
                            Reward Eligible
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-purple-300 mt-0.5">
                        {getValueDisplay(entry)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Link to Rewards Page */}
        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/rewards')}
            className="text-sm text-purple-300 hover:text-white transition-colors"
          >
            View your rewards →
          </button>
        </div>
      </div>
    </div>
  );
}
