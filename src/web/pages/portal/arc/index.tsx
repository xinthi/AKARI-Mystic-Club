/**
 * ARC Home Page - Minimal Stable Version
 * 
 * Fetches top projects and displays them in a treemap visualization.
 * Always shows content - never blank.
 */

import React, { useEffect, useState, useRef } from 'react';
import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { ArcProjectsTreemapV3, TreemapProjectItem } from '@/components/arc/ArcProjectsTreemapV3';

// =============================================================================
// TYPES
// =============================================================================

interface ArcHomeProps {
  canManageArc: boolean;
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

  // State
  const [data, setData] = useState<TreemapProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [treemapError, setTreemapError] = useState<Error | null>(null);
  const [segment, setSegment] = useState<'all' | 'gainers' | 'losers' | 'stable'>('all');
  const [dateRange, setDateRange] = useState<'24h' | '7d' | '30d'>('7d');
  
  // Container dimensions for treemap
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });

  // Track container dimensions
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  // Fetch top projects
  useEffect(() => {
    if (!canManageArc) {
      setLoading(false);
      return;
    }

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        
        const res = await fetch(`/api/portal/arc/top-projects?limit=20`);
        
        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({ error: 'Unknown error' }));
          setError(errorBody.error || `Failed to load projects (${res.status})`);
          setData([]);
          return;
        }

        const result = await res.json();
        
        if (!result.ok) {
          setError(result.error || 'Failed to load projects');
          setData([]);
          return;
        }

        const items = result.items || result.projects || [];
        
        // Map to TreemapProjectItem format
        const mappedItems: TreemapProjectItem[] = items.map((item: any) => ({
          id: item.id || '',
          display_name: item.display_name || item.name || 'Unknown',
          name: item.display_name || item.name || 'Unknown',
          twitter_username: item.twitter_username || null,
          growth_pct: typeof item.growth_pct === 'number' && !isNaN(item.growth_pct) ? item.growth_pct : 0,
          slug: item.slug || null,
          arc_access_level: item.arc_access_level || 'none',
          arc_active: typeof item.arc_active === 'boolean' ? item.arc_active : false,
        }));

        setData(mappedItems);
      } catch (err: any) {
        console.error('[ARC] Fetch error:', err);
        setError(err.message || 'Failed to load projects');
        setData([]);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [canManageArc]);

  // Filter and sort data based on segment
  const filteredData = React.useMemo(() => {
    if (segment === 'all') {
      return data;
    }
    
    let filtered = [...data];
    
    if (segment === 'gainers') {
      filtered = filtered
        .filter(item => item.growth_pct > 0.5)
        .sort((a, b) => b.growth_pct - a.growth_pct)
        .slice(0, 20);
    } else if (segment === 'losers') {
      filtered = filtered
        .filter(item => item.growth_pct < -0.5)
        .sort((a, b) => a.growth_pct - b.growth_pct)
        .slice(0, 20);
    } else if (segment === 'stable') {
      filtered = filtered
        .filter(item => Math.abs(item.growth_pct) <= 0.5)
        .slice(0, 20);
    }
    
    return filtered;
  }, [data, segment]);

  // Prepare treemap data with value field
  const treemapData: TreemapProjectItem[] = filteredData.map((item) => {
    const gp = typeof item.growth_pct === 'number' && !isNaN(item.growth_pct) ? item.growth_pct : 0;
    return {
      ...item,
      value: Math.max(1, Math.abs(gp)),
      growth_pct: gp,
    };
  });

  // Calculate treemap dimensions
  const treemapWidth = Math.max(400, containerDimensions.width - 32);
  const treemapHeight = 400;

  // Handle project click
  const handleProjectClick = (item: TreemapProjectItem) => {
    const arcAccessLevel = item.arc_access_level || 'none';
    const projectIdentifier = item.slug || item.id;

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
      <div className="space-y-6 px-6 py-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">ARC Projects</h1>
          <p className="text-sm text-white/60">
            Track influence across crypto Twitter projects
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Segment buttons */}
          <div className="flex gap-2">
            {(['all', 'gainers', 'losers', 'stable'] as const).map((seg) => (
              <button
                key={seg}
                onClick={() => setSegment(seg)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  segment === seg
                    ? 'bg-akari-primary text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                {seg === 'all' ? 'All' : seg === 'gainers' ? 'Top Gainers' : seg === 'losers' ? 'Top Losers' : 'Stable'}
              </button>
            ))}
          </div>

          {/* Date range dropdown (UI only for now) */}
          <div className="flex gap-2">
            {(['24h', '7d', '30d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                  dateRange === range
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
            <span className="ml-3 text-white/60">Loading projects...</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Treemap Container */}
        {!loading && !error && (
          <div className="rounded-xl border border-white/10 bg-black/40 overflow-hidden">
            <div className="p-4">
              {/* Treemap */}
              {filteredData.length > 0 ? (
                <div className="space-y-4">
                  {/* Treemap */}
                  <div
                    ref={containerRef}
                    style={{ width: '100%', height: '400px', position: 'relative' }}
                  >
                    {containerDimensions.width === 0 ? (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-white/60">Measuring container...</p>
                      </div>
                    ) : (
                      <ArcProjectsTreemapV3
                        data={treemapData}
                        width={treemapWidth}
                        height={treemapHeight}
                        onError={(err) => {
                          console.error('[ARC] Treemap error:', err);
                          setTreemapError(err);
                        }}
                        onProjectClick={handleProjectClick}
                      />
                    )}
                  </div>

                  {/* Fallback list (always show if treemap error or as backup) */}
                  {(treemapError || filteredData.length > 0) && (
                    <div className="mt-4">
                      {treemapError && (
                        <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-center">
                          <p className="text-xs text-yellow-400 mb-1">Treemap unavailable, showing list fallback</p>
                          <p className="text-xs text-yellow-300/60">{treemapError.message}</p>
                        </div>
                      )}
                      
                      {/* List fallback */}
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {filteredData.map((item) => {
                          const name = item.display_name || item.name || 'Unknown';
                          const growthPct = item.growth_pct || 0;
                          const isClickable = item.arc_active && item.arc_access_level !== 'none';

                          return (
                            <div
                              key={item.id}
                              className={`flex items-center justify-between p-3 rounded-lg border ${
                                isClickable
                                  ? 'border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer'
                                  : 'border-white/5 bg-white/5 opacity-50'
                              }`}
                              onClick={() => {
                                if (isClickable) {
                                  handleProjectClick(item);
                                }
                              }}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-white truncate">{name}</div>
                                {item.twitter_username && (
                                  <div className="text-xs text-white/60 truncate">@{item.twitter_username}</div>
                                )}
                              </div>
                              <div className={`text-sm font-bold ml-4 ${
                                growthPct > 0 ? 'text-green-400' : growthPct < 0 ? 'text-red-400' : 'text-white/60'
                              }`}>
                                {growthPct >= 0 ? '+' : ''}{growthPct.toFixed(1)}%
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    <p className="text-sm text-white/60 mb-2">No projects available</p>
                    <p className="text-xs text-white/40">
                      {filteredData.length === 0 && data.length > 0
                        ? 'No projects match the selected filter'
                        : 'Projects need to be active to appear here'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && data.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
            <p className="text-sm text-white/60">No projects available</p>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps<ArcHomeProps> = async (context) => {
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
