/**
 * ARC Home Page - Minimal Stable Version
 * 
 * Fetches ARC projects and top projects, displays them in a simple list format.
 * Always shows content - never blank.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';

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
}

interface ArcProjectsResponse {
  ok: boolean;
  projects?: ArcProject[];
  error?: string;
}

interface TopProjectItem {
  id: string;
  name: string;
  display_name?: string;
  twitter_username?: string;
  growth_pct: number;
  slug?: string | null;
  projectId?: string;
  arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active?: boolean;
}

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

  // State for projects list
  const [projects, setProjects] = useState<ArcProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);

  // State for top projects
  const [topProjectsView, setTopProjectsView] = useState<'gainers' | 'losers'>('gainers');
  const [topProjectsTimeframe, setTopProjectsTimeframe] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
  const [topProjectsData, setTopProjectsData] = useState<TopProjectItem[]>([]);
  const [topProjectsLoading, setTopProjectsLoading] = useState(false);
  const [topProjectsError, setTopProjectsError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  // Get user's Twitter username (only one definition)
  const userTwitterUsername = akariUser.user?.xUsername || null;

  // Fetch ARC projects
  useEffect(() => {
    async function fetchProjects() {
      try {
        setProjectsLoading(true);
        setProjectsError(null);

        const res = await fetch('/api/portal/arc/projects');
        
        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({ error: 'Unknown error' }));
          setProjectsError(errorBody.error || `Failed to load projects (${res.status})`);
          setProjects([]);
          return;
        }

        const data: ArcProjectsResponse = await res.json().catch(() => null);

        if (!data || !data.ok || !data.projects) {
          setProjectsError(data?.error || 'Failed to load projects');
          setProjects([]);
          return;
        }

        setProjects(data.projects);
      } catch (err: any) {
        console.error('[ARC] Projects fetch error:', err);
        setProjectsError(err.message || 'Failed to load projects');
        setProjects([]);
      } finally {
        setProjectsLoading(false);
      }
    }

    fetchProjects();
  }, []);

  // Fetch top projects (only when canManageArc is true)
  async function loadTopProjects() {
    try {
      setTopProjectsLoading(true);
      setTopProjectsError(null);
      
      const res = await fetch(`/api/portal/arc/top-projects?mode=${topProjectsView}&timeframe=${topProjectsTimeframe}&limit=20`);
      
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
      
      // Map to TopProjectItem format
      const mappedItems: TopProjectItem[] = items.map((item: any) => ({
        id: item.id || '',
        name: item.display_name || item.name || 'Unknown',
        display_name: item.display_name || item.name || 'Unknown',
        twitter_username: item.twitter_username || '',
        growth_pct: typeof item.growth_pct === 'number' ? item.growth_pct : 0,
        slug: item.slug || null,
        projectId: item.id || '',
        arc_access_level: item.arc_access_level || 'none',
        arc_active: typeof item.arc_active === 'boolean' ? item.arc_active : false,
      }));

      setTopProjectsData(mappedItems);
    } catch (err: any) {
      console.error('[ARC] Top projects fetch error:', err);
      setTopProjectsError(err.message || 'Failed to load top projects');
      setTopProjectsData([]);
    } finally {
      setTopProjectsLoading(false);
    }
  }

  useEffect(() => {
    if (!canManageArc) {
      return;
    }

    loadTopProjects();
  }, [canManageArc, topProjectsView, topProjectsTimeframe, refreshNonce]);

  // Handle refresh button
  const handleRefresh = () => {
    setRefreshNonce(prev => prev + 1);
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
      <div className="space-y-12 px-6 py-8">
        {/* Top Projects Hero Section */}
        {canManageArc && (
          <section className="w-full">
            {/* Header with Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-4xl font-bold text-white mb-2">Top Projects</h1>
                <p className="text-sm text-white/60">
                  Track momentum across crypto Twitter projects
                </p>
              </div>
              <div className="flex items-center gap-3">
                {userIsSuperAdmin && (
                  <>
                    <Link
                      href="/portal/arc/admin"
                      className="pill-neon inline-flex items-center gap-2 bg-akari-neon-teal/10 border border-akari-neon-teal/50 px-4 py-2 text-sm text-akari-neon-teal hover:bg-akari-neon-teal/20 hover:shadow-soft-glow"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      ARC Admin
                    </Link>
                    <button
                      onClick={handleRefresh}
                      disabled={topProjectsLoading}
                      className="pill-neon inline-flex items-center gap-2 bg-akari-neon-teal/10 border border-akari-neon-teal/50 px-4 py-2 text-sm text-akari-neon-teal hover:bg-akari-neon-teal/20 hover:shadow-soft-glow disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                {/* Mode buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setTopProjectsView('gainers')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      topProjectsView === 'gainers'
                        ? 'bg-akari-primary text-white'
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    Top Gainers
                  </button>
                  <button
                    onClick={() => setTopProjectsView('losers')}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
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
                      className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
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

            {/* Content */}
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
              <TopProjectsListFallback
                items={topProjectsData}
              />
            )}
          </section>
        )}

        {/* ARC Projects List - Secondary Section */}
        <section>
          <h2 className="text-2xl font-semibold text-white mb-4">ARC Projects</h2>
          
          {projectsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
              <span className="ml-3 text-white/60">Loading projects...</span>
            </div>
          ) : projectsError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center">
              <p className="text-sm text-red-400">{projectsError}</p>
            </div>
          ) : projects.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
              <p className="text-sm text-white/60">No projects available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => {
                const projectName = project.name || 'Unknown';
                const projectSlug = project.slug;
                
                return (
                  <div
                    key={project.project_id}
                    className="rounded-xl border border-white/10 bg-black/40 p-4 hover:border-white/20 transition-colors"
                  >
                    <div className="mb-2">
                      <h3 className="text-sm font-semibold text-white truncate">{projectName}</h3>
                      {project.twitter_username && (
                        <p className="text-xs text-white/60 truncate">@{project.twitter_username}</p>
                      )}
                    </div>
                    {projectSlug ? (
                      <Link
                        href={`/portal/arc/${projectSlug}`}
                        className="inline-block w-full text-center px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-colors text-sm font-medium"
                      >
                        View Project →
                      </Link>
                    ) : (
                      <div className="text-xs text-white/40 italic">No slug available</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </PortalLayout>
  );
}

// =============================================================================
// FALLBACK COMPONENTS
// =============================================================================

/**
 * Hero + Mini Grid layout for top projects
 * 
 * - Row 1: 2 large cards (top 2 items) side by side on desktop, stacked on mobile
 * - Row 2: up to 8 small cards (items 3-10) in compact grid
 * - Limited to 10 items total
 */
function TopProjectsListFallback({
  items,
}: {
  items: TopProjectItem[];
}) {
  const router = useRouter();

  const formatGrowthPct = (growthPct: number): string => {
    const sign = growthPct >= 0 ? '+' : '';
    return `${sign}${growthPct.toFixed(2)}%`;
  };

  // Sort by growth_pct descending and limit to 10 items
  const sortedItems = [...items]
    .sort((a, b) => {
      const growthA = typeof a.growth_pct === 'number' ? a.growth_pct : 0;
      const growthB = typeof b.growth_pct === 'number' ? b.growth_pct : 0;
      return growthB - growthA;
    })
    .slice(0, 10);

  const top2Items = sortedItems.slice(0, 2);
  const remainingItems = sortedItems.slice(2, 10);

  // Helper function to handle click behavior
  const handleCardClick = (item: TopProjectItem) => {
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

  return (
    <div className="w-full space-y-6">
      {/* Row 1: Top 2 Large Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {top2Items.map((item) => {
          const name = item.display_name || item.name || 'Unknown';
          const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
          const twitterUsername = item.twitter_username || '';
          const isClickable = (item.arc_active === true) && (item.arc_access_level !== 'none' && item.arc_access_level !== undefined);
          
          // Color accent based on growth
          const borderColor = growthPct > 0 
            ? 'border-green-500/30' 
            : growthPct < 0 
            ? 'border-red-500/30' 
            : 'border-white/10';
          
          const bgColor = growthPct > 0
            ? 'bg-green-500/5'
            : growthPct < 0
            ? 'bg-red-500/5'
            : 'bg-white/5';
          
          return (
            <div
              key={item.id || item.projectId || Math.random()}
              className={`rounded-xl border ${borderColor} ${bgColor} p-8 min-h-[220px] flex flex-col justify-between ${
                isClickable
                  ? 'hover:bg-white/10 cursor-pointer transition-colors'
                  : 'opacity-50 cursor-not-allowed'
              }`}
              onClick={() => handleCardClick(item)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xl font-semibold text-white truncate mb-2">{name}</div>
                {twitterUsername && (
                  <div className="text-sm text-white/60 truncate mb-3">@{twitterUsername}</div>
                )}
                {!isClickable && (
                  <div className="text-sm text-yellow-400 mt-2">🔒 No ARC leaderboard active</div>
                )}
              </div>
              <div className={`text-3xl font-bold ${
                growthPct > 0 ? 'text-green-400' : growthPct < 0 ? 'text-red-400' : 'text-white/60'
              }`}>
                {formatGrowthPct(growthPct)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Row 2: Small Cards Grid (items 3-10) */}
      {remainingItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {remainingItems.map((item) => {
            const name = item.display_name || item.name || 'Unknown';
            const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
            const twitterUsername = item.twitter_username || '';
            const isClickable = (item.arc_active === true) && (item.arc_access_level !== 'none' && item.arc_access_level !== undefined);
            
            // Color accent based on growth
            const borderColor = growthPct > 0 
              ? 'border-green-500/30' 
              : growthPct < 0 
              ? 'border-red-500/30' 
              : 'border-white/10';
            
            const bgColor = growthPct > 0
              ? 'bg-green-500/5'
              : growthPct < 0
              ? 'bg-red-500/5'
              : 'bg-white/5';
            
            return (
              <div
                key={item.id || item.projectId || Math.random()}
                className={`rounded-lg border ${borderColor} ${bgColor} p-4 min-h-[120px] flex flex-col justify-between ${
                  isClickable
                    ? 'hover:bg-white/10 cursor-pointer transition-colors'
                    : 'opacity-50 cursor-not-allowed'
                }`}
                onClick={() => handleCardClick(item)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate mb-1">{name}</div>
                  {twitterUsername && (
                    <div className="text-xs text-white/60 truncate mb-1">@{twitterUsername}</div>
                  )}
                  {!isClickable && (
                    <div className="text-xs text-yellow-400 mt-1">🔒</div>
                  )}
                </div>
                <div className={`text-lg font-bold ${
                  growthPct > 0 ? 'text-green-400' : growthPct < 0 ? 'text-red-400' : 'text-white/60'
                }`}>
                  {formatGrowthPct(growthPct)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
