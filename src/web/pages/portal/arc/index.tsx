/**
 * ARC Home Page - Minimal Stable Version
 * 
 * Fetches ARC projects and top projects, displays them in a simple list format.
 * Always shows content - never blank.
 */

import React, { useEffect, useState, useMemo, useCallback, Component, ReactNode } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { ArcTopProjectsCards } from '@/components/arc/ArcTopProjectsCards';
import { ArcTopProjectsTreemap } from '@/components/arc/ArcTopProjectsTreemap';
import { requireArcTier } from '@/lib/server-auth';
import { getRequiredTierForPage } from '@/lib/arc/access-policy';

// =============================================================================
// TYPES
// =============================================================================

interface TopProjectItem {
  id: string;
  name: string;
  display_name?: string;
  twitter_username?: string;
  growth_pct: number;
  slug?: string | null;
  projectId: string; // Required - normalized from various sources
  arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active?: boolean;
  value?: number; // Optional - for treemap sizing
}

interface ArcHomeProps {
  canManageArc: boolean;
}

interface LiveLeaderboard {
  arenaId: string;
  arenaName: string;
  arenaSlug: string;
  projectId: string;
  projectName: string;
  projectSlug: string | null;
  xHandle: string | null;
  creatorCount: number;
  startAt: string | null;
  endAt: string | null;
}

// =============================================================================
// ERROR BOUNDARY FOR TREEMAP
// =============================================================================

interface TreemapErrorBoundaryProps {
  children: ReactNode;
  onError: () => void;
  fallback: ReactNode;
}

