/**
 * Creator Manager - Project Admin Home
 * 
 * Lists projects where the current user is owner/admin/moderator
 * Shows Creator Manager programs for each project
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { ErrorDisplay } from '@/components/portal/ErrorDisplay';
import { useAkariUser } from '@/lib/akari-auth';

// =============================================================================
// TYPES
// =============================================================================

interface Project {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  twitter_username: string | null;
}

interface Program {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  visibility: 'private' | 'public' | 'hybrid';
  status: 'active' | 'paused' | 'ended';
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  stats?: {
    totalCreators: number;
    approvedCreators: number;
    totalArcPoints: number;
  };
}

interface ProjectWithPrograms extends Project {
  programs: Program[];
  crmApproved: boolean; // Has CRM approval and unlock
  crmHasAccess: boolean; // Has approval (may not be unlocked yet)
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function CreatorManagerHome() {
  const router = useRouter();
  const akariUser = useAkariUser();
  const [allProjects, setAllProjects] = useState<ProjectWithPrograms[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [applyingProjectId, setApplyingProjectId] = useState<string | null>(null);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [kolLists, setKolLists] = useState<Array<{ listName: string; creatorCount: number }>>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  
  // Get projectId from query params (supports both UUID and slug)
  const projectIdFromQuery = router.query.projectId as string | undefined;

  // Handle applying for CRM access
  const handleApplyForCrm = async (projectId: string) => {
    if (applyingProjectId) return; // Prevent double-clicks

    setApplyingProjectId(projectId);
    try {
      const res = await fetch(`/api/portal/arc/projects/${projectId}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          applied_by_official_x: false,
          notes: 'Requesting CRM access for Creator Manager',
        }),
      });

      const data = await res.json();

      if (data.ok) {
        alert('CRM access request submitted successfully! You will be notified once it\'s approved.');
        // Reload projects to update status
        loadProjects();
      } else {
        alert(data.error || 'Failed to submit CRM access request');
      }
    } catch (err) {
      console.error('[Creator Manager] Error applying for CRM:', err);
      alert('Failed to submit CRM access request. Please try again.');
    } finally {
      setApplyingProjectId(null);
    }
  };

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Use API route instead of direct Supabase calls
      const response = await fetch('/api/portal/creator-manager/projects', { credentials: 'include' });
      const data = await response.json();

      if (!data.ok) {
        // Handle configuration errors gracefully
        if (data.error?.includes('configuration') || data.error?.includes('Service configuration')) {
          setError('Server configuration error. Please contact support.');
        } else {
          setError(data.error || 'Failed to load projects');
        }
        setAllProjects([]);
        return;
      }

      const projectsWithAccess: ProjectWithPrograms[] = data.projects || [];
      setAllProjects(projectsWithAccess);
      
      // Auto-expand project if projectId query exists
      if (projectIdFromQuery && projectsWithAccess.length > 0) {
        const matchingProject = projectsWithAccess.find(
          (p: ProjectWithPrograms) => p.id === projectIdFromQuery || p.slug === projectIdFromQuery
        );
        if (matchingProject) {
          setExpandedProjects(new Set([matchingProject.id]));
        }
      }
      // If no filter, projects are collapsed by default (empty Set)
    } catch (err: any) {
      console.error('[Creator Manager] Error loading projects:', err);
      setError('Failed to load projects. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [projectIdFromQuery]);

  useEffect(() => {
    if (!akariUser.isLoggedIn) {
      setLoading(false);
      return;
    }

    loadProjects();
  }, [akariUser.isLoggedIn, loadProjects]);

  // Filter projects based on projectId query param
  const filteredProjects = projectIdFromQuery
    ? allProjects.filter(
        (p) => p.id === projectIdFromQuery || p.slug === projectIdFromQuery
      )
    : allProjects;

  // Toggle project expansion
  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  if (!akariUser.isLoggedIn) {
    return (
      <ArcPageShell>
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
          <p className="text-sm text-red-400">Please log in to access Creator Manager</p>
        </div>
      </ArcPageShell>
    );
  }

  if (loading) {
    return (
      <ArcPageShell>
        <div className="text-center py-12">
          <p className="text-white/60">Loading...</p>
        </div>
      </ArcPageShell>
    );
  }

  if (error) {
    return (
      <ArcPageShell>
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Link href="/portal/arc" className="hover:text-white transition-colors">
              ARC Home
            </Link>
            <span>/</span>
            <span className="text-white">Creator Manager</span>
          </div>

          <ErrorDisplay
            error={error}
            onRetry={() => {
              setError(null);
              loadProjects();
            }}
          />
        </div>
      </ArcPageShell>
    );
  }

  if (allProjects.length === 0) {
    return (
      <ArcPageShell>
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Link href="/portal/arc" className="hover:text-white transition-colors">
              ARC Home
            </Link>
            <span>/</span>
            <span className="text-white">Creator Manager</span>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-8 text-center">
            <p className="text-white/60">
              You don&apos;t have admin/moderator access to any projects yet.
            </p>
            <p className="text-sm text-white/60 mt-2">
              Projects must be claimed and you must be assigned as owner, admin, or moderator.
            </p>
          </div>
        </div>
      </ArcPageShell>
    );
  }

  // If filtering by projectId and no match found
  if (projectIdFromQuery && filteredProjects.length === 0) {
    return (
      <ArcPageShell>
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Link href="/portal/arc" className="hover:text-white transition-colors">
              ARC Home
            </Link>
            <span>/</span>
            <span className="text-white">Creator Manager</span>
          </div>

          <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-8 text-center">
            <p className="text-white/60">
              Project not found or you don&apos;t have access to it.
            </p>
            <Link
              href="/portal/arc/creator-manager"
              className="text-teal-400 hover:text-teal-300 text-sm underline mt-2 inline-block"
            >
              View all projects
            </Link>
          </div>
        </div>
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link href="/portal/arc" className="hover:text-white transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <span className="text-white">Creator Manager</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Creator Manager</h1>
          {projectIdFromQuery && (
            <Link
              href="/portal/arc/creator-manager"
              className="text-sm text-akari-muted hover:text-akari-primary transition-colors"
            >
              View all projects
            </Link>
          )}
        </div>

        {/* Your Brands Section */}
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">Your Brands</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allProjects.map((project) => (
              <div
                key={project.id}
                onClick={() => setSelectedBrandId(project.id === selectedBrandId ? null : project.id)}
                className={`rounded-lg border p-4 cursor-pointer transition-all ${
                  selectedBrandId === project.id
                    ? 'border-teal-400 bg-teal-500/10'
                    : 'border-white/10 bg-black/40 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-3">
                  {project.avatar_url ? (
                    <img
                      src={project.avatar_url}
                      alt={project.name}
                      className="w-12 h-12 rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center text-white font-semibold">
                      {project.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-white truncate">{project.name}</h3>
                    {project.twitter_username && (
                      <p className="text-sm text-white/60 truncate">@{project.twitter_username}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* KOL Lists Section - Only show when a brand is selected */}
        {selectedBrandId && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">
                KOL Lists
                {allProjects.find(p => p.id === selectedBrandId) && (
                  <span className="text-sm font-normal text-white/60 ml-2">
                    for {allProjects.find(p => p.id === selectedBrandId)?.name}
                  </span>
                )}
              </h2>
              <button
                onClick={() => setShowCreateListModal(true)}
                className="px-4 py-2 bg-teal-500 text-black rounded-lg hover:bg-teal-400 transition-colors text-sm font-medium"
              >
                Create new
              </button>
            </div>

            {loadingLists ? (
              <div className="text-center py-8">
                <p className="text-white/60">Loading lists...</p>
              </div>
            ) : kolLists.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-black/40 p-8 text-center">
                <p className="text-white/60 mb-4">No KOL lists created yet</p>
                <button
                  onClick={() => setShowCreateListModal(true)}
                  className="px-4 py-2 bg-teal-500 text-black rounded-lg hover:bg-teal-400 transition-colors text-sm font-medium"
                >
                  Create First List
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {kolLists.map((list) => (
                  <div
                    key={list.listName}
                    className="rounded-lg border border-white/10 bg-black/40 p-4 hover:border-white/20 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white font-semibold">
                          {list.listName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-medium text-white">{list.listName === 'default' ? 'Default List' : list.listName}</h3>
                          <p className="text-sm text-white/60">{list.creatorCount} creator{list.creatorCount !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/portal/arc/creator-manager/brand/${selectedBrandId}/list/${encodeURIComponent(list.listName)}`}
                          className="px-3 py-1.5 bg-white/5 border border-white/10 text-white rounded-lg hover:bg-white/10 transition-colors text-sm"
                        >
                          View
                        </Link>
                        <button
                          onClick={() => {
                            setNewListName(list.listName);
                            setShowCreateListModal(true);
                          }}
                          className="px-3 py-1.5 bg-white/5 border border-white/10 text-white rounded-lg hover:bg-white/10 transition-colors text-sm"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create List Modal */}
        {showCreateListModal && (
          <>
            <div
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => {
                setShowCreateListModal(false);
                setNewListName('');
              }}
            />
            <div className="fixed inset-0 flex items-center justify-center z-50">
              <div
                className="bg-black border border-white/10 rounded-lg p-6 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-xl font-semibold text-white mb-4">
                  {newListName ? 'Edit List' : 'Create New List'}
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">List Name</label>
                    <input
                      type="text"
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      placeholder="e.g., Tier 1 KOLs, Micro-influencers"
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center gap-3 justify-end">
                    <button
                      onClick={() => {
                        setShowCreateListModal(false);
                        setNewListName('');
                      }}
                      className="px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg hover:bg-white/10 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!newListName.trim() || !selectedBrandId) return;
                        // TODO: Implement create/edit list API call
                        alert(`List "${newListName}" will be created/updated (API integration pending)`);
                        setShowCreateListModal(false);
                        setNewListName('');
                        loadKolLists(selectedBrandId);
                      }}
                      disabled={!newListName.trim()}
                      className="px-4 py-2 bg-teal-500 text-black rounded-lg hover:bg-teal-400 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {newListName ? 'Save' : 'Create'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Projects List (Legacy - Hidden, can be removed later) */}
        <div className="space-y-4 hidden">
          {filteredProjects.map((project) => {
            const isExpanded = expandedProjects.has(project.id);
            const hasPrograms = project.programs.length > 0;

            return (
              <div
                key={project.id}
                className="rounded-xl border border-akari-border bg-akari-card overflow-hidden"
              >
                {/* Project Header - Clickable to expand/collapse */}
                <div
                  className="flex items-start justify-between p-6 cursor-pointer hover:bg-akari-cardSoft transition-colors"
                  onClick={() => toggleProject(project.id)}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {project.avatar_url && (
                      <img
                        src={project.avatar_url}
                        alt={project.name}
                        className="w-12 h-12 rounded-full flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-semibold text-akari-text">{project.name}</h2>
                      {project.twitter_username && (
                        <p className="text-sm text-akari-muted">@{project.twitter_username}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {hasPrograms && (
                      <span className="text-sm text-akari-muted">
                        {project.programs.length} program{project.programs.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {/* Show status badge if not approved */}
                    {!project.crmApproved && (
                      <span className="px-2 py-1 rounded text-xs bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                        {project.crmHasAccess ? 'Awaiting Unlock' : 'Not Approved'}
                      </span>
                    )}
                    {/* Team Management Button */}
                    <Link
                      href={`/portal/projects/${project.id}/team`}
                      onClick={(e) => e.stopPropagation()}
                      className="px-3 py-2 sm:px-4 sm:py-2 bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 rounded-lg transition-colors text-xs sm:text-sm font-medium"
                      title="Manage Team Members"
                    >
                      Team
                    </Link>
                    {/* Show Create Program if approved, Apply if not */}
                    {project.crmApproved ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/portal/arc/creator-manager/create?projectId=${project.id}`);
                        }}
                        className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors text-sm font-medium"
                      >
                        Create Program
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApplyForCrm(project.id);
                        }}
                        disabled={applyingProjectId === project.id}
                        className="px-4 py-2 bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {applyingProjectId === project.id ? 'Applying...' : 'Apply for CRM'}
                      </button>
                    )}
                    <svg
                      className={`w-5 h-5 text-akari-muted transition-transform ${
                        isExpanded ? 'transform rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>

                {/* Programs List - Expandable */}
                {isExpanded && (
                  <div className="px-6 pb-6 border-t border-akari-border/50">
                    {!hasPrograms ? (
                      <div className="mt-4 p-6 rounded-lg border border-akari-border/50 bg-akari-cardSoft text-center">
                        {project.crmApproved ? (
                          <>
                            <p className="text-akari-muted mb-4">
                              This project has not opened Creator Manager programs yet.
                            </p>
                            <button
                              onClick={() =>
                                router.push(
                                  `/portal/arc/creator-manager/create?projectId=${project.id}`
                                )
                              }
                              className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors text-sm font-medium"
                            >
                              Create First Program
                            </button>
                          </>
                        ) : (
                          <>
                            <p className="text-akari-muted mb-4">
                              {project.crmHasAccess
                                ? 'CRM access is approved but awaiting unlock. Please contact support.'
                                : 'This project needs CRM approval before you can create Creator Manager programs.'}
                            </p>
                            {!project.crmHasAccess && (
                              <button
                                onClick={() => handleApplyForCrm(project.id)}
                                disabled={applyingProjectId === project.id}
                                className="px-4 py-2 bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30 rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {applyingProjectId === project.id ? 'Applying...' : 'Apply for CRM Access'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="mt-4 space-y-2">
                        {project.programs.map((program) => (
                          <Link
                            key={program.id}
                            href={`/portal/arc/creator-manager/${program.id}`}
                            className="block p-4 rounded-lg border border-akari-border/50 bg-akari-cardSoft hover:border-akari-primary/50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="font-medium text-akari-text">{program.title}</h3>
                                <p className="text-sm text-akari-muted mt-1">
                                  {program.stats?.approvedCreators || 0} creators •{' '}
                                  {program.stats?.totalArcPoints || 0} ARC points
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-2 py-1 rounded text-xs ${
                                    program.status === 'active'
                                      ? 'bg-green-500/20 text-green-300'
                                      : program.status === 'paused'
                                      ? 'bg-yellow-500/20 text-yellow-300'
                                      : 'bg-akari-cardSoft text-akari-muted'
                                  }`}
                                >
                                  {program.status}
                                </span>
                                <span className="text-akari-muted">→</span>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ArcPageShell>
  );
}

