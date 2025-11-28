/**
 * Rewards Page (Legacy)
 * 
 * This page now redirects to the leaderboard since TON rewards have been removed.
 * Weekly recognition is shown on the leaderboard instead.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../lib/telegram-webapp';

export default function RewardsPage() {
  const router = useRouter();

  // Telegram BackButton
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.BackButton) return;

    tg.BackButton.show();
    const handleBack = () => router.push('/');
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-black to-purple-950 text-white">
      <div className="px-4 pt-5 pb-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">🌟 Weekly Recognition</h1>
          <p className="text-xs text-purple-300 mt-1">
            Top players are highlighted every Tuesday on the leaderboard.
          </p>
        </div>

        {/* Info Card */}
        <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 backdrop-blur-lg rounded-2xl p-6 border border-purple-500/20 mb-6">
          <div className="text-center">
            <div className="text-5xl mb-4">🏆</div>
            <h2 className="text-xl font-bold text-white mb-2">Weekly Recognition</h2>
            <p className="text-purple-200 text-sm mb-4">
              Every Tuesday, the top 10 players in each category are highlighted on the leaderboard.
              Keep playing to earn your spot!
            </p>
          </div>
        </div>

        {/* Categories */}
        <div className="space-y-3">
          <div className="bg-black/40 border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">🎯</div>
              <div>
                <div className="font-semibold text-white">Top Spenders</div>
                <div className="text-xs text-purple-300">Users who spend the most MYST on predictions</div>
              </div>
            </div>
          </div>

          <div className="bg-black/40 border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">👥</div>
              <div>
                <div className="font-semibold text-white">Top Referrers</div>
                <div className="text-xs text-purple-300">Users who earn the most referral rewards</div>
              </div>
            </div>
          </div>

          <div className="bg-black/40 border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="text-2xl">⚡</div>
              <div>
                <div className="font-semibold text-white">Top Experience</div>
                <div className="text-xs text-purple-300">Users with the highest experience points</div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-6">
          <button
            onClick={() => router.push('/leaderboard')}
            className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 rounded-xl font-semibold transition-all"
          >
            View Leaderboard
          </button>
        </div>

        {/* How to Earn */}
        <div className="mt-6 bg-black/40 border border-white/5 rounded-xl p-4">
          <h3 className="font-semibold text-white mb-3">How to Earn Recognition</h3>
          <ul className="space-y-2 text-sm text-purple-200">
            <li className="flex items-start gap-2">
              <span className="text-purple-400">•</span>
              Place bets on predictions to climb the spender leaderboard
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400">•</span>
              Invite friends using your referral link
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400">•</span>
              Complete campaign tasks to earn experience points
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-400">•</span>
              Spin the Wheel of Fortune daily for bonus MYST
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
