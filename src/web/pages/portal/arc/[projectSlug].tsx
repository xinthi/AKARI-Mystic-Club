/**
 * ARC Project Hub Page
 * 
 * Public project page showing project details, leaderboard, GameFi, and CRM sections.
 * Uses feature flags to conditionally show sections.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { useCurrentMsArena } from '@/lib/arc/hooks';
import { getEnabledProducts, getCrmVisibilityLabel } from '@/lib/arc/features';
import { EmptyState } from '@/components/arc/EmptyState';
import { ErrorState } from '@/components/arc/ErrorState';
import { requireArcAccessRoute } from '@/lib/server/require-arc-access';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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

  // Leaderboard data
  const [leaderboardCreators, setLeaderboardCreators] = useState<Array<{
    id?: string;
    twitter_username: string;
    avatar_url?: string | null;
    arc_points: number;
    score?: number;
    base_points?: number;
    multiplier?: number;
    ring: 'core' | 'momentum' | 'discovery' | null;
    style: string | null;
    is_joined?: boolean;
    is_auto_tracked?: boolean;
    smart_followers_count?: number | null;
    smart_followers_pct?: number | null;
    contribution_pct?: number | null;
    ct_heat?: number | null;
  }>>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Reset to page 1 when leaderboard data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [leaderboardCreators.length]);

  // Approved MS request (for fallback detection)
  const [hasApprovedMsRequest, setHasApprovedMsRequest] = useState(false);
  const [approvedRequestLoading, setApprovedRequestLoading] = useState(false);

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

        // Check for approved MS requests (fallback if features not set)
        // Note: This endpoint requires auth, so we handle 401 gracefully
        setApprovedRequestLoading(true);
        try {
          const requestsRes = await fetch(
            `/api/portal/arc/leaderboard-requests?projectId=${encodeURIComponent(data.project.id)}`,
            { credentials: 'include' }
          );
          if (requestsRes.ok) {
            const requestsData = await requestsRes.json();
            if (requestsData.ok && requestsData.requests) {
              const hasApprovedMs = requestsData.requests.some(
                (r: any) => r.status === 'approved' && (r.productType === 'ms' || r.productType === null)
              );
              setHasApprovedMsRequest(hasApprovedMs);
            }
          } else if (requestsRes.status === 401 || requestsRes.status === 403) {
            // User is not authenticated or doesn't have permission - this is OK for public pages
            // We'll rely on features and arena checks instead
            console.log('[ArcProjectHub] Cannot check requests (auth required), using features/arena check instead');
            setHasApprovedMsRequest(false);
          } else {
            // Other errors - log but don't fail
            const errorData = await requestsRes.json().catch(() => ({ error: 'Unknown error' }));
            console.warn('[ArcProjectHub] Failed to fetch requests:', errorData.error || requestsRes.statusText);
          }
        } catch (reqErr) {
          // Network or other errors - log but don't fail
          console.warn('[ArcProjectHub] Failed to fetch requests:', reqErr);
        } finally {
          setApprovedRequestLoading(false);
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

  // Calculate enabled products and MS status before useEffect
  const enabledProducts = useMemo(() => {
    return features ? getEnabledProducts(features) : { ms: false, gamefi: false, crmPublic: false, crmEnabled: false };
  }, [features]);

  // MS is enabled if:
  // 1. leaderboard_enabled = true in features, OR
  // 2. Has an active/live arena (currentArena !== null), OR
  // 3. Has an approved MS request (fallback for scheduled arenas or missing features)
  // This ensures leaderboard shows even if arena hasn't started yet or features weren't set
  const msEnabled = useMemo(() => {
    return enabledProducts.ms || (currentArena !== null && !arenaLoading) || hasApprovedMsRequest;
  }, [enabledProducts.ms, currentArena, arenaLoading, hasApprovedMsRequest]);

  // Fetch leaderboard creators when project ID is available
  useEffect(() => {
    if (!projectId || !msEnabled) {
      setLeaderboardCreators([]);
      return;
    }

    // Store projectId in a const so TypeScript knows it's non-null
    const validProjectId = projectId;

    async function fetchLeaderboard() {
      setLeaderboardLoading(true);
      setLeaderboardError(null);

      try {
        // Use the full leaderboard endpoint which includes both joined and auto-tracked creators
        const res = await fetch(`/api/portal/arc/leaderboard/${encodeURIComponent(validProjectId)}`, {
          credentials: 'include',
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to load leaderboard');
        }

        const data = await res.json();
        if (data.ok && data.entries) {
          // Map the leaderboard entries to our format
          const mappedCreators = data.entries.map((entry: any, index: number) => ({
            id: `creator-${index}`,
            twitter_username: entry.twitter_username || '',
            avatar_url: entry.avatar_url || null,
            arc_points: entry.score || entry.base_points || 0,
            score: entry.score,
            base_points: entry.base_points,
            multiplier: entry.multiplier,
            ring: entry.ring || null,
            style: null,
            is_joined: entry.is_joined || false,
            is_auto_tracked: entry.is_auto_tracked || false,
            smart_followers_count: entry.smart_followers_count || null,
            smart_followers_pct: entry.smart_followers_pct || null,
            contribution_pct: entry.contribution_pct || null,
            ct_heat: entry.ct_heat || null,
          }));
          setLeaderboardCreators(mappedCreators);
        } else {
          setLeaderboardCreators([]);
        }
      } catch (err: any) {
        console.error('[ArcProjectHub] Leaderboard fetch error:', err);
        setLeaderboardError(err.message || 'Failed to load leaderboard');
        setLeaderboardCreators([]);
      } finally {
        setLeaderboardLoading(false);
      }
    }

    fetchLeaderboard();
  }, [projectId, msEnabled]);

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
                <div className="flex items-center gap-2">
                  <Link
                    href={`/portal/arc/${encodeURIComponent(projectSlug || '')}/team`}
                    className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Manage Team
                  </Link>
                  <Link
                    href={`/portal/arc/admin/${encodeURIComponent(projectSlug || '')}`}
                    className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Admin
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mindshare Leaderboard Section */}
        {msEnabled && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Mindshare Leaderboard</h2>
              {canManageProject && (currentArena || hasApprovedMsRequest) && (
                <Link
                  href={`/portal/arc/admin/${encodeURIComponent(projectSlug || '')}`}
                  className="px-3 py-1.5 text-xs font-medium border border-white/20 text-white/80 rounded-lg hover:bg-white/10 transition-colors"
                >
                  Manage Arena
                </Link>
              )}
            </div>
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
              // No active arena - check if there's an approved request (arena might be scheduled)
              hasApprovedMsRequest ? (
                <div className="text-center py-8">
                  <p className="text-white/80 mb-2">Leaderboard coming soon</p>
                  <p className="text-white/60 text-sm">
                    The arena is scheduled to start soon. Creators will appear here once it goes live.
                  </p>
                </div>
              ) : (
                <EmptyState
                  icon="📊"
                  title="No active leaderboard right now"
                  description="This project has ARC enabled, but there is no live arena at the moment."
                />
              )
            ) : (
              <div className="space-y-4">
                {/* Arena Info */}
                <div className="pb-4 border-b border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-1">{currentArena.name || 'Active Arena'}</h3>
                  <p className="text-white/60 text-sm">
                    {currentArena.starts_at && (
                      <span>Starts: {new Date(currentArena.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    )}
                    {currentArena.ends_at && (
                      <span className="ml-2">Ends: {new Date(currentArena.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    )}
                  </p>
                </div>

                {/* Leaderboard Table */}
                {leaderboardLoading ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-white/60"></div>
                    <p className="mt-2 text-white/60 text-sm">Loading leaderboard...</p>
                  </div>
                ) : leaderboardError ? (
                  <div className="text-center py-8">
                    <p className="text-red-400 text-sm">{leaderboardError}</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="text-left py-3 px-4 text-sm font-semibold text-white/60">Rank</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-white/60">Creator</th>
                            <th className="text-left py-3 px-4 text-sm font-semibold text-white/60">Ring</th>
                            <th className="text-right py-3 px-4 text-sm font-semibold text-white/60">Points</th>
                            <th className="text-right py-3 px-4 text-sm font-semibold text-white/60">Smart Followers</th>
                            <th className="text-right py-3 px-4 text-sm font-semibold text-white/60">MS</th>
                            <th className="text-right py-3 px-4 text-sm font-semibold text-white/60">CT Heat</th>
                          </tr>
                        </thead>
                        <tbody>
                          {leaderboardCreators.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="py-8 text-center">
                                <EmptyState
                                  icon="👥"
                                  title="No creators yet"
                                  description="Creators will appear here once they start contributing or join the leaderboard."
                                />
                              </td>
                            </tr>
                          ) : (() => {
                            // Calculate pagination
                            const totalPages = Math.ceil(leaderboardCreators.length / itemsPerPage);
                            const startIndex = (currentPage - 1) * itemsPerPage;
                            const endIndex = startIndex + itemsPerPage;
                            const paginatedCreators = leaderboardCreators.slice(startIndex, endIndex);
                            
                            return paginatedCreators.map((creator, index) => {
                              const globalRank = startIndex + index + 1;
                              return (
                                <tr
                                  key={creator.id || `creator-${globalRank}`}
                                  className="border-b border-white/5 hover:bg-white/5 transition-colors"
                                >
                                  <td className="py-3 px-4 text-white font-medium">#{globalRank}</td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  {creator.avatar_url ? (
                                    <div className="relative w-8 h-8 rounded-full overflow-hidden border border-white/20 flex-shrink-0">
                                      <Image
                                        src={creator.avatar_url}
                                        alt={creator.twitter_username || 'Creator avatar'}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                      />
                                    </div>
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex-shrink-0 flex items-center justify-center">
                                      <span className="text-white/60 text-xs">
                                        {(creator.twitter_username || '?')[0].toUpperCase()}
                                      </span>
                                    </div>
                                  )}
                                  <Link
                                    href={`/portal/arc/creator/${encodeURIComponent(creator.twitter_username?.replace(/^@+/, '') || '')}`}
                                    className="text-white hover:text-teal-400 transition-colors"
                                  >
                                    {creator.twitter_username || 'Unknown'}
                                  </Link>
                                  {creator.is_auto_tracked && (
                                    <span className="ml-2 text-xs text-white/40">(tracked)</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                {creator.ring && (
                                  <span className={`px-2 py-1 rounded-full text-xs border ${
                                    creator.ring === 'core'
                                      ? 'bg-purple-500/20 text-purple-400 border-purple-500/50'
                                      : creator.ring === 'momentum'
                                      ? 'bg-blue-500/20 text-blue-400 border-blue-500/50'
                                      : 'bg-teal-500/20 text-teal-400 border-teal-500/50'
                                  }`}>
                                    {creator.ring}
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right text-white font-medium">
                                {creator.arc_points.toLocaleString()}
                                {creator.multiplier && creator.multiplier > 1 && (
                                  <span className="ml-1 text-xs text-teal-400">({creator.multiplier}x)</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right text-white/80">
                                {creator.smart_followers_count !== null && creator.smart_followers_count !== undefined ? (
                                  <div>
                                    <div className="font-medium">{creator.smart_followers_count.toLocaleString()}</div>
                                    {creator.smart_followers_pct !== null && creator.smart_followers_pct !== undefined && (
                                      <div className="text-xs text-white/60">({creator.smart_followers_pct.toFixed(1)}%)</div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-white/40">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right text-white/80">
                                {creator.contribution_pct !== null && creator.contribution_pct !== undefined ? (
                                  <span className="font-medium">{creator.contribution_pct.toFixed(2)}%</span>
                                ) : (
                                  <span className="text-white/40">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right text-white/80">
                                {creator.ct_heat !== null && creator.ct_heat !== undefined ? (
                                  <span className="font-medium">{creator.ct_heat}</span>
                                ) : (
                                  <span className="text-white/40">—</span>
                                )}
                                </td>
                              </tr>
                            );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Pagination Controls */}
                    {leaderboardCreators.length > itemsPerPage && (() => {
                      const totalPages = Math.ceil(leaderboardCreators.length / itemsPerPage);
                      return (
                        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                          <div className="text-sm text-white/60">
                            Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, leaderboardCreators.length)} of {leaderboardCreators.length} creators
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                              disabled={currentPage === 1}
                              className="px-4 py-2 text-sm font-medium border border-white/20 text-white/80 rounded-lg hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                              Previous
                            </button>
                            <span className="text-sm text-white/60 px-3">
                              Page {currentPage} of {totalPages}
                            </span>
                            <button
                              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                              disabled={currentPage >= totalPages}
                              className="px-4 py-2 text-sm font-medium border border-white/20 text-white/80 rounded-lg hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
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
        {!msEnabled && !enabledProducts.gamefi && !enabledProducts.crmPublic && (
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

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { projectSlug } = context.params || {};
  
  if (!projectSlug || typeof projectSlug !== 'string') {
    return {
      redirect: {
        destination: '/portal/arc',
        permanent: false,
      },
    };
  }

  const supabase = getSupabaseAdmin();

  // Resolve project by slug
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', projectSlug)
    .maybeSingle();

  if (!project) {
    return {
      redirect: {
        destination: '/portal/arc',
        permanent: false,
      },
    };
  }

  // Check ARC access for this project: allow superadmin OR approved access for that project
  const accessCheck = await requireArcAccessRoute(context, `/portal/arc/${projectSlug}`, project.id);
  if (accessCheck) {
    return accessCheck; // Redirect if access check fails
  }

  return {
    props: {},
  };
};
