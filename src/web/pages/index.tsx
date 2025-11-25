/**
 * AKARI Mystic Club - Mini App Dashboard
 * 
 * Main entry point for the Telegram Mini App
 * Shows user stats, quick links, and active predictions/campaigns
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';

// Dynamically import Telegram SDK to avoid SSR issues
const TelegramWebApp = dynamic(() => import('@twa-dev/sdk'), { ssr: false });

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
    if (typeof window !== 'undefined') {
      TelegramWebApp.then((sdk) => {
        try {
          // @ts-ignore - SDK types may vary
          const initData = (sdk as any).initData;
          if (initData) {
            setInitData(initData);
            authenticateUser(initData);
          } else {
            setError('Telegram init data not available');
            setLoading(false);
          }
        } catch (err) {
          console.error('Telegram SDK error:', err);
          setError('Failed to initialize Telegram WebApp');
          setLoading(false);
        }
      });
    }
  }, []);

  const authenticateUser = async (initData: string) => {
    try {
      const response = await fetch('/api/auth/telegram', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ initData }),
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      const data = await response.json();
      setUser(data.user);
      setLoading(false);
    } catch (err: any) {
      console.error('Auth error:', err);
      setError(err.message || 'Authentication failed');
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

  if (error || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-xl mb-4">🔮</div>
          <div className="text-lg mb-2">Failed to load</div>
          <div className="text-sm text-purple-300">{error || 'User not found'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      {/* Header */}
      <header className="p-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">🔮 AKARI Mystic Club</h1>
        <p className="text-purple-300">Welcome back, {user.username || 'Mystic'}</p>
      </header>

      {/* User Stats Card */}
      <div className="px-6 mb-6">
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-2xl p-6 border border-purple-500/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm text-purple-300 mb-1">Your Points</div>
              <div className="text-3xl font-bold">{user.points.toLocaleString()} EP</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-purple-300 mb-1">Tier</div>
              <div className="text-xl font-semibold">{user.tier || 'None'}</div>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-purple-500/20">
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
            onClick={() => router.push('/campaigns')}
            className="bg-purple-600 hover:bg-purple-700 rounded-xl p-4 text-left transition-colors"
          >
            <div className="text-2xl mb-2">📋</div>
            <div className="font-semibold">Campaigns</div>
            <div className="text-sm text-purple-200">Tasks & Rewards</div>
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
