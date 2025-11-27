/**
 * AKARI Mystic Club - Mini App Dashboard
 * 
 * Main entry point for the Telegram Mini App
 * Shows user stats, quick links, and active predictions/campaigns
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../lib/telegram-webapp';

interface User {
  id: string;
  username?: string;
  points: number;
  tier?: string;
  credibilityScore: string;
  positiveReviews: number;
}

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [initData, setInitData] = useState<string | null>(null);

  useEffect(() => {
    // Initialize Telegram WebApp
    const WebApp = getWebApp();
    if (WebApp) {
      try {
        WebApp.ready();
        WebApp.expand();
        
        // @ts-ignore - SDK types may vary
        const initData = (WebApp as any).initData;
        if (initData) {
          setInitData(initData);
          authenticateUser(initData);
        } else {
          // Try to authenticate anyway - permissive mode
          console.warn('No initData from WebApp, attempting auth anyway');
          authenticateUser('');
        }
      } catch (err) {
        console.error('Telegram SDK error:', err);
        // Don't fail - try to authenticate anyway
        authenticateUser('');
      }
    } else {
      // Server-side - try to authenticate anyway
      console.warn('WebApp not available (server-side), attempting auth anyway');
      authenticateUser('');
    }
  }, []);

  const authenticateUser = async (initData: string) => {
    try {
      // Debug: log initData before sending
      console.log('[Dashboard] Sending initData to /api/auth/telegram:');
      console.log('[Dashboard]   - length:', initData?.length ?? 0);
      console.log('[Dashboard]   - preview:', initData ? initData.slice(0, 80) + '...' : '(empty)');

      const response = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ initData }),
      });

      // Treat any 200 response as success
      if (!response.ok) {
        console.error('Auth endpoint returned non-200:', response.status, response.statusText);
        // Still continue - permissive mode
        setLoading(false);
        return;
      }

      const data = await response.json();
      console.log('Auth response:', { ok: data.ok, hasUser: !!data.user, reason: data.reason });
      
      // Store user if available, but don't require it
      if (data.user) {
        // Map the response to our User interface
        setUser({
          id: String(data.user.id || ''),
          username: data.user.username,
          points: data.user.points || 0,
          tier: data.user.tier,
          credibilityScore: data.user.credibilityScore || '0',
          positiveReviews: data.user.positiveReviews || 0,
        });
      }
      
      setLoading(false);
    } catch (err: any) {
      console.error('Auth error:', err);
      // Don't show error - just continue loading
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  // Only show error if there's a critical error, not if user is missing
  if (error && (error.includes('critical') || error.includes('fatal'))) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-xl mb-4">🔮</div>
          <div className="text-lg mb-2">Failed to load</div>
          <div className="text-sm text-purple-300">{error}</div>
        </div>
      </div>
    );
  }

  // If no user, show a default state but still allow navigation
  const displayUser = user || {
    id: 'guest',
    username: 'Guest',
    points: 0,
    tier: undefined,
    credibilityScore: '0',
    positiveReviews: 0,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      {/* Header */}
      <header className="p-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">🔮 AKARI Mystic Club</h1>
        <p className="text-purple-300">Welcome back, {displayUser.username || 'Mystic'}</p>
      </header>

      {/* User Stats Card */}
      <div className="px-6 mb-6">
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-2xl p-6 border border-purple-500/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-purple-300 mb-1">Your Points</div>
              <div className="text-3xl font-bold">{displayUser.points.toLocaleString()} EP</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-purple-300 mb-1">Tier</div>
              <div className="text-xl font-semibold">{displayUser.tier || 'None'}</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-purple-500/20">
            <div>
              <div className="text-xs text-purple-300 mb-1">Credibility</div>
              <div className="text-lg font-semibold">{displayUser.credibilityScore}/10</div>
            </div>
            <div>
              <div className="text-xs text-purple-300 mb-1">Reviews</div>
              <div className="text-lg font-semibold">{displayUser.positiveReviews} 🛡️</div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => router.push('/predictions')}
            className="bg-purple-600 hover:bg-purple-700 rounded-xl p-4 text-left transition-colors"
          >
            <div className="text-2xl mb-2">🎲</div>
            <div className="font-semibold">Predictions</div>
            <div className="text-sm text-purple-200">Bet & Win</div>
          </button>

          <button
            onClick={() => router.push('/rewards')}
            className="bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 rounded-xl p-4 text-left transition-colors"
          >
            <div className="text-2xl mb-2">🎁</div>
            <div className="font-semibold">Rewards</div>
            <div className="text-sm text-amber-100">Weekly TON</div>
          </button>

          <button
            onClick={() => router.push('/leaderboard')}
            className="bg-purple-600 hover:bg-purple-700 rounded-xl p-4 text-left transition-colors"
          >
            <div className="text-2xl mb-2">🏆</div>
            <div className="font-semibold">Leaderboard</div>
            <div className="text-sm text-purple-200">Top Players</div>
          </button>

          <button
            onClick={() => router.push('/campaigns')}
            className="bg-purple-600 hover:bg-purple-700 rounded-xl p-4 text-left transition-colors"
          >
            <div className="text-2xl mb-2">📋</div>
            <div className="font-semibold">Campaigns</div>
            <div className="text-sm text-purple-200">Tasks & Rewards</div>
          </button>

          <button
            onClick={() => router.push('/profile')}
            className="bg-purple-600 hover:bg-purple-700 rounded-xl p-4 text-left transition-colors"
          >
            <div className="text-2xl mb-2">👤</div>
            <div className="font-semibold">Profile</div>
            <div className="text-sm text-purple-200">Your Stats</div>
          </button>
        </div>
      </div>

      {/* Recent Activity Preview */}
      <div className="px-6 pb-6">
        <h2 className="text-xl font-semibold mb-4">Active Predictions</h2>
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-4 border border-purple-500/20">
          <button
            onClick={() => router.push('/predictions')}
            className="w-full text-left text-purple-200 hover:text-white transition-colors"
          >
            View all predictions →
          </button>
        </div>
      </div>
    </div>
  );
}
