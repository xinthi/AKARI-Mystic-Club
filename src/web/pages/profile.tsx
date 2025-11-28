/**
 * Profile Page
 *
 * Shows user profile, MYST balance, referral sharing, X connection, and stats
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../lib/telegram-webapp';

interface User {
  id: string;
  username?: string;
  firstName?: string;
  points: number;
  tier?: string;
  credibilityScore: string;
  positiveReviews: number;
  mystBalance?: number;
  referralCode?: string;
  referralLink?: string;
  referralCount?: number;
  xConnected?: boolean;
  xHandle?: string;
  recentBets?: Array<{
    id: string;
    predictionTitle: string;
    option: string;
    starsBet: number;
    pointsBet: number;
    mystBet?: number;
  }>;
}

type ProfileResponse =
  | { ok: true; user: User }
  | { ok: false; user: null; message: string };

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingX, setConnectingX] = useState(false);
  
  // Get MYST modal state
  const [showMystModal, setShowMystModal] = useState(false);
  const [claimingMyst, setClaimingMyst] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  
  // Toast state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Show toast helper
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Telegram BackButton - navigate to home
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.BackButton) return;

    tg.BackButton.show();
    tg.BackButton.onClick(() => {
      router.push('/');
    });

    return () => {
      try {
        tg.BackButton.hide();
        tg.BackButton.onClick(() => {});
      } catch (_) {
        // ignore
      }
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
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      // Get initData from Telegram WebApp
      let initData = '';
      if (typeof window !== 'undefined') {
        const tg = (window as any).Telegram?.WebApp;
        initData = tg?.initData || '';
      }

      const response = await fetch('/api/profile', {
        headers: {
          'x-telegram-init-data': initData,
          'Content-Type': 'application/json',
        },
      });

      const data: ProfileResponse = await response.json();

      if (data.ok && data.user) {
        setUser(data.user);
        setError(null);
      } else {
        setUser(null);
        setError(data.message || 'Failed to load profile');
      }

      setLoading(false);
    } catch (err: any) {
      console.error('[Profile] Error loading profile:', err);
      setError(err.message || 'Failed to load data');
      setUser(null);
      setLoading(false);
    }
  };

  // Claim demo MYST
  const claimDemoMyst = async () => {
    setClaimingMyst(true);
    setClaimMessage(null);

    try {
      const tg = (window as any).Telegram?.WebApp;
      const initData = tg?.initData || '';

      const response = await fetch('/api/myst/demo-credit', {
        method: 'POST',
        headers: {
          'x-telegram-init-data': initData,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.ok) {
        showToast(`You received ${data.mystGranted} MYST!`, 'success');
        setShowMystModal(false);
        // Refresh profile to update balance
        loadProfile();
      } else {
        setClaimMessage(data.message || 'Failed to claim MYST');
      }
    } catch (err: any) {
      console.error('[Profile] Error claiming MYST:', err);
      setClaimMessage('Failed to claim MYST. Please try again.');
    } finally {
      setClaimingMyst(false);
    }
  };

  // Copy referral link to clipboard
  const copyReferralLink = async () => {
    if (!user?.referralLink) return;

    try {
      await navigator.clipboard.writeText(user.referralLink);
      showToast('Referral link copied!', 'success');
    } catch (err) {
      console.error('[Profile] Failed to copy:', err);
      showToast('Failed to copy link', 'error');
    }
  };

  // Share referral link via Telegram
  const shareReferralLink = () => {
    if (!user?.referralLink) return;

    const text = `Join AKARI Mystic Club and earn MYST rewards! 🔮`;
    const tg = (window as any).Telegram?.WebApp;

    try {
      if (tg?.openTelegramLink) {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(user.referralLink)}&text=${encodeURIComponent(text)}`;
        tg.openTelegramLink(shareUrl);
      } else {
        // Fallback for non-Telegram browsers
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(user.referralLink)}&text=${encodeURIComponent(text)}`;
        window.open(shareUrl, '_blank');
      }
    } catch (err) {
      console.error('[Profile] Failed to share:', err);
      showToast('Failed to open share dialog', 'error');
    }
  };

  const connectXAccount = async () => {
    setConnectingX(true);

    try {
      const tg = (window as any).Telegram?.WebApp;
      const initData = tg?.initData || '';

      if (!initData) {
        alert('Please open this app from Telegram to connect your X account.');
        setConnectingX(false);
        return;
      }

      const encodedInitData = encodeURIComponent(initData);
      const url = `/api/auth/x/start?initData=${encodedInitData}`;
      const authWindow = window.open(url, '_blank');

      if (!authWindow) {
        window.location.href = url;
        return;
      }

      const checkInterval = setInterval(() => {
        try {
          if (authWindow.closed) {
            clearInterval(checkInterval);
            setConnectingX(false);
            loadProfile();
          }
        } catch {
          // Cross-origin access
        }
      }, 1000);

      setTimeout(() => {
        clearInterval(checkInterval);
        setConnectingX(false);
      }, 300000);
    } catch (err: any) {
      console.error('Error connecting X:', err);
      alert(err.message || 'Failed to connect X account');
      setConnectingX(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading profile...</div>
      </div>
    );
  }

  // Show error state when no user
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
        <header className="p-6 pb-4">
          <h1 className="text-3xl font-bold mb-2">👤 Profile</h1>
        </header>
        <div className="px-6 pb-6">
          <div className="bg-red-900/30 backdrop-blur-lg rounded-xl p-8 text-center border border-red-500/20">
            <div className="text-4xl mb-4">🔮</div>
            <div className="text-lg mb-2">{error || 'User not found'}</div>
            <div className="text-sm text-purple-300 mb-4">
              Please open this app from Telegram to view your profile
            </div>
            <button
              onClick={loadProfile}
              className="px-4 py-2 bg-purple-600 rounded-lg hover:bg-purple-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Get MYST Modal */}
      {showMystModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-purple-900/90 rounded-2xl p-6 max-w-sm w-full border border-purple-500/30">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">💎</div>
              <h3 className="text-xl font-bold">Get MYST</h3>
            </div>
            
            <p className="text-sm text-purple-200 mb-4 text-center">
              MYST is the in-game chip used for predictions, boosts, and rewards.
            </p>
            
            <div className="bg-purple-800/30 rounded-lg p-3 mb-4 text-xs text-purple-300 text-center">
              Demo mode: In the future, you will get MYST by spending Telegram Stars.
            </div>

            {claimMessage && (
              <div className="bg-amber-900/30 rounded-lg p-3 mb-4 text-sm text-amber-200 text-center">
                {claimMessage}
              </div>
            )}

            <button
              onClick={claimDemoMyst}
              disabled={claimingMyst}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:from-gray-600 disabled:to-gray-700 rounded-xl font-semibold transition-all mb-3"
            >
              {claimingMyst ? 'Claiming...' : 'Claim 10 MYST (Demo)'}
            </button>

            <button
              onClick={() => setShowMystModal(false)}
              className="w-full py-2 text-purple-300 hover:text-white text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <header className="p-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">👤 Profile</h1>
        <p className="text-purple-300">@{user.username || user.firstName || 'mystic'}</p>
      </header>

      <div className="px-6 pb-6 space-y-4">
        {/* MYST Balance Card */}
        <div className="bg-gradient-to-r from-amber-900/40 to-amber-800/30 backdrop-blur-lg rounded-xl p-5 border border-amber-500/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-amber-300 mb-1">MYST Balance</div>
              <div className="text-3xl font-bold text-amber-100">
                {(user.mystBalance ?? 0).toLocaleString()} <span className="text-lg">MYST</span>
              </div>
            </div>
            <button
              onClick={() => setShowMystModal(true)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg font-semibold text-sm transition-colors"
            >
              Get MYST
            </button>
          </div>
        </div>

        {/* Stats Card */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-purple-300 mb-1">Experience Points</div>
              <div className="text-2xl font-bold">{user.points.toLocaleString()} EP</div>
            </div>
            <div>
              <div className="text-xs text-purple-300 mb-1">Tier</div>
              <div className="text-xl font-semibold">{user.tier || 'None'}</div>
            </div>
            <div>
              <div className="text-xs text-purple-300 mb-1">Credibility</div>
              <div className="text-lg font-semibold">{user.credibilityScore}/10</div>
            </div>
            <div>
              <div className="text-xs text-purple-300 mb-1">Reviews</div>
              <div className="text-lg font-semibold">{user.positiveReviews} 🛡️</div>
            </div>
          </div>
        </div>

        {/* Referral Card */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">👥</span>
            <h2 className="text-lg font-semibold">Invite Friends</h2>
          </div>
          <p className="text-sm text-purple-300 mb-4">
            Earn MYST when your friends play on AKARI Mystic Club.
          </p>

          {/* Referral Link */}
          {user.referralLink && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="text"
                  readOnly
                  value={user.referralLink}
                  className="flex-1 bg-purple-800/30 border border-purple-500/30 rounded-lg px-3 py-2 text-xs text-purple-200 truncate"
                />
                <button
                  onClick={copyReferralLink}
                  className="p-2 bg-purple-700 hover:bg-purple-600 rounded-lg transition-colors"
                  title="Copy link"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>

              <button
                onClick={shareReferralLink}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                Share on Telegram
              </button>

              {(user.referralCount ?? 0) > 0 && (
                <div className="mt-3 text-center text-sm text-purple-300">
                  {user.referralCount} friend{user.referralCount === 1 ? '' : 's'} joined
                </div>
              )}
            </>
          )}
        </div>

        {/* X Account Connection */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
          <h2 className="text-lg font-semibold mb-4">Connected Accounts</h2>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </div>
              <div>
                <div className="font-semibold">X (Twitter)</div>
                {user.xConnected ? (
                  <div className="text-sm text-green-400">@{user.xHandle}</div>
                ) : (
                  <div className="text-sm text-purple-300">Not connected</div>
                )}
              </div>
            </div>

            {!user.xConnected && (
              <button
                onClick={connectXAccount}
                disabled={connectingX}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
              >
                {connectingX ? 'Connecting...' : 'Connect'}
              </button>
            )}

            {user.xConnected && (
              <span className="text-green-400 text-sm">✓ Connected</span>
            )}
          </div>
        </div>

        {/* Recent Bets */}
        {user.recentBets && user.recentBets.length > 0 && (
          <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-5 border border-purple-500/20">
            <h2 className="text-lg font-semibold mb-4">Recent Bets</h2>
            <div className="space-y-3">
              {user.recentBets.map((bet) => (
                <div key={bet.id} className="text-sm border-b border-purple-500/10 pb-3 last:border-0 last:pb-0">
                  <div className="font-semibold mb-1">{bet.predictionTitle}</div>
                  <div className="flex justify-between text-purple-300">
                    <span>Choice: {bet.option}</span>
                    <span>
                      {(bet.mystBet ?? 0) > 0 
                        ? `${bet.mystBet} MYST` 
                        : bet.starsBet > 0 
                          ? `${bet.starsBet} ⭐` 
                          : `${bet.pointsBet} EP`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
