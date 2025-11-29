/**
 * Admin Deposits Page
 * 
 * View pending TON deposits for manual reconciliation.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { isAdminLoggedIn, adminFetch } from '../../lib/admin-client';
import AdminLayout from '../../components/admin/AdminLayout';

interface Deposit {
  id: string;
  userId: string;
  username?: string;
  firstName?: string;
  tonAmount: number;
  tonPriceUsd: number;
  usdAmount: number;
  mystEstimate: number;
  memo: string;
  status: string;
  txHash?: string;
  createdAt: string;
}

export default function AdminDepositsPage() {
  const router = useRouter();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filter, setFilter] = useState<'pending' | 'confirmed' | 'all'>('pending');

  const loadDeposits = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/deposits?status=${filter}`);
      const data = await res.json();
      if (data.ok) {
        setDeposits(data.deposits || []);
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to load' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to load deposits' });
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push('/admin');
      return;
    }
    loadDeposits();
  }, [loadDeposits, router]);

  const confirmDeposit = async (depositId: string, txHash: string) => {
    try {
      const res = await adminFetch(`/api/admin/deposits/${depositId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ txHash }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: 'success', text: `Deposit confirmed! ${data.mystCredited} MYST credited` });
        loadDeposits();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to confirm' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to confirm deposit' });
    }
  };

  return (
    <AdminLayout title="Deposits" subtitle="Manage pending TON deposits">
      {message && (
        <div className={`mb-4 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {message.text}
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 mb-6">
        {(['pending', 'confirmed', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium ${
              filter === f ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button
          onClick={loadDeposits}
          className="ml-auto px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-2xl font-bold">{deposits.length}</div>
          <div className="text-gray-400 text-sm">Total Shown</div>
        </div>
        <div className="bg-amber-900/30 p-4 rounded-lg border border-amber-500/30">
          <div className="text-2xl font-bold text-amber-300">
            {deposits.filter(d => d.status === 'pending').length}
          </div>
          <div className="text-amber-200/70 text-sm">Pending</div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-2xl font-bold">
            {deposits.reduce((sum, d) => sum + d.tonAmount, 0).toFixed(2)} TON
          </div>
          <div className="text-gray-400 text-sm">Total Amount</div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-2xl font-bold">
            {deposits.reduce((sum, d) => sum + d.mystEstimate, 0).toFixed(0)} MYST
          </div>
          <div className="text-gray-400 text-sm">Total MYST</div>
        </div>
      </div>

      {/* Deposits Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : deposits.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-gray-800/40 rounded-lg">
          No deposits found
        </div>
      ) : (
        <div className="bg-gray-800/60 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-400">User</th>
                  <th className="px-4 py-3 text-center text-gray-400">TON</th>
                  <th className="px-4 py-3 text-center text-gray-400">USD</th>
                  <th className="px-4 py-3 text-center text-gray-400">MYST</th>
                  <th className="px-4 py-3 text-left text-gray-400">Memo</th>
                  <th className="px-4 py-3 text-center text-gray-400">Status</th>
                  <th className="px-4 py-3 text-center text-gray-400">Date</th>
                  <th className="px-4 py-3 text-center text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.id} className="border-t border-gray-700/50">
                    <td className="px-4 py-3">
                      <div className="text-white">{d.username ? `@${d.username}` : d.firstName || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">{d.userId.slice(0, 8)}...</div>
                    </td>
                    <td className="px-4 py-3 text-center text-blue-400">{d.tonAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center text-gray-300">${d.usdAmount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-center text-amber-300">{d.mystEstimate.toFixed(0)}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs text-purple-300 bg-purple-900/30 px-2 py-1 rounded">{d.memo}</code>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${
                        d.status === 'pending' ? 'bg-amber-500/30 text-amber-300' :
                        d.status === 'confirmed' ? 'bg-green-500/30 text-green-300' :
                        'bg-gray-500/30 text-gray-300'
                      }`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400 text-xs">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {d.status === 'pending' && (
                        <button
                          onClick={() => {
                            const txHash = prompt('Enter TON transaction hash:');
                            if (txHash) confirmDeposit(d.id, txHash);
                          }}
                          className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-xs"
                        >
                          Confirm
                        </button>
                      )}
                      {d.txHash && (
                        <a
                          href={`https://tonscan.org/tx/${d.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:underline text-xs"
                        >
                          View TX
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

