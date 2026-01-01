/**
 * Super Admin ARC Billing Page
 * 
 * View and manage ARC billing records.
 */

import { useState, useEffect, useCallback } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { requireSuperAdmin } from '@/lib/server-auth';
import { EmptyState } from '@/components/arc/EmptyState';
import { ErrorState } from '@/components/arc/ErrorState';

// =============================================================================
// TYPES
// =============================================================================

interface BillingRecord {
  id: string;
  request_id: string;
  project_id: string;
  access_level: 'creator_manager' | 'leaderboard' | 'gamified';
  base_price_usd: number;
  discount_percent: number;
  final_price_usd: number;
  currency: string;
  payment_status: 'pending' | 'paid' | 'waived' | 'refunded';
  payment_method: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  project?: {
    id: string;
    name: string;
    slug: string | null;
  } | null;
}

interface BillingSummary {
  gross: number;
  net: number;
  discountsTotal: number;
  byAccessLevel: {
    creator_manager: { count: number; gross: number; net: number };
    leaderboard: { count: number; gross: number; net: number };
    gamified: { count: number; gross: number; net: number };
  };
}

interface BillingResponse {
  ok: boolean;
  rows: BillingRecord[];
  summary: BillingSummary;
  error?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '-';
  }
}

function formatDateTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getAccessLevelLabel(level: string): string {
  const labels: Record<string, string> = {
    creator_manager: 'Creator Manager',
    leaderboard: 'Leaderboard',
    gamified: 'Gamified',
  };
  return labels[level] || level;
}

