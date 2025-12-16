/**
 * Super Admin Projects Management Page
 * 
 * View and manage all tracked projects, edit metadata, and trigger manual refreshes.
 */

import { useState, useEffect, useCallback } from 'react';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { classifyFreshness, getFreshnessPillClasses } from '@/lib/portal/data-freshness';

// =============================================================================
// TYPES
// =============================================================================

interface AdminProjectSummary {
  id: string;
  name: string;
  display_name: string | null;
  slug: string;
  x_handle: string;
  twitter_username: string | null;
  profile_type: 'project' | 'personal' | null;
  is_company: boolean;
  claimed_by: string | null;
  claimed_at: string | null;
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | null;
  arc_active: boolean;
  arc_active_until: string | null;
  followers: number;
  akari_score: number | null;
  last_updated_at: string | null;
  updated_at: string | null;
  is_active: boolean;
}

interface AdminProjectsResponse {
  ok: boolean;
  projects?: AdminProjectSummary[];
  error?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatNumber(num: number | null): string {
  if (num === null) return '-';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '–';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function AdminProjectsPage() {
  const akariUser = useAkariUser();
  const [projects, setProjects] = useState<AdminProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'hidden' | 'unclassified' | 'projects' | 'arc_active'>('all');
  const [editingProject, setEditingProject] = useState<AdminProjectSummary | null>(null);
  const [classifyingProjectId, setClassifyingProjectId] = useState<string | null>(null);
  const [refreshingProjectId, setRefreshingProjectId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    slug: '',
    x_handle: '',
    is_active: true,
  });
  const [classifyForm, setClassifyForm] = useState({
    profileType: 'project' as 'project' | 'personal',
    isCompany: false,
    arcAccessLevel: 'none' as 'none' | 'creator_manager' | 'leaderboard' | 'gamified',
    arcActive: false,
    arcActiveUntil: '',
  });

  // Check if user is super admin
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load projects
  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) {
        params.append('q', debouncedSearch.trim());
      }
      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      
      // Add pagination (simple - can be enhanced later)
      params.append('page', '1');
      params.append('limit', '100');

