/**
 * Super Admin Projects Management Page
 * 
 * View and manage all tracked projects, edit metadata, and trigger manual refreshes.
 */

import { useState, useEffect, useCallback } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { classifyFreshness, getFreshnessPillClasses } from '@/lib/portal/data-freshness';
import { requireSuperAdmin } from '@/lib/server-auth';

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
  identityType: 'individual' | 'company' | 'unknown' | null; // From owner's persona_type
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | null;
  arc_active: boolean;
  arc_active_until: string | null;
  followers: number;
  akari_score: number | null;
  last_updated_at: string | null;
  first_tracked_at: string | null;
  last_refreshed_at: string | null;
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

// Toast notification component
function Toast({ 
  message, 
  type, 
  onClose 
}: { 
  message: string; 
  type: 'success' | 'error'; 
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div 
      className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 animate-slide-up ${
        type === 'success' 
          ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400' 
          : 'bg-red-500/20 border border-red-500/50 text-red-400'
      }`}
    >
      {type === 'success' ? (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      )}
      <span className="text-sm">{message}</span>
      <button onClick={onClose} className="ml-2 hover:opacity-70">
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
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
  const [updatingProjectId, setUpdatingProjectId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    slug: '',
    x_handle: '',
    header_image_url: '',
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
        params.append('filter', statusFilter);
      }
      
      // Add pagination
      params.append('page', '1');
      params.append('pageSize', '100');

      const res = await fetch(`/api/portal/admin/projects?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Handle non-OK responses
      if (!res.ok) {
        let errorMessage = 'Unknown error';
        let errorData: any = null;

        try {
          const text = await res.text();
          if (text) {
            try {
              errorData = JSON.parse(text);
              errorMessage = errorData.error || errorData.message || 'Unknown error';
            } catch {
              errorMessage = text;
            }
          }
        } catch (e) {
          // Failed to read response
        }

        const statusMessage = `${res.status} ${errorMessage}`;
        setError(statusMessage);
        console.error('[ProjectsAdmin] fetch failed:', {
          status: res.status,
          statusText: res.statusText,
          error: errorMessage,
          data: errorData,
        });
        return;
      }

      const data: AdminProjectsResponse = await res.json();

      if (!data.ok) {
        const errorMsg = data.error || 'Failed to load projects';
        setError(errorMsg);
        console.error('[ProjectsAdmin] API returned ok:false:', errorMsg);
        return;
      }

      setProjects(data.projects || []);
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to load projects';
      setError(errorMsg);
      console.error('[ProjectsAdmin] fetch failed:', err);
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
  const handleEdit = async (project: AdminProjectSummary) => {
    // Fetch full project details including header_image_url
    try {
      const res = await fetch(`/api/portal/admin/projects/${project.id}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.ok && data.project) {
        setEditingProject(project);
        setEditForm({
          name: data.project.name,
          slug: data.project.slug,
          x_handle: data.project.x_handle,
          header_image_url: data.project.header_image_url || '',
          is_active: data.project.is_active,
        });
      } else {
        // Fallback to basic info
        setEditingProject(project);
        setEditForm({
          name: project.name,
          slug: project.slug,
          x_handle: project.x_handle,
          header_image_url: '',
          is_active: project.is_active,
        });
      }
    } catch (err) {
      // Fallback to basic info
      setEditingProject(project);
      setEditForm({
        name: project.name,
        slug: project.slug,
        x_handle: project.x_handle,
        header_image_url: '',
        is_active: project.is_active,
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingProject) return;

    try {
      const res = await fetch(`/api/portal/admin/projects/${editingProject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
        credentials: 'include',
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
        credentials: 'include',
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

  // Handle inline ARC field updates
  const handleUpdateArcField = async (
    projectId: string,
    field: 'arc_active' | 'arc_access_level',
    value: boolean | 'none' | 'creator_manager' | 'leaderboard' | 'gamified'
  ) => {
    setUpdatingProjectId(projectId);

    try {
      const updateBody: { arc_active?: boolean; arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' } = {};
      if (field === 'arc_active') {
        updateBody.arc_active = value as boolean;
      } else {
        updateBody.arc_access_level = value as 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
      }

      const res = await fetch(`/api/portal/admin/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updateBody),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to update project');
      }

      // Update local state immediately for better UX
      setProjects((prev) =>
        prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                arc_active: field === 'arc_active' ? (value as boolean) : p.arc_active,
                arc_access_level: field === 'arc_access_level' ? (value as 'none' | 'creator_manager' | 'leaderboard' | 'gamified') : p.arc_access_level,
              }
            : p
        )
      );

      // Show toast notification
      setToast({
        message: 'ARC settings updated',
        type: 'success',
      });
    } catch (err: any) {
      setToast({
        message: err.message || 'Failed to update project',
        type: 'error',
      });
      // Reload projects on error to sync state
      await loadProjects();
    } finally {
      setUpdatingProjectId(null);
    }
  };

  // Not logged in
  if (!akariUser.isLoggedIn) {
    return (
      <>
      <PortalLayout title="Projects Admin">
        <div className="px-4 py-4 md:px-6 lg:px-10">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 text-center">
            <p className="text-slate-400">Log in to view this page.</p>
          </div>
        </div>
      </PortalLayout>
      </>
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
    <>
      <PortalLayout title="Projects Admin">
      <div className="px-4 py-4 md:px-6 lg:px-10 max-w-full">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-white mb-2">Projects Admin - ARC Control Plane</h1>
          <p className="text-sm text-slate-400">Manage tracked projects and ARC settings</p>
          <p className="text-xs text-slate-500 mt-2">
            Only projects marked as &apos;Project&apos; appear in ARC.
          </p>
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
          <div className="rounded-2xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl overflow-hidden shadow-[0_0_30px_rgba(0,246,162,0.1)] max-w-full">
            <div className="overflow-x-auto max-w-full">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5 sticky top-0 z-10">
                    <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider font-semibold text-gradient-teal whitespace-nowrap w-[200px]">Project</th>
                    <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider font-semibold text-akari-muted whitespace-nowrap w-[80px]">
                      <div className="flex items-center gap-1" title="From profiles: Individual / Company">
                        Identity
                        <span className="text-[10px]">ℹ️</span>
                      </div>
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider font-semibold text-gradient-blue whitespace-nowrap w-[100px]">
                      <div className="flex items-center gap-1" title="From projects: Personal / Project">
                        Type
                        <span className="text-[10px]">ℹ️</span>
                      </div>
                    </th>
                    <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider font-semibold text-akari-muted whitespace-nowrap w-[70px]">ARC</th>
                    <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider font-semibold text-akari-muted whitespace-nowrap w-[80px]">Status</th>
                    <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider font-semibold text-akari-muted whitespace-nowrap w-[100px] hidden lg:table-cell">Claimed</th>
                    <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider font-semibold text-akari-muted whitespace-nowrap w-[90px] hidden xl:table-cell">Updated</th>
                    <th className="text-left py-2.5 px-3 text-xs uppercase tracking-wider font-semibold text-akari-muted whitespace-nowrap w-[200px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 px-5 text-center text-akari-muted">
                        No projects found
                      </td>
                    </tr>
                  ) : (
                    projects.map((project) => {
                      return (
                        <tr
                          key={project.id}
                          className="border-b border-akari-neon-teal/10 last:border-0 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5"
                        >
                          <td className="py-2.5 px-3 text-akari-text">
                            <div className="truncate font-semibold" title={project.display_name || project.name || ''}>
                              {project.display_name || project.name}
                            </div>
                            <div className="text-[10px] text-akari-muted font-mono truncate">@{project.twitter_username || project.x_handle}</div>
                            <div className="text-[10px] text-akari-muted/60 font-mono truncate">{project.slug}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            {project.identityType === 'company' ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-400 font-medium whitespace-nowrap">Co</span>
                            ) : project.identityType === 'individual' ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400 font-medium whitespace-nowrap">Ind</span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-500/20 text-gray-400 font-medium whitespace-nowrap">?</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                              project.profile_type === 'project' 
                                ? 'bg-purple-500/20 text-purple-400' 
                                : project.profile_type === 'personal'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                            }`} title={!project.profile_type ? 'Needs classification' : ''}>
                              {project.profile_type === 'project' 
                                ? 'Proj' 
                                : project.profile_type === 'personal' 
                                ? 'Pers' 
                                : '⚠️'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="relative">
                              <select
                                value={project.arc_access_level || 'none'}
                                onChange={(e) => {
                                  const newValue = e.target.value as 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
                                  handleUpdateArcField(project.id, 'arc_access_level', newValue);
                                }}
                                disabled={updatingProjectId === project.id || !userIsSuperAdmin}
                                className={`px-1.5 py-1 rounded text-[10px] font-medium border transition-colors appearance-none bg-akari-bg h-7 w-full ${
                                  updatingProjectId === project.id
                                    ? 'opacity-50 cursor-not-allowed'
                                    : 'cursor-pointer hover:opacity-80'
                                } ${
                                  project.arc_access_level === 'gamified' 
                                    ? 'text-purple-400 border-purple-500/50'
                                    : project.arc_access_level === 'leaderboard'
                                    ? 'text-blue-400 border-blue-500/50'
                                    : project.arc_access_level === 'creator_manager'
                                    ? 'text-yellow-400 border-yellow-500/50'
                                    : 'text-gray-400 border-gray-500/50'
                                }`}
                                title={project.arc_access_level || 'none'}
                              >
                                <option value="none">none</option>
                                <option value="creator_manager">cm</option>
                                <option value="leaderboard">lb</option>
                                <option value="gamified">gam</option>
                              </select>
                              {updatingProjectId === project.id && (
                                <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px]">⏳</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <label className="flex items-center gap-1.5 cursor-pointer group" title={project.arc_active ? 'ARC Active' : 'ARC Inactive'}>
                              <input
                                type="checkbox"
                                checked={project.arc_active || false}
                                onChange={(e) => {
                                  handleUpdateArcField(project.id, 'arc_active', e.target.checked);
                                }}
                                disabled={updatingProjectId === project.id || !userIsSuperAdmin}
                                className={`w-3.5 h-3.5 rounded border-2 transition-colors ${
                                  updatingProjectId === project.id
                                    ? 'opacity-50 cursor-not-allowed'
                                    : 'cursor-pointer'
                                } ${
                                  project.arc_active
                                    ? 'bg-green-500 border-green-500'
                                    : 'bg-transparent border-gray-500'
                                }`}
                              />
                              <span className={`text-[10px] whitespace-nowrap ${
                                project.arc_active ? 'text-green-400' : 'text-akari-muted'
                              }`}>
                                {project.arc_active ? '✓' : '○'}
                              </span>
                            </label>
                          </td>
                          <td className="py-2.5 px-3 text-akari-muted text-[10px] hidden lg:table-cell">
                            {project.claimed_by ? (
                              <div title={project.claimed_by}>
                                <div className="truncate max-w-[80px] font-mono">
                                  {project.claimed_by.substring(0, 6)}...
                                </div>
                                <div className="text-[9px]">{formatDate(project.claimed_at)}</div>
                              </div>
                            ) : (
                              '–'
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-akari-muted text-[10px] hidden xl:table-cell whitespace-nowrap">
                            {formatDate(project.last_refreshed_at || project.claimed_at || project.first_tracked_at || project.last_updated_at)}
                          </td>
                          <td className="py-2.5 px-3">
                            {userIsSuperAdmin && (
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Link
                                  href={`/portal/admin/projects/${project.id}/team`}
                                  className="px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/50 transition-all duration-300 text-[10px] font-medium h-7 flex items-center"
                                  title="Manage Team"
                                >
                                  T
                                </Link>
                                {(project.arc_access_level === 'none' || !project.arc_active) && (
                                  <Link
                                    href={`/portal/arc/project/${project.id}`}
                                    className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/50 transition-all duration-300 text-[10px] font-medium h-7 flex items-center"
                                    title="Request ARC Access"
                                  >
                                    ARC
                                  </Link>
                                )}
                                <button
                                  onClick={() => handleClassify(project)}
                                  className="px-2 py-1 rounded bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 border border-purple-500/50 transition-all duration-300 text-[10px] font-medium h-7"
                                  title="Classify"
                                >
                                  C
                                </button>
                                <button
                                  onClick={() => handleEdit(project)}
                                  className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/50 transition-all duration-300 text-[10px] font-medium h-7"
                                  title="Edit"
                                >
                                  E
                                </button>
                                <button
                                  onClick={() => handleRefresh(project.id)}
                                  disabled={refreshingProjectId === project.id}
                                  className="px-2 py-1 rounded bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition-all duration-300 text-[10px] font-medium disabled:opacity-50 disabled:cursor-not-allowed h-7"
                                  title="Refresh"
                                >
                                  {refreshingProjectId === project.id ? '⏳' : 'R'}
                                </button>
                              </div>
                            )}
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
                  <label className="block text-xs text-slate-400 mb-1">
                    Ecosystem Type
                    <span className="text-xs text-yellow-400 ml-2" title="This is the ONLY field that controls ARC Top Projects visibility">
                      ⚠️ Controls ARC visibility
                    </span>
                  </label>
                  <select
                    value={classifyForm.profileType}
                    onChange={(e) => setClassifyForm({ ...classifyForm, profileType: e.target.value as 'project' | 'personal' })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                  >
                    <option value="personal">Personal (Individual)</option>
                    <option value="project">Project (Company/Organization)</option>
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Only projects with type &quot;Project&quot; appear in ARC Top Projects treemap.
                  </p>
                  <p className="text-xs text-orange-400 mt-1">
                    ⚠️ User should claim their profile first and set identity (individual/company) before classification.
                  </p>
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
                  <label className="block text-xs text-slate-400 mb-1">Header Image URL</label>
                  <input
                    type="url"
                    value={editForm.header_image_url}
                    onChange={(e) => setEditForm({ ...editForm, header_image_url: e.target.value })}
                    placeholder="https://example.com/header-image.jpg"
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    URL to the project header image (displayed on leaderboard pages)
                  </p>
                  {editForm.header_image_url && (
                    <div className="mt-2">
                      <img
                        src={editForm.header_image_url}
                        alt="Header preview"
                        className="w-full h-32 object-cover rounded-lg border border-slate-700"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}
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
    
    {/* Toast notification */}
    {toast && (
      <Toast 
        message={toast.message} 
        type={toast.type} 
        onClose={() => setToast(null)} 
      />
    )}
    
    {/* CSS for toast animation */}
    <style jsx global>{`
      @keyframes slide-up {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .animate-slide-up {
        animation: slide-up 0.2s ease-out;
      }
    `}</style>
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