class TreemapErrorBoundary extends Component<TreemapErrorBoundaryProps, { hasError: boolean }> {
  constructor(props: TreemapErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ARC] Treemap error boundary caught:', error, errorInfo);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// =============================================================================
// TREEMAP WRAPPER COMPONENT
// =============================================================================

interface TreemapWrapperProps {
  items: TopProjectItem[];
  mode: 'gainers' | 'losers';
  timeframe: '24h' | '7d' | '30d' | '90d';
  onProjectClick: (item: TopProjectItem) => void;
  onError: () => void;
}

function TreemapWrapper({ items, mode, timeframe, onProjectClick, onError }: TreemapWrapperProps) {
  const showDebug = process.env.NODE_ENV !== 'production';

  // Debug: log when switching to treemap (must be before early returns)
  React.useEffect(() => {
    if (showDebug) {
      console.log('[ARC] treemap toggle', { count: items?.length, first: items?.[0] });
    }
  }, [showDebug, items]);

  const fallback = (
    <>
      <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-center">
        <p className="text-sm text-yellow-400">Treemap unavailable, showing cards.</p>
      </div>
      <ArcTopProjectsCards 
        items={items as any} 
        onClickItem={onProjectClick as any} 
      />
    </>
  );

  // Check if items array is empty
  if (!items || items.length === 0) {
    return (
      <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-center">
        <p className="text-sm text-yellow-400">Treemap unavailable, showing cards.</p>
      </div>
    );
  }

  // Items are already normalized with projectId and value, so use them directly
  // Cast to match treemap component's expected interface (it requires non-optional fields)
  const treemapItems = items as any;

  return (
    <TreemapErrorBoundary onError={onError} fallback={fallback}>
      <div className="w-full min-h-[420px] h-[420px] md:min-h-[560px] md:h-[560px]">
        <ArcTopProjectsTreemap
          key={`${mode}-${timeframe}-${items.length}`}
          items={treemapItems}
          mode={mode}
          timeframe={timeframe}
          onProjectClick={(project) => {
            const item = items.find(
              i => (i.projectId || i.id) === project.projectId
            );
            if (item) {
              onProjectClick(item);
            }
          }}
        />
      </div>
    </TreemapErrorBoundary>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcHome({ canManageArc: initialCanManageArc }: ArcHomeProps) {
  const router = useRouter();
  const akariUser = useAkariUser();
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);
  
  const isDevMode = process.env.NODE_ENV === 'development';
  const canManageArc = isDevMode || userIsSuperAdmin || initialCanManageArc;

  // State for top projects
  const [topProjectsView, setTopProjectsView] = useState<'gainers' | 'losers'>('gainers');
  const [topProjectsTimeframe, setTopProjectsTimeframe] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
  const [topProjectsData, setTopProjectsData] = useState<TopProjectItem[]>([]);
  const [topProjectsLoading, setTopProjectsLoading] = useState(false);
  const [topProjectsError, setTopProjectsError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [topProjectsDisplayMode, setTopProjectsDisplayMode] = useState<'cards' | 'treemap'>('cards');
  const [treemapError, setTreemapError] = useState<string | null>(null);

  // Live Leaderboards state
  const [liveLeaderboards, setLiveLeaderboards] = useState<LiveLeaderboard[]>([]);
  const [upcomingLeaderboards, setUpcomingLeaderboards] = useState<LiveLeaderboard[]>([]);
  const [liveLeaderboardsLoading, setLiveLeaderboardsLoading] = useState(false);
  const [liveLeaderboardsError, setLiveLeaderboardsError] = useState<string | null>(null);

  // Auto-switch to cards if data is empty and treemap is selected
  useEffect(() => {
    if (topProjectsDisplayMode === 'treemap' && topProjectsData.length === 0 && !topProjectsLoading) {
      setTopProjectsDisplayMode('cards');
    }
  }, [topProjectsDisplayMode, topProjectsData.length, topProjectsLoading]);

  // Get user's Twitter username (only one definition)
  const userTwitterUsername = akariUser.user?.xUsername || null;

  // Fetch top projects (only when canManageArc is true)
  const loadTopProjects = useCallback(async () => {
    try {
      setTopProjectsLoading(true);
      setTopProjectsError(null);
      
      const res = await fetch(`/api/portal/arc/top-projects?mode=${topProjectsView}&timeframe=${topProjectsTimeframe}&limit=20`, { credentials: 'include' });
      
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({ error: 'Unknown error' }));
        setTopProjectsError(errorBody.error || `Failed to load top projects (${res.status})`);
        setTopProjectsData([]);
        return;
      }

      const data = await res.json().catch(() => null);

      if (!data || !data.ok) {
        setTopProjectsError(data?.error || 'Failed to load top projects');
        setTopProjectsData([]);
        return;
      }

      const items = data.items || data.projects || [];
      
      // Normalize items to match TopProjectItem format, handling projectId variations
      const normalizedItems: TopProjectItem[] = (items ?? []).map((p: any) => {
        // Ensure projectId is always a string (handle various case variations)
        const projectId = String(p.projectId ?? p.projectid ?? p.project_id ?? p.id ?? '');
        const name = p.display_name || p.name || 'Unknown';
        const twitterUsername = String(p.twitter_username || '');
        
        return {
          ...p,
          id: projectId,
          projectId: projectId,
          name: name,
          display_name: name,
          twitter_username: twitterUsername,
          growth_pct: Number(p.growth_pct ?? 0),
          slug: p.slug || null,
          arc_access_level: p.arc_access_level || 'none',
          arc_active: typeof p.arc_active === 'boolean' ? p.arc_active : false,
          // Ensure value exists for treemap sizing (always positive)
          value: Math.max(1, Math.abs(Number(p.growth_pct ?? 0)) || 1),
        };
      });

      setTopProjectsData(normalizedItems);
    } catch (err: any) {
      console.error('[ARC] Top projects fetch error:', err);
      setTopProjectsError(err.message || 'Failed to load top projects');
      setTopProjectsData([]);
    } finally {
      setTopProjectsLoading(false);
    }
  }, [topProjectsView, topProjectsTimeframe]);

  useEffect(() => {
    if (!canManageArc) {
      return;
    }

    loadTopProjects();
  }, [canManageArc, loadTopProjects, refreshNonce]);

  // Fetch live leaderboards
  useEffect(() => {
    async function fetchLiveLeaderboards() {
      try {
        setLiveLeaderboardsLoading(true);
        setLiveLeaderboardsError(null);

        const res = await fetch('/api/portal/arc/live-leaderboards?limit=15', { credentials: 'include' });
        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to load live leaderboards');
        }

        setLiveLeaderboards(data.leaderboards || []);
        setUpcomingLeaderboards(data.upcoming || []);
      } catch (err: any) {
        console.error('[ARC] Live leaderboards fetch error:', err);
        setLiveLeaderboardsError(err.message || 'Failed to load live leaderboards');
        setLiveLeaderboards([]);
        setUpcomingLeaderboards([]);
      } finally {
        setLiveLeaderboardsLoading(false);
      }
    }

    fetchLiveLeaderboards();
  }, []);

