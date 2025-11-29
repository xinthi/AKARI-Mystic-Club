/**
 * Admin Leaderboard Analytics Page
 * 
 * View top players by MYST spent, referrals, or aXP for any period.
 * Supports CSV export for off-platform use.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  isAdminLoggedIn,
  adminFetch,
  clearAdminToken,
} from '../../lib/admin-client';
import AdminLayout from '../../components/admin/AdminLayout';

type Metric = 'myst_spent' | 'referrals' | 'axp';
type Period = 'week' | 'month' | 'all';

interface LeaderboardRow {
  userId: string;
  telegramId: string | null;
  username: string | null;
  firstName: string | null;
  mystValue: number;
  referralCount: number;
  axpValue: number;
  mystBalance: number;
}

interface LeaderboardData {
  metric: Metric;
  period: { from: string; to: string };
  rows: LeaderboardRow[];
  total: number;
}

const METRIC_LABELS: Record<Metric, string> = {
  myst_spent: 'MYST Spent',
  referrals: 'Referrals',
  axp: 'aXP',
};

const PERIOD_LABELS: Record<Period, string> = {
  week: 'This Week',
  month: 'This Month',
  all: 'All Time',
};

export default function AdminLeaderboardPage() {
  const router = useRouter();
  
  // Query state
  const [metric, setMetric] = useState<Metric>('myst_spent');
  const [period, setPeriod] = useState<Period>('week');
  const [limit, setLimit] = useState(10);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  
  // Data state
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdminLoggedIn()) {
      router.push('/admin');
    }
  }, [router]);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Build query params
      const params = new URLSearchParams();
      params.set('metric', metric);
      params.set('period', period);
      params.set('limit', String(limit));
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);

      const response = await adminFetch(`/api/admin/leaderboard?${params.toString()}`);

      if (response.status === 401 || response.status === 403) {
        setError('Unauthorized - please login again');
        clearAdminToken();
        setTimeout(() => router.push('/admin'), 2000);
        return;
      }

      const json = await response.json();

      if (json.ok) {
        setData({
          metric: json.metric,
          period: json.period,
          rows: json.rows,
          total: json.rows.reduce((sum: number, row: LeaderboardRow) => {
            if (metric === 'myst_spent') return sum + row.mystValue;
            if (metric === 'referrals') return sum + row.referralCount;
            return sum + row.axpValue;
          }, 0),
        });
      } else {
        setError(json.message ?? 'Failed to load data');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [metric, period, limit, fromDate, toDate, router]);

  // Export CSV
  const exportCSV = () => {
    if (!data || data.rows.length === 0) {
      setError('No data to export');
      return;
    }

    const headers = ['Rank', 'Telegram ID', 'Username', 'First Name', 'Metric Value', 'MYST Balance'];
    const rows = data.rows.map((row, index) => {
      const metricValue =
        metric === 'myst_spent' ? row.mystValue :
        metric === 'referrals' ? row.referralCount :
        row.axpValue;
      
      return [
        index + 1,
        row.telegramId ?? '',
        row.username ?? '',
        row.firstName ?? '',
        metricValue,
        row.mystBalance,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leaderboard-${metric}-${period}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout title="Leaderboard Analytics" subtitle="View top players by MYST spent, referrals, or aXP">
      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 text-red-300 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">🔍 Filters</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
          {/* Metric */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Metric</label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as Metric)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            >
              {Object.entries(METRIC_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Period */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            >
              {Object.entries(PERIOD_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Top N */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">Top N</label>
            <input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(Math.min(100, Math.max(1, Number(e.target.value))))}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            />
          </div>

          {/* From Date */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">From (optional)</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            />
          </div>

          {/* To Date */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">To (optional)</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-lg"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={loadLeaderboard}
            disabled={loading}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded-lg font-semibold"
          >
            {loading ? 'Loading...' : '📊 Load Data'}
          </button>
          <button
            onClick={() => {
              setFromDate('');
              setToDate('');
            }}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
          >
            Clear Dates
          </button>
        </div>
      </div>

      {/* Results */}
      {data && (
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-lg font-semibold">📊 Results</h2>
              <p className="text-sm text-gray-400">
                {METRIC_LABELS[data.metric]} · {data.period.from} to {data.period.to}
              </p>
            </div>
            <button
              onClick={exportCSV}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium"
            >
              📥 Download CSV
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-2 text-gray-400 font-medium">#</th>
                  <th className="text-left py-3 px-2 text-gray-400 font-medium">User</th>
                  <th className="text-right py-3 px-2 text-gray-400 font-medium">{METRIC_LABELS[metric]}</th>
                  <th className="text-right py-3 px-2 text-gray-400 font-medium">MYST Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => {
                  const metricValue =
                    metric === 'myst_spent' ? row.mystValue :
                    metric === 'referrals' ? row.referralCount :
                    row.axpValue;

                  return (
                    <tr key={row.userId} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                      <td className="py-3 px-2">
                        {index < 3 ? (
                          <span className="text-lg">{['🥇', '🥈', '🥉'][index]}</span>
                        ) : (
                          <span className="text-gray-400">{index + 1}</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="font-medium">{row.username || row.firstName || 'Anonymous'}</div>
                        <div className="text-xs text-gray-500">{row.telegramId}</div>
                      </td>
                      <td className="py-3 px-2 text-right font-semibold text-purple-400">
                        {metricValue.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-right text-amber-400">
                        {row.mystBalance.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-600 font-semibold">
                  <td colSpan={2} className="py-3 px-2 text-gray-400">Total</td>
                  <td className="py-3 px-2 text-right text-purple-300">
                    {data.total.toLocaleString()}
                  </td>
                  <td className="py-3 px-2 text-right text-amber-300">
                    {data.rows.reduce((sum, r) => sum + r.mystBalance, 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {data.rows.length === 0 && (
            <div className="text-center text-gray-400 py-8">
              No data found for this query
            </div>
          )}
        </div>
      )}

      {/* No Data Yet */}
      {!data && !loading && (
        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
          <div className="text-4xl mb-4">📊</div>
          <p className="text-gray-400">Select filters and click &quot;Load Data&quot; to view the leaderboard</p>
        </div>
      )}
    </AdminLayout>
  );
}
