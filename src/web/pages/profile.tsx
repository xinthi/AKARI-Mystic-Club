/**
 * Profile Page
 * 
 * Shows user profile, stats, and allows editing
 */

import { useEffect, useState } from 'react';

interface User {
  id: string;
  username?: string;
  points: number;
  tier?: string;
  credibilityScore: string;
  positiveReviews: number;
  interests: string[];
  tonWallet?: string;
  evmWallet?: string;
  language?: string;
  recentBets?: Array<{
    id: string;
    predictionTitle: string;
    optionIndex: number;
    starsBet: number;
    pointsBet: number;
  }>;
}

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    tonWallet: '',
    evmWallet: '',
    language: 'en',
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const sdk = await import('@twa-dev/sdk');
        // @ts-ignore
        initData = (sdk as any).initData || '';
      }

      const response = await fetch('/api/profile', {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load profile');
      }

      const data = await response.json();
      setUser(data.user);
      setFormData({
        tonWallet: data.user.tonWallet || '',
        evmWallet: data.user.evmWallet || '',
        language: data.user.language || 'en',
      });
      setLoading(false);
    } catch (err: any) {
      console.error('Error loading profile:', err);
      setError(err.message || 'Failed to load profile');
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const sdk = await import('@twa-dev/sdk');
        // @ts-ignore
        initData = (sdk as any).initData || '';
      }

      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': initData,
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      alert('Profile updated!');
      setEditing(false);
      loadProfile();
    } catch (err: any) {
      console.error('Error updating profile:', err);
      alert(err.message || 'Failed to update profile');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading profile...</div>
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="text-xl mb-4">🔮</div>
          <div className="text-lg">{error || 'User not found'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white">
      <header className="p-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">👤 Profile</h1>
        <p className="text-purple-300">@{user.username || 'mystic'}</p>
      </header>

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

        {/* Wallets */}
        <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Wallets</h2>
            <button
              onClick={() => editing ? saveProfile() : setEditing(true)}
              className="text-sm text-purple-300 hover:text-white"
            >
              {editing ? 'Save' : 'Edit'}
            </button>
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-purple-300 mb-2">TON Wallet</label>
                <input
                  type="text"
                  value={formData.tonWallet}
                  onChange={(e) => setFormData({ ...formData, tonWallet: e.target.value })}
                  placeholder="Enter TON wallet address"
                  className="w-full bg-purple-800/50 border border-purple-500/30 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-400"
                />
              </div>
              <div>
                <label className="block text-sm text-purple-300 mb-2">EVM Wallet</label>
                <input
                  type="text"
                  value={formData.evmWallet}
                  onChange={(e) => setFormData({ ...formData, evmWallet: e.target.value })}
                  placeholder="Enter EVM wallet address"
                  className="w-full bg-purple-800/50 border border-purple-500/30 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <div className="text-sm text-purple-300 mb-1">TON</div>
                <div className="font-mono text-sm break-all">
                  {user.tonWallet || 'Not set'}
                </div>
              </div>
              <div>
                <div className="text-sm text-purple-300 mb-1">EVM</div>
                <div className="font-mono text-sm break-all">
                  {user.evmWallet || 'Not set'}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Interests */}
        {user.interests && user.interests.length > 0 && (
          <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20">
            <h2 className="text-lg font-semibold mb-4">Interests</h2>
            <div className="flex flex-wrap gap-2">
              {user.interests.map((interest) => (
                <span
                  key={interest}
                  className="px-3 py-1 bg-purple-600 rounded-full text-sm"
                >
                  {interest.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Recent Bets */}
        {user.recentBets && user.recentBets.length > 0 && (
          <div className="bg-purple-900/30 backdrop-blur-lg rounded-xl p-6 border border-purple-500/20">
            <h2 className="text-lg font-semibold mb-4">Recent Bets</h2>
            <div className="space-y-3">
              {user.recentBets.map((bet) => (
                <div key={bet.id} className="text-sm">
                  <div className="font-semibold">{bet.predictionTitle}</div>
                  <div className="text-purple-300">
                    {bet.starsBet > 0 ? `${bet.starsBet} ⭐` : `${bet.pointsBet} EP`}
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
