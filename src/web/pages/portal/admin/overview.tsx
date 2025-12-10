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
          <div className="neon-card neon-hover p-8 text-center">
            <p className="text-akari-muted">Log in to view the admin dashboard.</p>
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
          <div className="neon-card neon-hover p-8 text-center">
            <p className="text-akari-muted">You need super admin access to view this page.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Admin Overview">
      <div className="px-4 py-4 md:px-6 lg:px-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-3 text-gradient-neon">Admin Overview</h1>
          <p className="text-base text-akari-muted leading-relaxed">High level view of AKARI Mystic Club.</p>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="neon-card neon-hover p-12 text-center">
            <p className="text-akari-muted">Loading overview...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="neon-card border-red-500/30 bg-red-500/10 p-6 text-center">
            <p className="text-red-400 font-semibold">{error}</p>
          </div>
        )}

        {/* Content */}
        {!loading && !error && data && (
          <>
            {/* Top Stats Row */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
              <div className="neon-card neon-hover p-6">
                <p className="text-xs uppercase tracking-wider text-gradient-teal font-semibold mb-2">Total Users</p>
                <p className="text-3xl font-bold text-gradient-akari">{formatNumber(data.stats.totalUsers)}</p>
                <p className="text-xs text-akari-muted mt-2">All time</p>
              </div>

              <div className="neon-card neon-hover p-6">
                <p className="text-xs uppercase tracking-wider text-gradient-blue font-semibold mb-2">Tracked Projects</p>
                <p className="text-3xl font-bold text-gradient-heat">{formatNumber(data.stats.trackedProjects)}</p>
                <p className="text-xs text-akari-muted mt-2">All time</p>
              </div>

              <div className="neon-card neon-hover p-6">
                <p className="text-xs uppercase tracking-wider text-gradient-pink font-semibold mb-2">Deep Explorer Users</p>
                <p className="text-3xl font-bold text-gradient-sentiment">{formatNumber(data.stats.deepExplorerUsers)}</p>
                <p className="text-xs text-akari-muted mt-2">With access</p>
              </div>

              <div className="neon-card neon-hover p-6">
                <p className="text-xs uppercase tracking-wider text-gradient-neon-teal font-semibold mb-2">Institutional Plus Users</p>
                <p className="text-3xl font-bold text-gradient-neon">{formatNumber(data.stats.institutionalPlusUsers)}</p>
                <p className="text-xs text-akari-muted mt-2">With access</p>
              </div>
            </section>

            {/* Recent Users and Projects */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Recent Users */}
              <div className="neon-card neon-hover p-6">
                <h2 className="text-base font-bold text-gradient-teal mb-6">Recent Users</h2>
                {data.recentUsers.length === 0 ? (
                  <p className="text-sm text-akari-muted">No users found.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5">
                          <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-teal">
                            Display Name
                          </th>
                          <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-blue">
                            X Handle
                          </th>
                          <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">
                            Created
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentUsers.map((user) => (
                          <tr
                            key={user.id}
                            className="border-b border-akari-neon-teal/10 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5"
                          >
                            <td className="py-4 px-5 text-akari-text font-semibold">
                              <Link
                                href={`/portal/admin/users/${user.id}`}
                                className="hover:text-gradient-teal transition-all duration-300"
                              >
                                {user.displayName || 'Unknown'}
                              </Link>
                            </td>
                            <td className="py-4 px-5 text-akari-muted">
                              {user.xUsername ? `@${user.xUsername}` : 'Not linked'}
                            </td>
                            <td className="py-4 px-5 text-akari-muted text-xs">
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
              <div className="neon-card neon-hover p-6">
                <h2 className="text-base font-bold text-gradient-blue mb-6">Recent Projects</h2>
                {data.recentProjects.length === 0 ? (
                  <p className="text-sm text-akari-muted">No projects found.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5">
                          <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-teal">
                            Name
                          </th>
                          <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-blue">
                            X Handle
                          </th>
                          <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">
                            Created
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recentProjects.map((project) => (
                          <tr
                            key={project.id}
                            className="border-b border-akari-neon-teal/10 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5"
                          >
                            <td className="py-4 px-5 text-akari-text font-semibold">
                              {project.name}
                            </td>
                            <td className="py-4 px-5 text-akari-muted">
                              {project.xHandle ? `@${project.xHandle}` : '-'}
                            </td>
                            <td className="py-4 px-5 text-akari-muted text-xs">
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

