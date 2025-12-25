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
  canViewArc: boolean;
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

export default function ArcHome({ canViewArc, canManageArc: initialCanManageArc }: ArcHomeProps) {
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

  // Live Leaderboards state
  const [liveLeaderboards, setLiveLeaderboards] = useState<LiveLeaderboard[]>([]);
  const [upcomingLeaderboards, setUpcomingLeaderboards] = useState<LiveLeaderboard[]>([]);
  const [liveLeaderboardsLoading, setLiveLeaderboardsLoading] = useState(false);
  const [liveLeaderboardsError, setLiveLeaderboardsError] = useState<string | null>(null);

  // Upcoming filter state (must be before early return)
  const [upcomingFilter, setUpcomingFilter] = useState<'today' | 'thisweek' | 'all'>('all');

  // Auto-switch to cards if data is empty and treemap is selected
  useEffect(() => {
    if (topProjectsDisplayMode === 'treemap' && topProjectsData.length === 0 && !topProjectsLoading) {
      setTopProjectsDisplayMode('cards');
    }
  }, [topProjectsDisplayMode, topProjectsData.length, topProjectsLoading]);

  // Fetch top projects (when user can view ARC)
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
    if (!canViewArc) {
      return;
    }

    loadTopProjects();
  }, [canViewArc, loadTopProjects, refreshNonce]);

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

  // Filter upcoming by timeframe (client-side)
  const filteredUpcoming = useMemo(() => {
    if (upcomingFilter === 'all') return upcomingLeaderboards;
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Start of week (Sunday)
    
    return upcomingLeaderboards.filter(lb => {
      if (!lb.startAt) return false;
      const startDate = new Date(lb.startAt);
      
      if (upcomingFilter === 'today') {
        return startDate >= todayStart && startDate < new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      }
      if (upcomingFilter === 'thisweek') {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        return startDate >= weekStart && startDate < weekEnd;
      }
      return true;
    });
  }, [upcomingLeaderboards, upcomingFilter]);

  return (
    <PortalLayout title="ARC Universe">
      {/* Full-screen shell */}
      <div className="min-h-screen w-full">
        {/* Compact Header */}
        <div className="border-b border-white/10 bg-black/40 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
            <div className="flex flex-col gap-2">
              <h1 className="text-2xl font-bold text-white">ARC</h1>
              <p className="text-sm text-white/60">
                Turn campaigns into measurable signal
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {/* Treemap Hero Section */}
          {canViewArc && (
            <section className="mb-10">
              {/* Control Strip */}
              <div className="mb-5">
                <div className="flex flex-wrap items-center gap-2.5 overflow-x-auto pb-2 -mx-1 px-1">
                  {/* View Toggle: Cards / Treemap */}
                  <div className="flex gap-0.5 bg-white/5 border border-white/10 rounded-lg p-0.5">
                    <button
                      onClick={() => setTopProjectsDisplayMode('cards')}
                      className={`inline-flex items-center justify-center px-3 h-8 text-xs font-medium rounded-md transition-colors ${
                        topProjectsDisplayMode === 'cards'
                          ? 'bg-white/10 text-white'
                          : 'text-white/60 hover:text-white'
                      }`}
                      aria-label="View as cards"
                    >
                      Cards
                    </button>
                    <button
                      onClick={() => setTopProjectsDisplayMode('treemap')}
                      className={`inline-flex items-center justify-center px-3 h-8 text-xs font-medium rounded-md transition-colors ${
                        topProjectsDisplayMode === 'treemap'
                          ? 'bg-white/10 text-white'
                          : 'text-white/60 hover:text-white'
                      }`}
                      aria-label="View as treemap"
                    >
                      Treemap
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-6 bg-white/10" />

                  {/* Mode Toggle: Gainers / Losers */}
                  <div className="flex gap-1">
                    <button
                      onClick={() => setTopProjectsView('gainers')}
                      className={`inline-flex items-center justify-center px-3 h-8 text-xs font-medium rounded-lg transition-colors ${
                        topProjectsView === 'gainers'
                          ? 'bg-akari-primary text-white'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                      aria-label="Top gainers"
                    >
                      Top Gainers
                    </button>
                    <button
                      onClick={() => setTopProjectsView('losers')}
                      className={`inline-flex items-center justify-center px-3 h-8 text-xs font-medium rounded-lg transition-colors ${
                        topProjectsView === 'losers'
                          ? 'bg-akari-primary text-white'
                          : 'bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                      aria-label="Top losers"
                    >
                      Top Losers
                    </button>
                  </div>

                  {/* Divider */}
                  <div className="w-px h-6 bg-white/10" />

                  {/* Timeframe Pills */}
                  <div className="flex gap-1">
                    {(['24h', '7d', '30d', '90d'] as const).map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setTopProjectsTimeframe(tf)}
                        className={`inline-flex items-center justify-center px-3 h-8 text-xs font-medium rounded-lg transition-colors ${
                          topProjectsTimeframe === tf
                            ? 'bg-white/10 text-white border border-white/20'
                            : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                        }`}
                        aria-label={`Timeframe ${tf}`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>

                  {/* Divider */}
                  <div className="w-px h-6 bg-white/10" />

                  {/* Refresh Button */}
                  <button
                    onClick={handleRefresh}
                    disabled={topProjectsLoading}
                    className="inline-flex items-center justify-center gap-1.5 px-3 h-8 text-xs font-medium bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Refresh data"
                  >
                    {topProjectsLoading ? (
                      <>
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/60 border-t-transparent" />
                        <span className="hidden sm:inline">Refreshing...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span className="hidden sm:inline">Refresh</span>
                      </>
                    )}
                  </button>

                  {/* Admin Buttons (canManageArc only) */}
                  {canManageArc && (
                    <>
                      <div className="w-px h-6 bg-white/10" />
                      <Link
                        href="/portal/arc/admin"
                        className="inline-flex items-center justify-center gap-1.5 px-3 h-8 text-xs font-medium bg-akari-neon-teal/10 border border-akari-neon-teal/50 text-akari-neon-teal rounded-lg hover:bg-akari-neon-teal/20 transition-colors"
                        aria-label="ARC Admin"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="hidden sm:inline">Admin</span>
                      </Link>
                      <Link
                        href="/portal/admin/arc/leaderboard-requests"
                        className="inline-flex items-center justify-center gap-1.5 px-3 h-8 text-xs font-medium bg-akari-neon-teal/10 border border-akari-neon-teal/50 text-akari-neon-teal rounded-lg hover:bg-akari-neon-teal/20 transition-colors"
                        aria-label="Review Requests"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="hidden sm:inline">Requests</span>
                      </Link>
                    </>
                  )}
                </div>
              </div>

              {/* Hero Content Panel */}
              <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm">
                {topProjectsLoading ? (
                  <div className="flex items-center justify-center py-24">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                    <span className="ml-3 text-white/60">Loading projects...</span>
                  </div>
                ) : topProjectsError ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
                    <p className="text-sm text-red-400">{topProjectsError}</p>
                  </div>
                ) : topProjectsData.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-black/40 p-12 text-center">
                    <p className="text-sm text-white/60">No projects available</p>
                  </div>
                ) : (
                  <div className="p-4 sm:p-6">
                    {topProjectsDisplayMode === 'cards' ? (
                      <ArcTopProjectsCards
                        items={topProjectsData as any}
                        onClickItem={handleTopProjectClick as any}
                      />
                    ) : (
                      <TreemapWrapper
                        key={`treemap-${topProjectsView}-${topProjectsTimeframe}-${topProjectsData.length}`}
                        items={topProjectsData}
                        mode={topProjectsView}
                        timeframe={topProjectsTimeframe}
                        onProjectClick={handleTopProjectClick}
                        onError={() => {}}
                      />
                    )}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Below Treemap Sections */}
          <div className="space-y-10">
            {/* Live Leaderboards Section */}
            <section>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-semibold text-white">Live</h2>
                <span className="inline-flex items-center gap-2 px-2.5 py-1 text-xs font-medium bg-red-500/20 border border-red-500/30 text-red-400 rounded-full">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400"></span>
                  </span>
                  Active
                </span>
              </div>
              
              {liveLeaderboardsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-black/40 p-5 animate-pulse">
                      <div className="h-5 bg-white/10 rounded mb-3 w-3/4"></div>
                      <div className="h-4 bg-white/5 rounded mb-2 w-1/2"></div>
                      <div className="h-3 bg-white/5 rounded mb-4 w-2/3"></div>
                      <div className="h-9 bg-white/5 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : liveLeaderboardsError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                  <p className="text-red-400 text-sm">{liveLeaderboardsError}</p>
                </div>
              ) : liveLeaderboards.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-16 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/5 mb-4">
                    <svg className="w-6 h-6 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <p className="text-white/70 text-sm font-medium mb-1">No active leaderboards</p>
                  <p className="text-white/50 text-xs">Check back later for new campaigns</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {liveLeaderboards.map((leaderboard) => {
                    const timeRemaining = leaderboard.endAt 
                      ? Math.max(0, new Date(leaderboard.endAt).getTime() - Date.now())
                      : null;
                    const hoursRemaining = timeRemaining ? Math.floor(timeRemaining / (1000 * 60 * 60)) : null;
                    
                    return (
                      <div
                        key={leaderboard.arenaId}
                        className="group rounded-xl border border-white/10 bg-black/40 p-5 hover:border-white/20 hover:bg-white/5 transition-all"
                      >
                        <div className="mb-3.5">
                          <h3 className="text-base font-semibold text-white mb-1.5 truncate">
                            {leaderboard.arenaName}
                          </h3>
                          <p className="text-sm text-white/70 mb-1 truncate">
                            {leaderboard.projectName}
                          </p>
                          {leaderboard.xHandle && (
                            <p className="text-xs text-white/50 mb-2">@{leaderboard.xHandle}</p>
                          )}
                          <div className="flex items-center gap-3 text-xs text-white/60">
                            <span>{leaderboard.creatorCount} {leaderboard.creatorCount === 1 ? 'creator' : 'creators'}</span>
                            {hoursRemaining !== null && hoursRemaining > 0 && (
                              <span>{hoursRemaining}h remaining</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {leaderboard.projectSlug && (
                            <>
                              <Link
                                href={`/portal/arc/${leaderboard.projectSlug}/arena/${leaderboard.arenaSlug}`}
                                className="flex-1 text-center px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
                              >
                                View Arena
                              </Link>
                              <Link
                                href={`/portal/arc/${leaderboard.projectSlug}`}
                                className="px-4 py-2 text-sm font-medium bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
                              >
                                Project
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Upcoming Section */}
            <section>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-xl font-semibold text-white">Upcoming</h2>
                <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
                  {(['today', 'thisweek', 'all'] as const).map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setUpcomingFilter(filter)}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                        upcomingFilter === filter
                          ? 'bg-white/10 text-white'
                          : 'text-white/60 hover:text-white'
                      }`}
                      aria-label={`Filter: ${filter}`}
                    >
                      {filter === 'today' ? 'Today' : filter === 'thisweek' ? 'This Week' : 'All'}
                    </button>
                  ))}
                </div>
              </div>

              {liveLeaderboardsLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-black/40 p-5 animate-pulse">
                      <div className="h-5 bg-white/10 rounded mb-3 w-3/4"></div>
                      <div className="h-4 bg-white/5 rounded mb-2 w-1/2"></div>
                      <div className="h-3 bg-white/5 rounded mb-4 w-2/3"></div>
                      <div className="h-9 bg-white/5 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : filteredUpcoming.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-16 text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/5 mb-4">
                    <svg className="w-6 h-6 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-white/70 text-sm font-medium mb-1">No upcoming leaderboards</p>
                  <p className="text-white/50 text-xs">Scheduled campaigns will appear here</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredUpcoming.map((leaderboard) => {
                    const startDate = leaderboard.startAt ? new Date(leaderboard.startAt) : null;
                    const timeUntilStart = startDate ? Math.max(0, startDate.getTime() - Date.now()) : null;
                    const daysUntilStart = timeUntilStart ? Math.floor(timeUntilStart / (1000 * 60 * 60 * 24)) : null;
                    
                    return (
                      <div
                        key={leaderboard.arenaId}
                        className="group rounded-xl border border-white/10 bg-black/40 p-5 hover:border-white/20 hover:bg-white/5 transition-all"
                      >
                        <div className="mb-3.5">
                          <h3 className="text-base font-semibold text-white mb-1.5 truncate">
                            {leaderboard.arenaName}
                          </h3>
                          <p className="text-sm text-white/70 mb-1 truncate">
                            {leaderboard.projectName}
                          </p>
                          {leaderboard.xHandle && (
                            <p className="text-xs text-white/50 mb-2">@{leaderboard.xHandle}</p>
                          )}
                          <div className="text-xs text-white/60">
                            {startDate ? (
                              <>
                                <div>Starts {startDate.toLocaleDateString()}</div>
                                {daysUntilStart !== null && daysUntilStart > 0 && (
                                  <div>{daysUntilStart} {daysUntilStart === 1 ? 'day' : 'days'} until start</div>
                                )}
                              </>
                            ) : (
                              <div>Scheduled</div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {leaderboard.projectSlug && (
                            <Link
                              href={`/portal/arc/${leaderboard.projectSlug}`}
                              className="flex-1 text-center px-4 py-2 text-sm font-medium bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
                            >
                              View Details
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
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
      return tierCheck; // Redirect if tier check fails
    }
  }
  
  // If we reach here, user passed tier check (canViewArc = true)
  const canViewArc = true;
  
  // canManageArc: SuperAdmin/dev only (for admin buttons)
  const isDevMode = process.env.NODE_ENV === 'development';
  
  // Get session token to check for superadmin
  const sessionToken = context.req.headers.cookie
    ?.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('akari_session='))
    ?.split('=')[1];
  
  let canManageArc = false;
  if (isDevMode) {
    canManageArc = true;
  } else if (sessionToken) {
    // Check if user is superadmin (simplified check - full check happens client-side)
    // For now, rely on client-side check via isSuperAdmin()
    canManageArc = false;
  }
  
  return {
    props: {
      canViewArc,
      canManageArc,
    },
  };
};
