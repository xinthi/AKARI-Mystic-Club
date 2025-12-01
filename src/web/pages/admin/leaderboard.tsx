/**
 * Admin Analytics & Leaderboard Page
 * 
 * Platform-wide statistics + top players by MYST spent, referrals, or aXP.
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

interface PlatformStats {
  totalUsers: number;
  newUsersToday: number;
  newUsersWeek: number;
  newUsersMonth: number;
  dau: number;
  wau: number;
  mau: number;
  totalMystSpent: number;
  totalMystInCirculation: number;
  totalPredictions: number;
  activePredictions: number;
  totalBets: number;
  totalCampaigns: number;
  activeCampaigns: number;
  totalTasksCompleted: number;
  totalReferrals: number;
  totalWheelSpins: number;
  totalDeposits: number;
  pendingDeposits: number;
  totalWithdrawals: number;
  pendingWithdrawals: number;
}

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
  
  // Platform stats
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  
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

  // Load platform stats
  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const response = await adminFetch('/api/admin/analytics');
      const json = await response.json();
      if (json.ok && json.stats) {
        setStats(json.stats);
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdminLoggedIn()) {
      loadStats();
    }
  }, [loadStats]);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
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
    <AdminLayout title="Analytics" subtitle="Platform statistics and leaderboard data">
      {/* Platform Stats Dashboard */}
      <div className="mb-8">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          📊 Platform Overview
          <button
            onClick={loadStats}
            className="text-sm px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
          >
            Refresh
          </button>
        </h2>
        
        {statsLoading ? (
          <div className="text-gray-400">Loading stats...</div>
        ) : stats ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Users */}
            <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-xl p-4 border border-blue-500/30">
              <div className="text-blue-300 text-sm">Total Users</div>
              <div className="text-3xl font-bold text-blue-400">{stats.totalUsers.toLocaleString()}</div>
              <div className="text-xs text-blue-300/70 mt-1">+{stats.newUsersToday} today</div>
            </div>
            
            <div className="bg-gradient-to-br from-green-900/50 to-green-800/30 rounded-xl p-4 border border-green-500/30">
              <div className="text-green-300 text-sm">Daily Active</div>
              <div className="text-3xl font-bold text-green-400">{stats.dau.toLocaleString()}</div>
              <div className="text-xs text-green-300/70 mt-1">{((stats.dau / stats.totalUsers) * 100).toFixed(1)}% of total</div>
            </div>
            
            <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 rounded-xl p-4 border border-purple-500/30">
              <div className="text-purple-300 text-sm">Weekly Active</div>
              <div className="text-3xl font-bold text-purple-400">{stats.wau.toLocaleString()}</div>
              <div className="text-xs text-purple-300/70 mt-1">+{stats.newUsersWeek} new this week</div>
            </div>
            
            <div className="bg-gradient-to-br from-amber-900/50 to-amber-800/30 rounded-xl p-4 border border-amber-500/30">
              <div className="text-amber-300 text-sm">Monthly Active</div>
              <div className="text-3xl font-bold text-amber-400">{stats.mau.toLocaleString()}</div>
              <div className="text-xs text-amber-300/70 mt-1">+{stats.newUsersMonth} new this month</div>
            </div>
            
            {/* MYST Economy */}
            <div className="bg-gradient-to-br from-yellow-900/50 to-yellow-800/30 rounded-xl p-4 border border-yellow-500/30">
              <div className="text-yellow-300 text-sm">Total MYST Spent</div>
              <div className="text-2xl font-bold text-yellow-400">{stats.totalMystSpent.toLocaleString()}</div>
              <div className="text-xs text-yellow-300/70 mt-1">≈ ${(stats.totalMystSpent * 0.02).toLocaleString()} USD</div>
            </div>
            
            <div className="bg-gradient-to-br from-orange-900/50 to-orange-800/30 rounded-xl p-4 border border-orange-500/30">
              <div className="text-orange-300 text-sm">MYST in Circulation</div>
              <div className="text-2xl font-bold text-orange-400">{stats.totalMystInCirculation.toLocaleString()}</div>
              <div className="text-xs text-orange-300/70 mt-1">≈ ${(stats.totalMystInCirculation * 0.02).toLocaleString()} USD</div>
            </div>
            
            <div className="bg-gradient-to-br from-red-900/50 to-red-800/30 rounded-xl p-4 border border-red-500/30">
              <div className="text-red-300 text-sm">Pending Deposits</div>
              <div className="text-2xl font-bold text-red-400">{stats.pendingDeposits}</div>
              <div className="text-xs text-red-300/70 mt-1">{stats.totalDeposits} total</div>
            </div>
            
            <div className="bg-gradient-to-br from-pink-900/50 to-pink-800/30 rounded-xl p-4 border border-pink-500/30">
              <div className="text-pink-300 text-sm">Pending Withdrawals</div>
              <div className="text-2xl font-bold text-pink-400">{stats.pendingWithdrawals}</div>
              <div className="text-xs text-pink-300/70 mt-1">{stats.totalWithdrawals} total</div>
            </div>
            
            {/* Activity */}
            <div className="bg-gradient-to-br from-cyan-900/50 to-cyan-800/30 rounded-xl p-4 border border-cyan-500/30">
              <div className="text-cyan-300 text-sm">Predictions</div>
              <div className="text-2xl font-bold text-cyan-400">{stats.activePredictions} active</div>
              <div className="text-xs text-cyan-300/70 mt-1">{stats.totalPredictions} total · {stats.totalBets} bets</div>
            </div>
            
            <div className="bg-gradient-to-br from-teal-900/50 to-teal-800/30 rounded-xl p-4 border border-teal-500/30">
              <div className="text-teal-300 text-sm">Campaigns</div>
              <div className="text-2xl font-bold text-teal-400">{stats.activeCampaigns} active</div>
              <div className="text-xs text-teal-300/70 mt-1">{stats.totalCampaigns} total · {stats.totalTasksCompleted} tasks done</div>
            </div>
            
            <div className="bg-gradient-to-br from-indigo-900/50 to-indigo-800/30 rounded-xl p-4 border border-indigo-500/30">
              <div className="text-indigo-300 text-sm">Referrals</div>
              <div className="text-2xl font-bold text-indigo-400">{stats.totalReferrals.toLocaleString()}</div>
              <div className="text-xs text-indigo-300/70 mt-1">users referred</div>
            </div>
            
            <div className="bg-gradient-to-br from-violet-900/50 to-violet-800/30 rounded-xl p-4 border border-violet-500/30">
              <div className="text-violet-300 text-sm">Wheel Spins</div>
              <div className="text-2xl font-bold text-violet-400">{stats.totalWheelSpins.toLocaleString()}</div>
              <div className="text-xs text-violet-300/70 mt-1">total spins</div>
            </div>
          </div>
        ) : (
          <div className="text-gray-400">Failed to load stats</div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-900/50 text-red-300 p-4 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Leaderboard Section */}
      <div className="bg-gray-800 rounded-xl p-6 mb-6 border border-gray-700">
        <h2 className="text-lg font-semibold mb-4">🏆 Leaderboard</h2>
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
              {data.rows.length > 0 && (
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
              )}
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
          <div className="text-4xl mb-4">🏆</div>
          <p className="text-gray-400">Select filters and click &quot;Load Data&quot; to view the leaderboard</p>
        </div>
      )}
    </AdminLayout>
  );
}
