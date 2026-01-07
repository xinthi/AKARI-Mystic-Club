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
import { MindshareTreemap } from '@/components/arc/MindshareTreemap';
import { CountdownTimer } from '@/components/arc/CountdownTimer';
import { TopTweetsFeed } from '@/components/arc/TopTweetsFeed';

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
    // Delta values (in basis points - bps)
    delta7d?: number | null;
    delta1m?: number | null;
    delta3m?: number | null;
  }>>([]);
  
  // Delta display mode: 'absolute' (bps) or 'relative' (%)
  const [deltaMode, setDeltaMode] = useState<'absolute' | 'relative'>('absolute');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  // Time period filter state
  type TimePeriod = '7D' | '1M' | '3M' | 'ALL';
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('ALL');

  // Treemap data
  const [treemapData, setTreemapData] = useState<Array<{ name: string; value: number; handle: string; avatar: string | null }>>([]);
  const [treemapLoading, setTreemapLoading] = useState(false);

  // Top tweets data
  const [topTweets, setTopTweets] = useState<Array<{
    tweet_id: string;
    url: string;
    text: string;
    author_handle: string;
    author_name: string | null;
    author_avatar: string | null;
    created_at: string;
    impressions: number | null;
    engagements: number | null;
    likes: number;
    replies: number;
    reposts: number;
    score: number;
  }>>([]);
  const [topTweetsLoading, setTopTweetsLoading] = useState(false);

  // Reset to page 1 when leaderboard data changes
  useEffect(() => {
    setCurrentPage(1);
  }, [leaderboardCreators.length, timePeriod]);

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
            delta7d: entry.delta7d ?? null,
            delta1m: entry.delta1m ?? null,
            delta3m: entry.delta3m ?? null,
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

  // Fetch treemap data
  useEffect(() => {
    if (!projectId || !msEnabled) {
      setTreemapData([]);
      return;
    }

    // Store projectId in a const so TypeScript knows it's non-null
    const validProjectId = projectId;

    async function fetchTreemap() {
      setTreemapLoading(true);
      try {
        const res = await fetch(`/api/portal/arc/projects/${encodeURIComponent(validProjectId)}/treemap`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.nodes) {
            setTreemapData(data.nodes);
          }
        }
      } catch (err) {
        console.error('[ArcProjectHub] Treemap fetch error:', err);
      } finally {
        setTreemapLoading(false);
      }
    }

    fetchTreemap();
  }, [projectId, msEnabled]);

  // Fetch top tweets
  useEffect(() => {
    if (!projectId || !msEnabled) {
      setTopTweets([]);
      return;
    }

    // Store projectId in a const so TypeScript knows it's non-null
    const validProjectId = projectId;

    async function fetchTopTweets() {
      setTopTweetsLoading(true);
      try {
        const range = timePeriod === 'ALL' ? '7d' : timePeriod.toLowerCase();
        const res = await fetch(`/api/portal/arc/projects/${encodeURIComponent(validProjectId)}/top-tweets?range=${range}&limit=10`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.tweets) {
            setTopTweets(data.tweets);
          }
        }
      } catch (err) {
        console.error('[ArcProjectHub] Top tweets fetch error:', err);
      } finally {
        setTopTweetsLoading(false);
      }
    }

    fetchTopTweets();
  }, [projectId, msEnabled, timePeriod]);

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
          <div className="space-y-6">
            {/* Top Section: Treemap (Left) and Project Details (Right) */}
            {currentArena && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Treemap */}
                <div className="lg:col-span-2">
                  <MindshareTreemap nodes={treemapData} loading={treemapLoading} />
                </div>
                
                {/* Right: Project Details + Countdown */}
                <div className="bg-white/5 rounded-lg border border-white/10 p-6">
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-xl font-bold text-white mb-1">
                        {project?.name || 'Project'} Mindshare
                      </h2>
                      <p className="text-white/70 text-sm">
                        {currentArena.name || 'Active Arena'}
                      </p>
                    </div>
                    {currentArena.starts_at && currentArena.ends_at && (
                      <div className="space-y-2">
                        <div className="text-sm text-white/80">
                          <div>Start: {new Date(currentArena.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                          <div>End: {new Date(currentArena.ends_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                        </div>
                        <div className="pt-2 border-t border-white/10">
                          <div className="text-xs text-white/60 mb-2">Time Remaining</div>
                          <CountdownTimer targetDate={currentArena.ends_at} />
                        </div>
                      </div>
                    )}
                    {canManageProject && (
                      <Link
                        href={`/portal/arc/admin/${encodeURIComponent(projectSlug || '')}`}
                        className="block w-full mt-4 px-4 py-2 text-sm font-medium bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-colors text-center"
                      >
                        Manage Arena
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            )}

            {arenaLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white/60"></div>
                <p className="mt-4 text-white/60 text-sm">Loading arena...</p>
              </div>
            ) : arenaError ? (
              <ErrorState
                message={arenaError}
                onRetry={() => window.location.reload()}
              />
            ) : !currentArena ? (
              hasApprovedMsRequest ? (
                <div className="text-center py-12">
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
            ) : leaderboardLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white/60"></div>
                <p className="mt-4 text-white/60 text-sm">Loading leaderboard...</p>
              </div>
            ) : leaderboardError ? (
              <div className="text-center py-12">
                <p className="text-red-400 text-sm">{leaderboardError}</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Time Period Filters */}
                <div className="flex items-center gap-2 bg-white/5 px-0.5 py-0 rounded-full">
                  {(['7D', '1M', '3M', 'ALL'] as TimePeriod[]).map((period) => (
                    <button
                      key={period}
                      onClick={() => setTimePeriod(period)}
                      className={`w-8 h-5 flex items-center justify-center rounded-full text-xs font-normal transition-all duration-200 ${
                        timePeriod === period
                          ? 'bg-[#F6623A] text-white font-medium'
                          : 'text-white/60 hover:text-white/80'
                      }`}
                    >
                      {period}
                    </button>
                  ))}
                </div>

                {/* Top Gainers/Losers and Top Tweets Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left: Top Gainers & Losers */}
                  <div className="lg:col-span-2">
                    {leaderboardCreators.length > 0 && (
                      <div className="rounded-lg border border-white/10 bg-black/40 p-6">
                        <div className="flex items-center justify-between mb-4 px-2">
                          <h3 className="text-base font-bold text-white flex items-center gap-2 leading-5">
                            <span className="w-1 h-4 bg-red-500 rounded"></span>
                            Mindshare
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setDeltaMode('absolute')}
                              className={`w-[120px] h-5 flex items-center justify-center rounded-full text-xs font-medium transition-all duration-200 ${
                                deltaMode === 'absolute'
                                  ? 'bg-[#14CC7F] text-white'
                                  : 'text-white/40'
                              }`}
                            >
                              △ Absolute (bps)
                            </button>
                            <button
                              onClick={() => setDeltaMode('relative')}
                              className={`w-[120px] h-5 flex items-center justify-center rounded-full text-xs font-medium transition-all duration-200 ${
                                deltaMode === 'relative'
                                  ? 'bg-[#14CC7F] text-white'
                                  : 'text-white/40'
                              }`}
                            >
                              △ Relative (%)
                            </button>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Top Gainers Table */}
                          <div className="flex flex-col gap-4">
                        <h4 className="text-base font-bold text-white px-2 leading-5">Top Gainers</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full border-separate border-spacing-0 text-xs">
                            <thead>
                              <tr>
                                <th className="w-[20%] text-left py-1 px-2 font-normal text-white/60 leading-3">Name</th>
                                <th className="w-[20%] text-right py-1 px-0 font-normal text-white/60 leading-3">Current</th>
                                <th className="w-[20%] text-center py-1 px-0 font-normal text-white/60 leading-3">Δ7D</th>
                                <th className="w-[20%] text-center py-1 px-0 font-normal text-white/60 leading-3">Δ1M</th>
                                <th className="w-[20%] text-right py-1 pr-2 font-normal text-white/60 leading-3 rounded-r-lg">Δ3M</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                // Sort by contribution percentage (or points as fallback)
                                const sorted = [...leaderboardCreators].sort((a, b) => 
                                  (b.contribution_pct ?? 0) - (a.contribution_pct ?? 0)
                                );
                                const topGainers = sorted.slice(0, 5);
                                
                                return topGainers.map((creator, idx) => {
                                  const formatDelta = (delta: number | null | undefined) => {
                                    if (delta === null || delta === undefined) return '—';
                                    if (delta === 0) return '▲ 0bps';
                                    const isPositive = delta > 0;
                                    const absDelta = Math.abs(delta);
                                    if (deltaMode === 'absolute') {
                                      return `${isPositive ? '▲' : '▼'} ${Math.round(absDelta)}bps`;
                                    } else {
                                      return `${isPositive ? '▲' : '▼'} ${absDelta.toFixed(2)}%`;
                                    }
                                  };
                                  
                                  return (
                                    <tr 
                                      key={creator.id || `gainer-${idx}`} 
                                      className="hover:bg-white/5 transition-colors duration-200 cursor-pointer last:border-b-0"
                                    >
                                      <td className="max-w-[130px] py-2 pl-2 text-left rounded-l-lg">
                                        <div className="flex items-center gap-0.5 min-w-0">
                                          {creator.avatar_url ? (
                                            <div className="relative w-[18px] h-[18px] rounded-full overflow-hidden flex-shrink-0">
                                              <Image
                                                src={creator.avatar_url}
                                                alt={creator.twitter_username || 'Avatar'}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                              />
                                            </div>
                                          ) : (
                                            <div className="w-[18px] h-[18px] rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center">
                                              <span className="text-white/60 text-[10px]">
                                                {(creator.twitter_username || '?')[0].toUpperCase()}
                                              </span>
                                            </div>
                                          )}
                                          <div className="flex gap-0.5 min-w-0">
                                            <span className="font-medium text-white text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                                              {creator.twitter_username || 'Unknown'}
                                            </span>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-3 text-right text-xs font-normal text-white leading-4">
                                        {creator.contribution_pct !== null && creator.contribution_pct !== undefined
                                          ? `${creator.contribution_pct.toFixed(2)}%`
                                          : '—'}
                                      </td>
                                      <td className={`py-3 text-center text-xs font-normal leading-4 ${
                                        (creator.delta7d ?? 0) > 0 ? 'text-[#14CC7F]' : (creator.delta7d ?? 0) < 0 ? 'text-[#FE3C70]' : 'text-white/60'
                                      }`}>
                                        <div className="flex items-center justify-center gap-0.5">
                                          {formatDelta(creator.delta7d)}
                                        </div>
                                      </td>
                                      <td className={`py-3 text-center text-xs font-normal leading-4 ${
                                        (creator.delta1m ?? 0) > 0 ? 'text-[#14CC7F]' : (creator.delta1m ?? 0) < 0 ? 'text-[#FE3C70]' : 'text-white/60'
                                      }`}>
                                        <div className="flex items-center justify-center gap-0.5">
                                          {formatDelta(creator.delta1m)}
                                        </div>
                                      </td>
                                      <td className={`py-3 pr-2 text-right text-xs font-normal leading-4 rounded-r-lg ${
                                        (creator.delta3m ?? 0) > 0 ? 'text-[#14CC7F]' : (creator.delta3m ?? 0) < 0 ? 'text-[#FE3C70]' : 'text-white/60'
                                      }`}>
                                        <div className="flex items-center justify-end gap-0.5">
                                          {formatDelta(creator.delta3m)}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                          </div>

                          {/* Top Losers Table */}
                          <div className="flex flex-col gap-4">
                        <h4 className="text-base font-bold text-white px-2 leading-5">Top Losers</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full border-separate border-spacing-0 text-xs">
                            <thead>
                              <tr>
                                <th className="w-[20%] text-left py-1 px-2 font-normal text-white/60 leading-3">Name</th>
                                <th className="w-[20%] text-right py-1 px-0 font-normal text-white/60 leading-3">Current</th>
                                <th className="w-[20%] text-center py-1 px-0 font-normal text-white/60 leading-3">Δ7D</th>
                                <th className="w-[20%] text-center py-1 px-0 font-normal text-white/60 leading-3">Δ1M</th>
                                <th className="w-[20%] text-right py-1 pr-2 font-normal text-white/60 leading-3 rounded-r-lg">Δ3M</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                // Sort by contribution percentage (ascending for losers)
                                const sorted = [...leaderboardCreators].sort((a, b) => 
                                  (a.contribution_pct ?? 0) - (b.contribution_pct ?? 0)
                                );
                                const topLosers = sorted.slice(0, 5);
                                
                                return topLosers.map((creator, idx) => {
                                  const formatDelta = (delta: number | null | undefined) => {
                                    if (delta === null || delta === undefined) return '—';
                                    if (delta === 0) return '▲ 0bps';
                                    const isPositive = delta > 0;
                                    const absDelta = Math.abs(delta);
                                    if (deltaMode === 'absolute') {
                                      return `${isPositive ? '▲' : '▼'} ${Math.round(absDelta)}bps`;
                                    } else {
                                      return `${isPositive ? '▲' : '▼'} ${absDelta.toFixed(2)}%`;
                                    }
                                  };
                                  
                                  return (
                                    <tr 
                                      key={creator.id || `loser-${idx}`} 
                                      className="hover:bg-white/5 transition-colors duration-200 cursor-pointer last:border-b-0"
                                    >
                                      <td className="max-w-[130px] py-2 pl-2 text-left rounded-l-lg">
                                        <div className="flex items-center gap-0.5 min-w-0">
                                          {creator.avatar_url ? (
                                            <div className="relative w-[18px] h-[18px] rounded-full overflow-hidden flex-shrink-0">
                                              <Image
                                                src={creator.avatar_url}
                                                alt={creator.twitter_username || 'Avatar'}
                                                fill
                                                className="object-cover"
                                                unoptimized
                                              />
                                            </div>
                                          ) : (
                                            <div className="w-[18px] h-[18px] rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center">
                                              <span className="text-white/60 text-[10px]">
                                                {(creator.twitter_username || '?')[0].toUpperCase()}
                                              </span>
                                            </div>
                                          )}
                                          <div className="flex gap-0.5 min-w-0">
                                            <span className="font-medium text-white text-xs overflow-hidden text-ellipsis whitespace-nowrap">
                                              {creator.twitter_username || 'Unknown'}
                                            </span>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="py-3 text-right text-xs font-normal text-white leading-4">
                                        {creator.contribution_pct !== null && creator.contribution_pct !== undefined
                                          ? `${creator.contribution_pct.toFixed(2)}%`
                                          : '—'}
                                      </td>
                                      <td className={`py-3 text-center text-xs font-normal leading-4 ${
                                        (creator.delta7d ?? 0) > 0 ? 'text-[#14CC7F]' : (creator.delta7d ?? 0) < 0 ? 'text-[#FE3C70]' : 'text-white/60'
                                      }`}>
                                        <div className="flex items-center justify-center gap-0.5">
                                          {formatDelta(creator.delta7d)}
                                        </div>
                                      </td>
                                      <td className={`py-3 text-center text-xs font-normal leading-4 ${
                                        (creator.delta1m ?? 0) > 0 ? 'text-[#14CC7F]' : (creator.delta1m ?? 0) < 0 ? 'text-[#FE3C70]' : 'text-white/60'
                                      }`}>
                                        <div className="flex items-center justify-center gap-0.5">
                                          {formatDelta(creator.delta1m)}
                                        </div>
                                      </td>
                                      <td className={`py-3 pr-2 text-right text-xs font-normal leading-4 rounded-r-lg ${
                                        (creator.delta3m ?? 0) > 0 ? 'text-[#14CC7F]' : (creator.delta3m ?? 0) < 0 ? 'text-[#FE3C70]' : 'text-white/60'
                                      }`}>
                                        <div className="flex items-center justify-end gap-0.5">
                                          {formatDelta(creator.delta3m)}
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Top Tweets Feed */}
                  <div className="lg:col-span-1">
                    <TopTweetsFeed tweets={topTweets} loading={topTweetsLoading} />
                  </div>
                </div>

                {/* Main Leaderboard Table */}
                <div className="rounded-lg border border-white/10 bg-black/40 overflow-hidden">
                  <div className="p-4 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <h3 className="text-base font-bold text-white flex items-center gap-2 leading-5">
                        <span className="w-1 h-4 bg-red-500 rounded"></span>
                        Top 50 Creators
                      </h3>
                      {/* Time Period Filters for Main Table */}
                      <div className="flex items-center gap-2 bg-white/5 px-0.5 py-0 rounded-full">
                        {(['7D', '1M', '3M', 'ALL'] as TimePeriod[]).map((period) => (
                          <button
                            key={period}
                            onClick={() => setTimePeriod(period)}
                            className={`w-8 h-5 flex items-center justify-center rounded-full text-xs font-normal transition-all duration-200 ${
                              timePeriod === period
                                ? 'bg-[#F6623A] text-white font-medium'
                                : 'text-white/60 hover:text-white/80'
                            }`}
                          >
                            {period}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {leaderboardCreators.length === 0 ? (
                    <div className="p-12 text-center">
                      <EmptyState
                        icon="👥"
                        title="No creators yet"
                        description="Creators will appear here once they start contributing or join the leaderboard."
                      />
                    </div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-white/10 bg-white/5">
                              <th className="text-left py-4 px-6 text-xs font-semibold text-white/60 uppercase tracking-wider">Rank</th>
                              <th className="text-left py-4 px-6 text-xs font-semibold text-white/60 uppercase tracking-wider">Name</th>
                              <th className="text-left py-4 px-6 text-xs font-semibold text-white/60 uppercase tracking-wider">Ring</th>
                              <th className="text-right py-4 px-6 text-xs font-semibold text-white/60 uppercase tracking-wider">Points</th>
                              <th className="text-right py-4 px-6 text-xs font-semibold text-white/60 uppercase tracking-wider">Smart Followers</th>
                              <th className="text-right py-4 px-6 text-xs font-semibold text-white/60 uppercase tracking-wider">MS</th>
                              <th className="text-right py-4 px-6 text-xs font-semibold text-white/60 uppercase tracking-wider">CT Heat</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              // Calculate pagination
                              const totalPages = Math.ceil(leaderboardCreators.length / itemsPerPage);
                              const startIndex = (currentPage - 1) * itemsPerPage;
                              const endIndex = startIndex + itemsPerPage;
                              const paginatedCreators = leaderboardCreators.slice(startIndex, endIndex);
                              
                              return paginatedCreators.map((creator, index) => {
                                const globalRank = startIndex + index + 1;
                                const isTopThree = globalRank <= 3;
                                const rankBgColor = 
                                  globalRank === 1 ? 'bg-gradient-to-r from-yellow-500/10 to-yellow-400/5' :
                                  globalRank === 2 ? 'bg-gradient-to-r from-gray-400/10 to-gray-300/5' :
                                  globalRank === 3 ? 'bg-gradient-to-r from-orange-500/10 to-orange-400/5' :
                                  '';
                                
                                return (
                                  <tr
                                    key={creator.id || `creator-${globalRank}`}
                                    className={`border-b border-white/5 hover:bg-white/5 transition-colors ${rankBgColor}`}
                                  >
                                    <td className="py-4 px-6">
                                      <span className={`font-bold ${
                                        globalRank === 1 ? 'text-yellow-400' :
                                        globalRank === 2 ? 'text-gray-300' :
                                        globalRank === 3 ? 'text-orange-400' :
                                        'text-white'
                                      }`}>
                                        #{globalRank}
                                      </span>
                                    </td>
                                    <td className="py-4 px-6">
                                      <div className="flex items-center gap-3">
                                        {creator.avatar_url ? (
                                          <div className="relative w-10 h-10 rounded-full overflow-hidden border-2 border-white/20 flex-shrink-0">
                                            <Image
                                              src={creator.avatar_url}
                                              alt={creator.twitter_username || 'Creator avatar'}
                                              fill
                                              className="object-cover"
                                              unoptimized
                                            />
                                          </div>
                                        ) : (
                                          <div className="w-10 h-10 rounded-full bg-white/10 border-2 border-white/20 flex-shrink-0 flex items-center justify-center">
                                            <span className="text-white/60 text-sm font-medium">
                                              {(creator.twitter_username || '?')[0].toUpperCase()}
                                            </span>
                                          </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                          <Link
                                            href={`/portal/arc/creator/${encodeURIComponent(creator.twitter_username?.replace(/^@+/, '') || '')}`}
                                            className="text-white font-medium hover:text-teal-400 transition-colors block truncate"
                                          >
                                            {creator.twitter_username || 'Unknown'}
                                          </Link>
                                          {creator.is_auto_tracked && (
                                            <span className="text-xs text-white/40">Auto-tracked</span>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="py-4 px-6">
                                      {creator.ring && (
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
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
                                    <td className="py-4 px-6 text-right">
                                      <div className="flex items-center justify-end gap-1">
                                        <span className="text-white font-semibold">{creator.arc_points.toLocaleString()}</span>
                                        {creator.multiplier && creator.multiplier > 1 && (
                                          <span className="text-xs text-teal-400 font-medium">({creator.multiplier}x)</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-4 px-6 text-right">
                                      {creator.smart_followers_count !== null && creator.smart_followers_count !== undefined ? (
                                        <div>
                                          <div className="text-white font-medium">{creator.smart_followers_count.toLocaleString()}</div>
                                          {creator.smart_followers_pct !== null && creator.smart_followers_pct !== undefined && (
                                            <div className="text-xs text-white/50">({creator.smart_followers_pct.toFixed(1)}%)</div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-white/40">—</span>
                                      )}
                                    </td>
                                    <td className="py-4 px-6">
                                      {creator.contribution_pct !== null && creator.contribution_pct !== undefined ? (
                                        <div className="flex items-center gap-2">
                                          <span className="text-white font-medium min-w-[3rem] text-right">{creator.contribution_pct.toFixed(2)}%</span>
                                          <div className="flex-1 max-w-[100px] h-2 bg-white/10 rounded-full overflow-hidden">
                                            <div 
                                              className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full transition-all"
                                              style={{ width: `${Math.min(100, (creator.contribution_pct / (leaderboardCreators[0]?.contribution_pct ?? 1)) * 100)}%` }}
                                            />
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-white/40">—</span>
                                      )}
                                    </td>
                                    <td className="py-4 px-6 text-right">
                                      {creator.ct_heat !== null && creator.ct_heat !== undefined ? (
                                        <span className="text-white font-medium">{creator.ct_heat}</span>
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
                          <div className="flex items-center justify-between p-4 border-t border-white/10 bg-white/5">
                            <div className="text-sm text-white/60">
                              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, leaderboardCreators.length)} of {leaderboardCreators.length} creators
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                disabled={currentPage === 1}
                                className="px-4 py-2 text-sm font-medium bg-white/5 border border-white/20 text-white/80 rounded-lg hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/5"
                              >
                                Previous
                              </button>
                              <span className="text-sm text-white/60 px-3">
                                Page {currentPage} of {totalPages}
                              </span>
                              <button
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                disabled={currentPage >= totalPages}
                                className="px-4 py-2 text-sm font-medium bg-white/5 border border-white/20 text-white/80 rounded-lg hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/5"
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
