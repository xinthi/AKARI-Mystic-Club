/**
 * Leaderboard Page
 * 
 * Shows top users by points, tier, or campaign
 */

import { useEffect, useState } from 'react';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username?: string;
  tier?: string;
  points: number;
  credibilityScore?: number;
  positiveReviews?: number;
  completions?: number;
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<'points' | 'tier'>('points');

  useEffect(() => {
    loadLeaderboard();
  }, [type]);

  const loadLeaderboard = async () => {
    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const sdk = await import('@twa-dev/sdk');
        // @ts-ignore - SDK types may vary
        initData = (sdk as any).initData || '';
      }

      const url = type === 'tier' 
        ? '/api/leaderboard?type=tier&tier=Seeker'
        : '/api/leaderboard?type=points';

      const response = await fetch(url, {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load leaderboard');
      }

      const data = await response.json();
      setLeaderboard(data.leaderboard || []);
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading leaderboard:', err);
      setError(err.message || 'Failed to load leaderboard');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading leaderboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-xl mb-4">🔮</div>
          <div className="text-lg">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      <header className="p-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">🏆 Leaderboard</h1>
        <p className="text-purple-300">Top players in AKARI Mystic Club</p>
      </header>

      {/* Type Selector */}
      <div className="px-6 mb-4">
        <div className="flex gap-2">
          <button
            onClick={() => setType('points')}
            className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
              type === 'points'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-900/30 text-purple-300'
            }`}
          >
            Points
          </button>
          <button
            onClick={() => setType('tier')}
            className={`flex-1 py-2 rounded-lg font-semibold transition-colors ${
              type === 'tier'
                ? 'bg-purple-600 text-white'
                : 'bg-purple-900/30 text-purple-300'
            }`}
          >
            By Tier
          </button>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="px-6 pb-6">
        {leaderboard.length === 0 ? (
          <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-8 text-center border border-purple-500/20">
            <div className="text-4xl mb-4">🔮</div>
            <div className="text-lg mb-2">No rankings yet</div>
            <div className="text-sm text-purple-300">Be the first to earn points!</div>
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, index) => {
              const isTopThree = entry.rank <= 3;
              const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;

              return (
                <div
                  key={entry.userId}
                  className={`bg-purple-900/30 backdrop-blur-lg rounded-xl p-4 border ${
                    isTopThree
                      ? 'border-yellow-500/30 bg-yellow-900/10'
                      : 'border-purple-500/20'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-bold w-12 text-center">
                      {medal || `#${entry.rank}`}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold">
                        {entry.username || 'Anonymous'} {entry.tier && `(${entry.tier})`}
                      </div>
                      <div className="text-sm text-purple-300">
                        {entry.points.toLocaleString()} EP
                        {entry.credibilityScore && ` • ${entry.credibilityScore.toFixed(1)} cred`}
                        {entry.completions !== undefined && ` • ${entry.completions} tasks`}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
