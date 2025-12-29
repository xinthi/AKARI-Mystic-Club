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
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { ArcTopProjectsCards } from '@/components/arc/ArcTopProjectsCards';
import { ArcTopProjectsTreemap } from '@/components/arc/ArcTopProjectsTreemap';
import { requireArcTier } from '@/lib/server-auth';
import { getRequiredTierForPage } from '@/lib/arc/access-policy';
import { useArcLiveItems } from '@/lib/arc/useArcLiveItems';
import { useArcNotifications } from '@/lib/arc/useArcNotifications';
import { DesktopArcShell } from '@/components/arc/fb/DesktopArcShell';
import { MobileLayout } from '@/components/arc/fb/mobile/MobileLayout';

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
      <style jsx global>{`
        .treemap-responsive-wrapper {
          transform: scale(0.52);
          transform-origin: top left;
          width: 192.3%;
          height: 192.3%;
        }
        @media (min-width: 640px) {
          .treemap-responsive-wrapper {
            transform: scale(0.67);
            width: 149.25%;
            height: 149.25%;
          }
        }
        @media (min-width: 768px) {
          .treemap-responsive-wrapper {
            transform: scale(0.78);
            width: 128.2%;
            height: 128.2%;
          }
        }
        @media (min-width: 1024px) {
          .treemap-responsive-wrapper {
            transform: scale(0.93);
            width: 107.5%;
            height: 107.5%;
          }
        }
        @media (min-width: 1280px) {
          .treemap-responsive-wrapper {
            transform: scale(1);
            width: 100%;
            height: 100%;
          }
        }
      `}</style>
      <div className="w-full overflow-hidden rounded-lg">
        <div className="w-full h-[280px] sm:h-[360px] md:h-[420px] lg:h-[500px] xl:h-[540px] 2xl:h-[600px] relative">
          <div className="absolute treemap-responsive-wrapper">
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
        </div>
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

  // Use new data hooks
  const { liveItems, upcomingItems, allItems, loading: liveItemsLoading, error: liveItemsError, refetch: refetchLiveItems } = useArcLiveItems();
  const { activities, unreadCount, loading: notificationsLoading } = useArcNotifications();

  // State for top projects
  const [topProjectsView, setTopProjectsView] = useState<'gainers' | 'losers'>('gainers');
  const [topProjectsTimeframe, setTopProjectsTimeframe] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
  const [topProjectsData, setTopProjectsData] = useState<TopProjectItem[]>([]);
  const [topProjectsLoading, setTopProjectsLoading] = useState(false);
  const [topProjectsError, setTopProjectsError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [topProjectsDisplayMode, setTopProjectsDisplayMode] = useState<'cards' | 'treemap'>('cards');

  // Filter states
  const [kindFilter, setKindFilter] = useState<'all' | 'arena' | 'campaign' | 'gamified'>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'live' | 'upcoming'>('all');
  const [searchQuery, setSearchQuery] = useState('');

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
      
      const res = await fetch(`/api/portal/arc/top-projects?mode=${topProjectsView}&timeframe=${topProjectsTimeframe}&limit=30`, { credentials: 'include' });
      
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


  // Render treemap section (preserved exactly as before)
  const treemapRender = canViewArc ? (
    <section className="mb-6">
      {/* Control Strip */}
      <div className="mb-4">
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
        </div>
      </div>

      {/* Hero Content Panel */}
      <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden">
        {topProjectsLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
            <span className="ml-3 text-white/60">Loading projects...</span>
          </div>
        ) : topProjectsError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-400">{topProjectsError}</p>
          </div>
        ) : topProjectsData.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-black/40 p-12 text-center">
            <p className="text-sm text-white/60">No projects available</p>
          </div>
        ) : (
          <>
            {topProjectsDisplayMode === 'cards' ? (
              <div className="p-4 sm:p-6">
                <ArcTopProjectsCards
                  items={topProjectsData as any}
                  onClickItem={handleTopProjectClick as any}
                />
              </div>
            ) : (
              <div className="w-full overflow-hidden">
                <TreemapWrapper
                  key={`treemap-${topProjectsView}-${topProjectsTimeframe}-${topProjectsData.length}`}
                  items={topProjectsData}
                  mode={topProjectsView}
                  timeframe={topProjectsTimeframe}
                  onProjectClick={handleTopProjectClick}
                  onError={() => {}}
                />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  ) : null;

  const loading = liveItemsLoading || notificationsLoading;
  const error = liveItemsError;

  return (
    <>
      {/* Desktop Layout (md and up) */}
      <div className="hidden md:block w-full">
        <DesktopArcShell
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          unreadCount={unreadCount}
          canManageArc={canManageArc}
          treemapRender={treemapRender}
          liveItems={liveItems}
          upcomingItems={upcomingItems}
          activities={activities}
          loading={liveItemsLoading}
          error={liveItemsError}
          kindFilter={kindFilter}
          timeFilter={timeFilter}
          onKindFilterChange={setKindFilter}
          onTimeFilterChange={setTimeFilter}
          onActionSuccess={refetchLiveItems}
        />
      </div>

      {/* Mobile Layout (below md) */}
      <div className="md:hidden w-full">
        <MobileLayout
          unreadCount={unreadCount}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          liveItems={liveItems}
          upcomingItems={upcomingItems}
          activities={activities}
          loading={loading}
          error={error}
          treemapRender={treemapRender}
          canManageArc={canManageArc}
        />
      </div>
    </>
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
