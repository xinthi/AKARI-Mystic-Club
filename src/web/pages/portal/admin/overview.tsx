/**
 * Super Admin Overview Dashboard
 * 
 * High-level view of AKARI Mystic Club stats and recent activity.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

interface AdminOverviewStats {
  totalUsers: number;
  trackedProjects: number;
  deepExplorerUsers: number;
  institutionalPlusUsers: number;
}

interface RecentUser {
  id: string;
  displayName: string | null;
  createdAt: string;
  xUsername: string | null;
}

interface RecentProject {
  id: string;
  name: string;
  slug: string;
  xHandle: string | null;
  createdAt: string;
}

interface AdminOverviewData {
  stats: AdminOverviewStats;
  recentUsers: RecentUser[];
  recentProjects: RecentProject[];
}

// =============================================================================
// HELPERS
// =============================================================================

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function AdminOverviewPage() {
  const akariUser = useAkariUser();
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user is super admin
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  // Load data
  useEffect(() => {
    if (!userIsSuperAdmin) {
      setLoading(false);
      return;
    }

    loadData();
  }, [userIsSuperAdmin]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/portal/admin/overview');
      const result = await res.json();

      if (!result.ok) {
        throw new Error(result.error || 'Failed to load overview');
      }

      setData({
        stats: result.stats,
        recentUsers: result.recentUsers || [],
        recentProjects: result.recentProjects || [],
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load overview.');
    } finally {
      setLoading(false);
    }
  };

  // Not logged in
  if (!akariUser.isLoggedIn) {
    return (
      <PortalLayout title="Admin Overview">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400">Log in to view the admin dashboard.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  // Not super admin
  if (!userIsSuperAdmin) {
    return (
      <PortalLayout title="Admin Overview">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400">You need super admin access to view this page.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Admin Overview">
      <div className="px-4 py-4 md:px-6 lg:px-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white mb-2">Admin Overview</h1>
          <p className="text-sm text-slate-400">High level view of AKARI Mystic Club.</p>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
            <p className="text-slate-400">Loading overview...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Content */}
        {!loading && !error && data && (
          <>
            {/* Top Stats Row */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Total Users</p>
                <p className="text-2xl font-bold text-white">{formatNumber(data.stats.totalUsers)}</p>
                <p className="text-xs text-slate-400 mt-1">All time</p>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Tracked Projects</p>
                <p className="text-2xl font-bold text-white">{formatNumber(data.stats.trackedProjects)}</p>
                <p className="text-xs text-slate-400 mt-1">All time</p>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Deep Explorer Users</p>
                <p className="text-2xl font-bold text-white">{formatNumber(data.stats.deepExplorerUsers)}</p>
                <p className="text-xs text-slate-400 mt-1">With access</p>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Institutional Plus Users</p>
                <p className="text-2xl font-bold text-white">{formatNumber(data.stats.institutionalPlusUsers)}</p>
                <p className="text-xs text-slate-400 mt-1">With access</p>
              </div>
            </section>

            {/* Recent Users and Projects */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Users */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-white mb-4">Recent Users</h2>
                {data.recentUsers.length === 0 ? (
                  <p className="text-xs text-slate-400">No users found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-800">
                          <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500">
                            Display Name
                          </th>
                          <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500">
                            X Handle
                          </th>
                          <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500">
                            Created
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentUsers.map((user) => (
                          <tr
                            key={user.id}
                            className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                          >
                            <td className="py-2 px-3 text-white">
                              <Link
                                href={`/portal/admin/users/${user.id}`}
                                className="hover:text-akari-primary transition hover:underline"
                              >
                                {user.displayName || 'Unknown'}
                              </Link>
                            </td>
                            <td className="py-2 px-3 text-slate-400">
                              {user.xUsername ? `@${user.xUsername}` : 'Not linked'}
                            </td>
                            <td className="py-2 px-3 text-slate-400">
                              {formatDate(user.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Recent Projects */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <h2 className="text-sm font-semibold text-white mb-4">Recent Projects</h2>
                {data.recentProjects.length === 0 ? (
                  <p className="text-xs text-slate-400">No projects found.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-800">
                          <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500">
                            Name
                          </th>
                          <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500">
                            X Handle
                          </th>
                          <th className="text-left py-2 px-3 text-xs uppercase tracking-wider text-slate-500">
                            Created
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentProjects.map((project) => (
                          <tr
                            key={project.id}
                            className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                          >
                            <td className="py-2 px-3 text-white">
                              {project.name}
                            </td>
                            <td className="py-2 px-3 text-slate-400">
                              {project.xHandle ? `@${project.xHandle}` : '-'}
                            </td>
                            <td className="py-2 px-3 text-slate-400">
                              {formatDate(project.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </PortalLayout>
  );
}

