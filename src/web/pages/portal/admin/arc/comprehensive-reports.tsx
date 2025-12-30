/**
 * ARC Comprehensive Platform Reports Page
 * 
 * Shows comprehensive platform-wide reports for super admins only.
 * Includes financial metrics, user activity, participation stats, etc.
 */

import { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { requireSuperAdmin } from '@/lib/server-auth';

// =============================================================================
// TYPES
// =============================================================================

interface ComprehensiveReport {
  financial: {
    totalRevenue: number;
    monthlyRevenue: number;
    totalBillingRecords: number;
    averageRevenuePerProject: number;
    revenueByAccessLevel: {
      leaderboard: number;
      gamified: number;
      creator_manager: number;
    };
  };
  platform: {
    totalProjects: number;
    activeProjects: number;
    projectsRunningCampaigns: number;
    totalTrackedProfiles: number;
    activeUsers: number;
  };
  userActivity: {
    totalCampaigns: number;
    activeCampaigns: number;
    totalArenas: number;
    activeArenas: number;
    totalCreatorManagerPrograms: number;
    activeCreatorManagerPrograms: number;
    totalParticipants: number;
    activeParticipants: number;
  };
  participation: {
    totalPosts: number;
    totalEngagements: number;
    averageParticipationPerCampaign: number;
    topParticipatingProjects: Array<{
      projectId: string;
      projectName: string;
      participantCount: number;
      engagementCount: number;
    }>;
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ComprehensiveReportsPage() {
  const akariUser = useAkariUser();
  const [report, setReport] = useState<ComprehensiveReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  useEffect(() => {
    if (!userIsSuperAdmin) {
      setLoading(false);
      return;
    }

    loadReport();
  }, [userIsSuperAdmin]);

  const loadReport = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/portal/admin/arc/comprehensive-reports', {
        credentials: 'include',
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load comprehensive report');
      }

      setReport(data.report);
    } catch (err: any) {
      setError(err.message || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  // Not logged in
  if (!akariUser.isLoggedIn) {
    return (
      <PortalLayout title="Comprehensive Reports">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400">Log in to view this page.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  // Not super admin
  if (!userIsSuperAdmin) {
    return (
      <PortalLayout title="Comprehensive Reports">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400">You need super admin access to view this page.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Comprehensive Platform Reports">
      <div className="px-4 py-4 md:px-6 lg:px-10">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Link href="/portal/admin/arc/reports" className="hover:text-akari-primary transition-colors">
                Reports
              </Link>
              <span>/</span>
              <span className="text-slate-300">Platform Reports</span>
            </div>
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2">Comprehensive Platform Reports</h1>
          <p className="text-sm text-slate-400">
            Financial metrics, user activity, participation stats, and platform-wide analytics
          </p>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-4" />
            <p className="text-slate-400">Loading comprehensive report...</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-2xl p-6 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Report content */}
        {!loading && !error && report && (
          <div className="space-y-6">
            {/* Financial Metrics */}
            <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
              <h2 className="text-lg font-semibold text-white mb-4">Financial Metrics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold text-akari-text">
                    ${report.financial.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Monthly Revenue</p>
                  <p className="text-2xl font-bold text-akari-text">
                    ${report.financial.monthlyRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Total Billing Records</p>
                  <p className="text-2xl font-bold text-akari-text">
                    {report.financial.totalBillingRecords.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Avg Revenue per Project</p>
                  <p className="text-2xl font-bold text-akari-text">
                    ${report.financial.averageRevenuePerProject.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-slate-700">
                <p className="text-xs text-akari-muted mb-2">Revenue by Access Level</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                    <p className="text-xs text-akari-muted mb-1">Leaderboard</p>
                    <p className="text-lg font-semibold text-akari-text">
                      ${report.financial.revenueByAccessLevel.leaderboard.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                    <p className="text-xs text-akari-muted mb-1">Gamified</p>
                    <p className="text-lg font-semibold text-akari-text">
                      ${report.financial.revenueByAccessLevel.gamified.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                    <p className="text-xs text-akari-muted mb-1">Creator Manager</p>
                    <p className="text-lg font-semibold text-akari-text">
                      ${report.financial.revenueByAccessLevel.creator_manager.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Platform Metrics */}
            <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
              <h2 className="text-lg font-semibold text-white mb-4">Platform Metrics</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Total Projects</p>
                  <p className="text-2xl font-bold text-akari-text">
                    {report.platform.totalProjects.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Active Projects</p>
                  <p className="text-2xl font-bold text-akari-text">
                    {report.platform.activeProjects.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Projects w/ Campaigns</p>
                  <p className="text-2xl font-bold text-akari-text">
                    {report.platform.projectsRunningCampaigns.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Total Tracked Profiles</p>
                  <p className="text-2xl font-bold text-akari-text">
                    {report.platform.totalTrackedProfiles.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Active Users</p>
                  <p className="text-2xl font-bold text-akari-text">
                    {report.platform.activeUsers.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* User Activity */}
            <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
              <h2 className="text-lg font-semibold text-white mb-4">User Activity</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Campaigns</p>
                  <p className="text-xl font-bold text-akari-text">
                    {report.userActivity.activeCampaigns} / {report.userActivity.totalCampaigns}
                  </p>
                  <p className="text-xs text-akari-muted mt-1">Active / Total</p>
                </div>
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Arenas</p>
                  <p className="text-xl font-bold text-akari-text">
                    {report.userActivity.activeArenas} / {report.userActivity.totalArenas}
                  </p>
                  <p className="text-xs text-akari-muted mt-1">Active / Total</p>
                </div>
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Creator Manager Programs</p>
                  <p className="text-xl font-bold text-akari-text">
                    {report.userActivity.activeCreatorManagerPrograms} / {report.userActivity.totalCreatorManagerPrograms}
                  </p>
                  <p className="text-xs text-akari-muted mt-1">Active / Total</p>
                </div>
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Participants</p>
                  <p className="text-xl font-bold text-akari-text">
                    {report.userActivity.activeParticipants.toLocaleString()} / {report.userActivity.totalParticipants.toLocaleString()}
                  </p>
                  <p className="text-xs text-akari-muted mt-1">Active / Total</p>
                </div>
              </div>
            </div>

            {/* Participation Stats */}
            <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
              <h2 className="text-lg font-semibold text-white mb-4">Participation Stats</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Total Posts</p>
                  <p className="text-2xl font-bold text-akari-text">
                    {report.participation.totalPosts.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Total Engagements</p>
                  <p className="text-2xl font-bold text-akari-text">
                    {report.participation.totalEngagements.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-600/50 p-4 bg-akari-cardSoft/30">
                  <p className="text-xs text-akari-muted mb-1">Avg Participation per Campaign</p>
                  <p className="text-2xl font-bold text-akari-text">
                    {report.participation.averageParticipationPerCampaign.toFixed(1)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  // Require Super Admin access
  const redirect = await requireSuperAdmin(context);
  if (redirect) {
    return redirect;
  }

  // User is authenticated and is Super Admin
  return {
    props: {},
  };
};

