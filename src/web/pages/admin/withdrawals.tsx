/**
 * Admin Withdrawals Page
 * 
 * View and process withdrawal requests manually.
 * Admin sends USDT (on TON chain) from treasury wallet and records txHash.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  isAdminLoggedIn,
  adminFetch,
  clearAdminToken,
} from '../../lib/admin-client';
import AdminLayout from '../../components/admin/AdminLayout';

interface Withdrawal {
  id: string;
  userId: string;
  username: string | null;
  telegramId: string;
  tonAddress: string;
  mystRequested: number;
  mystFee: number;
  mystBurn: number;
  usdNet: number;
  tonAmount: number; // This is actually USDT amount now
  tonPriceUsd: number;
  status: string;
  txHash: string | null;
  createdAt: string;
  paidAt: string | null;
}

type StatusFilter = 'all' | 'pending' | 'paid' | 'rejected';

export default function AdminWithdrawalsPage() {
  const router = useRouter();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Process modal state
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [txHash, setTxHash] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push('/admin');
    }
  }, [router]);

  const loadWithdrawals = useCallback(async () => {
    setLoading(true);
    setMessage(null);

    try {
      const url = statusFilter === 'all'
        ? '/api/admin/withdrawals'
        : `/api/admin/withdrawals?status=${statusFilter}`;

      const response = await adminFetch(url);

      if (response.status === 401 || response.status === 403) {
        setMessage({ type: 'error', text: 'Unauthorized - please login again' });
        clearAdminToken();
        setTimeout(() => router.push('/admin'), 2000);
        return;
      }

      const data = await response.json();

      if (data.ok) {
        setWithdrawals(data.withdrawals);
      } else {
        setMessage({ type: 'error', text: data.message ?? 'Failed to load' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, router]);

  useEffect(() => {
    if (isAdminLoggedIn()) {
      loadWithdrawals();
    }
  }, [statusFilter, loadWithdrawals]);

  const handleMarkPaid = async () => {
    if (!selectedWithdrawal || !txHash.trim()) return;
    setProcessing(true);

    try {
      const response = await adminFetch(`/api/admin/withdrawals/${selectedWithdrawal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'paid', txHash: txHash.trim() }),
      });

      const data = await response.json();

      if (data.ok) {
        setMessage({ type: 'success', text: 'Withdrawal marked as paid' });
        setSelectedWithdrawal(null);
        setTxHash('');
        loadWithdrawals();
      } else {
        setMessage({ type: 'error', text: data.message ?? 'Failed to update' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedWithdrawal) return;
    setProcessing(true);

    try {
      const response = await adminFetch(`/api/admin/withdrawals/${selectedWithdrawal.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected', rejectionReason: rejectionReason.trim() || 'No reason provided' }),
      });

      const data = await response.json();

      if (data.ok) {
        setMessage({ type: 'success', text: 'Withdrawal rejected' });
        setSelectedWithdrawal(null);
        setRejectionReason('');
        loadWithdrawals();
      } else {
        setMessage({ type: 'error', text: data.message ?? 'Failed to update' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AdminLayout title="Withdrawal Requests" subtitle="Process withdrawal requests manually. Send USDT (on TON chain) from treasury wallet.">
      {/* USDT Info Banner */}
      <div className="bg-blue-900/30 border border-blue-500/30 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💵</span>
          <div>
            <div className="font-semibold text-blue-200">USDT Withdrawals (TON Chain)</div>
            <div className="text-sm text-blue-300/70">
              Send USDT on TON network to user wallets. Rate: 1 MYST = $0.02 USD
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {(['all', 'pending', 'paid', 'rejected'] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === s
                ? 'bg-purple-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button
          onClick={loadWithdrawals}
          disabled={loading}
          className="ml-auto px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg mb-6 ${message.type === 'success' ? 'bg-green-900/50' : 'bg-red-900/50'}`}>
          {message.text}
        </div>
      )}

      {/* Withdrawals Table */}
      <div className="bg-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-700/50">
              <th className="text-left py-3 px-4 text-gray-300 font-medium text-sm">User</th>
              <th className="text-left py-3 px-4 text-gray-300 font-medium text-sm">Wallet</th>
              <th className="text-right py-3 px-4 text-gray-300 font-medium text-sm">MYST</th>
              <th className="text-right py-3 px-4 text-gray-300 font-medium text-sm">USD Net</th>
              <th className="text-right py-3 px-4 text-gray-300 font-medium text-sm">USDT to Send</th>
              <th className="text-center py-3 px-4 text-gray-300 font-medium text-sm">Status</th>
              <th className="text-center py-3 px-4 text-gray-300 font-medium text-sm">Action</th>
            </tr>
          </thead>
          <tbody>
            {withdrawals.map((w) => (
              <tr key={w.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                <td className="py-3 px-4">
                  <div className="font-medium">{w.username ?? 'Anonymous'}</div>
                  <div className="text-xs text-gray-500">{w.telegramId}</div>
                </td>
                <td className="py-3 px-4">
                  <div className="font-mono text-xs text-gray-400 max-w-[120px] truncate">
                    {w.tonAddress}
                  </div>
                </td>
                <td className="py-3 px-4 text-right">
                  <div>{w.mystRequested.toFixed(2)}</div>
                  <div className="text-xs text-gray-500">-{w.mystFee.toFixed(2)} fee</div>
                </td>
                <td className="py-3 px-4 text-right font-medium text-green-400">
                  ${w.usdNet.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-right font-bold text-blue-400">
                  {w.tonAmount.toFixed(2)} USDT
                </td>
                <td className="py-3 px-4 text-center">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    w.status === 'pending' ? 'bg-yellow-500/20 text-yellow-300' :
                    w.status === 'paid' ? 'bg-green-500/20 text-green-300' :
                    'bg-red-500/20 text-red-300'
                  }`}>
                    {w.status}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  {w.status === 'pending' && (
                    <button
                      onClick={() => setSelectedWithdrawal(w)}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-sm"
                    >
                      Process
                    </button>
                  )}
                  {w.status === 'paid' && w.txHash && (
                    <a
                      href={`https://tonscan.org/tx/${w.txHash}`}
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
            {withdrawals.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-gray-500">
                  No withdrawals found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Process Modal */}
      {selectedWithdrawal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Process Withdrawal</h2>
            
            <div className="space-y-3 mb-6">
              <div className="flex justify-between">
                <span className="text-gray-400">User:</span>
                <span>{selectedWithdrawal.username ?? selectedWithdrawal.telegramId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">USDT to Send:</span>
                <span className="text-blue-400 font-bold">{selectedWithdrawal.tonAmount.toFixed(2)} USDT</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">USD Value:</span>
                <span className="text-green-400">${selectedWithdrawal.usdNet.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-gray-400 text-sm">Send to (TON chain):</span>
                <div className="bg-gray-900 rounded p-2 mt-1 font-mono text-xs break-all">
                  {selectedWithdrawal.tonAddress}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Transaction Hash (after sending USDT)</label>
                <input
                  type="text"
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                  placeholder="Enter txHash from TON chain"
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm"
                />
              </div>

              <button
                onClick={handleMarkPaid}
                disabled={!txHash.trim() || processing}
                className="w-full py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded-lg font-semibold"
              >
                {processing ? 'Processing...' : 'Mark as Paid'}
              </button>

              <div className="border-t border-gray-700 pt-4">
                <label className="block text-sm text-gray-400 mb-1">Or reject with reason:</label>
                <input
                  type="text"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Rejection reason (optional)"
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg text-sm mb-2"
                />
                <button
                  onClick={handleReject}
                  disabled={processing}
                  className="w-full py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 rounded-lg font-semibold"
                >
                  Reject & Refund
                </button>
              </div>

              <button
                onClick={() => {
                  setSelectedWithdrawal(null);
                  setTxHash('');
                  setRejectionReason('');
                }}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}
