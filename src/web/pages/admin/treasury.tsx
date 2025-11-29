/**
 * Admin Treasury Page
 * 
 * View all pool balances and transfer MYST between pools.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface PoolInfo {
  id: string;
  name: string;
  balance: number;
  description: string;
}

export default function AdminTreasuryPage() {
  const [adminToken, setAdminToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pools, setPools] = useState<PoolInfo[]>([]);
  const [totalMyst, setTotalMyst] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Transfer form state
  const [fromPool, setFromPool] = useState('');
  const [toPool, setToPool] = useState('');
  const [amount, setAmount] = useState('');
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('adminToken');
    if (stored) {
      setAdminToken(stored);
      setIsAuthenticated(true);
    }
  }, []);

  const loadPools = useCallback(async () => {
    if (!adminToken) return;
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/treasury', {
        headers: { 'x-admin-token': adminToken },
      });

      const data = await response.json();

      if (data.ok) {
        setPools(data.pools || []);
        setTotalMyst(data.totalMyst || 0);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to load' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => {
    if (isAuthenticated) {
      loadPools();
    }
  }, [isAuthenticated, loadPools]);

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
    setPools([]);
  };

  const handleTransfer = async () => {
    if (!fromPool || !toPool || !amount) {
      setMessage({ type: 'error', text: 'Please fill all transfer fields' });
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setMessage({ type: 'error', text: 'Invalid amount' });
      return;
    }

    setTransferring(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/treasury', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken,
        },
        body: JSON.stringify({ fromPool, toPool, amount: amountNum }),
      });

      const data = await response.json();

      if (data.ok) {
        setMessage({ type: 'success', text: data.message || 'Transfer successful' });
        setAmount('');
        loadPools(); // Refresh balances
      } else {
        setMessage({ type: 'error', text: data.message || 'Transfer failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setTransferring(false);
    }
  };

  // Get pool color based on type
  const getPoolColor = (poolId: string): string => {
    switch (poolId) {
      case 'treasury': return 'from-amber-600 to-amber-700';
      case 'leaderboard': return 'from-blue-600 to-blue-700';
      case 'referral': return 'from-green-600 to-green-700';
      case 'wheel': return 'from-purple-600 to-purple-700';
      default: return 'from-gray-600 to-gray-700';
    }
  };

  const getPoolIcon = (poolId: string): string => {
    switch (poolId) {
      case 'treasury': return '🏦';
      case 'leaderboard': return '🏆';
      case 'referral': return '👥';
      case 'wheel': return '🎡';
      default: return '💰';
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
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold">🏦 Treasury Management</h1>
            <p className="text-gray-400 text-sm mt-1">
              View pool balances and transfer MYST between pools
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
          >
            Logout
          </button>
        </div>

        {/* Total Balance Banner */}
        <div className="bg-gradient-to-r from-amber-900/50 to-amber-800/30 rounded-xl p-6 mb-6 border border-amber-500/30">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-amber-300 text-sm mb-1">Total MYST in All Pools</div>
              <div className="text-4xl font-bold text-amber-100">
                {totalMyst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MYST
              </div>
            </div>
            <button
              onClick={loadPools}
              disabled={loading}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 rounded-lg text-sm font-semibold"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Pool Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {pools.map((pool) => (
            <div
              key={pool.id}
              className={`bg-gradient-to-br ${getPoolColor(pool.id)} rounded-xl p-5 border border-white/10`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{getPoolIcon(pool.id)}</span>
                  <div>
                    <div className="font-semibold">{pool.name}</div>
                    <div className="text-xs text-white/60">{pool.id}</div>
                  </div>
                </div>
              </div>
              <div className="text-3xl font-bold mb-2">
                {pool.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-lg ml-1">MYST</span>
              </div>
              <div className="text-xs text-white/70">{pool.description}</div>
            </div>
          ))}
        </div>

        {/* Transfer Section */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4">💸 Transfer Between Pools</h2>
          <p className="text-gray-400 text-sm mb-4">
            Move MYST from one pool to another. Use this to fund the Wheel pool or redistribute funds.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* From Pool */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">From Pool</label>
              <select
                value={fromPool}
                onChange={(e) => setFromPool(e.target.value)}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
              >
                <option value="">Select source...</option>
                {pools.map((pool) => (
                  <option key={pool.id} value={pool.id}>
                    {pool.name} ({pool.balance.toFixed(2)} MYST)
                  </option>
                ))}
              </select>
            </div>

            {/* To Pool */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">To Pool</label>
              <select
                value={toPool}
                onChange={(e) => setToPool(e.target.value)}
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
              >
                <option value="">Select destination...</option>
                {pools.filter(p => p.id !== fromPool).map((pool) => (
                  <option key={pool.id} value={pool.id}>
                    {pool.name} ({pool.balance.toFixed(2)} MYST)
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Amount (MYST)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
              />
            </div>
          </div>

          <button
            onClick={handleTransfer}
            disabled={transferring || !fromPool || !toPool || !amount}
            className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:opacity-50 rounded-lg font-semibold transition-colors"
          >
            {transferring ? 'Transferring...' : 'Transfer MYST'}
          </button>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 bg-gray-800/50 rounded-xl p-4 border border-gray-700">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setFromPool('treasury');
                setToPool('wheel');
                setAmount('100');
              }}
              className="px-3 py-2 bg-purple-600/50 hover:bg-purple-600 rounded-lg text-sm"
            >
              🎡 Fund Wheel (+100)
            </button>
            <button
              onClick={() => {
                setFromPool('treasury');
                setToPool('leaderboard');
                setAmount('50');
              }}
              className="px-3 py-2 bg-blue-600/50 hover:bg-blue-600 rounded-lg text-sm"
            >
              🏆 Fund Leaderboard (+50)
            </button>
            <button
              onClick={() => {
                setFromPool('treasury');
                setToPool('referral');
                setAmount('25');
              }}
              className="px-3 py-2 bg-green-600/50 hover:bg-green-600 rounded-lg text-sm"
            >
              👥 Fund Referral (+25)
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-8 text-center space-x-4">
          <Link href="/admin/withdrawals" className="text-purple-400 hover:underline">Withdrawals</Link>
          <Link href="/admin/myst" className="text-purple-400 hover:underline">MYST Grant</Link>
          <Link href="/admin/wheel" className="text-purple-400 hover:underline">Wheel Pool</Link>
          <Link href="/admin/leaderboard" className="text-purple-400 hover:underline">Analytics</Link>
          <Link href="/admin/campaigns" className="text-purple-400 hover:underline">Campaigns</Link>
        </div>
      </div>
    </div>
  );
}

