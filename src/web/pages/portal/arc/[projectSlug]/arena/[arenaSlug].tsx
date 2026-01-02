/**
 * ARC Arena Details Page
 * 
 * Shows detailed arena information including leaderboard, creator map, storyline, and quests.
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Image from 'next/image';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { EmptyState } from '@/components/arc/EmptyState';
import { ErrorState } from '@/components/arc/ErrorState';

// =============================================================================
// TYPES
// =============================================================================

interface Arena {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
  starts_at: string | null;
  ends_at: string | null;
  reward_depth: number;
  settings: Record<string, any>;
}

interface Project {
  id: string;
  name: string;
  twitter_username: string;
  avatar_url: string | null;
  header_image_url: string | null;
  arc_access_level: string | null;
}

interface Creator {
  id: string;
  twitter_username: string;
  arc_points: number;
  adjusted_points: number;
  ring: 'core' | 'momentum' | 'discovery';
  style: string | null;
  meta: Record<string, any>;
  profile_id: string | null;
  joined_at: string | null;
  avatar_url: string | null;
}

interface ArenaDetailResponse {
  ok: boolean;
  arena?: Arena;
  project?: Project;
  creators?: Creator[];
  sentiment?: {
    enabled: boolean;
    summary: null;
    series: any[];
  };
  error?: string;
}

interface ProjectPermissions {
  canManage: boolean;
  role: string | null;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'N/A';
  }
}

function getStatusBadgeColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-green-500/20 text-green-400 border-green-500/50';
    case 'scheduled':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    case 'ended':
      return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
    case 'cancelled':
      return 'bg-red-500/20 text-red-400 border-red-500/50';
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
  }
}

function getRingColor(ring: string): string {
  switch (ring) {
    case 'core':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
    case 'momentum':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    case 'discovery':
      return 'bg-teal-500/20 text-teal-400 border-teal-500/50';
    default:
      return 'bg-slate-500/20 text-slate-400 border-slate-500/50';
  }
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArenaDetailsPage() {
  const router = useRouter();
  const rawProjectSlug = router.query.projectSlug;
  const rawArenaSlug = router.query.arenaSlug;
  const projectSlug = typeof rawProjectSlug === 'string' ? String(rawProjectSlug).trim().toLowerCase() : null;
  const arenaSlug = typeof rawArenaSlug === 'string' ? String(rawArenaSlug).trim().toLowerCase() : null;
  
  const akariUser = useAkariUser();
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);

  const [project, setProject] = useState<Project | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [arena, setArena] = useState<Arena | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [permissions, setPermissions] = useState<ProjectPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch project and arena data
  useEffect(() => {
    if (!projectSlug || !arenaSlug || !router.isReady) return;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Step 1: Resolve project by slug
        const projectRes = await fetch(
          `/api/portal/arc/project-by-slug?slug=${encodeURIComponent(projectSlug)}`,
          { credentials: 'include' }
        );

        if (!projectRes.ok) {
          const data = await projectRes.json();
          throw new Error(data.error || 'Project not found');
        }

        const projectData = await projectRes.json();
        if (!projectData.ok || !projectData.project) {
          throw new Error('Project not found');
        }

        setProjectId(projectData.project.id);

        // Step 2: Fetch arena details by arenaSlug
        const arenaRes = await fetch(
          `/api/portal/arc/arenas/${encodeURIComponent(arenaSlug)}`,
          { credentials: 'include' }
        );

        if (!arenaRes.ok) {
          const arenaData = await arenaRes.json();
          throw new Error(arenaData.error || 'Arena not found');
        }

        const arenaData: ArenaDetailResponse = await arenaRes.json();
        if (!arenaData.ok || !arenaData.arena || !arenaData.project) {
          throw new Error(arenaData.error || 'Failed to load arena');
        }

        // Verify project matches
        if (arenaData.project.id !== projectData.project.id) {
          throw new Error('Arena does not belong to this project');
        }

        setProject(arenaData.project);
        setArena(arenaData.arena);
        setCreators(arenaData.creators || []);

        // Step 3: Fetch permissions (if logged in)
        if (akariUser.isLoggedIn) {
          try {
            const permRes = await fetch(
              `/api/portal/arc/permissions?projectId=${encodeURIComponent(projectData.project.id)}`,
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
            console.warn('[ArenaDetailsPage] Failed to fetch permissions:', permErr);
          }
        }
      } catch (err: any) {
        console.error('[ArenaDetailsPage] Error:', err);
        setError(err.message || 'Failed to load arena');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [projectSlug, arenaSlug, router.isReady, akariUser.isLoggedIn]);

  const canManageProject = userIsSuperAdmin || permissions?.canManage || false;

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
            <p className="mt-4 text-white/60">Loading arena...</p>
          </div>
        </div>
      </ArcPageShell>
    );
  }

  // Error state
  if (error || !arena || !project) {
    return (
      <ArcPageShell
        projectSlug={projectSlug}
        canManageProject={canManageProject}
        isSuperAdmin={userIsSuperAdmin}
      >
        <ErrorState
          message={error || 'Arena not found'}
          onRetry={() => {
            setError(null);
            setLoading(true);
            if (projectSlug && arenaSlug) {
              window.location.reload();
            }
          }}
        />
      </ArcPageShell>
    );
  }

  // Sort creators by adjusted_points (descending)
  const sortedCreators = [...creators].sort((a, b) => b.adjusted_points - a.adjusted_points);

  return (
    <ArcPageShell
      projectSlug={projectSlug}
      canManageProject={canManageProject}
      isSuperAdmin={userIsSuperAdmin}
    >
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link href="/portal/arc" className="hover:text-white transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          {projectSlug && (
            <>
              <Link
                href={`/portal/arc/${encodeURIComponent(projectSlug)}`}
                className="hover:text-white transition-colors"
              >
                {project.name}
              </Link>
              <span>/</span>
            </>
          )}
          <span className="text-white">Arena: {arena.name}</span>
        </div>

        {/* Arena Header */}
        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">{arena.name}</h1>
              {arena.description && (
                <p className="text-white/60 mb-4">{arena.description}</p>
              )}
              <div className="flex items-center gap-4 text-sm">
                <span className={`px-3 py-1 rounded-full border ${getStatusBadgeColor(arena.status)}`}>
                  {arena.status.charAt(0).toUpperCase() + arena.status.slice(1)}
                </span>
                {arena.starts_at && (
                  <span className="text-white/60">
                    Starts: {formatDate(arena.starts_at)}
                  </span>
                )}
                {arena.ends_at && (
                  <span className="text-white/60">
                    Ends: {formatDate(arena.ends_at)}
                  </span>
                )}
              </div>
            </div>
            {canManageProject && (
              <Link
                href={`/portal/arc/admin/${encodeURIComponent(projectSlug || '')}`}
                className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors"
              >
                Manage Arena
              </Link>
            )}
          </div>
        </div>

        {/* Creators Leaderboard */}
        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <h2 className="text-xl font-bold text-white mb-4">Leaderboard</h2>
          {sortedCreators.length === 0 ? (
            <EmptyState
              icon="👥"
              title="No creators yet"
              description="Creators will appear here once they join the arena."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-3 px-4 text-sm font-semibold text-white/60">Rank</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-white/60">Creator</th>
                    <th className="text-left py-3 px-4 text-sm font-semibold text-white/60">Ring</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-white/60">Points</th>
                    <th className="text-right py-3 px-4 text-sm font-semibold text-white/60">Adjusted</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCreators.map((creator, index) => (
                    <tr
                      key={creator.id}
                      className="border-b border-white/5 hover:bg-white/5 transition-colors"
                    >
                      <td className="py-3 px-4 text-white font-medium">#{index + 1}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {creator.avatar_url ? (
                            <div className="relative w-8 h-8 rounded-full overflow-hidden border border-white/20">
                              <Image
                                src={creator.avatar_url}
                                alt={creator.twitter_username || 'Creator'}
                                fill
                                className="object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60">
                              {creator.twitter_username?.charAt(0).toUpperCase() || '?'}
                            </div>
                          )}
                          <Link
                            href={`/portal/arc/creator/${encodeURIComponent(creator.twitter_username?.replace(/^@+/, '') || '')}`}
                            className="text-white hover:text-teal-400 transition-colors"
                          >
                            {creator.twitter_username || 'Unknown'}
                          </Link>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs border ${getRingColor(creator.ring)}`}>
                          {creator.ring}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-white">
                        {creator.arc_points.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right text-teal-400 font-medium">
                        {creator.adjusted_points.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Storyline Section */}
        {sortedCreators.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Storyline</h2>
            <div className="space-y-3">
              {sortedCreators
                .filter((c) => c.joined_at)
                .sort((a, b) => {
                  if (!a.joined_at || !b.joined_at) return 0;
                  return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
                })
                .map((creator) => (
                  <div
                    key={creator.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10"
                  >
                    <div className="text-white/60 text-sm">
                      {formatDate(creator.joined_at)}
                    </div>
                    <div className="text-white">
                      <Link
                        href={`/portal/arc/creator/${encodeURIComponent(creator.twitter_username?.replace(/^@+/, '') || '')}`}
                        className="hover:text-teal-400 transition-colors"
                      >
                        {creator.twitter_username}
                      </Link>
                      {' joined the arena'}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Placeholder for Creator Map */}
        {sortedCreators.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-6">
            <h2 className="text-xl font-bold text-white mb-4">Creator Map</h2>
            <EmptyState
              icon="🗺️"
              title="Map visualization coming soon"
              description="Creator map visualization will be available in a future update."
            />
          </div>
        )}

        {/* Placeholder for Quests */}
        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <h2 className="text-xl font-bold text-white mb-4">Quests</h2>
          <EmptyState
            icon="🎮"
            title="No quests yet"
            description="Quests will appear here when available."
          />
        </div>
      </div>
    </ArcPageShell>
  );
}
