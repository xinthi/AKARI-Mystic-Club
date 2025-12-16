/**
 * Creator Manager - Project Admin Home
 * 
 * Lists projects where the current user is owner/admin/moderator
 * Shows Creator Manager programs for each project
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { createClient } from '@supabase/supabase-js';

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
}

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }
  return createClient(supabaseUrl, supabaseServiceKey);
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
  
  // Get projectId from query params (supports both UUID and slug)
  const projectIdFromQuery = router.query.projectId as string | undefined;

  const loadProjects = useCallback(async () => {
    try {
      const supabase = getSupabaseAdmin();

      // Get all projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('id, name, slug, avatar_url, twitter_username')
        .order('name');

      if (projectsError) throw projectsError;

      // Filter projects where user has permissions
      const projectsWithAccess: ProjectWithPrograms[] = [];
      
      for (const project of projectsData || []) {
        const permissions = await checkProjectPermissions(
          supabase,
          akariUser.userId!,
          project.id
        );

        if (permissions.canManage) {
          // Get programs for this project
          const programsRes = await fetch(
            `/api/portal/creator-manager/programs?projectId=${project.id}`
          );
          const programsData = await programsRes.json();

          projectsWithAccess.push({
            ...project,
            programs: programsData.ok ? programsData.programs : [],
          });
        }
      }

      setAllProjects(projectsWithAccess);
      
      // Auto-expand project if projectId query exists
      if (projectIdFromQuery && projectsWithAccess.length > 0) {
        const matchingProject = projectsWithAccess.find(
          (p) => p.id === projectIdFromQuery || p.slug === projectIdFromQuery
        );
        if (matchingProject) {
          setExpandedProjects(new Set([matchingProject.id]));
        }
      }
      // If no filter, projects are collapsed by default (empty Set)
    } catch (err: any) {
      console.error('[Creator Manager] Error loading projects:', err);
      setError(err.message || 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }, [akariUser.userId, projectIdFromQuery]);

  useEffect(() => {
    if (!akariUser.userId) {
      setLoading(false);
      return;
    }

    loadProjects();
  }, [akariUser.userId, loadProjects]);

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
      <PortalLayout title="Creator Manager">
        <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-8 text-center">
          <p className="text-sm text-akari-danger">Please log in to access Creator Manager</p>
        </div>
      </PortalLayout>
    );
  }

  if (loading) {
    return (
      <PortalLayout title="Creator Manager">
        <div className="text-center py-12">
          <p className="text-akari-muted">Loading...</p>
        </div>
      </PortalLayout>
    );
  }

  if (error) {
    return (
      <PortalLayout title="Creator Manager">
        <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-8 text-center">
          <p className="text-sm text-akari-danger">{error}</p>
        </div>
      </PortalLayout>
    );
  }

  if (allProjects.length === 0) {
    return (
      <PortalLayout title="Creator Manager">
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-akari-muted">
            <Link href="/portal/arc" className="hover:text-akari-primary transition-colors">
              ARC Home
            </Link>
            <span>/</span>
            <span className="text-akari-text">Creator Manager</span>
          </div>

          <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
            <p className="text-akari-muted">
              You don&apos;t have admin/moderator access to any projects yet.
            </p>
            <p className="text-sm text-akari-muted mt-2">
              Projects must be claimed and you must be assigned as owner, admin, or moderator.
            </p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  // If filtering by projectId and no match found
  if (projectIdFromQuery && filteredProjects.length === 0) {
    return (
      <PortalLayout title="Creator Manager">
        <div className="space-y-6">
          <div className="flex items-center gap-2 text-sm text-akari-muted">
            <Link href="/portal/arc" className="hover:text-akari-primary transition-colors">
              ARC Home
            </Link>
            <span>/</span>
            <span className="text-akari-text">Creator Manager</span>
          </div>

          <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
            <p className="text-akari-muted">
              Project not found or you don&apos;t have access to it.
            </p>
            <Link
              href="/portal/arc/creator-manager"
              className="text-akari-primary hover:text-akari-neon-teal text-sm underline mt-2 inline-block"
            >
              View all projects
            </Link>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="Creator Manager">
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-akari-muted">
          <Link href="/portal/arc" className="hover:text-akari-primary transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <span className="text-akari-text">Creator Manager</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-akari-text">Creator Manager</h1>
          {projectIdFromQuery && (
            <Link
              href="/portal/arc/creator-manager"
              className="text-sm text-akari-muted hover:text-akari-primary transition-colors"
            >
              View all projects
            </Link>
          )}
        </div>

        {/* Projects List */}
        <div className="space-y-4">
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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/portal/arc/creator-manager/create?projectId=${project.id}`);
                      }}
                      className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors text-sm font-medium"
                    >
                      Create Program
                    </button>
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
                        <p className="text-akari-muted mb-4">
                          This project has no active Creator Manager programs.
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
    </PortalLayout>
  );
}

