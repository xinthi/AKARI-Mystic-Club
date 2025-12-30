/**
 * ARC Reports Listing Page
 * 
 * Shows all available reports for the current user.
 * - Project admins: See reports for their projects only
 * - Super admins: See all reports + comprehensive platform reports
 */

import { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

interface ReportItem {
  kind: 'arena' | 'campaign' | 'gamified';
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  projectSlug: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'N/A';
  }
}

function getKindLabel(kind: string): string {
  switch (kind) {
    case 'arena':
      return 'Arena';
    case 'campaign':
      return 'Campaign';
    case 'gamified':
      return 'Gamified Program';
    default:
      return kind;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active':
    case 'live':
      return 'bg-green-500/20 text-green-400 border-green-500/50';
    case 'scheduled':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    case 'paused':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    case 'ended':
    case 'cancelled':
      return 'bg-red-500/20 text-red-400 border-red-500/50';
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcReportsListingPage() {
  const akariUser = useAkariUser();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'arena' | 'campaign' | 'gamified'>('all');

  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  useEffect(() => {
    if (!akariUser.isLoggedIn) {
      setLoading(false);
      return;
    }

    loadReports();
  }, [akariUser.isLoggedIn]);

  const loadReports = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/portal/admin/arc/reports-list', {
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load reports');
      }

      setReports(data.reports || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  const filteredReports = reports.filter(
    (report) => filter === 'all' || report.kind === filter
  );

  // Not logged in
  if (!akariUser.isLoggedIn) {
    return (
      <PortalLayout title="ARC Reports">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400">Log in to view reports.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="ARC Reports">
      <div className="px-4 py-4 md:px-6 lg:px-10">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Link href="/portal/arc" className="hover:text-akari-primary transition-colors">
                ARC
              </Link>
              <span>/</span>
              <span className="text-slate-300">Reports</span>
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2">ARC Reports</h1>
          <p className="text-sm text-slate-400">
            {userIsSuperAdmin
              ? 'View all campaign and platform reports'
              : 'View reports for your projects'}
          </p>
        </div>

        {/* Comprehensive Reports (Super Admin Only) */}
        {userIsSuperAdmin && (
          <div className="mb-6 rounded-xl border border-slate-700 p-6 bg-akari-card">
            <h2 className="text-lg font-semibold text-white mb-4">Platform Reports</h2>
            <Link
              href="/portal/admin/arc/comprehensive-reports"
              className="inline-flex items-center gap-2 px-4 py-2 bg-akari-primary/20 hover:bg-akari-primary/30 border border-akari-primary/50 rounded-lg text-sm text-akari-primary transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              View Comprehensive Platform Reports
            </Link>
            <p className="text-xs text-slate-400 mt-2">
              Financial metrics, user activity, participation stats, and more
            </p>
          </div>
        )}

        {/* Filter */}
        <div className="mb-4 flex gap-2 border-b border-slate-700 pb-4">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              filter === 'all'
                ? 'text-akari-primary border-b-2 border-akari-primary'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('arena')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              filter === 'arena'
                ? 'text-akari-primary border-b-2 border-akari-primary'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Arenas
          </button>
          <button
            onClick={() => setFilter('campaign')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              filter === 'campaign'
                ? 'text-akari-primary border-b-2 border-akari-primary'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Campaigns
          </button>
          <button
            onClick={() => setFilter('gamified')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              filter === 'gamified'
                ? 'text-akari-primary border-b-2 border-akari-primary'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Gamified
          </button>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-4" />
            <p className="text-slate-400">Loading reports...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-2xl p-6 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Reports list */}
        {!loading && !error && (
          <>
            {filteredReports.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
                <p className="text-slate-400">
                  {filter === 'all'
                    ? 'No reports available'
                    : `No ${filter} reports available`}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-akari-card overflow-hidden">
                <table className="w-full">
                  <thead className="bg-akari-cardSoft/30 border-b border-akari-border/30">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Title</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Project</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Date Range</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-akari-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-akari-border/30">
                    {filteredReports.map((report) => (
                      <tr key={`${report.kind}-${report.id}`} className="hover:bg-akari-cardSoft/20 transition-colors">
                        <td className="px-4 py-3 text-sm text-akari-text">
                          {getKindLabel(report.kind)}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-akari-text">
                          {report.title}
                        </td>
                        <td className="px-4 py-3 text-sm text-akari-text">
                          {report.projectName}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                              report.status
                            )}`}
                          >
                            {report.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-400">
                          {report.startsAt && report.endsAt
                            ? `${formatDate(report.startsAt)} - ${formatDate(report.endsAt)}`
                            : report.startsAt
                            ? `From ${formatDate(report.startsAt)}`
                            : report.endsAt
                            ? `Until ${formatDate(report.endsAt)}`
                            : 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/portal/admin/arc/reports/${report.kind}/${report.id}`}
                            className="px-3 py-1.5 text-sm font-medium bg-akari-primary/20 hover:bg-akari-primary/30 border border-akari-primary/50 rounded-lg text-akari-primary transition-colors"
                          >
                            View Report
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    props: {},
  };
};