      const res = await fetch(`/api/portal/admin/projects?${params.toString()}`);
      const data: AdminProjectsResponse = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to load projects');
      }

      setProjects(data.projects || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    if (userIsSuperAdmin) {
      loadProjects();
    }
  }, [userIsSuperAdmin, loadProjects]);

  // Handle edit
  const handleEdit = (project: AdminProjectSummary) => {
    setEditingProject(project);
    setEditForm({
      name: project.name,
      slug: project.slug,
      x_handle: project.x_handle,
      is_active: project.is_active,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingProject) return;

    try {
      const res = await fetch(`/api/portal/admin/projects/${editingProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to update project');
      }

      // Reload projects
      await loadProjects();
      setEditingProject(null);
    } catch (err: any) {
      alert(err.message || 'Failed to update project');
    }
  };

  // Handle refresh
  const handleRefresh = async (projectId: string) => {
    setRefreshingProjectId(projectId);

    try {
      const res = await fetch(`/api/portal/admin/projects/${projectId}/refresh`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to refresh project');
      }

      // Reload projects to get updated metrics
      await loadProjects();
    } catch (err: any) {
      alert(err.message || 'Failed to refresh project');
    } finally {
      setRefreshingProjectId(null);
    }
  };

  // Handle classify
  const handleClassify = (project: AdminProjectSummary) => {
    setClassifyingProjectId(project.id);
    setClassifyForm({
      profileType: project.profile_type || 'project',
      isCompany: project.is_company || false,
      arcAccessLevel: project.arc_access_level || 'none',
      arcActive: project.arc_active || false,
      arcActiveUntil: project.arc_active_until ? new Date(project.arc_active_until).toISOString().split('T')[0] : '',
    });
  };

  const handleSaveClassify = async () => {
    if (!classifyingProjectId) return;

    try {
      const res = await fetch('/api/portal/admin/projects/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: classifyingProjectId,
          profileType: classifyForm.profileType,
          isCompany: classifyForm.isCompany,
          arcAccessLevel: classifyForm.arcAccessLevel,
          arcActive: classifyForm.arcActive,
          arcActiveUntil: classifyForm.arcActiveUntil || null,
        }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to classify project');
      }

      // Reload projects
      await loadProjects();
      setClassifyingProjectId(null);
    } catch (err: any) {
      alert(err.message || 'Failed to classify project');
    }
  };

  // Not logged in
  if (!akariUser.isLoggedIn) {
    return (
      <PortalLayout title="Projects Admin">
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
      <PortalLayout title="Projects Admin">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400">You need super admin access to view this page.</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Projects Admin">
      <div className="px-4 py-4 md:px-6 lg:px-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white mb-2">Projects Admin</h1>
          <p className="text-sm text-slate-400">Manage tracked projects and trigger manual refreshes</p>
        </div>

        {/* Controls */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <label className="block text-xs text-slate-400 mb-1">Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, slug, or X handle..."
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">Filter</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'hidden' | 'unclassified' | 'projects' | 'arc_active')}
                className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
              >
                <option value="all">All</option>
                <option value="active">Active only</option>
                <option value="hidden">Hidden only</option>
                <option value="unclassified">Unclassified</option>
                <option value="projects">Projects only</option>
                <option value="arc_active">ARC Active</option>
              </select>
            </div>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-4" />
            <p className="text-slate-400">Loading projects...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-red-400">{error}</p>
            <button
              onClick={loadProjects}
              className="mt-4 px-4 py-2 rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-sm font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Projects table */}
        {!loading && !error && (
          <div className="rounded-2xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl overflow-hidden shadow-[0_0_30px_rgba(0,246,162,0.1)]">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5">
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-teal">Name</th>
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">X Handle</th>
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-blue">Type</th>
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Company</th>
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Claimed</th>
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">ARC Level</th>
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">ARC Active</th>
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Updated</th>
                    <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 px-5 text-center text-akari-muted">
                        No projects found
                      </td>
                    </tr>
                  ) : (
                    projects.map((project) => {
                      return (
                        <tr
                          key={project.id}
                          className="border-b border-akari-neon-teal/10 last:border-0 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5"
                        >
                          <td className="py-4 px-5 text-akari-text font-semibold">
                            <div>{project.display_name || project.name}</div>
                            <div className="text-xs text-akari-muted font-mono">{project.slug}</div>
                          </td>
                          <td className="py-4 px-5 text-akari-muted">@{project.twitter_username || project.x_handle}</td>
                          <td className="py-4 px-5">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              project.profile_type === 'project' 
                                ? 'bg-blue-500/20 text-blue-400' 
                                : project.profile_type === 'personal'
                                ? 'bg-purple-500/20 text-purple-400'
                                : 'bg-gray-500/20 text-gray-400'
                            }`}>
                              {project.profile_type || 'Unclassified'}
                            </span>
                          </td>
                          <td className="py-4 px-5">
                            {project.is_company ? (
                              <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400">Yes</span>
                            ) : (
                              <span className="text-akari-muted text-xs">No</span>
                            )}
                          </td>
                          <td className="py-4 px-5 text-akari-muted text-xs">
                            {project.claimed_by ? (
                              <div>
                                <div>By: {project.claimed_by.substring(0, 8)}...</div>
                                <div>{formatDate(project.claimed_at)}</div>
                              </div>
                            ) : (
                              '–'
                            )}
                          </td>
                          <td className="py-4 px-5">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              project.arc_access_level === 'gamified' 
                                ? 'bg-purple-500/20 text-purple-400'
                                : project.arc_access_level === 'leaderboard'
                                ? 'bg-blue-500/20 text-blue-400'
                                : project.arc_access_level === 'creator_manager'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-gray-500/20 text-gray-400'
                            }`}>
                              {project.arc_access_level || 'none'}
                            </span>
                          </td>
                          <td className="py-4 px-5">
                            {project.arc_active ? (
                              <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400">Active</span>
                            ) : (
                              <span className="text-akari-muted text-xs">Inactive</span>
                            )}
                            {project.arc_active_until && (
                              <div className="text-xs text-akari-muted mt-1">
                                Until: {formatDate(project.arc_active_until)}
                              </div>
                            )}
                          </td>
                          <td className="py-4 px-5 text-akari-muted text-xs">{formatDate(project.updated_at || project.last_updated_at)}</td>
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => handleClassify(project)}
                                className="px-3 py-1.5 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/50 transition-all duration-300 text-xs font-medium"
                              >
                                Classify
                              </button>
                              <button
                                onClick={() => handleEdit(project)}
                                className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/50 transition-all duration-300 text-xs font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleRefresh(project.id)}
                                disabled={refreshingProjectId === project.id}
                                className="px-3 py-1.5 rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition-all duration-300 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {refreshingProjectId === project.id ? 'Refreshing...' : 'Refresh'}
                              </button>
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

        {/* Classify Modal */}
        {classifyingProjectId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
              <h2 className="text-xl font-semibold text-white mb-4">Classify Project</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Profile Type</label>
                  <select
                    value={classifyForm.profileType}
                    onChange={(e) => setClassifyForm({ ...classifyForm, profileType: e.target.value as 'project' | 'personal' })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                  >
                    <option value="project">Project</option>
                    <option value="personal">Personal</option>
                  </select>
                </div>

                {classifyForm.profileType === 'project' && (
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={classifyForm.isCompany}
                        onChange={(e) => setClassifyForm({ ...classifyForm, isCompany: e.target.checked })}
                        className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-akari-primary focus:ring-akari-primary"
                      />
                      <span className="text-sm text-slate-400">Is Company</span>
                    </label>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-slate-400 mb-1">ARC Access Level</label>
                  <select
                    value={classifyForm.arcAccessLevel}
                    onChange={(e) => setClassifyForm({ ...classifyForm, arcAccessLevel: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                  >
                    <option value="none">None</option>
                    <option value="creator_manager">Creator Manager</option>
                    <option value="leaderboard">Leaderboard</option>
                    <option value="gamified">Gamified</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={classifyForm.arcActive}
                      onChange={(e) => setClassifyForm({ ...classifyForm, arcActive: e.target.checked })}
                      className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-akari-primary focus:ring-akari-primary"
                    />
                    <span className="text-sm text-slate-400">ARC Active</span>
                  </label>
                </div>

                {classifyForm.arcActive && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">ARC Active Until (optional)</label>
                    <input
                      type="date"
                      value={classifyForm.arcActiveUntil}
                      onChange={(e) => setClassifyForm({ ...classifyForm, arcActiveUntil: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleSaveClassify}
                  className="flex-1 px-4 py-2 rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-sm font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => setClassifyingProjectId(null)}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 transition text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingProject && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full">
              <h2 className="text-xl font-semibold text-white mb-4">Edit Project</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Slug</label>
                  <input
                    type="text"
                    value={editForm.slug}
                    onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">X Handle</label>
                  <input
                    type="text"
                    value={editForm.x_handle}
                    onChange={(e) => setEditForm({ ...editForm, x_handle: e.target.value.replace('@', '') })}
                    placeholder="handle (without @)"
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.is_active}
                      onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                      className="w-4 h-4 rounded bg-slate-800 border-slate-700 text-akari-primary focus:ring-akari-primary"
                    />
                    <span className="text-sm text-slate-400">Active</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={handleSaveEdit}
                  className="flex-1 px-4 py-2 rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-sm font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingProject(null)}
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 transition text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

