/**
 * Super Admin ARC Leaderboard Requests Page
 * 
 * Allows super admins to review and approve/reject ARC leaderboard access requests.
 */

import { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { requireSuperAdmin } from '@/lib/server-auth';
import Link from 'next/link';

// =============================================================================
// TYPES
// =============================================================================

interface LeaderboardRequest {
  id: string;
  project_id: string;
  requested_by: string;
  justification: string | null;
  requested_arc_access_level: 'creator_manager' | 'leaderboard' | 'gamified' | null;
  status: 'pending' | 'approved' | 'rejected';
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
  project?: {
    id: string;
    name: string;
    display_name: string | null;
    slug: string | null;
    twitter_username: string | null;
  };
  requester?: {
    id: string;
    username: string;
    display_name: string | null;
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateString: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getStatusBadgeColor(status: 'pending' | 'approved' | 'rejected'): string {
  switch (status) {
    case 'approved':
      return 'bg-green-500/20 text-green-400 border-green-500/50';
    case 'rejected':
      return 'bg-red-500/20 text-red-400 border-red-500/50';
    case 'pending':
    default:
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function AdminLeaderboardRequestsPage() {
  const akariUser = useAkariUser();
  const [requests, setRequests] = useState<LeaderboardRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());
  const [approveModal, setApproveModal] = useState<{ requestId: string; projectName: string } | null>(null);
  const [selectedAccessLevel, setSelectedAccessLevel] = useState<'leaderboard' | 'gamified' | 'creator_manager'>('leaderboard');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ summary: any; dryRun?: boolean } | null>(null);

  // Check if user is super admin
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  // Handle backfill arenas (dry run)
  const handleBackfillArenasDryRun = async () => {
    setBackfillLoading(true);
    setBackfillResult(null);
    setError(null);
    try {
      const res = await fetch('/api/portal/admin/arc/backfill-arenas?dryRun=1', {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();

      if (data.ok) {
        setBackfillResult({ summary: data.summary, dryRun: data.dryRun });
      } else {
        setError(data.error || 'Failed to run backfill dry run');
      }
    } catch (err: any) {
      setError(`Backfill dry run error: ${err.message}`);
    } finally {
      setBackfillLoading(false);
    }
  };

  // Handle backfill arenas (real run)
  const handleBackfillArenas = async () => {
    if (!confirm('This will create/activate arenas for all approved leaderboard projects. Continue?')) {
      return;
    }

    setBackfillLoading(true);
    setBackfillResult(null);
    setError(null);
    try {
      const res = await fetch('/api/portal/admin/arc/backfill-arenas', {
        method: 'POST',
        credentials: 'include',
      });

      const data = await res.json();

      if (data.ok) {
        setBackfillResult({ summary: data.summary, dryRun: data.dryRun });
        // Reload requests to reflect any changes (only for real run)
        if (!data.dryRun) {
          await loadRequests();
        }
      } else {
        setError(data.error || 'Failed to backfill arenas');
      }
    } catch (err: any) {
      setError(`Backfill error: ${err.message}`);
    } finally {
      setBackfillLoading(false);
    }
  };

  // Load requests
  useEffect(() => {
    if (!userIsSuperAdmin) {
      setLoading(false);
      return;
    }

    loadRequests();
  }, [userIsSuperAdmin]);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/portal/admin/arc/leaderboard-requests');
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to load requests');
      }

      setRequests(data.requests || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (requestId: string) => {
    if (processingIds.has(requestId)) return;

    setProcessingIds((prev) => new Set(prev).add(requestId));
    setRowErrors((prev) => {
      const next = new Map(prev);
      next.delete(requestId);
      return next;
    });

    try {
      const res = await fetch(`/api/portal/admin/arc/leaderboard-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies (session token) - required for authentication
        body: JSON.stringify({ status: 'rejected' }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to reject request');
      }

      // Reload requests
      await loadRequests();
    } catch (err: any) {
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.set(requestId, err.message || 'Failed to reject request');
        return next;
      });
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const handleStopCampaign = async (projectId: string, requestId: string) => {
    if (processingIds.has(requestId)) return;

    if (!confirm('Are you sure you want to stop all active campaigns for this project? This will cancel all active arenas.')) {
      return;
    }

    setProcessingIds((prev) => new Set(prev).add(requestId));
    setRowErrors((prev) => {
      const next = new Map(prev);
      next.delete(requestId);
      return next;
    });

    try {
      const res = await fetch('/api/portal/admin/arc/stop-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to stop campaigns');
      }

      // Reload requests to refresh status
      await loadRequests();
    } catch (err: any) {
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.set(requestId, err.message || 'Failed to stop campaigns');
        return next;
      });
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const handleApprove = async () => {
    if (!approveModal) return;
    const requestId = approveModal.requestId;

    if (processingIds.has(requestId)) return;

    setProcessingIds((prev) => new Set(prev).add(requestId));
    setRowErrors((prev) => {
      const next = new Map(prev);
      next.delete(requestId);
      return next;
    });

    try {
      const res = await fetch(`/api/portal/admin/arc/leaderboard-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies (session token) - required for authentication
        body: JSON.stringify({
          status: 'approved',
          arc_access_level: selectedAccessLevel,
          start_at: startDate || undefined,
          end_at: endDate || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to approve request');
      }

      // Close modal and reload requests
      setApproveModal(null);
      setSelectedAccessLevel('leaderboard');
      setStartDate('');
      setEndDate('');
      await loadRequests();
    } catch (err: any) {
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.set(requestId, err.message || 'Failed to approve request');
        return next;
      });
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  // Not logged in
  if (!akariUser.isLoggedIn) {
    return (
      <PortalLayout title="ARC Leaderboard Requests">
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
      <PortalLayout title="ARC Leaderboard Requests">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400">You need super admin access to view this page.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <>
      <PortalLayout title="ARC Leaderboard Requests">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Link href="/portal/admin" className="hover:text-akari-primary transition-colors">
                  Admin
                </Link>
                <span>/</span>
                <Link href="/portal/arc" className="hover:text-akari-primary transition-colors">
                  ARC
                </Link>
                <span>/</span>
                <span className="text-slate-300">Leaderboard Requests</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleBackfillArenasDryRun}
                  disabled={backfillLoading || !userIsSuperAdmin}
                  className="px-4 py-2 bg-akari-primary/10 hover:bg-akari-primary/20 border border-akari-primary/30 rounded-lg text-sm text-akari-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {backfillLoading ? 'Processing...' : 'Backfill Arenas (Dry Run)'}
                </button>
                <button
                  onClick={handleBackfillArenas}
                  disabled={backfillLoading || !userIsSuperAdmin}
                  className="px-4 py-2 bg-akari-primary/20 hover:bg-akari-primary/30 border border-akari-primary/50 rounded-lg text-sm text-akari-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {backfillLoading ? 'Processing...' : 'Backfill Arenas (Run)'}
                </button>
              </div>
            </div>
            <h1 className="text-2xl font-semibold text-white mb-2">ARC Leaderboard Requests</h1>
            <p className="text-sm text-slate-400">
              Review and approve/reject requests for ARC leaderboard access.
            </p>
          </div>

          {/* Backfill Results */}
          {backfillResult && (
            <div className={`mb-6 p-4 rounded-lg border ${backfillResult.dryRun ? 'border-yellow-500/30 bg-yellow-500/10' : 'border-akari-primary/30 bg-akari-primary/10'}`}>
              <h3 className={`text-sm font-semibold mb-2 ${backfillResult.dryRun ? 'text-yellow-400' : 'text-akari-primary'}`}>
                {backfillResult.dryRun ? 'Backfill Dry Run Results' : 'Backfill Complete'}
              </h3>
              <div className="text-sm text-akari-text space-y-1">
                <p>Total Eligible: {backfillResult.summary.totalEligible}</p>
                <p>Scanned: {backfillResult.summary.scannedCount || backfillResult.summary.totalEligible}</p>
                <p>{backfillResult.dryRun ? 'Would Create' : 'Created'}: {backfillResult.summary.createdCount}</p>
                <p>{backfillResult.dryRun ? 'Would Update' : 'Updated'}: {backfillResult.summary.updatedCount}</p>
                <p>Skipped: {backfillResult.summary.skippedCount}</p>
                {backfillResult.summary.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="text-akari-danger font-semibold">Errors ({backfillResult.summary.errors.length}):</p>
                    <ul className="list-disc list-inside text-akari-muted">
                      {backfillResult.summary.errors.slice(0, 5).map((err: any, idx: number) => (
                        <li key={idx}>{err.slug || err.projectId}: {err.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-4" />
              <p className="text-slate-400">Loading requests...</p>
            </div>
          )}

          {/* Error state */}
          {error && !loading && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
              <p className="text-red-400">{error}</p>
              <button
                onClick={loadRequests}
                className="mt-4 px-4 py-2 rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-sm font-medium"
              >
                Retry
              </button>
            </div>
          )}

          {/* Requests table */}
          {!loading && !error && (
            <div className="rounded-2xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl overflow-hidden shadow-[0_0_30px_rgba(0,246,162,0.1)]">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5">
                      <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-teal">Project</th>
                      <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Requester</th>
                      <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Requested Access</th>
                      <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Justification</th>
                      <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Status</th>
                      <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Created</th>
                      <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 px-5 text-center text-akari-muted">
                          No requests found
                        </td>
                      </tr>
                    ) : (
                      requests.map((request) => {
                        const isProcessing = processingIds.has(request.id);
                        const rowError = rowErrors.get(request.id);
                        const projectName = request.project?.display_name || request.project?.name || 'Unknown Project';
                        const requesterDisplayName = request.requester?.display_name;
                        const requesterUsername = request.requester?.username;
                        const requesterName = requesterDisplayName || requesterUsername || 'Unknown';

                        return (
                          <tr
                            key={request.id}
                            className="border-b border-akari-neon-teal/10 last:border-0 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5"
                          >
                            <td className="py-4 px-5 text-akari-text font-semibold">
                              <div>{projectName}</div>
                              {request.project?.twitter_username && (
                                <div className="text-xs text-akari-muted">@{request.project.twitter_username}</div>
                              )}
                            </td>
                            <td className="py-4 px-5 text-akari-text font-semibold">
                              <div>{requesterName}</div>
                              {requesterUsername && (
                                <div className="text-xs text-akari-muted">@{requesterUsername}</div>
                              )}
                            </td>
                            <td className="py-4 px-5 text-akari-muted text-sm">
                              {request.requested_arc_access_level ? (
                                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                                  request.requested_arc_access_level === 'gamified' 
                                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                                    : request.requested_arc_access_level === 'leaderboard'
                                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                                    : 'bg-green-500/20 text-green-400 border border-green-500/50'
                                }`}>
                                  {request.requested_arc_access_level === 'creator_manager' && 'Creator Manager'}
                                  {request.requested_arc_access_level === 'leaderboard' && 'Campaign Leaderboard'}
                                  {request.requested_arc_access_level === 'gamified' && 'Gamified Leaderboard'}
                                </span>
                              ) : (
                                <span className="text-akari-muted/60">-</span>
                              )}
                            </td>
                            <td className="py-4 px-5 text-akari-muted text-sm max-w-xs">
                              {request.justification ? (
                                <div className="truncate" title={request.justification}>
                                  {request.justification}
                                </div>
                              ) : (
                                <span className="text-akari-muted/60">-</span>
                              )}
                            </td>
                            <td className="py-4 px-5">
                              <span className={`px-2 py-1 rounded text-xs font-medium border ${getStatusBadgeColor(request.status)}`}>
                                {request.status}
                              </span>
                            </td>
                            <td className="py-4 px-5 text-akari-muted text-xs">
                              {formatDate(request.created_at)}
                            </td>
                            <td className="py-4 px-5">
                              {rowError && (
                                <div className="text-xs text-red-400 mb-2">{rowError}</div>
                              )}
                              <div className="flex items-center gap-2">
                                {request.status === 'pending' && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setSelectedAccessLevel('leaderboard');
                                        setApproveModal({ requestId: request.id, projectName });
                                      }}
                                      disabled={isProcessing}
                                      className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/50 transition-all duration-300 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleReject(request.id)}
                                      disabled={isProcessing}
                                      className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50 transition-all duration-300 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {isProcessing ? 'Processing...' : 'Reject'}
                                    </button>
                                  </>
                                )}
                                {request.status === 'approved' && (
                                  <button
                                    onClick={() => handleStopCampaign(request.project_id, request.id)}
                                    disabled={isProcessing}
                                    className="px-3 py-1.5 rounded-lg bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/50 transition-all duration-300 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Stop all active campaigns for this project"
                                  >
                                    {isProcessing ? 'Stopping...' : 'Stop Campaign'}
                                  </button>
                                )}
                                {request.status !== 'pending' && request.status !== 'approved' && (
                                  <span className="text-xs text-akari-muted">
                                    {request.decided_at ? formatDate(request.decided_at) : '-'}
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </PortalLayout>

      {/* Approve Modal */}
      {approveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-white mb-4">Approve Request</h2>
            <p className="text-sm text-slate-400 mb-4">
              Approve ARC leaderboard access for <span className="font-semibold text-white">{approveModal.projectName}</span>?
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">ARC Access Level</label>
                <select
                  value={selectedAccessLevel}
                  onChange={(e) => setSelectedAccessLevel(e.target.value as 'leaderboard' | 'gamified' | 'creator_manager')}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                >
                  <option value="leaderboard">Leaderboard → /portal/arc/project/[slug]</option>
                  <option value="gamified">Gamified → /portal/arc/project/[slug]</option>
                  <option value="creator_manager">Creator Manager → /portal/arc/creator-manager</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {selectedAccessLevel === 'creator_manager' 
                    ? 'Routes to Creator Manager tools. Sets projects.arc_active=true and projects.arc_access_level=creator_manager'
                    : 'Routes to project ARC leaderboard page. Sets projects.arc_active=true and projects.arc_access_level=' + selectedAccessLevel}
                </p>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Start Date</label>
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                />
                <p className="text-xs text-slate-500 mt-1">When the leaderboard access should become active</p>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">End Date</label>
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                />
                <p className="text-xs text-slate-500 mt-1">When the leaderboard access should expire</p>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleApprove}
                disabled={processingIds.has(approveModal.requestId)}
                className="flex-1 px-4 py-2 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/50 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {processingIds.has(approveModal.requestId) ? 'Processing...' : 'Approve'}
              </button>
              <button
                onClick={() => {
                  setApproveModal(null);
                  setSelectedAccessLevel('leaderboard');
                  setStartDate('');
                  setEndDate('');
                }}
                disabled={processingIds.has(approveModal.requestId)}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 transition text-sm font-medium disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

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

