/**
 * ARC Admin Home Page
 * 
 * Lists all ARC-enabled projects for admin management
 */

import React from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { createPortalClient } from '@/lib/portal/supabase';
import { isSuperAdmin } from '@/lib/permissions';
import { useAkariUser } from '@/lib/akari-auth';

// =============================================================================
// TYPES
// =============================================================================

interface ArcProject {
  project_id: string;
  slug: string | null;
  name: string | null;
  twitter_username: string | null;
  arc_tier: 'basic' | 'pro' | 'event_host';
  arc_status: 'inactive' | 'active' | 'suspended';
  security_status: 'normal' | 'alert' | 'clear';
  arenas_count: number;
}

interface ArcAdminHomeProps {
  projects: ArcProject[];
  error: string | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcAdminHome({ projects, error }: ArcAdminHomeProps) {
  const akariUser = useAkariUser();
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  // Helper function to get tier badge color
  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'event_host':
        return 'bg-purple-500/20 border-purple-500/40 text-purple-300';
      case 'pro':
        return 'bg-blue-500/20 border-blue-500/40 text-blue-300';
      case 'basic':
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-text';
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-text';
    }
  };

  // Helper function to get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 border-green-500/40 text-green-300';
      case 'suspended':
        return 'bg-red-500/20 border-red-500/40 text-red-300';
      case 'inactive':
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
    }
  };

  // Helper function to get security status badge color
  const getSecurityColor = (status: string) => {
    switch (status) {
      case 'alert':
        return 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300';
      case 'clear':
        return 'bg-green-500/20 border-green-500/40 text-green-300';
      case 'normal':
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-text';
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
          <span className="text-akari-text">Admin</span>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-akari-text">ARC Admin</h1>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-6 text-center">
            <p className="text-sm text-akari-danger">{error}</p>
          </div>
        )}

        {/* Projects table */}
        {!error && (
          <div className="rounded-xl border border-slate-700 bg-akari-card overflow-hidden">
            {projects.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-akari-muted">
                  No ARC-enabled projects found.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-akari-cardSoft/30 border-b border-akari-border/30">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Project</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">ARC Tier</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Security</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Arenas</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-akari-border/30">
                    {projects.map((project) => (
                      <tr
                        key={project.project_id}
                        className="hover:bg-akari-cardSoft/20 transition-colors"
                      >
                        <td className="px-4 py-3 text-sm text-akari-text">
                          <div>
                            <div className="font-medium">{project.name || 'Unnamed Project'}</div>
                            {project.twitter_username && (
                              <div className="text-xs text-akari-muted">
                                @{project.twitter_username}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getTierColor(
                              project.arc_tier
                            )}`}
                          >
                            {project.arc_tier}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                              project.arc_status
                            )}`}
                          >
                            {project.arc_status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getSecurityColor(
                              project.security_status
                            )}`}
                          >
                            {project.security_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-akari-text">
                          {project.arenas_count}
                        </td>
                        <td className="px-4 py-3">
                          {project.slug ? (
                            <Link
                              href={`/portal/arc/admin/${project.slug}`}
                              className="px-3 py-1.5 text-xs font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
                            >
                              Manage Arenas
                            </Link>
                          ) : (
                            <span className="text-xs text-akari-muted">No slug</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps<ArcAdminHomeProps> = async () => {
  try {
    const supabase = createPortalClient();

    // Query project_arc_settings joined with projects
    const { data: arcSettingsData, error: arcSettingsError } = await supabase
      .from('project_arc_settings')
      .select(`
        project_id,
        tier,
        status,
        security_status,
        projects (
          id,
          slug,
          name,
          twitter_username
        )
      `)
      .eq('is_arc_enabled', true);

    if (arcSettingsError) {
      console.error('[ArcAdminHome] Supabase error:', arcSettingsError);
      return {
        props: {
          projects: [],
          error: 'Failed to load ARC projects',
        },
      };
    }

    if (!arcSettingsData || arcSettingsData.length === 0) {
      return {
        props: {
          projects: [],
          error: null,
        },
      };
    }

    // Get project IDs to count arenas
    const projectIds = arcSettingsData.map((row: any) => row.project_id);

    // Count arenas per project
    const { data: arenasData } = await supabase
      .from('arenas')
      .select('project_id')
      .in('project_id', projectIds);

    const arenasCountByProject = new Map<string, number>();
    if (arenasData) {
      for (const arena of arenasData) {
        const count = arenasCountByProject.get(arena.project_id) || 0;
        arenasCountByProject.set(arena.project_id, count + 1);
      }
    }

    // Map data to response format
    const projects: ArcProject[] = arcSettingsData.map((row: any) => ({
      project_id: row.project_id,
      slug: row.projects?.slug ?? null,
      name: row.projects?.name ?? null,
      twitter_username: row.projects?.twitter_username ?? null,
      arc_tier: row.tier,
      arc_status: row.status,
      security_status: row.security_status,
      arenas_count: arenasCountByProject.get(row.project_id) || 0,
    }));

    return {
      props: {
        projects,
        error: null,
      },
    };
  } catch (error: any) {
    console.error('[ArcAdminHome] Error:', error);
    return {
      props: {
        projects: [],
        error: error.message || 'Internal server error',
      },
    };
  }
};