function getPaymentStatusBadge(status: string): string {
  const badges: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
    paid: 'bg-green-500/20 text-green-400 border-green-500/50',
    waived: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
    refunded: 'bg-red-500/20 text-red-400 border-red-500/50',
  };
  return badges[status] || 'bg-white/10 text-white/60 border-white/20';
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcBillingPage() {
  const { user } = useAkariUser();
  const userIsSuperAdmin = isSuperAdmin(user);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [records, setRecords] = useState<BillingRecord[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);

  // Filters
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [accessLevel, setAccessLevel] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<string>('');
  const [projectId, setProjectId] = useState<string>('');

  // Initialize default date range (last 30 days)
  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(now.toISOString().split('T')[0]);
  }, []);

  const loadBilling = useCallback(async () => {
    if (!userIsSuperAdmin) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set('from', new Date(dateFrom).toISOString());
      if (dateTo) params.set('to', new Date(dateTo + 'T23:59:59').toISOString());
      if (accessLevel) params.set('accessLevel', accessLevel);
      if (paymentStatus) params.set('paymentStatus', paymentStatus);
      if (projectId.trim()) params.set('projectId', projectId.trim());
      params.set('limit', '200');

      const res = await fetch(`/api/portal/admin/arc/billing?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data: BillingResponse = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to load billing records');
      }

      setRecords(data.rows || []);
      setSummary(data.summary);
    } catch (err: any) {
      setError(err.message || 'Failed to load billing records.');
    } finally {
      setLoading(false);
    }
  }, [userIsSuperAdmin, dateFrom, dateTo, accessLevel, paymentStatus, projectId]);

  useEffect(() => {
    if (!userIsSuperAdmin) {
      setLoading(false);
      return;
    }
    loadBilling();
  }, [loadBilling, userIsSuperAdmin]);

  const handleUpdateStatus = async (
    billingId: string,
    newStatus: 'paid' | 'waived',
    paymentRef?: string
  ) => {
    if (!confirm(`Mark this billing record as ${newStatus}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/portal/admin/arc/billing/${billingId}/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          payment_status: newStatus,
          payment_reference: paymentRef || undefined,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to update status');
      }

      // Refresh list
      await loadBilling();
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  if (!userIsSuperAdmin) {
    return (
      <ArcPageShell>
        <div className="p-8">
          <ErrorState message="SuperAdmin access required" />
        </div>
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell>
      <div className="p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">ARC Billing</h1>
            <p className="text-white/60">View and manage billing records</p>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-lg border border-white/10 bg-black/40 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm text-white/80 mb-1">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white focus:outline-none focus:border-akari-neon-teal/50"
              />
            </div>
            <div>
              <label className="block text-sm text-white/80 mb-1">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white focus:outline-none focus:border-akari-neon-teal/50"
              />
            </div>
            <div>
              <label className="block text-sm text-white/80 mb-1">Access Level</label>
              <select
                value={accessLevel}
                onChange={(e) => setAccessLevel(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white focus:outline-none focus:border-akari-neon-teal/50"
              >
                <option value="">All</option>
                <option value="creator_manager">Creator Manager</option>
                <option value="leaderboard">Leaderboard</option>
                <option value="gamified">Gamified</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-white/80 mb-1">Payment Status</label>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white focus:outline-none focus:border-akari-neon-teal/50"
              >
                <option value="">All</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="waived">Waived</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-white/80 mb-1">Project ID</label>
              <input
                type="text"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="UUID (optional)"
                className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white placeholder-white/40 focus:outline-none focus:border-akari-neon-teal/50"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={loadBilling}
              className="px-4 py-2 rounded-lg bg-akari-neon-teal/20 text-akari-neon-teal border border-akari-neon-teal/50 hover:bg-akari-neon-teal/30 transition-colors"
            >
              Apply Filters
            </button>
            <button
              onClick={() => {
                const now = new Date();
                const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                setDateFrom(from.toISOString().split('T')[0]);
                setDateTo(now.toISOString().split('T')[0]);
                setAccessLevel('');
                setPaymentStatus('');
                setProjectId('');
              }}
              className="px-4 py-2 rounded-lg border border-white/10 bg-black/40 text-white/80 hover:bg-white/10 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-lg border border-white/10 bg-black/40 p-6">
              <div className="text-sm text-white/60 mb-1">Gross Revenue</div>
              <div className="text-2xl font-bold text-white">{formatCurrency(summary.gross)}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/40 p-6">
              <div className="text-sm text-white/60 mb-1">Net Revenue</div>
              <div className="text-2xl font-bold text-green-400">{formatCurrency(summary.net)}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/40 p-6">
              <div className="text-sm text-white/60 mb-1">Total Discounts</div>
              <div className="text-2xl font-bold text-yellow-400">{formatCurrency(summary.discountsTotal)}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/40 p-6">
              <div className="text-sm text-white/60 mb-1">Total Records</div>
              <div className="text-2xl font-bold text-white">{records.length}</div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-8 text-center">
            <p className="text-white/60">Loading billing records...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <ErrorState message={error} onRetry={loadBilling} />
        )}

        {/* Empty state */}
        {!loading && !error && records.length === 0 && (
          <EmptyState
            icon="💰"
            title="No billing records"
            description="No billing records found for the selected filters."
          />
        )}

        {/* Billing table */}
        {!loading && !error && records.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/5 border-b border-white/10">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Access Level
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Base Price
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Discount
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Final Price
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Notes
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {records.map((record) => (
                    <tr key={record.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-sm text-white/80">
                        {formatDateTime(record.created_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/80">
                        {record.project ? (
                          <Link
                            href={`/portal/arc/admin/${record.project.slug || record.project.id}`}
                            className="text-akari-neon-teal hover:text-akari-neon-teal/80 transition-colors"
                          >
                            {record.project.name || record.project.id}
                          </Link>
                        ) : (
                          <span className="text-white/40 font-mono text-xs">{record.project_id.substring(0, 8)}...</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/80">
                        {getAccessLevelLabel(record.access_level)}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/80">
                        {formatCurrency(record.base_price_usd)}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/80">
                        {record.discount_percent > 0 ? (
                          <span className="text-yellow-400">{record.discount_percent}%</span>
                        ) : (
                          <span className="text-white/40">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-white">
                        {formatCurrency(record.final_price_usd)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${getPaymentStatusBadge(
                            record.payment_status
                          )}`}
                        >
                          {record.payment_status.charAt(0).toUpperCase() + record.payment_status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white/70 max-w-xs">
                        <div className="truncate" title={record.notes || ''}>
                          {record.notes || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {record.payment_status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleUpdateStatus(record.id, 'paid')}
                                className="px-2 py-1 text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/50 rounded hover:bg-green-500/30 transition-colors"
                                title="Mark as Paid"
                              >
                                Paid
                              </button>
                              <button
                                onClick={() => handleUpdateStatus(record.id, 'waived')}
                                className="px-2 py-1 text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded hover:bg-blue-500/30 transition-colors"
                                title="Mark as Waived"
                              >
                                Waive
                              </button>
                            </>
                          )}
                          {record.payment_status === 'paid' && record.paid_at && (
                            <span className="text-xs text-white/40">
                              Paid {formatDate(record.paid_at)}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ArcPageShell>
  );
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps = async (context) => {
  // Require Super Admin access
  const auth = await requireSuperAdmin(context);
  if (auth) {
    // auth contains redirect object if not authorized
    return auth;
  }

  return {
    props: {},
  };
};
