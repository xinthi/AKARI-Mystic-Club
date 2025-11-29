/**
 * Admin Treasury Page
 * 
 * View all pool balances and transfer MYST between pools.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  isAdminLoggedIn,
  adminFetch,
  clearAdminToken,
} from '../../lib/admin-client';
import AdminLayout from '../../components/admin/AdminLayout';

interface PoolInfo {
  id: string;
  name: string;
  balance: number;
  description: string;
}

export default function AdminTreasuryPage() {
  const router = useRouter();
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
    if (!isAdminLoggedIn()) {
      router.push('/admin');
      return;
    }
    loadPools();
  }, [router]);

  const loadPools = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    try {
      const response = await adminFetch('/api/admin/treasury');
      const data = await response.json();

      if (response.status === 401 || response.status === 403) {
        setMessage({ type: 'error', text: 'Unauthorized - please login again' });
        clearAdminToken();
        setTimeout(() => router.push('/admin'), 2000);
        return;
      }

      if (data.ok) {
        setPools(data.pools || []);
        setTotalMyst(data.totalMyst || 0);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to load pools' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error - please try again' });
    } finally {
      setLoading(false);
    }
  }, [router]);

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
      const response = await adminFetch('/api/admin/treasury', {
        method: 'POST',
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

  return (
    <AdminLayout title="Treasury Management" subtitle="View pool balances and transfer MYST between pools">
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
        {pools.length === 0 && !loading && (
          <div className="col-span-2 text-center py-8 text-gray-400">
            No pools found. Click Refresh to load pool data.
          </div>
        )}
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
    </AdminLayout>
  );
}