  // Handle refresh button
  const handleRefresh = () => {
    setRefreshNonce(prev => prev + 1);
  };

  // Handle top project click navigation
  const handleTopProjectClick = (item: TopProjectItem) => {
    const isClickable = (item.arc_active === true) && (item.arc_access_level !== 'none' && item.arc_access_level !== undefined);
    if (!isClickable) return;

    const arcAccessLevel = item.arc_access_level || 'none';
    const projectIdentifier = item.slug || item.projectId || item.id;
    
    if (arcAccessLevel === 'creator_manager') {
      router.push(`/portal/arc/creator-manager?projectId=${projectIdentifier}`);
    } else if (arcAccessLevel === 'leaderboard' || arcAccessLevel === 'gamified') {
      router.push(`/portal/arc/project/${projectIdentifier}`);
    }
  };

  // Show restricted view for non-SuperAdmins
  if (!canManageArc) {
    return (
      <PortalLayout title="ARC Universe">
        <div className="px-6 py-8 text-sm text-white/70">
          <h1 className="text-2xl font-semibold text-white mb-2">ARC Universe</h1>
          <p className="max-w-xl">
            ARC is currently in private beta. You can see it in the navigation,
            but only administrators have full access at the moment.
          </p>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title="ARC Universe">
      <div className="space-y-8 px-6 py-8">
        {/* Header - Matching Sentiment Terminal style */}
        <section className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.25em] text-akari-muted">
            ARC INFLUENCEFI TERMINAL
          </p>
          <h1 className="text-3xl font-bold md:text-4xl mb-2">
            Turn campaigns into measurable Crypto Twitter signal
          </h1>
          <p className="max-w-2xl text-sm text-akari-muted mb-3">
            Launch quests, rank creators, and track mindshare output in one place.
          </p>
          <p className="max-w-2xl text-xs text-akari-muted italic">
            ARC creates signal, not just tracks it.
          </p>
        </section>

        {/* Top Projects Section */}
        {canManageArc && (
          <section className="w-full max-w-6xl mx-auto">
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h2 className="text-2xl font-semibold text-white">TOP Profiles</h2>
              
              <div className="flex items-center gap-3 flex-wrap">
                {userIsSuperAdmin && (
                  <>
                    <Link
                      href="/portal/arc/admin"
                      className="pill-neon inline-flex items-center justify-center gap-2 bg-akari-neon-teal/10 border border-akari-neon-teal/50 px-4 h-10 text-sm text-akari-neon-teal hover:bg-akari-neon-teal/20 hover:shadow-soft-glow"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      ARC Admin
                    </Link>
                    <Link
                      href="/portal/admin/arc/leaderboard-requests"
                      className="pill-neon inline-flex items-center justify-center gap-2 bg-akari-neon-teal/10 border border-akari-neon-teal/50 px-4 h-10 text-sm text-akari-neon-teal hover:bg-akari-neon-teal/20 hover:shadow-soft-glow"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Review Requests
                    </Link>
                    <button
                      onClick={handleRefresh}
                      disabled={topProjectsLoading}
                      className="pill-neon inline-flex items-center justify-center gap-2 bg-akari-neon-teal/10 border border-akari-neon-teal/50 px-4 h-10 text-sm text-akari-neon-teal hover:bg-akari-neon-teal/20 hover:shadow-soft-glow disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {topProjectsLoading ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-akari-neon-teal border-t-transparent" />
                          Refreshing...
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Refresh
                        </>
                      )}
                    </button>
                  </>
                )}
                
                {/* View Toggle: Cards / Treemap */}
                <div className="flex gap-2 bg-white/5 border border-white/10 rounded-lg p-1">
                  <button
                    onClick={() => {
                      setTopProjectsDisplayMode('cards');
                      setTreemapError(null);
                    }}
                    className={`inline-flex items-center justify-center px-3 h-8 text-xs font-medium rounded-md transition-colors ${
                      topProjectsDisplayMode === 'cards'
                        ? 'bg-white/10 text-white'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Cards
                  </button>
                  <button
                    onClick={() => {
                      setTopProjectsDisplayMode('treemap');
                      setTreemapError(null);
                    }}
                    className={`inline-flex items-center justify-center px-3 h-8 text-xs font-medium rounded-md transition-colors ${
                      topProjectsDisplayMode === 'treemap'
                        ? 'bg-white/10 text-white'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Treemap
                  </button>
                </div>
                
                {/* Mode buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setTopProjectsView('gainers')}
                    className={`inline-flex items-center justify-center px-4 h-10 text-sm font-medium rounded-lg transition-colors ${
                      topProjectsView === 'gainers'
                        ? 'bg-akari-primary text-white'
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    Top Gainers
                  </button>
                  <button
                    onClick={() => setTopProjectsView('losers')}
                    className={`inline-flex items-center justify-center px-4 h-10 text-sm font-medium rounded-lg transition-colors ${
                      topProjectsView === 'losers'
                        ? 'bg-akari-primary text-white'
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    Top Losers
                  </button>
                </div>
                {/* Timeframe buttons */}
                <div className="flex gap-2">
                  {(['24h', '7d', '30d', '90d'] as const).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTopProjectsTimeframe(tf)}
                      className={`inline-flex items-center justify-center px-3 h-10 text-xs font-medium rounded-lg transition-colors ${
                        topProjectsTimeframe === tf
                          ? 'bg-white/10 text-white border border-white/20'
                          : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Content Panel */}
            <div className="rounded-2xl border border-white/10 bg-black/30 backdrop-blur p-6">
              {topProjectsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                  <span className="ml-3 text-white/60">Loading top projects...</span>
                </div>
              ) : topProjectsError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
                  <p className="text-sm text-red-400">{topProjectsError}</p>
                </div>
              ) : topProjectsData.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
                  <p className="text-sm text-white/60">No top projects available</p>
                </div>
              ) : (
                <>
                  {topProjectsDisplayMode === 'cards' ? (
                    <ArcTopProjectsCards
                      items={topProjectsData as any}
                      onClickItem={handleTopProjectClick as any}
                    />
                  ) : topProjectsData.length === 0 ? (
                    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-center">
                      <p className="text-sm text-yellow-400">Treemap unavailable, showing cards.</p>
                    </div>
                  ) : (
                    <TreemapWrapper
                      key={`treemap-${topProjectsView}-${topProjectsTimeframe}-${topProjectsData.length}`}
                      items={topProjectsData}
                      mode={topProjectsView}
                      timeframe={topProjectsTimeframe}
                      onProjectClick={handleTopProjectClick}
                      onError={() => setTreemapError('Treemap unavailable')}
                    />
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* Upcoming Leaderboards Section */}
        {upcomingLeaderboards.length > 0 && (
          <section className="w-full max-w-6xl mx-auto mb-8">
            <h2 className="text-2xl font-semibold text-white mb-4">Upcoming Leaderboards</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingLeaderboards.map((leaderboard) => (
                <div
                  key={leaderboard.arenaId}
                  className="rounded-xl border border-white/10 bg-black/40 p-5 hover:border-white/20 hover:bg-white/5 transition-all"
                >
                  <div className="mb-3">
                    <h3 className="text-base font-semibold text-white mb-1 truncate">
                      {leaderboard.arenaName}
                    </h3>
                    <p className="text-sm text-white/60 mb-1 truncate">
                      {leaderboard.projectName}
                    </p>
                    {leaderboard.xHandle && (
                      <p className="text-xs text-white/40 mb-2">@{leaderboard.xHandle}</p>
                    )}
                    {leaderboard.startAt && (
                      <p className="text-xs text-akari-primary">
                        Starts: {new Date(leaderboard.startAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {leaderboard.projectSlug && (
                      <Link
                        href={`/portal/arc/${leaderboard.projectSlug}`}
                        className="flex-1 text-center px-3 py-2 text-sm font-medium bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-colors"
                      >
                        View Project
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Live Leaderboards Section */}
        <section className="w-full max-w-6xl mx-auto mb-8">
          <h2 className="text-2xl font-semibold text-white mb-4">Live Leaderboards</h2>
          
          {liveLeaderboardsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
              <span className="ml-3 text-white/60">Loading leaderboards...</span>
            </div>
          ) : liveLeaderboardsError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
              <p className="text-red-400 text-sm">{liveLeaderboardsError}</p>
            </div>
          ) : liveLeaderboards.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
              <p className="text-white/60 text-sm">No active leaderboards at the moment.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveLeaderboards.map((leaderboard) => (
                <div
                  key={leaderboard.arenaId}
                  className="rounded-xl border border-white/10 bg-black/40 p-5 hover:border-white/20 hover:bg-white/5 transition-all"
                >
                  <div className="mb-3">
                    <h3 className="text-base font-semibold text-white mb-1 truncate">
                      {leaderboard.arenaName}
                    </h3>
                    <p className="text-sm text-white/60 mb-1 truncate">
                      {leaderboard.projectName}
                    </p>
                    {leaderboard.xHandle && (
                      <p className="text-xs text-white/40 mb-2">@{leaderboard.xHandle}</p>
                    )}
                    <p className="text-xs text-white/40">
                      {leaderboard.creatorCount} {leaderboard.creatorCount === 1 ? 'creator' : 'creators'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {leaderboard.projectSlug && (
                      <Link
                        href={`/portal/arc/${leaderboard.projectSlug}`}
                        className="flex-1 text-center px-3 py-2 text-sm font-medium bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-colors"
                      >
                        View Project
                      </Link>
                    )}
                    {leaderboard.projectSlug && (
                      <Link
                        href={`/portal/arc/${leaderboard.projectSlug}/arena/${leaderboard.arenaSlug}`}
                        className="flex-1 text-center px-3 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
                      >
                        View Arena
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </PortalLayout>
  );
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps<ArcHomeProps> = async (context) => {
  // Check tier requirement for /portal/arc
  const requiredTier = getRequiredTierForPage('/portal/arc');
  if (requiredTier) {
    const tierCheck = await requireArcTier(context, requiredTier, '/portal/arc');
    if (tierCheck) {
      return tierCheck;
    }
  }
  
  // Legacy logic: canManageArc (for SuperAdmin access to top projects)
  const isDevMode = process.env.NODE_ENV === 'development';
  
  if (isDevMode) {
    return {
      props: {
        canManageArc: true,
      },
    };
  }
  
  const cookies = context.req.headers.cookie?.split(';').map(c => c.trim()) || [];
  const hasSession = cookies.some(cookie => cookie.startsWith('akari_session='));
  
  if (!hasSession) {
    return {
      redirect: {
        destination: '/portal',
        permanent: false,
      },
    };
  }
  
  return {
    props: {
      canManageArc: false,
    },
  };
};
