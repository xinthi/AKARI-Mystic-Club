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
  requestedByDisplayName?: string;
  requestedByUsername?: string;
  campaignStatus?: 'live' | 'paused' | 'ended' | null;
  arenaStatus?: 'active' | 'scheduled' | 'paused' | 'cancelled' | 'ended' | null;
  campaignEndedAt?: string | null;
  arenaEndedAt?: string | null;
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
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountNotes, setDiscountNotes] = useState<string>('');
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ summary: any; dryRun?: boolean } | null>(null);

  // Check if user is super admin
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  // Fetch pricing when access level changes
  useEffect(() => {
    if (!approveModal || !selectedAccessLevel) return;

    async function fetchPricing() {
      setPricingLoading(true);
      try {
        const res = await fetch('/api/portal/admin/arc/pricing', {
          credentials: 'include',
        });
        const data = await res.json();

        if (data.ok && data.pricing) {
          const pricing = data.pricing.find((p: any) => p.access_level === selectedAccessLevel);
          if (pricing) {
            setBasePrice(pricing.base_price_usd);
          }
        }
      } catch (err) {
        console.error('[Approve Modal] Error fetching pricing:', err);
      } finally {
        setPricingLoading(false);
      }
    }

    fetchPricing();
  }, [approveModal, selectedAccessLevel]);

  // Calculate final price
  const finalPrice = basePrice !== null ? basePrice * (1 - discountPercent / 100) : null;

  // Handle backfill live items (dry run)
  const handleBackfillLiveItemsDryRun = async () => {
    setBackfillLoading(true);
    setBackfillResult(null);
    setError(null);
    try {
      const res = await fetch('/api/portal/admin/arc/backfill-live-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dryRun: true, limit: 100 }),
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

  // Handle backfill live items (real run)
  const handleBackfillLiveItems = async () => {
    if (!confirm('This will create/activate arenas and ensure required records exist for all approved requests. Continue?')) {
      return;
    }

    setBackfillLoading(true);
    setBackfillResult(null);
    setError(null);
    try {
      const res = await fetch('/api/portal/admin/arc/backfill-live-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ dryRun: false, limit: 100 }),
      });

      const data = await res.json();

      if (data.ok) {
        setBackfillResult({ summary: data.summary, dryRun: data.dryRun });
        // Reload requests to reflect any changes (only for real run)
        if (!data.dryRun) {
          await loadRequests();
        }
      } else {
        setError(data.error || 'Failed to backfill live items');
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
      // Force refresh by adding cache-busting timestamp
      const timestamp = Date.now();
      console.log(`[UI] Loading requests with cache-bust timestamp: ${timestamp}`);
      const res = await fetch(`/api/portal/admin/arc/leaderboard-requests?t=${timestamp}`, {
        cache: 'no-store',
      });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to load requests');
      }

      console.log(`[UI] Loaded ${data.requests?.length || 0} requests`);
      // Log status of each request for debugging
      data.requests?.forEach((req: any) => {
        if (req.status === 'approved') {
          console.log(`[UI] Request ${req.id}: campaignStatus=${req.campaignStatus}, arenaStatus=${req.arenaStatus}, campaignEndedAt=${req.campaignEndedAt}, arenaEndedAt=${req.arenaEndedAt}`);
        }
      });

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

    if (!confirm('Are you sure you want to end this campaign/arena? This action cannot be undone.')) {
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
        body: JSON.stringify({ projectId, requestId }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to end campaigns');
      }

      console.log('[UI] Campaign/arena ended successfully, waiting for DB propagation...');
      // Small delay to ensure database update has propagated
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Reload requests to refresh status (with cache-busting)
      console.log('[UI] Reloading requests after ending campaign/arena');
      await loadRequests();
    } catch (err: any) {
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.set(requestId, err.message || 'Failed to end campaigns');
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

  const handleResumeCampaign = async (projectId: string, requestId: string) => {
    if (processingIds.has(requestId)) return;

    setProcessingIds((prev) => new Set(prev).add(requestId));
    setRowErrors((prev) => {
      const next = new Map(prev);
      next.delete(requestId);
      return next;
    });

    try {
      // Re-activate by approving again (API will handle re-activating paused arenas/campaigns)
      const res = await fetch(`/api/portal/admin/arc/leaderboard-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: 'approved',
          // Don't change access level or dates, just re-activate
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to resume leaderboard');
      }

      console.log('[UI] Campaign/arena resumed successfully, waiting for DB propagation...');
      // Small delay to ensure database update has propagated
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Reload requests to refresh status (with cache-busting)
      console.log('[UI] Reloading requests after resuming campaign/arena');
      await loadRequests();
    } catch (err: any) {
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.set(requestId, err.message || 'Failed to resume leaderboard');
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

  const handlePauseCampaign = async (projectId: string, requestId: string) => {
    if (processingIds.has(requestId)) return;

    if (!confirm('Are you sure you want to pause this campaign/arena?')) {
      return;
    }

    setProcessingIds((prev) => new Set(prev).add(requestId));
    setRowErrors((prev) => {
      const next = new Map(prev);
      next.delete(requestId);
      return next;
    });

    try {
      const res = await fetch('/api/portal/admin/arc/pause-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId, requestId }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to pause campaigns');
      }

      console.log('[UI] Campaign/arena paused successfully, waiting for DB propagation...');
      // Small delay to ensure database update has propagated
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Reload requests to refresh status (with cache-busting)
      console.log('[UI] Reloading requests after pausing campaign/arena');
      await loadRequests();
    } catch (err: any) {
      setRowErrors((prev) => {
        const next = new Map(prev);
        next.set(requestId, err.message || 'Failed to pause campaigns');
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
          discount_percent: discountPercent || 0,
          discount_notes: discountNotes.trim() || undefined,
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
      setDiscountPercent(0);
      setDiscountNotes('');
      setBasePrice(null);
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
                  onClick={handleBackfillLiveItemsDryRun}
                  disabled={backfillLoading || !userIsSuperAdmin}
                  className="px-4 py-2 bg-akari-primary/10 hover:bg-akari-primary/20 border border-akari-primary/30 rounded-lg text-sm text-akari-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {backfillLoading ? 'Processing...' : 'Backfill Live Items (Dry Run)'}
                </button>
                <button
                  onClick={handleBackfillLiveItems}
                  disabled={backfillLoading || !userIsSuperAdmin}
                  className="px-4 py-2 bg-akari-primary/20 hover:bg-akari-primary/30 border border-akari-primary/50 rounded-lg text-sm text-akari-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {backfillLoading ? 'Processing...' : 'Backfill Live Items (Run)'}
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
                      <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider font-semibold text-gradient-teal">Project</th>
                      <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider font-semibold text-akari-muted">Requester</th>
                      <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider font-semibold text-akari-muted">Access</th>
                      <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider font-semibold text-akari-muted">Justification</th>
                      <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider font-semibold text-akari-muted">Status</th>
                      <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider font-semibold text-akari-muted">Created</th>
                      <th className="text-left py-3 px-4 text-[10px] uppercase tracking-wider font-semibold text-akari-muted">Actions</th>
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
                        // Use API-provided fallback fields first, then fallback to requester object
                        const requesterDisplayName = request.requestedByDisplayName || request.requester?.display_name;
                        const requesterUsername = request.requestedByUsername || request.requester?.username;
                        const requesterName = requesterDisplayName || requesterUsername || 'N/A';

                        return (
                          <tr
                            key={request.id}
                            className="border-b border-akari-neon-teal/10 last:border-0 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5"
                          >
                            <td className="py-3 px-4 text-akari-text font-semibold text-sm">
                              <div className="truncate max-w-[150px]">{projectName}</div>
                              {request.project?.twitter_username && (
                                <div className="text-[10px] text-akari-muted truncate">@{request.project.twitter_username}</div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-akari-text text-xs">
                              {requesterName !== 'N/A' ? (
                                <>
                                  <div className="font-medium truncate max-w-[120px]">{requesterName}</div>
                                  {requesterUsername && (
                                    <div className="text-[10px] text-akari-muted truncate">@{requesterUsername}</div>
                                  )}
                                </>
                              ) : (
                                <span className="text-akari-muted/60 italic text-xs">Unknown</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-akari-muted">
                              {request.requested_arc_access_level ? (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  request.requested_arc_access_level === 'gamified' 
                                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                                    : request.requested_arc_access_level === 'leaderboard'
                                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                                    : 'bg-green-500/20 text-green-400 border border-green-500/50'
                                }`}>
                                  {request.requested_arc_access_level === 'creator_manager' && 'CRM'}
                                  {request.requested_arc_access_level === 'leaderboard' && 'Leaderboard'}
                                  {request.requested_arc_access_level === 'gamified' && 'Gamified'}
                                </span>
                              ) : (
                                <span className="text-akari-muted/60 text-xs">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-akari-muted text-xs max-w-[200px]">
                              {request.justification ? (
                                <div className="truncate" title={request.justification}>
                                  {request.justification}
                                </div>
                              ) : (
                                <span className="text-akari-muted/60 text-xs">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {(() => {
                                // Show campaign/arena status for approved requests
                                if (request.status === 'approved') {
                                  const campaignStatus = request.campaignStatus;
                                  const arenaStatus = request.arenaStatus;
                                  
                                  // Determine effective status
                                  let displayStatus: string = request.status;
                                  let statusColor = getStatusBadgeColor('approved');
                                  
                                  // Check for ended first (including 'cancelled' which is treated as ended)
                                  if (campaignStatus === 'ended' || arenaStatus === 'ended' || arenaStatus === 'cancelled') {
                                    displayStatus = 'ended';
                                    statusColor = 'bg-gray-500/20 text-gray-400 border-gray-500/50';
                                  } else if (campaignStatus === 'paused' || arenaStatus === 'paused') {
                                    // Only 'paused' status is treated as paused (can be re-instated)
                                    displayStatus = 'paused';
                                    statusColor = 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
                                  } else if (campaignStatus === 'live' || arenaStatus === 'active' || arenaStatus === 'scheduled') {
                                    displayStatus = 'live';
                                    statusColor = 'bg-green-500/20 text-green-400 border-green-500/50';
                                  }
                                  
                                  return (
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border uppercase ${statusColor}`}>
                                      {displayStatus}
                                    </span>
                                  );
                                }
                                
                                return (
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border uppercase ${getStatusBadgeColor(request.status)}`}>
                                    {request.status}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-4 text-akari-muted text-[10px]">
                              {formatDate(request.created_at)}
                            </td>
                            <td className="py-3 px-4">
                              {rowError && (
                                <div className="text-xs text-red-400 mb-1.5 truncate">{rowError}</div>
                              )}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {request.status === 'pending' && (
                                  <>
                                    <button
                                      onClick={() => {
                                        setSelectedAccessLevel('leaderboard');
                                        setApproveModal({ requestId: request.id, projectName });
                                      }}
                                      disabled={isProcessing}
                                      className="px-2.5 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/50 transition-colors text-[10px] font-medium h-7 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      onClick={() => handleReject(request.id)}
                                      disabled={isProcessing}
                                      className="px-2.5 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50 transition-colors text-[10px] font-medium h-7 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {isProcessing ? '...' : 'Reject'}
                                    </button>
                                  </>
                                )}
                                {request.status === 'approved' && (() => {
                                  // Check for ended: campaigns/arenas with 'ended' or 'cancelled' status
                                  // 'cancelled' is treated as ended (cannot be re-instated)
                                  const isEnded = request.campaignStatus === 'ended' || 
                                                  request.arenaStatus === 'ended' || 
                                                  request.arenaStatus === 'cancelled';
                                  // Check for paused: only 'paused' status (can be re-instated)
                                  const isPaused = !isEnded && (
                                    request.campaignStatus === 'paused' || 
                                    request.arenaStatus === 'paused'
                                  );
                                  // Active/live if not ended and not paused
                                  const isActive = !isEnded && !isPaused;

                                  // ENDED: Show ENDED badge with end date, no action buttons
                                  if (isEnded) {
                                    const endDate = request.campaignEndedAt || request.arenaEndedAt;
                                    return (
                                      <div className="flex flex-col gap-1">
                                        <span className="px-2 py-0.5 rounded bg-gray-500/10 text-gray-400 text-[10px] font-medium">
                                          ENDED
                                        </span>
                                        {endDate && (
                                          <span className="text-[9px] text-akari-muted">
                                            {formatDate(endDate)}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  }

                                  // PAUSED: Show PAUSED badge and Start button (can be re-instated)
                                  if (isPaused) {
                                    return (
                                      <>
                                        <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400 text-[10px] font-medium mr-1.5">
                                          PAUSED
                                        </span>
                                        <button
                                          onClick={() => handleResumeCampaign(request.project_id, request.id)}
                                          disabled={isProcessing}
                                          className="px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/50 transition-colors text-[10px] font-medium h-7 disabled:opacity-50 disabled:cursor-not-allowed"
                                          title="Start this leaderboard"
                                        >
                                          {isProcessing ? '...' : 'Start'}
                                        </button>
                                        {userIsSuperAdmin && (
                                          <button
                                            onClick={() => handleStopCampaign(request.project_id, request.id)}
                                            disabled={isProcessing}
                                            className="px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50 transition-colors text-[10px] font-medium h-7 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="End this leaderboard"
                                          >
                                            {isProcessing ? '...' : 'End'}
                                          </button>
                                        )}
                                      </>
                                    );
                                  }

                                  // LIVE: Show LIVE badge and Pause/End buttons
                                  return (
                                    <>
                                      <span className="px-2 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px] font-medium mr-1.5">
                                        LIVE
                                      </span>
                                      <button
                                        onClick={() => handlePauseCampaign(request.project_id, request.id)}
                                        disabled={isProcessing}
                                        className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/50 transition-colors text-[10px] font-medium h-7 disabled:opacity-50 disabled:cursor-not-allowed"
                                        title="Pause this leaderboard"
                                      >
                                        {isProcessing ? '...' : 'Pause'}
                                      </button>
                                      {userIsSuperAdmin && (
                                        <button
                                          onClick={() => handleStopCampaign(request.project_id, request.id)}
                                          disabled={isProcessing}
                                          className="px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50 transition-colors text-[10px] font-medium h-7 disabled:opacity-50 disabled:cursor-not-allowed"
                                          title="End this leaderboard"
                                        >
                                          {isProcessing ? '...' : 'End'}
                                        </button>
                                      )}
                                    </>
                                  );
                                })()}
                                {request.status !== 'pending' && request.status !== 'approved' && (
                                  <span className="text-[10px] text-akari-muted">
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

              {/* Pricing and Discount Section */}
              <div className="border-t border-slate-700 pt-4 mt-4">
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs text-slate-400">Base Price</label>
                    {pricingLoading ? (
                      <span className="text-xs text-slate-500">Loading...</span>
                    ) : basePrice !== null ? (
                      <span className="text-sm font-semibold text-white">${basePrice.toFixed(2)}</span>
                    ) : (
                      <span className="text-xs text-slate-500">Not set</span>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-slate-400">Discount (%)</label>
                    <span className="text-xs text-slate-500">Super Admin Only</span>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={discountPercent}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                      setDiscountPercent(val);
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                    placeholder="0"
                  />
                  <p className="text-xs text-slate-500 mt-1">Enter discount percentage (0-100)</p>
                </div>

                {discountPercent > 0 && (
                  <div className="mt-3">
                    <label className="block text-xs text-slate-400 mb-1">Discount Notes (Optional)</label>
                    <textarea
                      value={discountNotes}
                      onChange={(e) => setDiscountNotes(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary resize-none"
                      rows={2}
                      placeholder="Reason for discount (e.g., partnership, early adopter, etc.)"
                    />
                    <p className="text-xs text-slate-500 mt-1">Internal notes about why this discount was applied</p>
                  </div>
                )}

                {basePrice !== null && (
                  <div className="mt-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">Final Price</span>
                      <span className="text-lg font-bold text-green-400">
                        ${finalPrice !== null ? finalPrice.toFixed(2) : '0.00'}
                      </span>
                    </div>
                    {discountPercent > 0 && (
                      <div className="mt-1 text-xs text-slate-500">
                        Savings: ${(basePrice - (finalPrice || 0)).toFixed(2)} ({discountPercent}%)
                      </div>
                    )}
                  </div>
                )}
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
                  setDiscountPercent(0);
                  setDiscountNotes('');
                  setBasePrice(null);
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

