/**
 * Find Users Page
 * 
 * Search for users, view their profiles, and leave reviews
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../../lib/telegram-webapp';

interface UserResult {
  id: string;
  username?: string;
  firstName?: string;
  credibilityScore: number;
  positiveReviews: number;
  negativeReviews: number;
}

export default function FindUsersPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [recentUsers, setRecentUsers] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const getInitData = (): string => {
    if (typeof window === 'undefined') return '';
    const tg = (window as any).Telegram?.WebApp;
    return tg?.initData || '';
  };

  // Telegram BackButton
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.BackButton) return;

    tg.BackButton.show();
    tg.BackButton.onClick(() => router.back());

    return () => {
      try {
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
      } catch (e) {}
    }
    
    // Load recent/active users on mount
    loadRecentUsers();
  }, [loadRecentUsers]);

  const loadRecentUsers = useCallback(async () => {
    try {
      const initData = getInitData();
      const response = await fetch('/api/users/recent', {
        headers: {
          'x-telegram-init-data': initData,
        },
      });
      const data = await response.json();
      if (data.ok && data.users) {
        setRecentUsers(data.users);
      }
    } catch (err) {
      console.error('Failed to load recent users:', err);
    }
  }, []);

  const searchUsers = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    setSearched(true);
    
    try {
      const initData = getInitData();
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(searchQuery.trim())}`, {
        headers: {
          'x-telegram-init-data': initData,
        },
      });
      const data = await response.json();
      if (data.ok && data.users) {
        setResults(data.users);
      } else {
        setResults([]);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      searchUsers();
    }
  };

  const inviteFriend = () => {
    const tg = (window as any).Telegram?.WebApp;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://play.akarimystic.club';
    const text = `Join me on AKARI Mystic Club! 🔮 Play predictions, earn MYST, and build your reputation.`;
    
    try {
      if (tg?.openTelegramLink) {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(text)}`;
        tg.openTelegramLink(shareUrl);
      } else {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(appUrl)}&text=${encodeURIComponent(text)}`;
        window.open(shareUrl, '_blank');
      }
    } catch (err) {
      console.error('Failed to open share:', err);
    }
  };

  const viewProfile = (userId: string) => {
    router.push(`/profile/${userId}`);
  };

  const renderUserCard = (user: UserResult) => (
    <button
      key={user.id}
      onClick={() => viewProfile(user.id)}
      className="w-full bg-purple-900/30 hover:bg-purple-800/40 rounded-xl p-4 border border-purple-500/20 transition-all text-left"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-700 rounded-full flex items-center justify-center text-lg">
            👤
          </div>
          <div>
            <div className="font-semibold text-white">
              {user.username ? `@${user.username}` : user.firstName || 'User'}
            </div>
            <div className="text-xs text-purple-300">
              Tap to view profile & review
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-lg font-bold ${
            user.credibilityScore > 0 ? 'text-green-400' :
            user.credibilityScore < 0 ? 'text-red-400' : 'text-gray-400'
          }`}>
            {user.credibilityScore > 0 ? '+' : ''}{user.credibilityScore}
          </div>
          <div className="text-xs text-gray-400">
            +{user.positiveReviews} / -{user.negativeReviews}
          </div>
        </div>
      </div>
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-black to-purple-900 text-white pb-6">
      {/* Header */}
      <header className="p-6 pb-4">
        <h1 className="text-2xl font-bold mb-2">👥 Find Users</h1>
        <p className="text-purple-300 text-sm">
          Search for users to view profiles and leave reviews
        </p>
      </header>

      <div className="px-6 space-y-4">
        {/* Search Box */}
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by username..."
            className="flex-1 bg-purple-800/30 border border-purple-500/30 rounded-xl px-4 py-3 text-white placeholder-purple-400 focus:outline-none focus:border-purple-400"
          />
          <button
            onClick={searchUsers}
            disabled={loading || !searchQuery.trim()}
            className="px-5 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:opacity-50 rounded-xl font-semibold transition-colors"
          >
            {loading ? '...' : '🔍'}
          </button>
        </div>

        {/* Search Results */}
        {searched && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">
              {results.length > 0 ? 'Search Results' : 'No Users Found'}
            </h2>
            
            {results.length > 0 ? (
              <div className="space-y-2">
                {results.map(renderUserCard)}
              </div>
            ) : (
              <div className="bg-purple-900/30 rounded-xl p-6 text-center border border-purple-500/20">
                <div className="text-4xl mb-3">🔮</div>
                <div className="text-purple-200 mb-4">
                  No user found with &quot;{searchQuery}&quot;
                </div>
                <button
                  onClick={inviteFriend}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition-colors"
                >
                  📨 Invite them to AKARI
                </button>
              </div>
            )}
          </div>
        )}

        {/* Recent/Active Users */}
        {!searched && (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Active Members</h2>
            
            {recentUsers.length > 0 ? (
              <div className="space-y-2">
                {recentUsers.map(renderUserCard)}
              </div>
            ) : (
              <div className="bg-purple-900/30 rounded-xl p-6 text-center border border-purple-500/20">
                <div className="text-gray-400">No active members to show</div>
              </div>
            )}
          </div>
        )}

        {/* Invite Section */}
        <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 rounded-xl p-5 border border-blue-500/30">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">📨</span>
            <div>
              <div className="font-semibold">Invite Friends</div>
              <div className="text-sm text-purple-300">
                Know someone who should join? Invite them!
              </div>
            </div>
          </div>
          <button
            onClick={inviteFriend}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-semibold transition-colors"
          >
            Share Invite Link
          </button>
        </div>

        {/* How Reviews Work */}
        <div className="bg-purple-900/30 rounded-xl p-5 border border-purple-500/20">
          <h3 className="font-semibold mb-3">📝 How Reviews Work</h3>
          <ul className="text-sm text-purple-200 space-y-2">
            <li>• Tap a user to view their profile</li>
            <li>• Click &quot;Leave a Review&quot; to rate them</li>
            <li>• Reviews affect their credibility score</li>
            <li>• High credibility = trustworthy member</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

