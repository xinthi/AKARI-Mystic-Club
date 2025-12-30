/**
 * ARC End Report Page
 * 
 * Shows analytics and totals for ended items (arenas, campaigns, gamified programs).
 * Super admin only.
 */

import { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { requireSuperAdmin } from '@/lib/server-auth';
import Link from 'next/link';

interface ReportData {
  kind: 'arena' | 'campaign' | 'gamified';
  id: string;
  title: string;
  projectName: string;
  projectSlug: string | null;
  stats: {
    totalCreators: number;
    totalPosts: number;
    totalViews: number;
    totalLikes: number;
    totalReplies: number;
    totalReposts: number;
    totalQuotes: number;
  };
  topCreators: Array<{
    username: string;
    displayName: string | null;
    arcPoints: number;
    posts: number;
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  }>;
}

export default function ArcEndReportPage() {
  const router = useRouter();
  const akariUser = useAkariUser();
  const { kind, id } = router.query;
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  useEffect(() => {
    if (!kind || !id || typeof kind !== 'string' || typeof id !== 'string') {
      return;
    }

    loadReport(kind, id);
  }, [kind, id]);

  const loadReport = async (reportKind: string, reportId: string) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/portal/admin/arc/reports?kind=${reportKind}&id=${reportId}`, {
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load report');
      }

      setReportData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    if (!reportData) return;

    // Generate CSV content
    const headers = ['Username', 'Display Name', 'ARC Points', 'Posts', 'Views', 'Likes', 'Replies', 'Reposts', 'Quotes'];
    const rows = reportData.topCreators.map((creator) => [
      creator.username,
      creator.displayName || '',
      creator.arcPoints.toString(),
      creator.posts.toString(),
      creator.views.toString(),
      creator.likes.toString(),
      creator.replies.toString(),
      creator.reposts.toString(),
      creator.quotes.toString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arc-report-${reportData.kind}-${reportData.id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Not logged in
  if (!akariUser.isLoggedIn) {
    return (
      <PortalLayout title="ARC End Report">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400">Log in to view this page.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  // Note: Access control is now handled by the API endpoint
  // Both project admins and superadmins can view reports, but admins can only see their own projects

  return (
    <PortalLayout title="ARC End Report">
      <div className="px-4 py-4 md:px-6 lg:px-10">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Link href="/portal/admin" className="hover:text-akari-primary transition-colors">
                Admin
              </Link>
              <span>/</span>
              <Link href="/portal/admin/arc/leaderboard-requests" className="hover:text-akari-primary transition-colors">
                ARC Leaderboard Requests
              </Link>
              <span>/</span>
              <span className="text-slate-300">End Report</span>
            </div>
            {reportData && userIsSuperAdmin && (
              <button
                onClick={handleExportCSV}
                className="px-4 py-2 bg-akari-primary/20 hover:bg-akari-primary/30 border border-akari-primary/50 rounded-lg text-sm text-akari-primary transition-colors"
              >
                Export CSV
              </button>
            )}
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2">ARC End Report</h1>
          {reportData && (
            <p className="text-sm text-slate-400">
              Report for {reportData.kind}: {reportData.title}
            </p>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-4" />
            <p className="text-slate-400">Loading report...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-red-400">{error}</p>
            <button
              onClick={() => kind && id && typeof kind === 'string' && typeof id === 'string' && loadReport(kind, id)}
              className="mt-4 px-4 py-2 rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Report content */}
        {!loading && !error && reportData && (
          <div className="space-y-6">
            {/* Project Info */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Project Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-slate-400">Project</p>
                  <p className="text-white font-medium">{reportData.projectName}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Item Type</p>
                  <p className="text-white font-medium capitalize">{reportData.kind}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Title</p>
                  <p className="text-white font-medium">{reportData.title}</p>
                </div>
              </div>
            </div>

            {/* Statistics */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Statistics</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-slate-400">Total Creators</p>
                  <p className="text-2xl font-bold text-white">{reportData.stats.totalCreators}</p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Total Posts</p>
                  <p className="text-2xl font-bold text-white">
                    {reportData.stats.totalPosts > 0 ? reportData.stats.totalPosts : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Total Views</p>
                  <p className="text-2xl font-bold text-white">
                    {reportData.stats.totalViews > 0 ? reportData.stats.totalViews.toLocaleString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Total Likes</p>
                  <p className="text-2xl font-bold text-white">
                    {reportData.stats.totalLikes > 0 ? reportData.stats.totalLikes.toLocaleString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Total Replies</p>
                  <p className="text-2xl font-bold text-white">
                    {reportData.stats.totalReplies > 0 ? reportData.stats.totalReplies.toLocaleString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Total Reposts</p>
                  <p className="text-2xl font-bold text-white">
                    {reportData.stats.totalReposts > 0 ? reportData.stats.totalReposts.toLocaleString() : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-400">Total Quotes</p>
                  <p className="text-2xl font-bold text-white">
                    {reportData.stats.totalQuotes > 0 ? reportData.stats.totalQuotes.toLocaleString() : 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Top Creators */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Top Creators</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Rank</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Username</th>
                      <th className="text-left py-3 px-4 text-sm font-semibold text-slate-300">Display Name</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">ARC Points</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">Posts</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">Views</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">Likes</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">Replies</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">Reposts</th>
                      <th className="text-right py-3 px-4 text-sm font-semibold text-slate-300">Quotes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.topCreators.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 px-4 text-center text-slate-400">
                          No creators found
                        </td>
                      </tr>
                    ) : (
                      reportData.topCreators.map((creator, index) => (
                        <tr key={creator.username} className="border-b border-slate-800/50">
                          <td className="py-3 px-4 text-slate-300">#{index + 1}</td>
                          <td className="py-3 px-4 text-white font-medium">@{creator.username}</td>
                          <td className="py-3 px-4 text-slate-300">{creator.displayName || '-'}</td>
                          <td className="py-3 px-4 text-right text-white font-medium">{creator.arcPoints.toLocaleString()}</td>
                          <td className="py-3 px-4 text-right text-slate-300">
                            {creator.posts > 0 ? creator.posts.toLocaleString() : 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-300">
                            {creator.views > 0 ? creator.views.toLocaleString() : 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-300">
                            {creator.likes > 0 ? creator.likes.toLocaleString() : 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-300">
                            {creator.replies > 0 ? creator.replies.toLocaleString() : 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-300">
                            {creator.reposts > 0 ? creator.reposts.toLocaleString() : 'N/A'}
                          </td>
                          <td className="py-3 px-4 text-right text-slate-300">
                            {creator.quotes > 0 ? creator.quotes.toLocaleString() : 'N/A'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const redirect = await requireSuperAdmin(context);
  if (redirect) {
    return redirect;
  }

  return {
    props: {},
  };
};

