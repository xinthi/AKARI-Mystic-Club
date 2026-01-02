/**
 * Super Admin ARC Leaderboard Requests Page
 * 
 * Allows super admins to review and approve ARC leaderboard access requests.
 */

import { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { requireSuperAdmin } from '@/lib/server-auth';

// =============================================================================
// TYPES
// =============================================================================

interface LeaderboardRequest {
  id: string;
  project_id: string;
  status: 'pending' | 'approved' | 'rejected';
  product_type?: 'ms' | 'gamefi' | 'crm' | null;
  start_at?: string | null;
  end_at?: string | null;
  created_at: string;
  project?: {
    id: string;
    name: string;
    slug: string | null;
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
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

function getProductTypeLabel(productType: string | null | undefined): string {
  if (!productType) return '-';
  switch (productType) {
    case 'ms':
      return 'Mindshare';
    case 'gamefi':
      return 'GameFi';
    case 'crm':
      return 'CRM';
    default:
      return productType;
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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Check if user is super admin
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

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
      const res = await fetch('/api/portal/admin/arc/leaderboard-requests', {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to load requests');
      }

      // Filter to show only pending requests (as per requirements)
      const pendingRequests = (data.requests || []).filter(
        (req: LeaderboardRequest) => req.status === 'pending'
      );

      setRequests(pendingRequests);
    } catch (err: any) {
      setError(err.message || 'Failed to load requests.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (processingIds.has(requestId)) return;

    setProcessingIds((prev) => new Set(prev).add(requestId));
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/portal/admin/arc/leaderboard-requests/${requestId}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to approve request');
      }

      // Show success message
      setSuccessMessage(`Request approved successfully for project ${data.projectId || requestId}`);

      // Reload requests after a short delay
      setTimeout(() => {
        loadRequests();
        setSuccessMessage(null);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to approve request');
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
      <ArcPageShell canManageArc={true}>
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
          <p className="text-sm text-red-400">Log in to view this page.</p>
        </div>
      </ArcPageShell>
    );
  }

  // Not super admin
  if (!userIsSuperAdmin) {
    return (
      <ArcPageShell canManageArc={true}>
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
          <p className="text-sm text-red-400">You need super admin access to view this page.</p>
          <Link
            href="/portal/arc"
            className="mt-4 inline-block text-sm text-teal-400 hover:text-teal-300 transition-colors"
          >
            ← Back to ARC Home
          </Link>
        </div>
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell 
      canManageArc={true}
      isSuperAdmin={userIsSuperAdmin}
    >
      <div className="space-y-6">
        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link href="/portal/arc" className="hover:text-white transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <Link href="/portal/admin/arc" className="hover:text-white transition-colors">
            Super Admin
          </Link>
          <span>/</span>
          <span className="text-white">Leaderboard Requests</span>
        </div>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">ARC Leaderboard Requests</h1>
          <p className="text-white/60">Review and approve pending ARC leaderboard access requests.</p>
        </div>

        {/* Success message */}
        {successMessage && (
          <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-4">
            <p className="text-sm text-green-400">{successMessage}</p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">{error}</p>
            <button
              onClick={loadRequests}
              className="mt-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50 transition text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-12 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-400 border-t-transparent mx-auto mb-4" />
            <p className="text-white/60">Loading requests...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && requests.length === 0 && (
          <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-12 text-center">
            <p className="text-white/60 mb-2">No pending ARC requests</p>
            <p className="text-sm text-white/40">All requests have been processed.</p>
          </div>
        )}

        {/* Requests table */}
        {!loading && !error && requests.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10 bg-black/20">
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider font-semibold text-white/80">
                      Project Name
                    </th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider font-semibold text-white/80">
                      Project Slug
                    </th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider font-semibold text-white/80">
                      Product Type
                    </th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider font-semibold text-white/80">
                      Start Date
                    </th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider font-semibold text-white/80">
                      End Date
                    </th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider font-semibold text-white/80">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider font-semibold text-white/80">
                      Requested At
                    </th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider font-semibold text-white/80">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => {
                    const isProcessing = processingIds.has(request.id);
                    const projectName = request.project?.name || 'Unknown Project';
                    const projectSlug = request.project?.slug || '-';

                    return (
                      <tr
                        key={request.id}
                        className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                      >
                        <td className="py-3 px-4 text-white text-sm">{projectName}</td>
                        <td className="py-3 px-4 text-white/60 text-sm font-mono">
                          {projectSlug}
                        </td>
                        <td className="py-3 px-4 text-white/60 text-sm">
                          {getProductTypeLabel(request.product_type)}
                        </td>
                        <td className="py-3 px-4 text-white/60 text-sm">
                          {formatDate(request.start_at)}
                        </td>
                        <td className="py-3 px-4 text-white/60 text-sm">
                          {formatDate(request.end_at)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium border uppercase ${getStatusBadgeColor(
                              request.status
                            )}`}
                          >
                            {request.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-white/60 text-sm">
                          {formatDate(request.created_at)}
                        </td>
                        <td className="py-3 px-4">
                          {request.status === 'pending' && (
                            <button
                              onClick={() => handleApprove(request.id)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/50 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isProcessing ? 'Processing...' : 'Approve'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
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
  const redirect = await requireSuperAdmin(context);
  if (redirect) {
    return redirect;
  }

  // User is authenticated and is Super Admin
  return {
    props: {},
  };
};
