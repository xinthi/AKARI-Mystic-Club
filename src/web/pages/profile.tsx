/**
 * Profile Page
 *
 * Shows user profile, stats, X connection status, and allows editing
 */

import { useEffect, useState } from 'react';
import { getWebApp } from '../lib/telegram-webapp';

interface User {
  id: string;
  username?: string;
  points: number;
  tier?: string;
  credibilityScore: string;
  positiveReviews: number;
  xConnected?: boolean;
  xHandle?: string;
  recentBets?: Array<{
    id: string;
    predictionTitle: string;
    option: string;
    starsBet: number;
    pointsBet: number;
  }>;
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingX, setConnectingX] = useState(false);

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
      let initData = '';
      if (typeof window !== 'undefined') {
        const WebApp = getWebApp();
        if (WebApp) {
          // @ts-ignore - SDK types may vary
          initData = (WebApp as any).initData || '';
        }
      }

      const response = await fetch('/api/profile', {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to load profile');
      }

      const data = await response.json();
      if (data.user) {
        setUser(data.user);
      }
      setLoading(false);
      setError(null);
    } catch (err: any) {
      console.error('Error loading profile:', err);
      setError(err.message || 'Failed to load data');
      setLoading(false);
    }
  };

  const connectXAccount = async () => {
    setConnectingX(true);

    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const WebApp = getWebApp();
        if (WebApp) {
          // @ts-ignore - SDK types may vary
          initData = (WebApp as any).initData || '';
        }
      }

      // Open X OAuth in a new window/tab
      // The start endpoint will redirect to X
      const url = `/api/auth/x/start`;

      // For Telegram Mini App, we need to use window.open or location.href
      // Using window.open for better UX
      const authWindow = window.open(url, '_blank');

      // Check if window opened successfully
      if (!authWindow) {
        // Fallback to location.href if popup blocked
        window.location.href = url;
        return;
      }

      // Poll to check if auth completed (simple approach)
      const checkInterval = setInterval(() => {
        try {
          if (authWindow.closed) {
            clearInterval(checkInterval);
            setConnectingX(false);
            // Reload profile to get updated X connection status
            loadProfile();
          }
        } catch {
          // Cross-origin access, window still open
        }
      }, 1000);

      // Timeout after 5 minutes
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

  const showError = error && !user;

  if (showError) {
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

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      <header className="p-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">👤 Profile</h1>
        <p className="text-purple-300">@{user.username || 'mystic'}</p>
      </header>

      {error && (
        <div className="px-6 mb-4">
          <div className="bg-red-900/30 backdrop-blur-lg rounded-xl p-4 border border-red-500/20">
            <div className="text-sm text-red-200 mb-2">{error}</div>
            <button
              onClick={loadProfile}
              className="text-xs px-3 py-1 bg-red-600 rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="px-6 pb-6 space-y-6">
        {/* Stats Card */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <div className="text-xs text-purple-300 mb-1">Points</div>
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

        {/* X Account Connection */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20">
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
          <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20">
            <h2 className="text-lg font-semibold mb-4">Recent Bets</h2>
            <div className="space-y-3">
              {user.recentBets.map((bet) => (
                <div key={bet.id} className="text-sm border-b border-purple-500/10 pb-3 last:border-0 last:pb-0">
                  <div className="font-semibold mb-1">{bet.predictionTitle}</div>
                  <div className="flex justify-between text-purple-300">
                    <span>Choice: {bet.option}</span>
                    <span>
                      {bet.starsBet > 0 ? `${bet.starsBet} ⭐` : `${bet.pointsBet} EP`}
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
