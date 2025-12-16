/**
 * ARC Home Page
 * 
 * Campaign Discovery Hub - Modern dashboard for creators and projects
 */

import React, { useEffect, useState, useMemo } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { getUserCampaignStatuses } from '@/lib/arc/helpers';
import { TopProjectItem } from '@/components/arc/ArcTopProjectsTreemap';

// Dynamic import with SSR disabled - recharts requires browser APIs
const ArcTopProjectsTreemap = dynamic(
  () => import('@/components/arc/ArcTopProjectsTreemap').then(mod => ({ default: mod.ArcTopProjectsTreemap })),
  { ssr: false }
);

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
  meta?: {
    banner_url?: string | null;
    accent_color?: string | null;
    tagline?: string | null;
  };
  stats?: {
    creatorCount?: number;
    totalPoints?: number;
    trend?: 'rising' | 'stable' | 'cooling';
  };
}

interface ArcProjectsResponse {
  ok: boolean;
  projects?: ArcProject[];
  error?: string;
}

interface UserCampaign {
  project_id: string;
  slug: string | null;
  name: string | null;
  twitter_username: string | null;
  arcPoints: number;
  ring?: string;
  rank?: number;
  meta?: {
    accent_color?: string | null;
  };
}

// =============================================================================
// PROPS
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
  
  // Override canManageArc with client-side check (more accurate)
  const isDevMode = process.env.NODE_ENV === 'development';
  const canManageArc = isDevMode || userIsSuperAdmin || initialCanManageArc;
  const [projects, setProjects] = useState<ArcProject[]>([]);
  const [myCampaigns, setMyCampaigns] = useState<UserCampaign[]>([]);
  const [userCampaignStatuses, setUserCampaignStatuses] = useState<Map<string, { isFollowing: boolean; hasJoined: boolean }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joiningProjectId, setJoiningProjectId] = useState<string | null>(null);
  const [topProjectsView, setTopProjectsView] = useState<'gainers' | 'losers'>('gainers');
  const [topProjectsTimeframe, setTopProjectsTimeframe] = useState<'24h' | '7d' | '30d' | '90d'>('7d');
  const [topProjectsData, setTopProjectsData] = useState<TopProjectItem[]>([]);
  const [topProjectsLoading, setTopProjectsLoading] = useState(false);
  const [topProjectsError, setTopProjectsError] = useState<string | null>(null);
  const [topProjectsLastUpdated, setTopProjectsLastUpdated] = useState<Date | null>(null);
  const [hasProjectAccess, setHasProjectAccess] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [treemapError, setTreemapError] = useState<Error | null>(null);

  // Check for safe-mode query param
  const isSafeMode = router.query.safe === '1';

  // Set mounted flag on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Get user's Twitter username
  const userTwitterUsername = akariUser.user?.xUsername || null;

  // Sort projects for Top Gainers/Losers
  const sortedTopProjects = useMemo(() => {
    const sorted = [...projects].sort((a, b) => {
      // Use totalPoints as the primary metric, fallback to creatorCount
      const aMetric = a.stats?.totalPoints ?? a.stats?.creatorCount ?? 0;
      const bMetric = b.stats?.totalPoints ?? b.stats?.creatorCount ?? 0;
      
      if (topProjectsView === 'gainers') {
        return bMetric - aMetric; // Highest first
      } else {
        return aMetric - bMetric; // Lowest first
      }
    });
    
    return sorted.slice(0, 20);
  }, [projects, topProjectsView]);

  // Calculate user stats
  const userStats = useMemo(() => {
    const joinedCount = myCampaigns.length;
    const totalArcPoints = myCampaigns.reduce((sum, campaign) => sum + campaign.arcPoints, 0);
    const activeCampaigns = projects.filter(p => p.arc_status === 'active').length;
    
    return {
      projectsJoined: joinedCount,
      totalArcPoints,
      activeCampaigns,
    };
  }, [myCampaigns, projects]);

  // Fetch ARC projects and user campaign statuses
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch projects
        const res = await fetch('/api/portal/arc/projects');
        
        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({ error: 'Unknown error' }));
          console.error('[ARC] projects fetch failed', { status: res.status, body: errorBody });
          setError(errorBody.error || `Failed to load ARC projects (${res.status})`);
          return;
        }

        const data: ArcProjectsResponse = await res.json().catch((parseError) => {
          console.error('[ARC] projects JSON parse failed', parseError);
          setError('Invalid response from server');
          return null;
        });

        if (!data) {
          return; // Error already handled
        }

        if (!data.ok || !data.projects) {
          console.error('[ARC] projects API error', { status: res.status, body: data });
          setError(data.error || 'Failed to load ARC projects');
          return;
        }

        setProjects(data.projects);

        // Check user permissions (simplified - can be enhanced with API call)
        // For now, check if user has any project team access or creator role
        if (akariUser.user) {
          // Check if user is creator
          // Note: realRoles from Supabase can include 'creator' even though Role type doesn't include it
          // We cast to string[] to safely check for 'creator' role
          const userRoles = (akariUser.user.realRoles || []) as unknown as string[];
          setIsCreator(userRoles.includes('creator') || false);
          
          // Check project access (simplified - would need API call for full check)
          // For now, assume SuperAdmin has access
          setHasProjectAccess(userIsSuperAdmin || isDevMode);
        }

        // Fetch user campaign statuses
        if (data.projects.length > 0) {
          const projectIds = data.projects.map(p => p.project_id);
          
          if (userTwitterUsername) {
            const statuses = await getUserCampaignStatuses(projectIds, userTwitterUsername);
            setUserCampaignStatuses(statuses);
            
            // Build my campaigns list
            const joinedCampaigns: UserCampaign[] = [];
            const projects = data?.projects ?? [];
            statuses.forEach((status, projectId) => {
              if (status.hasJoined) {
                const project = projects.find(p => p.project_id === projectId);
                if (project) {
                  joinedCampaigns.push({
                    project_id: project.project_id,
                    slug: project.slug,
                    name: project.name,
                    twitter_username: project.twitter_username,
                    arcPoints: status.arcPoints || 0,
                    ring: status.ring,
                    meta: project.meta,
                  });
                }
              }
            });
            setMyCampaigns(joinedCampaigns);
          } else if (isDevMode) {
            // In dev mode, treat user as following all projects (but not joined yet)
            const devStatuses = new Map<string, { isFollowing: boolean; hasJoined: boolean }>();
            projectIds.forEach(projectId => {
              devStatuses.set(projectId, {
                isFollowing: true,
                hasJoined: false,
              });
            });
            setUserCampaignStatuses(devStatuses);
            console.log('[ArcHome] Dev mode - set userCampaignStatuses:', Array.from(devStatuses.entries()));
          }
        }
      } catch (err) {
        setError('Failed to connect to API');
        console.error('[ArcHome] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [userTwitterUsername, isDevMode, userIsSuperAdmin, akariUser.user]);

  // Load top projects data
  useEffect(() => {
    async function loadTopProjects() {
      setTopProjectsLoading(true);
      setTopProjectsError(null);
      try {
        const res = await fetch(`/api/portal/arc/top-projects?mode=${topProjectsView}&timeframe=${topProjectsTimeframe}&limit=20`);
        
        if (!res.ok) {
          const errorBody = await res.json().catch(() => ({ error: 'Unknown error' }));
          console.error('[ARC] top-projects fetch failed', { status: res.status, body: errorBody });
          setTopProjectsError(errorBody.error || `Failed to load top projects (${res.status})`);
          setTopProjectsData([]);
          return;
        }

        const data = await res.json().catch((parseError) => {
          console.error('[ARC] top-projects JSON parse failed', parseError);
          setTopProjectsError('Invalid response from server');
          setTopProjectsData([]);
          return null;
        });

        if (!data) {
          return; // Error already handled
        }

        if (!data.ok) {
          console.error('[ARC] top-projects API error', { status: res.status, body: data });
          setTopProjectsError(data.error || 'Failed to load top projects');
          setTopProjectsData([]);
          return;
        }

        // Support both 'items' (new) and 'projects' (legacy) for backward compatibility
        const items = data.items || data.projects;
        
        if (!items || !Array.isArray(items)) {
          console.error('[ARC] top-projects invalid data format', { data });
          setTopProjectsError('Invalid data format from server');
          setTopProjectsData([]);
          return;
        }
        
        console.log(`[ARC] Received ${items.length} projects from API`);
        
        // If no projects, log helpful message
        if (items.length === 0) {
          console.log('[ARC] No projects returned. All active projects from Sentiment section should appear here.');
        }

        // Safely map projects to treemap items with error handling
        try {
          const treemapItems: TopProjectItem[] = items.map((p: any) => {
            if (!p || typeof p !== 'object') {
              throw new Error('Invalid project item in array');
            }
            return {
              projectId: p.project_id || '',
              name: p.name || 'Unknown',
              twitter_username: p.twitter_username || '',
              logo_url: p.logo_url || null,
              growth_pct: typeof p.growth_pct === 'number' ? p.growth_pct : 0,
              heat: typeof p.heat === 'number' ? p.heat : undefined,
              slug: p.slug || null,
              arc_access_level: p.arc_access_level || 'none',
              arc_active: typeof p.arc_active === 'boolean' ? p.arc_active : false,
            };
          });
          setTopProjectsData(treemapItems);
          setTopProjectsLastUpdated(new Date());
        } catch (mapError: any) {
          console.error('[ARC] top-projects mapping failed', mapError);
          setTopProjectsError('Failed to process project data');
          setTopProjectsData([]);
        }
      } catch (err: any) {
        console.error('[ARC] top-projects fetch error', err);
        setTopProjectsError(err.message || 'Failed to load top projects');
        setTopProjectsData([]);
      } finally {
        setTopProjectsLoading(false);
      }
    }

    if (canManageArc) {
      loadTopProjects();
    }
  }, [topProjectsView, topProjectsTimeframe, canManageArc]);

  // Handle join campaign
  const handleJoinCampaign = async (projectId: string) => {
    if (joiningProjectId) return; // Prevent double-clicks

    console.log('[ArcHome] Joining campaign:', projectId);

    try {
      setJoiningProjectId(projectId);

      const res = await fetch('/api/portal/arc/join-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      const result = await res.json();

      console.log('[ArcHome] Join campaign response:', result);

      if (!res.ok || !result.ok) {
        // Handle not_following case
        if (result.reason === 'not_following') {
          const project = projects.find(p => p.project_id === projectId);
          const projectName = project?.name || 'this project';
          const projectHandle = project?.twitter_username;
          
          if (projectHandle) {
            alert(`You must follow @${projectHandle} on X to join this campaign. Please follow the project and try again.`);
            // Optionally open X profile in new tab
            window.open(`https://x.com/${projectHandle}`, '_blank');
          } else {
            alert(`You must follow ${projectName} on X to join this campaign.`);
          }
          return;
        }
        
        throw new Error(result.error || 'Failed to join campaign');
      }

      // Refresh campaign statuses
        const projectIds = projects.map(p => p.project_id);
      if (userTwitterUsername) {
        const statuses = await getUserCampaignStatuses(projectIds, userTwitterUsername);
        setUserCampaignStatuses(statuses);

        // Update my campaigns
        const joinedCampaigns: UserCampaign[] = [];
        statuses.forEach((status, pid) => {
          if (status.hasJoined) {
            const project = projects.find(p => p.project_id === pid);
            if (project) {
              joinedCampaigns.push({
                project_id: project.project_id,
                slug: project.slug,
                name: project.name,
                twitter_username: project.twitter_username,
                arcPoints: status.arcPoints || 0,
                ring: status.ring,
                meta: project.meta,
              });
            }
          }
        });
        setMyCampaigns(joinedCampaigns);
      } else if (isDevMode) {
        // In dev mode, update statuses to show user as following
        const devStatuses = new Map<string, { isFollowing: boolean; hasJoined: boolean }>();
        projectIds.forEach(projectId => {
          const existing = userCampaignStatuses.get(projectId);
          devStatuses.set(projectId, {
            isFollowing: true,
            hasJoined: existing?.hasJoined || false,
          });
        });
        setUserCampaignStatuses(devStatuses);
      }

      // Redirect to project ARC page
      const project = projects.find(p => p.project_id === projectId);
      if (project?.slug) {
        window.location.href = `/portal/arc/${project.slug}`;
      }
    } catch (err: any) {
      console.error('[ArcHome] Join campaign error:', err);
      alert(err?.message || 'Failed to join campaign. Please try again.');
    } finally {
      setJoiningProjectId(null);
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
      <div className="space-y-8">
        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
            <span className="ml-3 text-akari-muted">Loading campaigns...</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-6 text-center">
            <p className="text-sm text-akari-danger">Failed to load campaigns.</p>
          </div>
        )}

        {/* Content */}
        {!loading && !error && projects.length > 0 && (
          <>
            {/* Header Section */}
            <section className="mb-8">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-3xl font-bold text-white">ARC Universe</h1>
                {userIsSuperAdmin && (
                  <Link
                    href="/portal/arc/admin"
                    className="px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
                  >
                    ARC Admin
                  </Link>
                )}
              </div>
              <p className="text-white/60 text-sm">
                InfluenceFi dashboard powered by AKARI Sentiment
              </p>
            </section>

            {/* Top Projects Treemap */}
            <section className="mb-8">
              <h2 className="text-xl font-semibold text-white mb-4">Top Projects</h2>
              {topProjectsLoading ? (
                <div className="flex items-center justify-center py-12 rounded-xl border border-white/10 bg-black/40">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                  <span className="ml-3 text-white/60">Loading projects...</span>
                </div>
              ) : topProjectsError ? (
                <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-6 text-center">
                  <p className="text-sm text-akari-danger mb-2">Failed to load top projects</p>
                  <p className="text-xs text-akari-muted">{topProjectsError}</p>
                </div>
              ) : !topProjectsData || topProjectsData.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
                  <p className="text-sm text-white/60">No projects available</p>
                  <p className="text-xs text-white/40 mt-2">Try changing the timeframe or view mode</p>
                </div>
              ) : isSafeMode || !mounted ? (
                // Safe mode or not mounted: render simple list fallback
                <TopProjectsListFallback
                  items={topProjectsData}
                  mode={topProjectsView}
                  timeframe={topProjectsTimeframe}
                  onModeChange={setTopProjectsView}
                  onTimeframeChange={setTopProjectsTimeframe}
                  lastUpdated={topProjectsLastUpdated ?? undefined}
                />
              ) : (
                // Render treemap with error boundary
                <SafeTreemapWrapper
                  items={topProjectsData}
                  mode={topProjectsView}
                  timeframe={topProjectsTimeframe}
                  onModeChange={setTopProjectsView}
                  onTimeframeChange={setTopProjectsTimeframe}
                  lastUpdated={topProjectsLastUpdated ?? undefined}
                  onError={setTreemapError}
                />
              )}
              {treemapError && (
                <div className="mt-4 rounded-xl border border-akari-danger/30 bg-akari-card p-4 text-center">
                  <p className="text-xs text-akari-danger mb-1">Treemap rendering error</p>
                  <p className="text-xs text-akari-muted">{treemapError.message}</p>
                  <p className="text-xs text-white/40 mt-2">
                    Showing list view instead. <Link href="?safe=1" className="underline">Use safe mode</Link>
                  </p>
                </div>
              )}
            </section>

            {/* Action Cards */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              {/* Creator Manager Card */}
              <Link
                href={hasProjectAccess ? '/portal/arc/creator-manager' : '#'}
                className={`rounded-xl border p-6 transition-all ${
                  hasProjectAccess
                    ? 'border-white/10 bg-black/40 hover:border-white/20 hover:bg-black/60 cursor-pointer'
                    : 'border-white/5 bg-black/20 opacity-50 cursor-not-allowed'
                }`}
                onClick={(e) => {
                  if (!hasProjectAccess) {
                    e.preventDefault();
                  }
                }}
              >
                <h3 className="text-lg font-semibold text-white mb-2">Creator Manager</h3>
                <p className="text-sm text-white/60 mb-4">
                  Manage creator programs, missions, and campaigns for your projects.
                </p>
                {!hasProjectAccess && (
                  <p className="text-xs text-white/40 italic">Requires Project Team access</p>
                )}
              </Link>

              {/* My Creator Programs Card */}
              <Link
                href={isCreator ? '/portal/arc/my-creator-programs' : '#'}
                className={`rounded-xl border p-6 transition-all ${
                  isCreator
                    ? 'border-white/10 bg-black/40 hover:border-white/20 hover:bg-black/60 cursor-pointer'
                    : 'border-white/5 bg-black/20 opacity-50 cursor-not-allowed'
                }`}
                onClick={(e) => {
                  if (!isCreator) {
                    e.preventDefault();
                  }
                }}
              >
                <h3 className="text-lg font-semibold text-white mb-2">My Creator Programs</h3>
                <p className="text-sm text-white/60 mb-4">
                  View your active creator programs, missions, and progress.
                </p>
                {!isCreator && (
                  <p className="text-xs text-white/40 italic">Requires AKARI Creator status</p>
                )}
              </Link>
            </section>
          </>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
            <p className="text-sm text-akari-muted">
              No ARC campaigns yet. Campaigns will appear here as they go live.
            </p>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

// =============================================================================
// FALLBACK COMPONENTS
// =============================================================================

/**
 * Simple list fallback for top projects (used in safe mode or when treemap fails)
 */
function TopProjectsListFallback({
  items,
  mode,
  timeframe,
  onModeChange,
  onTimeframeChange,
  lastUpdated,
}: {
  items: TopProjectItem[];
  mode: 'gainers' | 'losers';
  timeframe: '24h' | '7d' | '30d' | '90d';
  onModeChange?: (mode: 'gainers' | 'losers') => void;
  onTimeframeChange?: (timeframe: '24h' | '7d' | '30d' | '90d') => void;
  lastUpdated?: Date | string | number;
}) {
  const router = useRouter();

  // Format last updated timestamp
  const lastUpdatedText = useMemo(() => {
    if (lastUpdated === undefined || lastUpdated === null) return null;
    try {
      const date = typeof lastUpdated === 'number' 
        ? new Date(lastUpdated) 
        : typeof lastUpdated === 'string' 
        ? new Date(lastUpdated) 
        : lastUpdated;
      if (isNaN(date.getTime())) return null;
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } catch {
      return null;
    }
  }, [lastUpdated]);

  const formatGrowthPct = (growthPct: number): string => {
    const sign = growthPct >= 0 ? '+' : '';
    return `${sign}${growthPct.toFixed(2)}%`;
  };

  return (
    <div className="w-full">
      {/* Header with Last updated and Controls */}
      <div className="flex items-center justify-between mb-4">
        {lastUpdatedText && (
          <div className="text-xs text-white/50">
            Last updated: {lastUpdatedText}
          </div>
        )}
        {!lastUpdatedText && <div />}
        
        <div className="flex items-center gap-3">
          {onModeChange && (
            <div className="flex gap-2">
              <button
                onClick={() => onModeChange('gainers')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === 'gainers'
                    ? 'bg-akari-primary text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                Top Gainers
              </button>
              <button
                onClick={() => onModeChange('losers')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === 'losers'
                    ? 'bg-akari-primary text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                Top Losers
              </button>
            </div>
          )}
          {onTimeframeChange && (
            <div className="flex gap-2">
              {(['24h', '7d', '30d', '90d'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => onTimeframeChange(tf)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    timeframe === tf
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* List view */}
      <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
        <div className="space-y-3">
          {items.map((item) => {
            const name = item.name || item.twitter_username || 'Unknown';
            const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
            const twitterUsername = item.twitter_username || '';
            const isClickable = (item.arc_active === true) && (item.arc_access_level !== 'none' && item.arc_access_level !== undefined);
            
            return (
              <div
                key={item.projectId || Math.random()}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  isClickable
                    ? 'border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer'
                    : 'border-white/5 bg-white/5 opacity-50 cursor-not-allowed'
                }`}
                onClick={() => {
                  if (isClickable && item.slug) {
                    router.push(`/portal/arc/${item.slug}`);
                  } else if (isClickable && twitterUsername) {
                    router.push(`/portal/sentiment/profile/${twitterUsername}`);
                  }
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{name}</div>
                  {twitterUsername && (
                    <div className="text-xs text-white/60 truncate">@{twitterUsername}</div>
                  )}
                  {!isClickable && (
                    <div className="text-xs text-yellow-400 mt-1">🔒 No ARC leaderboard active</div>
                  )}
                </div>
                <div className={`text-sm font-bold ml-4 ${
                  growthPct > 0 ? 'text-green-400' : growthPct < 0 ? 'text-red-400' : 'text-white/60'
                }`}>
                  {formatGrowthPct(growthPct)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Safe wrapper for treemap that catches rendering errors
 */
function SafeTreemapWrapper({
  items,
  mode,
  timeframe,
  onModeChange,
  onTimeframeChange,
  lastUpdated,
  onError,
}: {
  items: TopProjectItem[];
  mode: 'gainers' | 'losers';
  timeframe: '24h' | '7d' | '30d' | '90d';
  onModeChange?: (mode: 'gainers' | 'losers') => void;
  onTimeframeChange?: (timeframe: '24h' | '7d' | '30d' | '90d') => void;
  lastUpdated?: Date | string | number;
  onError: (error: Error | null) => void;
}) {
  useEffect(() => {
    // Reset error when props change
    onError(null);
  }, [items, mode, timeframe, onError]);

  try {
    return (
      <ArcTopProjectsTreemap
        items={items}
        mode={mode}
        timeframe={timeframe}
        onModeChange={onModeChange}
        onTimeframeChange={onTimeframeChange}
        lastUpdated={lastUpdated}
      />
    );
  } catch (error: any) {
    console.error('[ARC] Treemap rendering error:', error);
    onError(error instanceof Error ? error : new Error(String(error)));
    
    // Render fallback on error
    return (
      <TopProjectsListFallback
        items={items}
        mode={mode}
        timeframe={timeframe}
        onModeChange={onModeChange}
        onTimeframeChange={onTimeframeChange}
        lastUpdated={lastUpdated}
      />
    );
  }
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps<ArcHomeProps> = async (context) => {
  // Always return props - never return notFound: true
  // This ensures the route is always valid for logged-in users
  
  const isDevMode = process.env.NODE_ENV === 'development';
  
  // In dev mode, bypass authentication check
  if (isDevMode) {
    return {
      props: {
        canManageArc: true,
      },
    };
  }
  
  // Check for authentication via session cookie (production only)
  const cookies = context.req.headers.cookie?.split(';').map(c => c.trim()) || [];
  const hasSession = cookies.some(cookie => cookie.startsWith('akari_session='));
  
  // Redirect unauthenticated users to portal home (not login, since login page doesn't exist)
  if (!hasSession) {
    return {
      redirect: {
        destination: '/portal',
        permanent: false,
      },
    };
  }
  
  // Check if user is SuperAdmin
  // Note: In production, we'll check this client-side as well,
  // but for SSR we can't easily access the user session here without
  // implementing full auth. For now, we'll allow the page to render
  // and let the client-side handle the permission check.
  
  // In production, allow page to render and let client-side handle permission check
  const canManageArc = false; // Will be overridden client-side for SuperAdmins
  
  return {
    props: {
      canManageArc,
    },
  };
};
