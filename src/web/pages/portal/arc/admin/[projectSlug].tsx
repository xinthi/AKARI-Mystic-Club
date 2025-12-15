/**
 * ARC Admin - Per-Project Arena Manager
 * 
 * Manage arenas for a specific project
 */

import React, { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { createPortalClient } from '@/lib/portal/supabase';
import { isSuperAdmin } from '@/lib/permissions';
import { useAkariUser } from '@/lib/akari-auth';

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
}

interface ProjectInfo {
  id: string;
  name: string;
  twitter_username: string | null;
  slug: string | null;
}

interface ArenaManagerProps {
  project: ProjectInfo | null;
  arenas: Arena[];
  error: string | null;
  projectSlug: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArenaManager({ project, arenas: initialArenas, error, projectSlug }: ArenaManagerProps) {
  const router = useRouter();
  const akariUser = useAkariUser();
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  const [arenas, setArenas] = useState<Arena[]>(initialArenas);
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
      const res = await fetch(`/api/portal/arc/arenas?slug=${encodeURIComponent(projectSlug)}`);
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
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
    }
  };

  // Check access
  if (!userIsSuperAdmin) {
    return (
      <PortalLayout title="ARC Admin">
        <div className="space-y-6">
          <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-8 text-center">
            <p className="text-sm text-akari-danger">
              Access denied. Super Admin privileges required.
            </p>
            <Link
              href="/portal/arc"
              className="mt-4 inline-block text-sm text-akari-primary hover:text-akari-neon-teal transition-colors"
            >
              ← Back to ARC Home
            </Link>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="ARC Admin">
      <div className="space-y-6">
        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-2 text-sm text-akari-muted">
          <Link
            href="/portal/arc"
            className="hover:text-akari-primary transition-colors"
          >
            ARC Home
          </Link>
          <span>/</span>
          <Link
            href="/portal/arc/admin"
            className="hover:text-akari-primary transition-colors"
          >
            Admin
          </Link>
          <span>/</span>
          <span className="text-akari-text">{project?.name || 'Project'}</span>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-6 text-center">
            <p className="text-sm text-akari-danger">{error}</p>
          </div>
        )}

        {/* Project not found */}
        {!error && !project && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
            <p className="text-sm text-akari-muted">
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
                <h1 className="text-2xl font-bold text-akari-text mb-1">
                  {project.name}
                </h1>
                {project.twitter_username && (
                  <p className="text-sm text-akari-muted">
                    @{project.twitter_username}
                  </p>
                )}
              </div>
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
                className="px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
              >
                Create Arena
              </button>
            </div>

            {/* Arenas table */}
            <div className="rounded-xl border border-slate-700 bg-akari-card overflow-hidden">
              {arenas.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-akari-muted">
                    No arenas found for this project.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-akari-cardSoft/30 border-b border-akari-border/30">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Slug</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Date Range</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Reward Depth</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-akari-border/30">
                      {arenas.map((arena) => (
                        <tr
                          key={arena.id}
                          className="hover:bg-akari-cardSoft/20 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm text-akari-text">
                            <Link
                              href={`/portal/arc/${projectSlug}/arena/${arena.slug}`}
                              className="font-medium text-akari-primary hover:text-akari-neon-teal transition-colors"
                            >
                              {arena.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm text-akari-muted">
                            {arena.slug}
                          </td>
                          <td className="px-4 py-3 text-sm text-akari-text">
                            {formatDateRange(arena.starts_at, arena.ends_at)}
                          </td>
                          <td className="px-4 py-3 text-sm text-akari-text">
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
                              <button
                                onClick={() => openEditModal(arena)}
                                className="px-2 py-1 text-xs text-akari-muted hover:text-akari-primary transition-colors"
                              >
                                Edit
                              </button>
                              <Link
                                href={`/portal/arc/${projectSlug}/arena/${arena.slug}`}
                                className="px-2 py-1 text-xs text-akari-muted hover:text-akari-primary transition-colors"
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
    </PortalLayout>
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
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-akari-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-akari-text">{title}</h3>
          <button
            onClick={onClose}
            className="text-akari-muted hover:text-akari-text transition-colors"
            disabled={loading}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-akari-muted">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-akari-muted">Slug *</label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-akari-muted">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-akari-muted">Start Date</label>
              <input
                type="datetime-local"
                value={formData.starts_at}
                onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                disabled={loading}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-akari-muted">End Date</label>
              <input
                type="datetime-local"
                value={formData.ends_at}
                onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-akari-muted">Reward Depth</label>
              <input
                type="number"
                value={formData.reward_depth}
                onChange={(e) => setFormData({ ...formData, reward_depth: Number(e.target.value) || 0 })}
                min="0"
                className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                disabled={loading}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-akari-muted">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
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
            <div className="rounded-lg border border-akari-danger/30 bg-akari-danger/10 p-2">
              <p className="text-xs text-akari-danger">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium border border-akari-border/30 rounded-lg text-akari-text hover:bg-akari-cardSoft/30 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      },
    };
  }

  try {
    const supabase = createPortalClient();

    // Resolve project by slug
    const { data: projectData, error: projectError } = await supabase
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
        },
      };
    }

    // Load arenas for this project
    const { data: arenasData, error: arenasError } = await supabase
      .from('arenas')
      .select('id, project_id, slug, name, description, status, starts_at, ends_at, reward_depth')
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
    }));

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
      },
    };
  }
};
