/**
 * Admin Wheel Page
 * 
 * View and manage the Wheel of Fortune pool.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface WheelStats {
  poolBalance: number;
  totalSpins: number;
  totalWon: number;
  recentSpins: Array<{
    id: string;
    username?: string;
    amountWon: number;
    createdAt: string;
  }>;
}

export default function AdminWheelPage() {
  const [adminToken, setAdminToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  // Stats state
  const [stats, setStats] = useState<WheelStats | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Adjustment form
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  
  // UI state
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load token from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('adminToken');
    if (stored) {
      setAdminToken(stored);
      setIsAuthenticated(true);
    }
  }, []);

  const loadStats = useCallback(async () => {
    if (!adminToken) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/admin/wheel/stats', {
        headers: {
          'x-admin-token': adminToken,
        },
      });

      const data = await response.json();
      if (data.ok) {
        setStats(data);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to load stats' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    if (isAuthenticated) {
      loadStats();
    }
  }, [isAuthenticated, loadStats]);

  const handleLogin = () => {
    if (adminToken.trim()) {
      localStorage.setItem('adminToken', adminToken.trim());
      setIsAuthenticated(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setAdminToken('');
    setIsAuthenticated(false);
    setStats(null);
  };

  const handleAdjust = async () => {
    if (!adjustAmount) return;
    
    setAdjusting(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/wheel/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({
          amount: Number(adjustAmount),
        }),
      });

      const data = await response.json();

      if (data.ok) {
        setMessage({ type: 'success', text: `Pool adjusted. New balance: ${data.newBalance.toFixed(2)} MYST` });
        setAdjustAmount('');
        loadStats();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to adjust pool' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setAdjusting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-md mx-auto">
          <h1 className="text-2xl font-bold mb-6">Admin Login</h1>
          <div className="space-y-4">
            <input
              type="password"
              placeholder="Admin Token"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              className="w-full p-3 bg-gray-800 border border-gray-700 rounded-lg"
            />
            <button
              onClick={handleLogin}
              className="w-full p-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold"
            >
              Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Admin: Wheel of Fortune</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
          >
            Logout
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
            {message.text}
          </div>
        )}

        {/* Pool Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gradient-to-br from-amber-900/50 to-amber-800/30 rounded-xl p-6 border border-amber-500/30">
            <div className="text-sm text-amber-300 mb-1">Pool Balance</div>
            <div className="text-3xl font-bold text-amber-100">
              {loading ? '...' : (stats?.poolBalance ?? 0).toFixed(2)} MYST
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="text-sm text-gray-400 mb-1">Total Spins (All Time)</div>
            <div className="text-3xl font-bold">
              {loading ? '...' : stats?.totalSpins ?? 0}
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-xl p-6">
            <div className="text-sm text-gray-400 mb-1">Total Won (All Time)</div>
            <div className="text-3xl font-bold text-purple-400">
              {loading ? '...' : (stats?.totalWon ?? 0).toFixed(2)} MYST
            </div>
          </div>
        </div>

        {/* Adjust Pool */}
        <div className="bg-gray-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Adjust Pool Balance</h2>
          <div className="flex gap-4">
            <input
              type="number"
              step="0.1"
              placeholder="Amount (+ to add, - to remove)"
              value={adjustAmount}
              onChange={(e) => setAdjustAmount(e.target.value)}
              className="flex-1 p-3 bg-gray-700 border border-gray-600 rounded-lg"
            />
            <button
              onClick={handleAdjust}
              disabled={adjusting || !adjustAmount}
              className="px-6 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold"
            >
              {adjusting ? 'Adjusting...' : 'Adjust'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Use positive numbers to add MYST to the pool, negative to remove.
          </p>
        </div>

        {/* Recent Spins */}
        <div className="bg-gray-800 rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Recent Spins</h2>
            <button
              onClick={loadStats}
              disabled={loading}
              className="text-sm text-purple-400 hover:text-purple-300"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          
          {stats?.recentSpins && stats.recentSpins.length > 0 ? (
            <div className="space-y-2">
              {stats.recentSpins.map((spin) => (
                <div key={spin.id} className="flex justify-between items-center p-3 bg-gray-700/50 rounded-lg">
                  <div>
                    <span className="font-medium">{spin.username || 'Anonymous'}</span>
                    <span className="text-xs text-gray-400 ml-2">
                      {new Date(spin.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className={`font-semibold ${spin.amountWon > 0 ? 'text-amber-400' : 'text-gray-400'}`}>
                    {spin.amountWon > 0 ? `+${spin.amountWon}` : '0'} MYST
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 py-8">
              No spins yet
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="mt-8 text-center">
          <Link href="/admin/myst" className="text-purple-400 hover:underline mr-4">MYST Grant</Link>
          <Link href="/admin/campaigns" className="text-purple-400 hover:underline mr-4">Campaigns</Link>
          <Link href="/admin/campaign-requests" className="text-purple-400 hover:underline mr-4">Campaign Requests</Link>
          <Link href="/admin/prediction-requests" className="text-purple-400 hover:underline">Prediction Requests</Link>
        </div>
      </div>
    </div>
  );
}

