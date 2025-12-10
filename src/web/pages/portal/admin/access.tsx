/**
 * Super Admin Access Requests Page
 * 
 * Allows super admins to review and approve/reject feature access requests.
 */

import { useState, useEffect } from 'react';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { FEATURE_KEYS } from '@/lib/permissions';

// =============================================================================
// TYPES
// =============================================================================

interface AccessRequestWithUser {
  id: string;
  userId: string;
  featureKey: string;
  requestedPlan: string | null;
  justification: string | null;
  status: string;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    displayName: string;
    xUsername: string | null;
    currentTier: 'seer' | 'analyst' | 'institutional_plus';
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function getFeatureLabel(featureKey: string, requestedPlan?: string | null): string {
  // If requested_plan is set, prefer that (for tier-based requests)
  if (requestedPlan) {
    if (requestedPlan === 'analyst') return 'Analyst (Tier Upgrade)';
    if (requestedPlan === 'institutional_plus') return 'Institutional Plus (Tier Upgrade)';
  }
  
  // Fallback to feature key mapping
  switch (featureKey) {
    case FEATURE_KEYS.DeepExplorer:
      return 'Deep Explorer';
    case FEATURE_KEYS.InstitutionalPlus:
      return 'Institutional Plus';
    case 'markets.analytics':
      return 'Analyst (Tier Upgrade)'; // Analyst tier upgrade request
    default:
      return featureKey;
  }
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

function truncateText(text: string | null, maxLength: number = 50): string {
  if (!text) return '-';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

function getTierColor(tier: 'seer' | 'analyst' | 'institutional_plus'): string {
  switch (tier) {
    case 'institutional_plus':
      return 'bg-amber-500/20 text-amber-400 border-amber-500/50';
    case 'analyst':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
    case 'seer':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
  }
}

function formatTierName(tier: 'seer' | 'analyst' | 'institutional_plus'): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1).replace('_', ' ');
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function AdminAccessRequestsPage() {
  const akariUser = useAkariUser();
  const [requests, setRequests] = useState<AccessRequestWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Map<string, string>>(new Map());

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
      const res = await fetch('/api/portal/admin/access/requests');
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

  const handleDecision = async (requestId: string, action: 'approve' | 'reject') => {
    if (processingIds.has(requestId)) return;

    setProcessingIds((prev) => new Set(prev).add(requestId));
    setRowErrors((prev) => {
      const next = new Map(prev);
      next.delete(requestId);
      return next;
    });

    try {
      const res = await fetch('/api/portal/admin/access/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Action failed');
      }

      // Remove request from list
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err: any) {
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.set(requestId, err.message || 'Action failed. Try again.');
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

  // Not logged in or not super admin
  if (!akariUser.isLoggedIn || !userIsSuperAdmin) {
    return (
      <PortalLayout title="Access Requests - Admin">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400">
              You need super admin access to view this page.
            </p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Access Requests - Admin">
      <div className="px-4 py-4 md:px-6 lg:px-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white mb-2">Access Requests</h1>
          <p className="text-sm text-slate-400">Review feature access requests from users.</p>
        </div>

        {/* Main Card */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          {loading ? (
            <div className="py-12 text-center text-slate-400">
              Loading requests...
            </div>
          ) : error ? (
            <div className="py-12 text-center text-red-400">
              {error}
            </div>
          ) : requests.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              No pending access requests.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-slate-500">
                      User
                    </th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-slate-500">
                      X Handle
                    </th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-slate-500">
                      Current Tier
                    </th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-slate-500">
                      Feature
                    </th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-slate-500">
                      Requested Plan
                    </th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-slate-500">
                      Justification
                    </th>
                    <th className="text-left py-3 px-4 text-xs uppercase tracking-wider text-slate-500">
                      Requested At
                    </th>
                    <th className="text-right py-3 px-4 text-xs uppercase tracking-wider text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => {
                    const isProcessing = processingIds.has(request.id);
                    const rowError = rowErrors.get(request.id);

                    return (
                      <tr
                        key={request.id}
                        className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                      >
                        {/* User */}
                        <td className="py-3 px-4 text-sm text-white">
                          {request.user.displayName || 'Unknown user'}
                        </td>

                        {/* X Handle */}
                        <td className="py-3 px-4 text-sm text-slate-400">
                          {request.user.xUsername ? `@${request.user.xUsername}` : 'Not linked'}
                        </td>

                        {/* Current Tier */}
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getTierColor(request.user.currentTier)}`}>
                            {formatTierName(request.user.currentTier)}
                          </span>
                        </td>

                        {/* Feature */}
                        <td className="py-3 px-4 text-sm text-slate-300">
                          {getFeatureLabel(request.featureKey, request.requestedPlan)}
                        </td>

                        {/* Requested Plan */}
                        <td className="py-3 px-4 text-sm text-slate-400">
                          {request.requestedPlan || '-'}
                        </td>

                        {/* Justification */}
                        <td className="py-3 px-4 text-sm text-slate-400 max-w-xs">
                          <span
                            title={request.justification || ''}
                            className="block truncate"
                          >
                            {truncateText(request.justification, 40)}
                          </span>
                        </td>

                        {/* Requested At */}
                        <td className="py-3 px-4 text-sm text-slate-400">
                          {formatDate(request.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-2">
                            {rowError && (
                              <span className="text-xs text-red-400 mr-2">{rowError}</span>
                            )}
                            <button
                              onClick={() => handleDecision(request.id, 'approve')}
                              disabled={isProcessing}
                              className="px-3 py-1.5 min-h-[32px] rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/50 transition text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isProcessing ? 'Processing...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleDecision(request.id, 'reject')}
                              disabled={isProcessing}
                              className="px-3 py-1.5 min-h-[32px] rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50 transition text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isProcessing ? 'Processing...' : 'Reject'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

