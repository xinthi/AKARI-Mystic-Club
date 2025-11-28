/**
 * Admin Leaderboard Analytics Page
 * 
 * View top players by MYST spent, referrals, or aXP for any period.
 * Supports CSV export for off-platform use.
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

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
  const [adminToken, setAdminToken] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
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

  // Load token from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('adminToken');
    if (stored) {
      setAdminToken(stored);
      setIsAuthenticated(true);
    }
  }, []);

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
    setData(null);
  };

  const loadData = useCallback(async () => {
    if (!adminToken) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        metric,
        period,
        limit: String(limit),
      });

      // Add custom date range if provided
      if (fromDate && toDate) {
        params.set('from', new Date(fromDate).toISOString());
        params.set('to', new Date(toDate + 'T23:59:59Z').toISOString());
      }

      const response = await fetch(`/api/admin/leaderboard?${params}`, {
        headers: {
          'x-admin-token': adminToken,
        },
      });

      const result = await response.json();

      if (result.ok) {
        setData({
          metric: result.metric,
          period: result.period,
          rows: result.rows,
          total: result.total,
        });
      } else {
        setError(result.message || 'Failed to load data');
      }
    } catch (err: any) {
      console.error('[AdminLeaderboard] Error:', err);
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }, [adminToken, metric, period, limit, fromDate, toDate]);

  const downloadCSV = () => {
    if (!data || !data.rows.length) return;

    const metricColumn = metric === 'myst_spent' 
      ? 'mystSpent' 
      : metric === 'referrals' 
        ? 'referralCount' 
        : 'axpValue';

    const headers = ['Rank', 'TelegramID', 'Username', 'FirstName', metricColumn, 'MystBalance'];
    
    const csvRows = [headers.join(',')];

    data.rows.forEach((row, index) => {
      const metricValue = metric === 'myst_spent' 
        ? row.mystValue.toFixed(2)
        : metric === 'referrals'
          ? row.referralCount
          : row.axpValue;

      csvRows.push([
        index + 1,
        row.telegramId || '',
        row.username || '',
        row.firstName || '',
        metricValue,
        row.mystBalance.toFixed(2),
      ].join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `leaderboard_${metric}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    URL.revokeObjectURL(url);
  };

  const getMetricValue = (row: LeaderboardRow): string => {
    switch (metric) {
      case 'myst_spent':
        return `${row.mystValue.toFixed(2)} MYST`;
      case 'referrals':
        return `${row.referralCount} referrals`;
      case 'axp':
        return `${row.axpValue.toLocaleString()} aXP`;
    }
  };

  const formatDateRange = (from: string, to: string): string => {
    const fromDate = new Date(from).toLocaleDateString();
    const toDate = new Date(to).toLocaleDateString();
    return `${fromDate} - ${toDate}`;
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold">Leaderboard Analytics</h1>
            <p className="text-gray-400 text-sm mt-1">
              View top players by MYST spent, referrals, or aXP for any period.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
          >
            Logout
          </button>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-xl p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            {/* Metric */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Metric</label>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value as Metric)}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg"
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
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg"
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
                min="1"
                max="100"
                value={limit}
                onChange={(e) => setLimit(Math.min(100, Math.max(1, parseInt(e.target.value) || 10)))}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg"
              />
            </div>

            {/* From Date */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">From (override)</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg"
              />
            </div>

            {/* To Date */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">To (override)</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded-lg"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg font-semibold"
            >
              {loading ? 'Loading...' : 'Load Data'}
            </button>

            {fromDate || toDate ? (
              <button
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
              >
                Clear Dates
              </button>
            ) : null}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-900/50 rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {/* Results */}
        {data && (
          <div className="bg-gray-800 rounded-xl p-6">
            {/* Results Header */}
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-lg font-semibold">
                  Top {data.rows.length} by {METRIC_LABELS[data.metric]}
                </h2>
                <p className="text-sm text-gray-400">
                  Period: {formatDateRange(data.period.from, data.period.to)}
                </p>
              </div>
              <button
                onClick={downloadCSV}
                disabled={!data.rows.length}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 rounded-lg text-sm font-semibold flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV
              </button>
            </div>

            {/* Table */}
            {data.rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-700">
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">#</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">User</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Telegram ID</th>
                      <th className="text-right py-3 px-4 text-gray-400 font-medium">
                        {METRIC_LABELS[metric]}
                      </th>
                      <th className="text-right py-3 px-4 text-gray-400 font-medium">MYST Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, index) => (
                      <tr 
                        key={row.userId} 
                        className={`border-b border-gray-700/50 ${index < 3 ? 'bg-amber-900/10' : ''}`}
                      >
                        <td className="py-3 px-4">
                          <span className={`font-bold ${
                            index === 0 ? 'text-amber-400' : 
                            index === 1 ? 'text-gray-300' : 
                            index === 2 ? 'text-amber-600' : 
                            'text-gray-400'
                          }`}>
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium">
                            {row.username ? `@${row.username}` : row.firstName || 'Anonymous'}
                          </div>
                          {row.firstName && row.username && (
                            <div className="text-xs text-gray-500">{row.firstName}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-400 font-mono text-sm">
                          {row.telegramId || '-'}
                        </td>
                        <td className="py-3 px-4 text-right font-semibold">
                          {getMetricValue(row)}
                        </td>
                        <td className="py-3 px-4 text-right text-purple-400">
                          {row.mystBalance.toFixed(2)} MYST
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-600 bg-gray-700/30">
                      <td colSpan={3} className="py-3 px-4 font-semibold">
                        Total ({metric === 'axp' ? 'all users' : 'in period'})
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-amber-400">
                        {metric === 'myst_spent' && `${data.total.toFixed(2)} MYST`}
                        {metric === 'referrals' && `${data.total} referrals`}
                        {metric === 'axp' && `${data.total.toLocaleString()} aXP`}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400">
                No data found for the selected criteria.
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 text-center">
          <Link href="/admin/myst" className="text-purple-400 hover:underline mr-4">MYST Grant</Link>
          <Link href="/admin/wheel" className="text-purple-400 hover:underline mr-4">Wheel Pool</Link>
          <Link href="/admin/campaigns" className="text-purple-400 hover:underline mr-4">Campaigns</Link>
          <Link href="/admin/campaign-requests" className="text-purple-400 hover:underline mr-4">Campaign Requests</Link>
          <Link href="/admin/prediction-requests" className="text-purple-400 hover:underline">Prediction Requests</Link>
        </div>
      </div>
    </div>
  );
}

