/**
 * ARC Admin - Per-Project Arena Manager
 * 
 * Manage arenas for a specific project
 */

import React, { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { createPortalClient } from '@/lib/portal/supabase';
import { isSuperAdmin } from '@/lib/permissions';
import { useAkariUser } from '@/lib/akari-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkProjectPermissions, type ProjectPermissionCheck } from '@/lib/project-permissions';
import { getSessionTokenFromRequest } from '@/lib/server-auth';
import { useCurrentMsArena } from '@/lib/arc/hooks';
import { activateMsArena } from '@/lib/arc/api';

// =============================================================================
// TYPES
// =============================================================================

interface Arena {
  id: string;
  project_id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
  starts_at: string | null;
  ends_at: string | null;
  reward_depth: number;
  kind?: string | null;
}

interface ProjectInfo {
  id: string;
  name: string;
  twitter_username: string | null;
  slug: string | null;
}

interface ProjectFeatures {
  leaderboard_enabled: boolean;
  leaderboard_start_at: string | null;
  leaderboard_end_at: string | null;
  gamefi_enabled: boolean;
  gamefi_start_at: string | null;
  gamefi_end_at: string | null;
  crm_enabled: boolean;
  crm_start_at: string | null;
  crm_end_at: string | null;
  crm_visibility: 'private' | 'public' | 'hybrid' | null;
}

interface LeaderboardRequest {
  id: string;
  project_id: string;
  product_type: 'ms' | 'gamefi' | 'crm' | null;
  start_at: string | null;
  end_at: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_at: string | null;
  notes: string | null;
}

interface ArenaManagerProps {
  project: ProjectInfo | null;
  arenas: Arena[];
  error: string | null;
  projectSlug: string;
  hasAccess: boolean;
  accessError: string | null;
  features: ProjectFeatures | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArenaManager({ project, arenas: initialArenas, error, projectSlug, hasAccess, accessError, features: initialFeatures }: ArenaManagerProps) {
  const router = useRouter();
  const akariUser = useAkariUser();
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);
  const [permissions, setPermissions] = useState<ProjectPermissionCheck | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);

  const [arenas, setArenas] = useState<Arena[]>(initialArenas);
  const [activateSuccess, setActivateSuccess] = useState<string | null>(null);
  const [activatingArenaId, setActivatingArenaId] = useState<string | null>(null);

  // Load current MS arena
  const { arena: currentArena, debug, loading: arenaLoading, error: arenaError, refresh: refreshCurrentArena } = useCurrentMsArena(project?.id || null);

  // ARC Access Requests state
  const [requests, setRequests] = useState<LeaderboardRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [latestRequest, setLatestRequest] = useState<LeaderboardRequest | null>(null);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

  // Request form state
  const [formProductType, setFormProductType] = useState<'ms' | 'gamefi' | 'crm'>('ms');
  const [formStartAt, setFormStartAt] = useState('');
  const [formEndAt, setFormEndAt] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Fetch permissions client-side to determine what actions are allowed
  useEffect(() => {
    async function fetchPermissions() {
      if (!project?.id || !akariUser.isLoggedIn) {
        setPermissionsLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/portal/arc/permissions?projectId=${encodeURIComponent(project.id)}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            setPermissions(data.permissions);
          }
        }
      } catch (err) {
        console.warn('[ArenaManager] Failed to fetch permissions:', err);
      } finally {
        setPermissionsLoading(false);
      }
    }

    fetchPermissions();
  }, [project?.id, akariUser.isLoggedIn]);

  // Fetch ARC access requests
  useEffect(() => {
    async function fetchRequests() {
      if (!project?.id) {
        setRequestsLoading(false);
        return;
      }

      setRequestsLoading(true);
      setRequestsError(null);

      try {
        const res = await fetch(`/api/portal/arc/leaderboard-requests?projectId=${encodeURIComponent(project.id)}`, {
          credentials: 'include',
        });
        const data = await res.json();

        if (!data.ok) {
          throw new Error(data.error || 'Failed to load requests');
        }

        const requestsList: LeaderboardRequest[] = data.requests || [];
        setRequests(requestsList);

        // Find latest request
        if (requestsList.length > 0) {
          const latest = requestsList[0];
          setLatestRequest(latest);
          setHasPendingRequest(latest.status === 'pending');
        } else {
          setLatestRequest(null);
          setHasPendingRequest(false);
        }
      } catch (err: any) {
        setRequestsError(err.message || 'Failed to load requests');
      } finally {
        setRequestsLoading(false);
      }
    }

    fetchRequests();
  }, [project?.id]);

  // Handle request form submission
  const handleSubmitRequest = async () => {
    if (!project?.id) {
      setFormError('Project ID is required');
      return;
    }

    // Validate dates for ms and gamefi
    if ((formProductType === 'ms' || formProductType === 'gamefi') && (!formStartAt || !formEndAt)) {
      setFormError('Start date and end date are required for Mindshare and GameFi');
      return;
    }

    // Validate date order
    if (formStartAt && formEndAt) {
      const startDate = new Date(formStartAt);
      const endDate = new Date(formEndAt);
      if (startDate >= endDate) {
        setFormError('End date must be after start date');
        return;
      }
    }

    setFormSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const res = await fetch('/api/portal/arc/leaderboard-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectId: project.id,
          productType: formProductType,
          startAt: formStartAt || undefined,
          endAt: formEndAt || undefined,
          notes: formNotes.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        const errorCode = data.error || 'unknown_error';
        let errorMessage = 'Failed to submit request';
        
        switch (errorCode) {
          case 'invalid_project_id':
            errorMessage = 'Invalid project ID';
            break;
          case 'invalid_product_type':
            errorMessage = 'Invalid product type';
            break;
          case 'missing_dates':
            errorMessage = 'Start date and end date are required';
            break;
          case 'invalid_dates':
            errorMessage = 'Invalid date range';
            break;
          case 'not_authenticated':
            errorMessage = 'Authentication required';
            break;
          default:
            errorMessage = data.error || 'Failed to submit request';
        }
        
        throw new Error(errorMessage);
      }

      // Success - reset form and refetch requests
      setFormSuccess('Request submitted successfully');
      setFormProductType('ms');
      setFormStartAt('');
      setFormEndAt('');
      setFormNotes('');

      // Refetch requests
      const res2 = await fetch(`/api/portal/arc/leaderboard-requests?projectId=${encodeURIComponent(project.id)}`, {
        credentials: 'include',
      });
      const data2 = await res2.json();
      if (data2.ok && data2.requests) {
        const requestsList: LeaderboardRequest[] = data2.requests || [];
        setRequests(requestsList);
        if (requestsList.length > 0) {
          const latest = requestsList[0];
          setLatestRequest(latest);
          setHasPendingRequest(latest.status === 'pending');
        }
      }

      // Clear success message after 3 seconds
      setTimeout(() => setFormSuccess(null), 3000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit request');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Compute if user can manage (create/edit arenas)
  const canManage = userIsSuperAdmin || permissions?.canManage || false;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingArena, setEditingArena] = useState<Arena | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    starts_at: '',
    ends_at: '',
    reward_depth: 0,
    status: 'draft' as 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled',
  });

  // Refresh arenas list
  const refreshArenas = async () => {
    if (!projectSlug) return;

    try {
      const res = await fetch(`/api/portal/arc/arenas?slug=${encodeURIComponent(projectSlug)}`, { credentials: 'include' });
      if (!res.ok) return;

      const data = await res.json();
      if (data.ok && data.arenas) {
        setArenas(data.arenas);
      }
    } catch (err) {
      console.error('[ArenaManager] Error refreshing arenas:', err);
    }
  };

  // Handle Create Arena
  const handleCreateArena = async () => {
    if (!project || !formData.name.trim() || !formData.slug.trim()) {
      setModalError('Name and slug are required');
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch('/api/portal/arc/arenas-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectId: project.id,
          name: formData.name.trim(),
          slug: formData.slug.trim(),
          description: formData.description.trim() || null,
          starts_at: formData.starts_at ? new Date(formData.starts_at).toISOString() : null,
          ends_at: formData.ends_at ? new Date(formData.ends_at).toISOString() : null,
          reward_depth: formData.reward_depth || 0,
          status: formData.status,
        }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Failed to create arena');
      }

      // Refresh list and close modal
      await refreshArenas();
      refreshCurrentArena();
      closeModals();
    } catch (err: any) {
      console.error('[ArenaManager] Error creating arena:', err);
      setModalError(err?.message || 'Failed to create arena. Please try again.');
    } finally {
      setModalLoading(false);
    }
  };

  // Handle Edit Arena
  const handleEditArena = async () => {
    if (!editingArena || !formData.name.trim() || !formData.slug.trim()) {
      setModalError('Name and slug are required');
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch('/api/portal/arc/arenas-admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingArena.id,
          name: formData.name.trim(),
          slug: formData.slug.trim(),
          description: formData.description.trim() || null,
          starts_at: formData.starts_at ? new Date(formData.starts_at).toISOString() : null,
          ends_at: formData.ends_at ? new Date(formData.ends_at).toISOString() : null,
          reward_depth: formData.reward_depth || 0,
          status: formData.status,
        }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Failed to update arena');
      }

      // Refresh list and close modal
      await refreshArenas();
      refreshCurrentArena();
      closeModals();
    } catch (err: any) {
      console.error('[ArenaManager] Error updating arena:', err);
      setModalError(err?.message || 'Failed to update arena. Please try again.');
    } finally {
      setModalLoading(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (arena: Arena) => {
    setEditingArena(arena);
    setFormData({
      name: arena.name,
      slug: arena.slug,
      description: arena.description || '',
      starts_at: arena.starts_at ? new Date(arena.starts_at).toISOString().slice(0, 16) : '',
      ends_at: arena.ends_at ? new Date(arena.ends_at).toISOString().slice(0, 16) : '',
      reward_depth: arena.reward_depth || 0,
      status: arena.status,
    });
    setModalError(null);
    setShowEditModal(true);
  };

  // Close modals
  const closeModals = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setEditingArena(null);
    setFormData({
      name: '',
      slug: '',
      description: '',
      starts_at: '',
      ends_at: '',
      reward_depth: 0,
      status: 'draft',
    });
    setModalError(null);
  };

  // Helper function to format date range
  const formatDateRange = (startsAt: string | null, endsAt: string | null) => {
    if (!startsAt && !endsAt) return 'No dates set';
    if (!startsAt) return `Until ${new Date(endsAt!).toLocaleDateString()}`;
    if (!endsAt) return `From ${new Date(startsAt).toLocaleDateString()}`;
    
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    return `${start.toLocaleDateString()} → ${end.toLocaleDateString()}`;
  };

  // Helper function to get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 border-green-500/40 text-green-300';
      case 'scheduled':
        return 'bg-blue-500/20 border-blue-500/40 text-blue-300';
      case 'ended':
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
      case 'cancelled':
        return 'bg-red-500/20 border-red-500/40 text-red-300';
      case 'draft':
      default:
        return 'bg-white/10 border-white/20 text-white/60';
    }
  };

  // Handle Activate Arena
  const handleActivateArena = async (arenaId: string) => {
    setActivatingArenaId(arenaId);
    setActivateSuccess(null);

    try {
      await activateMsArena(arenaId);
      setActivateSuccess(`Arena activated successfully`);
      
      // Refresh both arenas list and current arena
      await refreshArenas();
      refreshCurrentArena();

      // Clear success message after 3 seconds
      setTimeout(() => {
        setActivateSuccess(null);
      }, 3000);
    } catch (err: any) {
      console.error('[ArenaManager] Error activating arena:', err);
      setModalError(err?.message || 'Failed to activate arena. Please try again.');
    } finally {
      setActivatingArenaId(null);
    }
  };

  // Check access (server-side check)
  if (!hasAccess) {
    return (
      <ArcPageShell canManageArc={true}>
        <div>
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
            <p className="text-sm text-red-400">
              {accessError || 'Access denied. You do not have permission to manage this project.'}
            </p>
            {project?.slug && (
              <Link
                href={`/portal/arc/${encodeURIComponent(project.slug)}`}
                className="mt-4 inline-block text-sm text-teal-400 hover:text-teal-300 transition-colors"
              >
                ← Back to Project Hub
              </Link>
            )}
            <Link
              href="/portal/arc"
              className="mt-2 inline-block text-sm text-teal-400 hover:text-teal-300 transition-colors"
            >
              ← Back to ARC Home
            </Link>
          </div>
        </div>
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell canManageArc={true}>
      <div className="space-y-6">
        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          {project?.slug && (
            <>
              <Link
                href={`/portal/arc/${encodeURIComponent(project.slug)}`}
                className="hover:text-white transition-colors"
              >
                {project.name || 'Project'}
              </Link>
              <span>/</span>
            </>
          )}
          {!project?.slug && (
            <>
              <Link
                href="/portal/arc"
                className="hover:text-white transition-colors"
              >
                ARC Home
              </Link>
              <span>/</span>
            </>
          )}
          {userIsSuperAdmin && (
            <>
              <Link
                href="/portal/arc/admin"
                className="hover:text-white transition-colors"
              >
                Admin
              </Link>
              <span>/</span>
            </>
          )}
          <span className="text-white">Leaderboard Dashboard</span>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Project not found */}
        {!error && !project && (
          <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-8 text-center">
            <p className="text-white/60">
              Project not found.
            </p>
          </div>
        )}

        {/* Project content */}
        {!error && project && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">
                  {project.name}
                </h1>
                {project.twitter_username && (
                  <p className="text-white/60">
                    @{project.twitter_username}
                  </p>
                )}
              </div>
              {canManage && (
                <button
                  onClick={() => {
                    setFormData({
                      name: '',
                      slug: '',
                      description: '',
                      starts_at: '',
                      ends_at: '',
                      reward_depth: 0,
                      status: 'draft',
                    });
                    setModalError(null);
                    setShowCreateModal(true);
                  }}
                  className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity"
                >
                  Create Arena
                </button>
              )}
            </div>

            {/* ARC Access Requests Card */}
            <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
              <h2 className="text-lg font-semibold text-white mb-4">ARC Access Requests</h2>
              
              {requestsLoading ? (
                <div className="text-white/60 text-sm">Loading requests...</div>
              ) : requestsError ? (
                <div className="text-red-400 text-sm mb-4">{requestsError}</div>
              ) : !latestRequest ? (
                <div className="text-center py-4 mb-4">
                  <p className="text-white/60 mb-1">No requests yet</p>
                </div>
              ) : (
                <div className="space-y-3 mb-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-white/60">Product Type:</span>
                      <span className="ml-2 text-white">
                        {latestRequest.product_type === 'ms' ? 'Mindshare' : 
                         latestRequest.product_type === 'gamefi' ? 'GameFi' : 
                         latestRequest.product_type === 'crm' ? 'CRM' : 
                         'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Status:</span>
                      <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                        latestRequest.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                        latestRequest.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {latestRequest.status}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Start Date:</span>
                      <span className="ml-2 text-white">
                        {latestRequest.start_at ? new Date(latestRequest.start_at).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">End Date:</span>
                      <span className="ml-2 text-white">
                        {latestRequest.end_at ? new Date(latestRequest.end_at).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Created:</span>
                      <span className="ml-2 text-white">
                        {new Date(latestRequest.created_at).toLocaleString()}
                      </span>
                    </div>
                    {latestRequest.decided_at && (
                      <div>
                        <span className="text-white/60">Decided:</span>
                        <span className="ml-2 text-white">
                          {new Date(latestRequest.decided_at).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {hasPendingRequest && (
                    <div className="mt-3 p-3 rounded bg-yellow-500/10 border border-yellow-500/30">
                      <p className="text-yellow-400 text-sm">Pending approval - request form is disabled</p>
                    </div>
                  )}
                </div>
              )}

              {/* Show enabled badges for already enabled products */}
              {initialFeatures && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {initialFeatures.leaderboard_enabled && (
                    <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/50">
                      Leaderboard Enabled
                    </span>
                  )}
                  {initialFeatures.gamefi_enabled && (
                    <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/50">
                      GameFi Enabled
                    </span>
                  )}
                  {initialFeatures.crm_enabled && (
                    <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/50">
                      CRM Enabled
                    </span>
                  )}
                </div>
              )}

              {/* Request Form */}
              {canManage && !hasPendingRequest && (
                <div className="border-t border-white/10 pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Request New Access</h3>
                  
                  {formSuccess && (
                    <div className="mb-3 p-3 rounded bg-green-500/10 border border-green-500/30">
                      <p className="text-green-400 text-sm">{formSuccess}</p>
                    </div>
                  )}
                  
                  {formError && (
                    <div className="mb-3 p-3 rounded bg-red-500/10 border border-red-500/30">
                      <p className="text-red-400 text-sm">{formError}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Product Type</label>
                      <select
                        value={formProductType}
                        onChange={(e) => setFormProductType(e.target.value as 'ms' | 'gamefi' | 'crm')}
                        className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                      >
                        <option value="ms">Mindshare (Leaderboard)</option>
                        <option value="gamefi">GameFi (Gamified)</option>
                        <option value="crm">CRM (Creator Manager)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-1">
                        Start Date {(formProductType === 'ms' || formProductType === 'gamefi') && <span className="text-red-400">*</span>}
                      </label>
                      <input
                        type="datetime-local"
                        value={formStartAt}
                        onChange={(e) => setFormStartAt(e.target.value)}
                        required={formProductType === 'ms' || formProductType === 'gamefi'}
                        className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-1">
                        End Date {(formProductType === 'ms' || formProductType === 'gamefi') && <span className="text-red-400">*</span>}
                      </label>
                      <input
                        type="datetime-local"
                        value={formEndAt}
                        onChange={(e) => setFormEndAt(e.target.value)}
                        required={formProductType === 'ms' || formProductType === 'gamefi'}
                        className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-1">Notes (Optional)</label>
                      <textarea
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                        placeholder="Additional information about your request..."
                      />
                    </div>

                    <button
                      onClick={handleSubmitRequest}
                      disabled={formSubmitting || (formProductType !== 'crm' && (!formStartAt || !formEndAt))}
                      className="w-full px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {formSubmitting ? 'Submitting...' : 'Submit Request'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Current Active MS Arena Card */}
            <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Current Active MS Arena</h2>
              
              {arenaLoading ? (
                <div className="text-white/60 text-sm">Loading current arena...</div>
              ) : arenaError ? (
                <div className="text-red-400 text-sm">{arenaError}</div>
              ) : !currentArena ? (
                <div className="text-center py-4">
                  <p className="text-white/60 mb-1">No active Mindshare arena</p>
                  <p className="text-white/40 text-xs">Activate an arena to start tracking.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-white/60">Name:</span>
                      <span className="ml-2 text-white">{currentArena.name || currentArena.slug || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-white/60">ID:</span>
                      <span className="ml-2 text-white font-mono text-xs">{currentArena.id}</span>
                    </div>
                    <div>
                      <span className="text-white/60">Kind:</span>
                      <span className="ml-2 text-white">{currentArena.kind || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-white/60">Status:</span>
                      <span className={`ml-2 px-2 py-0.5 rounded text-xs ${getStatusColor(currentArena.status)}`}>
                        {currentArena.status}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Starts:</span>
                      <span className="ml-2 text-white">
                        {currentArena.starts_at ? new Date(currentArena.starts_at).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Ends:</span>
                      <span className="ml-2 text-white">
                        {currentArena.ends_at ? new Date(currentArena.ends_at).toLocaleString() : 'No end date'}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Updated:</span>
                      <span className="ml-2 text-white">
                        {currentArena.updated_at ? new Date(currentArena.updated_at).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                  
                  {debug && (
                    <div className="pt-3 border-t border-white/10">
                      <p className="text-xs text-white/60 mb-2">Debug Info:</p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-white/40">Live Active:</span>
                          <span className="ml-1 text-white">{debug.live_active_count}</span>
                        </div>
                        <div>
                          <span className="text-white/40">Live:</span>
                          <span className="ml-1 text-white">{debug.live_count}</span>
                        </div>
                        <div>
                          <span className="text-white/40">Active:</span>
                          <span className="ml-1 text-white">{debug.active_count}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Success message */}
            {activateSuccess && (
              <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3">
                <p className="text-sm text-green-400">{activateSuccess}</p>
              </div>
            )}

            {/* Arenas table */}
            <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden">
              {arenas.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-white/60">
                    No arenas found for this project.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Slug</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Date Range</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Reward Depth</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {arenas.map((arena) => (
                        <tr
                          key={arena.id}
                          className="hover:bg-white/5 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm text-white">
                            <Link
                              href={`/portal/arc/${projectSlug}/arena/${arena.slug}`}
                              className="font-medium text-teal-400 hover:text-teal-300 transition-colors"
                            >
                              {arena.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm text-white/60">
                            {arena.slug}
                          </td>
                          <td className="px-4 py-3 text-sm text-white">
                            {formatDateRange(arena.starts_at, arena.ends_at)}
                          </td>
                          <td className="px-4 py-3 text-sm text-white">
                            {arena.reward_depth}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                                arena.status
                              )}`}
                            >
                              {arena.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {userIsSuperAdmin && (arena.kind === 'ms' || arena.kind === 'legacy_ms') && (
                                <button
                                  onClick={() => handleActivateArena(arena.id)}
                                  disabled={activatingArenaId === arena.id}
                                  className="px-2 py-1 text-xs bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {activatingArenaId === arena.id ? 'Activating...' : 'Activate'}
                                </button>
                              )}
                              {canManage && (
                                <button
                                  onClick={() => openEditModal(arena)}
                                  className="px-2 py-1 text-xs text-white/60 hover:text-white transition-colors"
                                >
                                  Edit
                                </button>
                              )}
                              <Link
                                href={`/portal/arc/${projectSlug}/arena/${arena.slug}`}
                                className="px-2 py-1 text-xs text-white/60 hover:text-white transition-colors"
                              >
                                View
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Create Arena Modal */}
        {showCreateModal && (
          <ArenaModal
            title="Create Arena"
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleCreateArena}
            onClose={closeModals}
            loading={modalLoading}
            error={modalError}
          />
        )}

        {/* Edit Arena Modal */}
        {showEditModal && editingArena && (
          <ArenaModal
            title="Edit Arena"
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleEditArena}
            onClose={closeModals}
            loading={modalLoading}
            error={modalError}
          />
        )}
      </div>
    </ArcPageShell>
  );
}

// =============================================================================
// ARENA MODAL COMPONENT
// =============================================================================

interface ArenaModalProps {
  title: string;
  formData: {
    name: string;
    slug: string;
    description: string;
    starts_at: string;
    ends_at: string;
    reward_depth: number;
    status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
  };
  setFormData: (data: any) => void;
  onSubmit: () => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
}

function ArenaModal({ title, formData, setFormData, onSubmit, onClose, loading, error }: ArenaModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
            disabled={loading}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-white/60">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-teal-400/50 transition-colors"
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">Slug *</label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-teal-400/50 transition-colors"
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-teal-400/50 transition-colors"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-white/60">Start Date</label>
              <input
                type="datetime-local"
                value={formData.starts_at}
                onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                min="2000-01-01T00:00"
                max="2099-12-31T23:59"
                className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-teal-400/50 transition-colors"
                disabled={loading}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">End Date</label>
              <input
                type="datetime-local"
                value={formData.ends_at}
                onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                min="2000-01-01T00:00"
                max="2099-12-31T23:59"
                className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-teal-400/50 transition-colors"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-white/60 group relative">
                <span className="flex items-center gap-1">
                  Reward Depth
                  <svg className="w-3 h-3 text-white/40 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="absolute bottom-full left-0 mb-2 hidden w-56 rounded-lg bg-black/90 p-2 text-xs text-white/80 shadow-lg group-hover:block z-20 border border-white/10">
                    Number of top participants who will receive rewards (e.g., 100 = top 100 will be rewarded)
                  </div>
                </span>
              </label>
              <input
                type="number"
                value={formData.reward_depth}
                onChange={(e) => setFormData({ ...formData, reward_depth: Number(e.target.value) || 0 })}
                min="0"
                placeholder="100"
                className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-teal-400/50 transition-colors"
                disabled={loading}
              />
              <p className="mt-1 text-[10px] text-white/40">Top {formData.reward_depth || 0} participants will be eligible for rewards</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white focus:outline-none focus:border-teal-400/50 transition-colors"
                disabled={loading}
              >
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
                <option value="ended">Ended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-2">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium border border-white/10 rounded-lg text-white hover:bg-white/10 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps<ArenaManagerProps> = async (context) => {
  const { projectSlug } = context.params || {};

  if (!projectSlug || typeof projectSlug !== 'string') {
      return {
        props: {
          project: null,
          arenas: [],
          error: 'Invalid project slug',
          projectSlug: '',
          hasAccess: false,
          accessError: 'Invalid project slug',
          features: null,
        },
      };
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Get session token and user ID
    const sessionToken = getSessionTokenFromRequest(context.req);
    if (!sessionToken) {
      return {
        props: {
          project: null,
          arenas: [],
          error: null,
          projectSlug,
          hasAccess: false,
          accessError: 'Authentication required',
          features: null,
        },
      };
    }

    // Get user ID from session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session || new Date(session.expires_at) < new Date()) {
      return {
        props: {
          project: null,
          arenas: [],
          error: null,
          projectSlug,
          hasAccess: false,
          accessError: 'Invalid or expired session',
          features: null,
        },
      };
    }

    const userId = session.user_id;

    // Resolve project by slug
    const { data: projectData, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, name, twitter_username, slug')
      .eq('slug', projectSlug)
      .single();

    if (projectError || !projectData) {
      return {
        props: {
          project: null,
          arenas: [],
          error: 'Project not found',
          projectSlug,
          hasAccess: false,
          accessError: 'Project not found',
          features: null,
        },
      };
    }

    // Check project permissions
    const permissions = await checkProjectPermissions(supabaseAdmin, userId, projectData.id);
    const hasAccess = permissions.canManage || permissions.isSuperAdmin;

    if (!hasAccess) {
      return {
        props: {
          project: {
            id: projectData.id,
            name: projectData.name,
            twitter_username: projectData.twitter_username,
            slug: projectData.slug,
          },
          arenas: [],
          error: null,
          projectSlug,
          hasAccess: false,
          accessError: 'You do not have permission to manage this project. Only project owners, admins, moderators, or super admins can access this page.',
          features: null,
        },
      };
    }

    // Load arenas for this project
    const { data: arenasData, error: arenasError } = await supabaseAdmin
      .from('arenas')
      .select('id, project_id, slug, name, description, status, starts_at, ends_at, reward_depth, kind')
      .eq('project_id', projectData.id)
      .order('created_at', { ascending: false });

    if (arenasError) {
      console.error('[ArenaManager] Error loading arenas:', arenasError);
      return {
        props: {
          project: {
            id: projectData.id,
            name: projectData.name,
            twitter_username: projectData.twitter_username,
            slug: projectData.slug,
          },
          arenas: [],
          error: 'Failed to load arenas',
          projectSlug,
          hasAccess: true,
          accessError: null,
          features: null,
        },
      };
    }

    const arenas: Arena[] = (arenasData || []).map((row: any) => ({
      id: row.id,
      project_id: row.project_id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? null,
      status: row.status,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      reward_depth: row.reward_depth,
      kind: row.kind ?? null,
    }));

    // Load arc_project_features for this project
    const { data: featuresData, error: featuresError } = await supabaseAdmin
      .from('arc_project_features')
      .select('leaderboard_enabled, leaderboard_start_at, leaderboard_end_at, gamefi_enabled, gamefi_start_at, gamefi_end_at, crm_enabled, crm_start_at, crm_end_at, crm_visibility')
      .eq('project_id', projectData.id)
      .maybeSingle();

    let features: ProjectFeatures | null = null;
    if (featuresData) {
      features = {
        leaderboard_enabled: featuresData.leaderboard_enabled || false,
        leaderboard_start_at: featuresData.leaderboard_start_at || null,
        leaderboard_end_at: featuresData.leaderboard_end_at || null,
        gamefi_enabled: featuresData.gamefi_enabled || false,
        gamefi_start_at: featuresData.gamefi_start_at || null,
        gamefi_end_at: featuresData.gamefi_end_at || null,
        crm_enabled: featuresData.crm_enabled || false,
        crm_start_at: featuresData.crm_start_at || null,
        crm_end_at: featuresData.crm_end_at || null,
        crm_visibility: (featuresData.crm_visibility as 'private' | 'public' | 'hybrid') || null,
      };
    }

    return {
      props: {
        project: {
          id: projectData.id,
          name: projectData.name,
          twitter_username: projectData.twitter_username,
          slug: projectData.slug,
        },
        arenas,
        error: null,
        projectSlug,
        hasAccess: true,
        accessError: null,
        features,
      },
    };
  } catch (error: any) {
    console.error('[ArenaManager] Error:', error);
      return {
        props: {
          project: null,
          arenas: [],
          error: error.message || 'Internal server error',
          projectSlug,
          hasAccess: false,
          accessError: error.message || 'Internal server error',
          features: null,
        },
      };
  }
};
