/**
 * Admin Deposits Page
 * 
 * View and manage TON deposits with:
 * - Confirm/Decline actions
 * - Date range filtering
 * - CSV export for audit
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { isAdminLoggedIn, adminFetch } from '../../lib/admin-client';
import AdminLayout from '../../components/admin/AdminLayout';

interface Deposit {
  id: string;
  userId: string;
  telegramId?: string;
  username?: string;
  firstName?: string;
  userWallet?: string;
  tonAmount: number;
  tonPriceUsd: number;
  usdAmount: number;
  mystEstimate: number;
  mystCredited: number;
  memo: string;
  status: string;
  txHash?: string;
  confirmedAt?: string;
  declinedReason?: string;
  declinedAt?: string;
  declinedBy?: string;
  createdAt: string;
}

type FilterStatus = 'pending' | 'confirmed' | 'declined' | 'all';

export default function AdminDepositsPage() {
  const router = useRouter();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  
  // Date range filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Decline modal
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [declineDepositId, setDeclineDepositId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);

  const loadDeposits = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/admin/deposits?status=${filter}`;
      if (dateFrom) url += `&from=${dateFrom}`;
      if (dateTo) url += `&to=${dateTo}`;
      
      const res = await adminFetch(url);
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
  }, [filter, dateFrom, dateTo]);

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

  const openDeclineModal = (depositId: string) => {
    setDeclineDepositId(depositId);
    setDeclineReason('');
    setDeclineModalOpen(true);
  };

  const submitDecline = async () => {
    if (!declineDepositId || !declineReason.trim()) {
      setMessage({ type: 'error', text: 'Please enter a decline reason' });
      return;
    }

    setDeclining(true);
    try {
      const res = await adminFetch(`/api/admin/deposits/${declineDepositId}/decline`, {
        method: 'POST',
        body: JSON.stringify({ reason: declineReason.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setMessage({ type: 'success', text: 'Deposit declined' });
        setDeclineModalOpen(false);
        setDeclineDepositId(null);
        setDeclineReason('');
        loadDeposits();
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to decline' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to decline deposit' });
    } finally {
      setDeclining(false);
    }
  };

  const exportCSV = () => {
    if (deposits.length === 0) {
      setMessage({ type: 'error', text: 'No deposits to export' });
      return;
    }

    const headers = [
      'ID', 'Date', 'User', 'Telegram ID', 'User Wallet', 'TON Amount', 'USD Value', 
      'TON Price', 'MYST Estimate', 'MYST Credited', 'Memo', 'Status', 
      'TX Hash', 'Confirmed At', 'Declined Reason', 'Declined At', 'Declined By'
    ];

    const rows = deposits.map(d => [
      d.id,
      d.createdAt,
      d.username || d.firstName || 'Unknown',
      d.telegramId || '',
      d.userWallet || '',
      d.tonAmount.toFixed(4),
      d.usdAmount.toFixed(2),
      d.tonPriceUsd.toFixed(2),
      d.mystEstimate.toFixed(0),
      d.mystCredited.toFixed(0),
      d.memo,
      d.status,
      d.txHash || '',
      d.confirmedAt || '',
      d.declinedReason || '',
      d.declinedAt || '',
      d.declinedBy || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `deposits_${filter}_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    setMessage({ type: 'success', text: `Exported ${deposits.length} deposits` });
  };

  // Stats calculations
  const pendingCount = deposits.filter(d => d.status === 'pending').length;
  const confirmedCount = deposits.filter(d => d.status === 'confirmed').length;
  const declinedCount = deposits.filter(d => d.status === 'declined').length;
  const totalTon = deposits.reduce((sum, d) => sum + d.tonAmount, 0);
  const totalMyst = deposits.reduce((sum, d) => sum + d.mystEstimate, 0);

  return (
    <AdminLayout title="Deposits" subtitle="Manage pending TON deposits">
      {/* Decline Modal */}
      {declineModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-xl p-6 w-full max-w-md border border-red-500/30">
            <h3 className="text-xl font-bold text-red-400 mb-4">⚠️ Decline Deposit</h3>
            <p className="text-gray-300 text-sm mb-4">
              This action will mark the deposit as declined. The reason will be stored for audit purposes.
            </p>
            <div className="mb-4">
              <label className="block text-sm text-gray-400 mb-2">Decline Reason *</label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="e.g., No matching transaction found, Invalid memo, Spam request..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm resize-none h-24"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeclineModalOpen(false);
                  setDeclineDepositId(null);
                  setDeclineReason('');
                }}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={submitDecline}
                disabled={declining || !declineReason.trim()}
                className="flex-1 py-3 bg-red-600 hover:bg-red-500 disabled:bg-red-900 disabled:opacity-50 rounded-lg font-semibold"
              >
                {declining ? 'Declining...' : 'Decline Deposit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Important Notice */}
      <div className="mb-4 p-4 bg-blue-900/30 border border-blue-500/40 rounded-lg">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <div className="font-semibold text-blue-300 mb-1">Bookkeeping Tip</div>
            <p className="text-sm text-blue-200/80">
              Users should fund their account using the <strong>same TON wallet</strong> they have connected to their profile. 
              Check the &quot;User Wallet&quot; column to verify the sender address matches. Decline spam requests with a reason for audit tracking.
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg ${message.type === 'success' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {message.text}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* Status Filter */}
        <div className="flex gap-2">
          {(['pending', 'confirmed', 'declined', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg font-medium text-sm ${
                filter === f 
                  ? f === 'declined' ? 'bg-red-600 text-white' : 'bg-purple-600 text-white' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'pending' && pendingCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-black text-xs rounded-full">
                  {filter === 'pending' ? deposits.length : pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Date Filters */}
        <div className="flex gap-2 items-center">
          <span className="text-gray-400 text-sm">From:</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm"
          />
          <span className="text-gray-400 text-sm">To:</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="px-2 py-2 text-gray-400 hover:text-white text-sm"
            >
              ✕ Clear
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 ml-auto">
          <button
            onClick={exportCSV}
            disabled={deposits.length === 0}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:opacity-50 rounded-lg text-sm"
          >
            📥 Export CSV
          </button>
          <button
            onClick={loadDeposits}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-2xl font-bold">{deposits.length}</div>
          <div className="text-gray-400 text-sm">Total Shown</div>
        </div>
        <div className="bg-amber-900/30 p-4 rounded-lg border border-amber-500/30">
          <div className="text-2xl font-bold text-amber-300">{pendingCount}</div>
          <div className="text-amber-200/70 text-sm">Pending</div>
        </div>
        <div className="bg-green-900/30 p-4 rounded-lg border border-green-500/30">
          <div className="text-2xl font-bold text-green-300">{confirmedCount}</div>
          <div className="text-green-200/70 text-sm">Confirmed</div>
        </div>
        <div className="bg-red-900/30 p-4 rounded-lg border border-red-500/30">
          <div className="text-2xl font-bold text-red-300">{declinedCount}</div>
          <div className="text-red-200/70 text-sm">Declined</div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg">
          <div className="text-2xl font-bold">{totalTon.toFixed(2)} TON</div>
          <div className="text-gray-400 text-sm">{totalMyst.toFixed(0)} MYST</div>
        </div>
      </div>

      {/* Deposits Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : deposits.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-gray-800/40 rounded-lg">
          No deposits found for the selected filters
        </div>
      ) : (
        <div className="bg-gray-800/60 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-400">User</th>
                  <th className="px-4 py-3 text-left text-gray-400">User Wallet</th>
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
                  <tr key={d.id} className={`border-t border-gray-700/50 ${d.status === 'declined' ? 'bg-red-900/10' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="text-white">{d.username ? `@${d.username}` : d.firstName || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">{d.userId.slice(0, 8)}...</div>
                    </td>
                    <td className="px-4 py-3">
                      {d.userWallet ? (
                        <div className="flex items-center gap-1">
                          <code className="text-xs text-cyan-300 bg-cyan-900/30 px-2 py-1 rounded">
                            {d.userWallet.slice(0, 6)}...{d.userWallet.slice(-4)}
                          </code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(d.userWallet!);
                              setMessage({ type: 'success', text: 'Wallet copied!' });
                              setTimeout(() => setMessage(null), 2000);
                            }}
                            className="text-gray-400 hover:text-white text-xs"
                            title="Copy full address"
                          >
                            📋
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-red-400">Not connected</span>
                      )}
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
                        d.status === 'declined' ? 'bg-red-500/30 text-red-300' :
                        'bg-gray-500/30 text-gray-300'
                      }`}>
                        {d.status}
                      </span>
                      {d.status === 'declined' && d.declinedReason && (
                        <div className="mt-1 text-xs text-red-400" title={d.declinedReason}>
                          {d.declinedReason.length > 20 ? d.declinedReason.slice(0, 20) + '...' : d.declinedReason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400 text-xs">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {d.status === 'pending' && (
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => {
                              const txHash = prompt('Enter TON transaction hash:');
                              if (txHash) confirmDeposit(d.id, txHash);
                            }}
                            className="px-2 py-1 bg-green-600 hover:bg-green-500 rounded text-xs"
                          >
                            ✓ Confirm
                          </button>
                          <button
                            onClick={() => openDeclineModal(d.id)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-xs"
                          >
                            ✕ Decline
                          </button>
                        </div>
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
                      {d.status === 'declined' && (
                        <div className="text-xs text-gray-500">
                          by {d.declinedBy || 'Admin'}
                        </div>
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
