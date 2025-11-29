/**
 * Admin Dashboard / Login Page
 * 
 * If not logged in: Shows login form
 * If logged in: Shows admin dashboard with links to all admin sections
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  isAdminLoggedIn,
  setAdminToken,
  clearAdminToken,
  adminFetch,
} from '../../lib/admin-client';

const ADMIN_SECTIONS = [
  {
    href: '/admin/treasury',
    label: 'Treasury',
    icon: '🏦',
    description: 'View pool balances and transfer MYST between pools',
    color: 'from-amber-600 to-amber-700',
  },
  {
    href: '/admin/myst',
    label: 'MYST Grant',
    icon: '💎',
    description: 'Grant MYST tokens to users manually',
    color: 'from-purple-600 to-purple-700',
  },
  {
    href: '/admin/wheel',
    label: 'Wheel Pool',
    icon: '🎡',
    description: 'Manage Wheel of Fortune prize pool',
    color: 'from-pink-600 to-pink-700',
  },
  {
    href: '/admin/withdrawals',
    label: 'Withdrawals',
    icon: '💸',
    description: 'Process user withdrawal requests',
    color: 'from-green-600 to-green-700',
  },
  {
    href: '/admin/campaigns',
    label: 'Campaigns',
    icon: '📋',
    description: 'Create and manage campaigns',
    color: 'from-blue-600 to-blue-700',
  },
  {
    href: '/admin/leaderboard',
    label: 'Analytics',
    icon: '📊',
    description: 'View leaderboard and export data',
    color: 'from-cyan-600 to-cyan-700',
  },
  {
    href: '/admin/campaign-requests',
    label: 'Campaign Requests',
    icon: '📝',
    description: 'Review community campaign submissions',
    color: 'from-orange-600 to-orange-700',
  },
  {
    href: '/admin/prediction-requests',
    label: 'Prediction Requests',
    icon: '🎯',
    description: 'Review community prediction submissions',
    color: 'from-red-600 to-red-700',
  },
];

export default function AdminIndexPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    // Check if already logged in
    const loggedIn = isAdminLoggedIn();
    setIsLoggedIn(loggedIn);
    setCheckingAuth(false);
  }, []);

  const handleLogin = async () => {
    if (!token.trim()) {
      setError('Please enter your admin token');
      return;
    }

    setLoading(true);
    setError(null);

    // Save token first
    setAdminToken(token.trim());

    try {
      // Test the token by making a simple API call
      const response = await adminFetch('/api/admin/treasury');
      
      if (response.ok) {
        setIsLoggedIn(true);
      } else if (response.status === 401 || response.status === 403) {
        clearAdminToken();
        setError('Invalid admin token. Please try again.');
      } else {
        // Some other error, but token might be valid
        setIsLoggedIn(true);
      }
    } catch (err) {
      // Network error - assume token is valid and let user proceed
      setIsLoggedIn(true);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearAdminToken();
    setIsLoggedIn(false);
    setToken('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  // Login Screen
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🔐</div>
            <h1 className="text-3xl font-bold mb-2">Admin Panel</h1>
            <p className="text-gray-400">Enter your admin token to continue</p>
          </div>

          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            {error && (
              <div className="bg-red-900/50 text-red-300 p-3 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Admin Token
                </label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter your admin token..."
                  className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-purple-500"
                  autoFocus
                />
              </div>

              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded-lg font-semibold transition-colors"
              >
                {loading ? 'Verifying...' : 'Login'}
              </button>
            </div>
          </div>

          <div className="text-center mt-6">
            <Link href="/" className="text-purple-400 hover:underline text-sm">
              ← Back to App
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Screen
  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <span>🔐</span> Admin Dashboard
            </h1>
            <p className="text-gray-400 mt-1">
              AKARI Mystic Club Administration
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
          >
            Logout
          </button>
        </div>

        {/* Admin Sections Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ADMIN_SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className={`bg-gradient-to-br ${section.color} rounded-xl p-5 border border-white/10 hover:scale-[1.02] transition-transform`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">{section.icon}</span>
                <h2 className="text-xl font-semibold">{section.label}</h2>
              </div>
              <p className="text-white/80 text-sm">{section.description}</p>
            </Link>
          ))}
        </div>

        {/* Quick Stats (placeholder) */}
        <div className="mt-8 bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/myst"
              className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-medium"
            >
              💎 Grant MYST to User
            </Link>
            <Link
              href="/admin/treasury"
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium"
            >
              🏦 View Treasury
            </Link>
            <Link
              href="/admin/withdrawals"
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium"
            >
              💸 Process Withdrawals
            </Link>
          </div>
        </div>

        {/* Back to App */}
        <div className="mt-8 text-center">
          <Link href="/" className="text-purple-400 hover:underline">
            ← Back to Mini App
          </Link>
        </div>
      </div>
    </div>
  );
}

