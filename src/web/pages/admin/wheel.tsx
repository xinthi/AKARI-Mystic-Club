/**
 * Admin Wheel Page
 * 
 * View and manage the Wheel of Fortune pool.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  isAdminLoggedIn,
  adminFetch,
  clearAdminToken,
} from '../../lib/admin-client';
import AdminLayout from '../../components/admin/AdminLayout';

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
  const router = useRouter();
  
  // Stats state
  const [stats, setStats] = useState<WheelStats | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Adjustment form
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  
  // UI state
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminFetch('/api/admin/wheel/stats');

      if (response.status === 401 || response.status === 403) {
        setMessage({ type: 'error', text: 'Unauthorized - please login again' });
        clearAdminToken();
        setTimeout(() => router.push('/admin'), 2000);
        return;
      }

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
  }, [router]);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push('/admin');
      return;
    }
    loadStats();
  }, [router, loadStats]);

  const handleAdjust = async () => {
    if (!adjustAmount) return;
    
    setAdjusting(true);
    setMessage(null);

    try {
      const response = await adminFetch('/api/admin/wheel/adjust', {
        method: 'POST',
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

  // Export spins data as CSV
  const exportSpinsCSV = () => {
    if (!stats?.recentSpins || stats.recentSpins.length === 0) {
      setMessage({ type: 'error', text: 'No data to export' });
      return;
    }

    const headers = ['ID', 'Username', 'Amount Won', 'Date'];
    const rows = stats.recentSpins.map(spin => [
      spin.id,
      spin.username || 'Anonymous',
      spin.amountWon.toString(),
      new Date(spin.createdAt).toLocaleString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wheel-spins-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout title="Wheel of Fortune" subtitle="View and manage the Wheel prize pool">
      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {message.text}
        </div>
      )}

      {/* Pool Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 rounded-xl p-6 border border-purple-500/30">
          <div className="text-sm text-purple-300 mb-1">🎡 Pool Balance</div>
          <div className="text-3xl font-bold text-purple-100">
            {loading ? '...' : (stats?.poolBalance ?? 0).toFixed(2)} MYST
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">Total Spins (All Time)</div>
          <div className="text-3xl font-bold">
            {loading ? '...' : stats?.totalSpins ?? 0}
          </div>
        </div>
        
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="text-sm text-gray-400 mb-1">Total Won (All Time)</div>
          <div className="text-3xl font-bold text-amber-400">
            {loading ? '...' : (stats?.totalWon ?? 0).toFixed(2)} MYST
          </div>
        </div>
      </div>

      {/* Adjust Pool */}
      <div className="bg-gray-800 rounded-xl p-6 mb-8 border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">💰 Adjust Pool Balance</h2>
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
            className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold"
          >
            {adjusting ? 'Adjusting...' : 'Adjust'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Use positive numbers to add MYST to the pool, negative to remove. For larger adjustments, use Treasury → Transfer.
        </p>
      </div>

      {/* Recent Spins */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">🎰 Recent Spins</h2>
          <div className="flex gap-2">
            <button
              onClick={exportSpinsCSV}
              disabled={!stats?.recentSpins || stats.recentSpins.length === 0}
              className="px-3 py-1 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded text-sm"
            >
              📥 Export CSV
            </button>
            <button
              onClick={loadStats}
              disabled={loading}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              {loading ? 'Loading...' : '🔄 Refresh'}
            </button>
          </div>
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
    </AdminLayout>
  );
}
