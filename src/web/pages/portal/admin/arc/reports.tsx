/**
 * Super Admin ARC Reports Page
 * 
 * View platform-wide ARC reports with comprehensive metrics.
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

interface PlatformReport {
  ok: boolean;
  range: {
    from: string;
    to: string;
  };
  totals: {
    projects_active: {
      ms: number;
      gamefi: number;
      crm: number;
    };
    creators: {
      unique: number;
      total_participations: number;
    };
    utm: {
      clicks: number;
      unique_clicks: number;
    };
    revenue: {
      gross: number;
      net: number;
      discounts: number;
    };
    engagement: {
      likes: number;
      replies: number;
      reposts: number;
      quotes: number;
    };
    content: {
      posts: number;
      threads: number;
    };
    views: {
      total_views: number;
      total_impressions: number;
    };
  };
  perProject: Array<{
    projectId: string;
    slug: string | null;
    name: string;
    ms: boolean;
    gamefi: boolean;
    crm: boolean;
    utm: {
      clicks: number;
      unique_clicks: number;
    };
    revenue: {
      gross: number;
      net: number;
      discounts: number;
    };
    engagement: {
      likes: number;
      replies: number;
      reposts: number;
      quotes: number;
    };
    views: {
      total_views: number;
      total_impressions: number;
    };
  }>;
  perCreator: Array<{
    twitter_username: string;
    projectId: string;
    utm: {
      clicks: number;
      unique_clicks: number;
    };
    engagement: {
      likes: number;
      replies: number;
      reposts: number;
      quotes: number;
    };
    views: {
      total_views: number;
      total_impressions: number;
    };
  }>;
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

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcReportsPage() {
  const { user } = useAkariUser();
  const userIsSuperAdmin = isSuperAdmin(user);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PlatformReport | null>(null);

  // Date range
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Initialize default date range (last 30 days)
  useEffect(() => {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    setDateFrom(from.toISOString().split('T')[0]);
    setDateTo(now.toISOString().split('T')[0]);
  }, []);

  const loadReport = useCallback(async () => {
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

      const res = await fetch(`/api/portal/admin/arc/reports/platform?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data: PlatformReport = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to load report');
      }

      setReport(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  }, [userIsSuperAdmin, dateFrom, dateTo]);

  useEffect(() => {
    if (!userIsSuperAdmin) {
      setLoading(false);
      return;
    }
    loadReport();
  }, [loadReport, userIsSuperAdmin]);

  const handleDownloadJSON = () => {
    if (!report) return;

    const jsonStr = JSON.stringify(report, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arc-platform-report-${dateFrom}-to-${dateTo}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
            <h1 className="text-3xl font-bold text-white mb-2">ARC Platform Reports</h1>
            <p className="text-white/60">Comprehensive platform-wide metrics and analytics</p>
          </div>
          {report && (
            <button
              onClick={handleDownloadJSON}
              className="px-4 py-2 rounded-lg bg-akari-neon-teal/20 text-akari-neon-teal border border-akari-neon-teal/50 hover:bg-akari-neon-teal/30 transition-colors"
            >
              Download JSON
            </button>
          )}
        </div>

        {/* Date Range Filter */}
        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-sm text-white/80 mb-1">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white focus:outline-none focus:border-akari-neon-teal/50"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-white/80 mb-1">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-white focus:outline-none focus:border-akari-neon-teal/50"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={loadReport}
                className="px-4 py-2 rounded-lg bg-akari-neon-teal/20 text-akari-neon-teal border border-akari-neon-teal/50 hover:bg-akari-neon-teal/30 transition-colors"
              >
                Generate Report
              </button>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-8 text-center">
            <p className="text-white/60">Generating report...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <ErrorState message={error} onRetry={loadReport} />
        )}

        {/* Empty state */}
        {!loading && !error && !report && (
          <EmptyState
            icon="📊"
            title="No report data"
            description="Select a date range and click 'Generate Report' to view metrics."
          />
        )}

        {/* Report Content */}
        {!loading && !error && report && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-lg border border-white/10 bg-black/40 p-6">
                <div className="text-sm text-white/60 mb-1">Active Projects</div>
                <div className="text-2xl font-bold text-white">
                  MS: {report.totals.projects_active.ms} | GameFi: {report.totals.projects_active.gamefi} | CRM: {report.totals.projects_active.crm}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-6">
                <div className="text-sm text-white/60 mb-1">Creators</div>
                <div className="text-2xl font-bold text-white">
                  {formatNumber(report.totals.creators.unique)} unique
                </div>
                <div className="text-xs text-white/40 mt-1">
                  {formatNumber(report.totals.creators.total_participations)} participations
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-6">
                <div className="text-sm text-white/60 mb-1">UTM Clicks</div>
                <div className="text-2xl font-bold text-white">
                  {formatNumber(report.totals.utm.clicks)} total
                </div>
                <div className="text-xs text-white/40 mt-1">
                  {formatNumber(report.totals.utm.unique_clicks)} unique
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 p-6">
                <div className="text-sm text-white/60 mb-1">Revenue</div>
                <div className="text-2xl font-bold text-green-400">
                  {formatCurrency(report.totals.revenue.net)} net
                </div>
                <div className="text-xs text-white/40 mt-1">
                  {formatCurrency(report.totals.revenue.gross)} gross
                </div>
              </div>
            </div>

            {/* Per Project Table */}
            <div className="rounded-lg border border-white/10 bg-black/40 overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">Per Project Breakdown</h2>
                <p className="text-sm text-white/60 mt-1">
                  {report.perProject.length} projects
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                        Features
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                        UTM Clicks
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                        Revenue
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {report.perProject.map((project) => (
                      <tr key={project.projectId} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-sm text-white/80">
                          <Link
                            href={`/portal/arc/admin/${project.slug || project.projectId}`}
                            className="text-akari-neon-teal hover:text-akari-neon-teal/80 transition-colors"
                          >
                            {project.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-white/80">
                          <div className="flex items-center gap-2">
                            {project.ms && (
                              <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded">
                                MS
                              </span>
                            )}
                            {project.gamefi && (
                              <span className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 border border-purple-500/50 rounded">
                                GameFi
                              </span>
                            )}
                            {project.crm && (
                              <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 border border-green-500/50 rounded">
                                CRM
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-white/80">
                          <div>
                            <div>{formatNumber(project.utm.clicks)} clicks</div>
                            <div className="text-xs text-white/40">
                              {formatNumber(project.utm.unique_clicks)} unique
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-white/80">
                          <div>
                            <div className="font-semibold text-green-400">
                              {formatCurrency(project.revenue.net)}
                            </div>
                            <div className="text-xs text-white/40">
                              {formatCurrency(project.revenue.gross)} gross
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Per Creator Table */}
            <div className="rounded-lg border border-white/10 bg-black/40 overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white">Per Creator Breakdown</h2>
                <p className="text-sm text-white/60 mt-1">
                  {report.perCreator.length} creators
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                        Creator
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                        Project
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/60 uppercase tracking-wider">
                        UTM Clicks
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {report.perCreator.map((creator, idx) => (
                      <tr key={`${creator.twitter_username}_${creator.projectId}_${idx}`} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3 text-sm text-white/80">
                          @{creator.twitter_username}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/80">
                          <Link
                            href={`/portal/arc/admin/${creator.projectId}`}
                            className="text-akari-neon-teal hover:text-akari-neon-teal/80 transition-colors font-mono text-xs"
                          >
                            {creator.projectId.substring(0, 8)}...
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-white/80">
                          <div>
                            <div>{formatNumber(creator.utm.clicks)} clicks</div>
                            <div className="text-xs text-white/40">
                              {formatNumber(creator.utm.unique_clicks)} unique
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
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
  if (!auth.ok) {
    return {
      redirect: {
        destination: '/portal/arc',
        permanent: false,
      },
    };
  }

  return {
    props: {},
  };
};
