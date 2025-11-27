/**
 * Rewards Page
 * 
 * Shows user's current and past weekly TON rewards.
 * 
 * IMPORTANT UX RULES:
 * - Current rewards show ONLY the MYST burn amount, NOT the USD/TON value
 * - Past (paid) rewards can show the full amount
 * - Users burn MYST to unlock their TON reward
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../lib/telegram-webapp';

interface Reward {
  id: string;
  weekId: string;
  category: string;
  rank: number;
  status: 'pending_burn' | 'ready_for_payout' | 'paid';
  requiredMyst: number;
  burnedMyst: number;
  rewardUsd?: number;
  paidAt?: string;
}

interface RewardsData {
  mystBalance: number;
  currentRewards: Reward[];
  pastRewards: Reward[];
}

export default function RewardsPage() {
  const router = useRouter();
  const [data, setData] = useState<RewardsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [tonWallet, setTonWallet] = useState('');

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
    loadRewards();
  }, []);

  const loadRewards = async () => {
    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const WebApp = getWebApp();
        if (WebApp) {
          initData = (WebApp as any).initData || '';
        }
      }

      const response = await fetch('/api/rewards', {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          setError('Please open this app from Telegram');
          setLoading(false);
          return;
        }
        throw new Error('Failed to load rewards');
      }

      const result = await response.json();
      if (result.ok) {
        setData(result);
      } else {
        setError(result.reason || 'Failed to load rewards');
      }
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading rewards:', err);
      setError(err.message || 'Failed to load rewards');
      setLoading(false);
    }
  };

  const handleClaim = async (rewardId: string) => {
    try {
      setClaiming(rewardId);

      let initData = '';
      if (typeof window !== 'undefined') {
        const WebApp = getWebApp();
        if (WebApp) {
          initData = (WebApp as any).initData || '';
        }
      }

      const response = await fetch('/api/rewards/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
        body: JSON.stringify({
          rewardId,
          tonWallet: tonWallet || undefined,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        // Show success
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
          tg.showAlert(`Success! Burned ${result.burnedMyst.toFixed(2)} MYST. Your TON reward will be sent shortly.`);
        } else {
          alert(`Success! Burned ${result.burnedMyst.toFixed(2)} MYST.`);
        }
        // Reload rewards
        await loadRewards();
      } else {
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
          tg.showAlert(result.reason || 'Failed to claim reward');
        } else {
          alert(result.reason || 'Failed to claim reward');
        }
      }
    } catch (err: any) {
      console.error('Claim error:', err);
      alert(err.message || 'Failed to claim reward');
    } finally {
      setClaiming(null);
    }
  };

  const getCategoryLabel = (category: string): string => {
    switch (category) {
      case 'top_spender':
        return '🏆 Top Spender';
      case 'top_referrer':
        return '🤝 Top Referrer';
      case 'top_campaign':
        return '📋 Top Campaign';
      default:
        return category;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_burn':
        return (
          <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-300 rounded-full">
            Burn Required
          </span>
        );
      case 'ready_for_payout':
        return (
          <span className="px-2 py-0.5 text-[10px] font-medium bg-blue-500/20 text-blue-300 rounded-full">
            Processing
          </span>
        );
      case 'paid':
        return (
          <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-500/20 text-emerald-300 rounded-full">
            Paid ✓
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-black to-purple-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          <div className="text-purple-200 text-sm">Loading rewards...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-black to-purple-950 flex items-center justify-center p-4">
        <div className="bg-red-900/30 rounded-xl p-6 border border-red-500/20 text-center max-w-sm">
          <div className="text-3xl mb-3">⚠️</div>
          <div className="text-red-200 mb-4">{error}</div>
          <button
            onClick={loadRewards}
            className="px-4 py-2 bg-red-600 rounded-lg hover:bg-red-700 transition-colors text-white text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-black to-purple-950 text-white">
      <div className="px-4 pt-5 pb-6">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-white">Weekly Rewards</h1>
          <p className="text-xs text-purple-300 mt-1">
            Earn TON rewards by ranking on weekly leaderboards. Burn MYST to unlock your rewards.
          </p>
        </div>

        {/* MYST Balance */}
        <div className="mb-4 bg-black/40 border border-white/5 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-purple-300">Your MYST Balance</div>
              <div className="text-2xl font-bold text-white">
                {data?.mystBalance.toFixed(2) || '0.00'} <span className="text-purple-400">MYST</span>
              </div>
            </div>
            <div className="text-4xl">💎</div>
          </div>
        </div>

        {/* TON Wallet Input */}
        <div className="mb-4 bg-black/40 border border-white/5 rounded-2xl p-4">
          <label className="block text-xs text-purple-300 mb-2">Your TON Wallet (for payouts)</label>
          <input
            type="text"
            value={tonWallet}
            onChange={(e) => setTonWallet(e.target.value)}
            placeholder="EQ... or UQ..."
            className="w-full bg-purple-900/30 border border-purple-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-purple-400/50 focus:outline-none focus:border-purple-400"
          />
        </div>

        {/* Current Rewards */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-white mb-3">Current Rewards</h2>
          
          {data?.currentRewards.length === 0 ? (
            <div className="bg-black/40 border border-white/5 rounded-2xl p-6 text-center">
              <div className="text-3xl mb-2">🎯</div>
              <div className="text-sm text-purple-200">No pending rewards</div>
              <div className="text-xs text-purple-400 mt-1">
                Rank in the top 10 on weekly leaderboards to earn TON rewards!
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.currentRewards.map((reward) => (
                <div
                  key={reward.id}
                  className="bg-black/40 border border-white/5 rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-xs text-purple-400">{reward.weekId}</div>
                      <div className="text-sm font-medium text-white">
                        {getCategoryLabel(reward.category)}
                      </div>
                      <div className="text-xs text-purple-300">Rank #{reward.rank}</div>
                    </div>
                    {getStatusBadge(reward.status)}
                  </div>

                  {/* Burn info - NEVER show USD amount for unpaid rewards */}
                  <div className="bg-purple-900/30 rounded-xl p-3 mb-3">
                    <div className="text-xs text-purple-300 mb-1">
                      {reward.status === 'pending_burn'
                        ? 'Burn MYST to unlock your TON reward'
                        : 'Awaiting payout'}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white">
                        Required: <span className="font-bold">{reward.requiredMyst.toFixed(2)} MYST</span>
                      </span>
                      {reward.burnedMyst > 0 && (
                        <span className="text-xs text-emerald-300">
                          Burned: {reward.burnedMyst.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Claim button */}
                  {reward.status === 'pending_burn' && (
                    <button
                      onClick={() => handleClaim(reward.id)}
                      disabled={claiming === reward.id || (data?.mystBalance ?? 0) <= 0}
                      className="w-full bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 disabled:from-purple-800 disabled:to-purple-700 disabled:opacity-50 rounded-xl py-2.5 text-sm font-semibold transition-all"
                    >
                      {claiming === reward.id ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Burning...
                        </span>
                      ) : (
                        `Burn MYST & Unlock Reward`
                      )}
                    </button>
                  )}

                  {reward.status === 'ready_for_payout' && (
                    <div className="text-center text-xs text-purple-300">
                      Your TON reward is being processed and will be sent shortly.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Past Rewards */}
        <div>
          <h2 className="text-sm font-semibold text-white mb-3">Past Rewards</h2>
          
          {data?.pastRewards.length === 0 ? (
            <div className="bg-black/40 border border-white/5 rounded-2xl p-6 text-center">
              <div className="text-3xl mb-2">📜</div>
              <div className="text-sm text-purple-200">No past rewards</div>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.pastRewards.map((reward) => (
                <div
                  key={reward.id}
                  className="bg-black/40 border border-white/5 rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-xs text-purple-400">{reward.weekId}</div>
                      <div className="text-sm font-medium text-white">
                        {getCategoryLabel(reward.category)}
                      </div>
                      <div className="text-xs text-purple-300">Rank #{reward.rank}</div>
                    </div>
                    {getStatusBadge(reward.status)}
                  </div>

                  {/* For paid rewards, we CAN show the amount */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-purple-300">
                      Burned: {reward.burnedMyst.toFixed(2)} MYST
                    </span>
                    {reward.rewardUsd && (
                      <span className="text-emerald-300 font-medium">
                        +${reward.rewardUsd.toFixed(2)} in TON
                      </span>
                    )}
                  </div>
                  {reward.paidAt && (
                    <div className="text-[10px] text-purple-400 mt-1">
                      Paid: {new Date(reward.paidAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

