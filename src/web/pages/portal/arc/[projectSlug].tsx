/**
 * ARC Project Hub Page
 * 
 * Public project page showing project details, leaderboard, GameFi, and CRM sections.
 * Uses feature flags to conditionally show sections.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Image from 'next/image';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { useCurrentMsArena } from '@/lib/arc/hooks';
import { getEnabledProducts, getCrmVisibilityLabel } from '@/lib/arc/features';
import { EmptyState } from '@/components/arc/EmptyState';
import { ErrorState } from '@/components/arc/ErrorState';

// =============================================================================
// TYPES
// =============================================================================

interface Project {
  id: string;
  name: string;
  slug: string | null;
  twitter_username: string | null;
  avatar_url: string | null;
  header_image_url?: string | null;
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

interface ProjectPermissions {
  canManage: boolean;
  role: string | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcProjectHub() {
  const router = useRouter();
  const rawProjectSlug = router.query.projectSlug;
  const projectSlug = typeof rawProjectSlug === 'string' ? String(rawProjectSlug).trim().toLowerCase() : null;
  const akariUser = useAkariUser();
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  const [project, setProject] = useState<Project | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [features, setFeatures] = useState<ProjectFeatures | null>(null);
  const [permissions, setPermissions] = useState<ProjectPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load current MS arena
  const { arena: currentArena, loading: arenaLoading, error: arenaError } = useCurrentMsArena(projectId);

  // Fetch project by slug
  useEffect(() => {
    if (!projectSlug || !router.isReady) return;

    async function fetchProject() {
      try {
        setLoading(true);
        setError(null);

        // Type guard: ensure projectSlug is a string (already checked in useEffect condition)
        if (!projectSlug) return;
        const validProjectSlug: string = projectSlug;

        // Resolve project by slug
        const res = await fetch(`/api/portal/arc/project-by-slug?slug=${encodeURIComponent(validProjectSlug)}`, {
          credentials: 'include',
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Project not found');
        }

        const data = await res.json();
        if (!data.ok || !data.project) {
          throw new Error('Project not found');
        }

        setProject(data.project);
        setProjectId(data.project.id);

        // Fetch features from projects API
        const featuresRes = await fetch(`/api/portal/arc/projects`, {
          credentials: 'include',
        });

        if (featuresRes.ok) {
          const featuresData = await featuresRes.json();
          if (featuresData.ok && featuresData.projects) {
            const projectWithFeatures = featuresData.projects.find(
              (p: any) => p.project_id === data.project.id
            );
            if (projectWithFeatures?.features) {
              setFeatures(projectWithFeatures.features);
            }
          }
        }

        // Fetch permissions (if logged in)
        if (akariUser.isLoggedIn) {
          try {
            const permRes = await fetch(
              `/api/portal/arc/permissions?projectId=${encodeURIComponent(data.project.id)}`,
              { credentials: 'include' }
            );
            if (permRes.ok) {
              const permData = await permRes.json();
              if (permData.ok && permData.permissions) {
                setPermissions({
                  canManage: permData.permissions.canManage || false,
                  role: permData.permissions.role || null,
                });
              }
            }
          } catch (permErr) {
            console.warn('[ArcProjectHub] Failed to fetch permissions:', permErr);
          }
        }
      } catch (err: any) {
        console.error('[ArcProjectHub] Error:', err);
        setError(err.message || 'Failed to load project');
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
  }, [projectSlug, router.isReady, akariUser.isLoggedIn]);

  // Canonicalize projectSlug: redirect if normalized differs from original
  useEffect(() => {
    if (!router.isReady || !rawProjectSlug) return;

    if (typeof rawProjectSlug === 'string' && rawProjectSlug) {
      const normalized = String(rawProjectSlug).trim().toLowerCase();
      if (normalized !== rawProjectSlug) {
        router.replace(`/portal/arc/${encodeURIComponent(normalized)}`, undefined, { shallow: false });
        return;
      }
    }
  }, [router.isReady, rawProjectSlug, router]);

  const canManageProject = userIsSuperAdmin || permissions?.canManage || false;
  const enabledProducts = features ? getEnabledProducts(features) : { ms: false, gamefi: false, crmPublic: false, crmEnabled: false };

  // Loading state
  if (loading) {
    return (
      <ArcPageShell
      projectSlug={projectSlug}
      canManageProject={canManageProject}
      isSuperAdmin={userIsSuperAdmin}
    >
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white/60"></div>
          <p className="mt-4 text-white/60">Loading project...</p>
        </div>
      </div>
    </ArcPageShell>
    );
  }

  // Error state
  if (error || !project) {
    return (
      <ArcPageShell
        projectSlug={projectSlug}
        canManageProject={canManageProject}
        isSuperAdmin={userIsSuperAdmin}
      >
        <ErrorState
          message={error || 'Project not found'}
          onRetry={() => {
            setError(null);
            setLoading(true);
            // Trigger refetch
            if (projectSlug) {
              window.location.reload();
            }
          }}
        />
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell
      projectSlug={projectSlug}
      canManageProject={canManageProject}
      isSuperAdmin={userIsSuperAdmin}
    >
      <div className="space-y-6">
        {/* Project Hero Section */}
        <div className="relative rounded-lg overflow-hidden border border-white/10 bg-black/40">
          {project.header_image_url ? (
            <div className="relative h-48 w-full">
              <Image
                src={project.header_image_url}
                alt={project.name || 'Project banner'}
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
            </div>
          ) : (
            <div className="h-48 bg-gradient-to-br from-teal-500/20 to-cyan-500/20" />
          )}

          <div className="p-6">
            <div className="flex items-start gap-4">
              {project.avatar_url && (
                <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-white/20 flex-shrink-0">
                  <Image
                    src={project.avatar_url}
                    alt={project.name || 'Project avatar'}
                    fill
                    className="object-cover"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-white mb-1">{project.name}</h1>
                {project.twitter_username && (
                  <p className="text-white/60 text-sm">@{project.twitter_username}</p>
                )}
              </div>
              {canManageProject && (
                <Link
                  href={`/portal/arc/admin/${encodeURIComponent(projectSlug || '')}`}
                  className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors"
                >
                  Admin
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Mindshare Leaderboard Section */}
        {enabledProducts.ms && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Mindshare Leaderboard</h2>
            {arenaLoading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-white/60"></div>
                <p className="mt-2 text-white/60 text-sm">Loading arena...</p>
              </div>
            ) : arenaError ? (
              <ErrorState
                message={arenaError}
                onRetry={() => window.location.reload()}
              />
            ) : !currentArena ? (
              <EmptyState
                icon="📊"
                title="No active leaderboard right now"
                description="This project has ARC enabled, but there is no live arena at the moment."
              />
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{currentArena.name || 'Active Arena'}</h3>
                    <p className="text-white/60 text-sm">
                      {currentArena.starts_at && new Date(currentArena.starts_at).toLocaleDateString()}
                      {currentArena.ends_at && ` → ${new Date(currentArena.ends_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Link
                    href={`/portal/arc/${encodeURIComponent(projectSlug || '')}/arena/${encodeURIComponent(currentArena.slug || '')}`}
                    className="px-4 py-2 text-sm font-medium bg-teal-500/20 text-teal-400 border border-teal-500/50 rounded-lg hover:bg-teal-500/30 transition-colors"
                  >
                    View Leaderboard
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* GameFi Section */}
        {enabledProducts.gamefi && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Quests</h2>
            <EmptyState
              icon="🎮"
              title="No quests yet"
              description="GameFi quests will appear here when available."
            />
          </div>
        )}

        {/* CRM Section */}
        {enabledProducts.crmPublic && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-6">
            <h2 className="text-xl font-bold text-white mb-4">CRM</h2>
            <p className="text-white/60">CRM features are available for this project.</p>
            {canManageProject && (
              <Link
                href={`/portal/arc/admin/${encodeURIComponent(projectSlug || '')}`}
                className="mt-4 inline-block px-4 py-2 text-sm font-medium bg-teal-500/20 text-teal-400 border border-teal-500/50 rounded-lg hover:bg-teal-500/30 transition-colors"
              >
                Manage Campaigns
              </Link>
            )}
          </div>
        )}

        {/* Feature Not Enabled States */}
        {!enabledProducts.ms && !enabledProducts.gamefi && !enabledProducts.crmPublic && (
          <EmptyState
            icon="🔒"
            title="ARC features not enabled"
            description="This project does not have any ARC features enabled yet."
          />
        )}
      </div>
    </ArcPageShell>
  );
}
