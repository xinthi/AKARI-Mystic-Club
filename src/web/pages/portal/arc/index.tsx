/**
 * ARC Home Page
 * 
 * Campaign Discovery Hub - Modern dashboard for creators and projects
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { ArcProjectsTreemapV3, TreemapProjectItem } from '@/components/arc/ArcProjectsTreemapV3';

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
  const [topProjectsData, setTopProjectsData] = useState<any[]>([]);
  const [topProjectsLoading, setTopProjectsLoading] = useState(false);
  const [topProjectsError, setTopProjectsError] = useState<string | null>(null);
  const [rawApiItems, setRawApiItems] = useState<any[]>([]); // For debug display
  const [hasProjectAccess, setHasProjectAccess] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [myProjects, setMyProjects] = useState<Array<{
    id: string;
    name: string;
    display_name: string | null;
    slug: string | null;
    twitter_username: string | null;
    arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | null;
    arc_active: boolean;
  }>>([]);
  const [myProjectsLoading, setMyProjectsLoading] = useState(false);
  const [summary, setSummary] = useState<{
    trackedProjects: number;
    arcEnabled: number;
    activePrograms: number;
    creatorsParticipating: number;
  } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Track container dimensions for debug panel using ResizeObserver
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
    };

    // Initial measurement
    updateDimensions();

    // Use ResizeObserver for accurate tracking
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(listContainerRef.current);

    // Also listen to window resize as fallback
    window.addEventListener('resize', updateDimensions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
  }, []);

  // Get user's Twitter username
  const userTwitterUsername = akariUser.user?.xUsername || null;

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

  // Fetch projects user can manage (for ARC access requests)
  useEffect(() => {
    async function fetchMyProjects() {
      if (!akariUser.isLoggedIn) {
        setMyProjects([]);
        return;
      }

      try {
        setMyProjectsLoading(true);
        const res = await fetch('/api/portal/arc/my-projects');
        
        if (!res.ok) {
          console.error('[ARC] Failed to fetch my projects');
          return;
        }

        const data = await res.json();
        if (data.ok && data.projects) {
          setMyProjects(data.projects);
        }
      } catch (err) {
        console.error('[ARC] Error fetching my projects:', err);
      } finally {
        setMyProjectsLoading(false);
      }
    }

    fetchMyProjects();
  }, [akariUser.isLoggedIn]);

  // Load top projects data from API
  useEffect(() => {
    if (!canManageArc) {
      return;
    }

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
          setRawApiItems([]);
          return;
        }

        const data = await res.json().catch((parseError) => {
          console.error('[ARC] top-projects JSON parse failed', parseError);
          setTopProjectsError('Invalid response from server');
          setTopProjectsData([]);
          setRawApiItems([]);
          return null;
        });

        if (!data) {
          return; // Error already handled
        }

        if (!data.ok) {
          console.error('[ARC] top-projects API error', { status: res.status, body: data });
          setTopProjectsError(data.error || 'Failed to load top projects');
          setTopProjectsData([]);
          setRawApiItems([]);
          return;
        }

        // Support both 'items' (new) and 'projects' (legacy) for backward compatibility
        const items = data.items || data.projects;
        
        if (!items || !Array.isArray(items)) {
          console.error('[ARC] top-projects invalid data format', { data });
          setTopProjectsError('Invalid data format from server');
          setTopProjectsData([]);
          setRawApiItems([]);
          return;
        }
        
        console.log(`[ARC] Received ${items.length} projects from API`);
        
        // Store raw API items for debug display
        setRawApiItems(items);
        
        // Map to consistent format - use twitter_username from API (not x_handle)
        const mappedItems = items.map((item: any) => ({
          id: item.id || '',
          display_name: item.display_name || item.name || 'Unknown',
          name: item.display_name || item.name || 'Unknown',
          twitter_username: item.twitter_username || '', // Use twitter_username from API
          growth_pct: typeof item.growth_pct === 'number' ? item.growth_pct : 0,
          slug: item.slug || null,
          arc_access_level: item.arc_access_level || 'none',
          arc_active: typeof item.arc_active === 'boolean' ? item.arc_active : false,
        }));
        
        setTopProjectsData(mappedItems);
        
        // Reset treemap error when new data loads
        setTreemapError(null);
        setShowTreemap(true);
        
        if (items.length === 0) {
          console.warn('[ARC] No projects returned');
        }
      } catch (err: any) {
        console.error('[ARC] top-projects fetch error', err);
        setTopProjectsError(err.message || 'Failed to load top projects');
        setTopProjectsData([]);
        setRawApiItems([]);
      } finally {
        setTopProjectsLoading(false);
      }
    }

    loadTopProjects();
  }, [canManageArc, topProjectsView, topProjectsTimeframe]);


  // Load ARC summary
  useEffect(() => {
    async function loadSummary() {
      try {
        setSummaryLoading(true);
        const res = await fetch('/api/portal/arc/summary');
        const data = await res.json();
        
        if (data.ok && data.summary) {
          setSummary(data.summary);
        } else {
          // Safe fallback - set zeros
          setSummary({
            trackedProjects: 0,
            arcEnabled: 0,
            activePrograms: 0,
            creatorsParticipating: 0,
          });
        }
      } catch (err) {
        console.error('[ARC] Error loading summary:', err);
        // Safe fallback
        setSummary({
          trackedProjects: 0,
          arcEnabled: 0,
          activePrograms: 0,
          creatorsParticipating: 0,
        });
      } finally {
        setSummaryLoading(false);
      }
    }

    if (canManageArc) {
      loadSummary();
    }
  }, [canManageArc]);

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
            <section className="mb-6">
              <p className="mb-2 text-xs uppercase tracking-[0.25em] text-akari-muted">
                ARC INFLUENCEFI TERMINAL
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
                <h1 className="text-3xl font-bold md:text-4xl">
                  Track <span className="text-gradient-neon">Influence</span> Across Crypto Twitter
                </h1>
                <div className="flex items-center gap-2">
                  {userIsSuperAdmin && (
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
                  )}
                  <button
                    onClick={() => loadTopProjects(true)}
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
                </div>
              </div>
              <p className="max-w-2xl text-sm text-akari-muted">
                InfluenceFi validates who actually moves narratives, not who shouts the loudest. ARC ranks creators by measurable impact across approved projects.
              </p>
              <p className="mt-2 text-xs text-akari-muted/70">
                Click any unlocked project to open its ARC hub. Locked projects must enable ARC tier first.
              </p>
            </section>

        {/* ARC Summary Strip - Always show when canManageArc */}
        {!loading && (
          <section className="mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Tracked Projects */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="text-xs text-white/60 mb-1">Tracked Projects</div>
                <div className="text-2xl font-bold text-white">
                  {summaryLoading ? (
                    <div className="h-7 w-12 bg-white/10 rounded animate-pulse" />
                  ) : (
                    summary?.trackedProjects ?? 0
                  )}
                </div>
              </div>

              {/* ARC Enabled */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="text-xs text-white/60 mb-1">ARC Enabled</div>
                <div className="text-2xl font-bold text-white">
                  {summaryLoading ? (
                    <div className="h-7 w-12 bg-white/10 rounded animate-pulse" />
                  ) : (
                    summary?.arcEnabled ?? 0
                  )}
                </div>
              </div>

              {/* Active Programs */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="text-xs text-white/60 mb-1">Active Programs</div>
                <div className="text-2xl font-bold text-white">
                  {summaryLoading ? (
                    <div className="h-7 w-12 bg-white/10 rounded animate-pulse" />
                  ) : (
                    summary?.activePrograms ?? 0
                  )}
                </div>
              </div>

              {/* Creators Participating */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                <div className="text-xs text-white/60 mb-1">Creators Participating</div>
                <div className="text-2xl font-bold text-white">
                  {summaryLoading ? (
                    <div className="h-7 w-12 bg-white/10 rounded animate-pulse" />
                  ) : (
                    summary?.creatorsParticipating ?? 0
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

            {/* Top Projects Treemap */}
            <section className="mb-8">
              <div className="rounded-xl border border-white/10 bg-black/40 overflow-hidden">
                {/* Frame Header */}
                <div className="px-4 py-3 border-b border-white/10 bg-black/60 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Top Projects</h2>
                  <div className="flex items-center gap-4">
                    {/* Legend */}
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-green-500/50 border border-green-400/50" />
                        <span className="text-white/60">Gainers</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-red-500/50 border border-red-400/50" />
                        <span className="text-white/60">Losers</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-gray-500/30 border border-gray-400/30" />
                        <span className="text-white/60">Locked</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Treemap Container with Fixed Height */}
                <div className="p-4" style={{ minHeight: '480px', height: '480px' }}>
                  {topProjectsLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-3" />
                        <span className="text-white/60 text-sm">Loading projects...</span>
                      </div>
                    </div>
                  ) : topProjectsError ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <p className="text-sm text-akari-danger mb-2">Failed to load top projects</p>
                        <p className="text-xs text-akari-muted">{topProjectsError}</p>
                      </div>
                    </div>
                  ) : !topProjectsData || topProjectsData.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center max-w-md">
                        <p className="text-sm text-white/60 mb-2">No projects available in heatmap</p>
                        <p className="text-xs text-white/40 mb-3">
                          Projects need to be active and classified as &apos;project&apos; type to appear here.
                        </p>
                        <p className="text-xs text-white/40 mb-4">
                          Check browser console for detailed logs about project filtering.
                        </p>
                        {userIsSuperAdmin && (
                          <Link
                            href="/portal/admin/projects"
                            className="inline-block mt-4 px-4 py-2 bg-akari-neon-teal/20 border border-akari-neon-teal/50 text-akari-neon-teal rounded-lg hover:bg-akari-neon-teal/30 transition-colors text-sm font-medium"
                          >
                            Go to Projects Admin →
                          </Link>
                        )}
                      </div>
                    </div>
                  ) : (
                    // Always show debug block in dev mode, and fallback if treemap fails
                    <div className="h-full w-full flex flex-col">
                      {/* Debug Block (dev-only) */}
                      {isDevMode && (
                        <div className="mb-4 p-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-xs font-mono max-w-full overflow-hidden">
                          <div className="text-yellow-400 font-semibold mb-2">🔍 Debug Info (Dev Only)</div>
                          <div className="space-y-1 text-yellow-200/80 break-words">
                            <div>Mode: <span className="text-white">{topProjectsView}</span></div>
                            <div>Timeframe: <span className="text-white">{topProjectsTimeframe}</span></div>
                            <div>Raw API items.length: <span className="text-white">{rawApiItems.length}</span></div>
                            <div>Mapped treemapItems.length: <span className="text-white">{topProjectsData.length}</span></div>
                            {topProjectsData.length > 0 && (
                              <div className="mt-2">
                                <div className="text-yellow-400 mb-1">First 3 mapped objects:</div>
                                <pre className="text-[10px] overflow-auto max-h-32 bg-black/30 p-2 rounded break-words whitespace-pre-wrap">
                                  {JSON.stringify(topProjectsData.slice(0, 3), null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Treemap with ErrorBoundary - if it fails, show fallback */}
                      {isSafeMode || !mounted || treemapError ? (
                        // Safe mode, not mounted, or treemap error: render simple list fallback
                        <div className="flex-1 overflow-y-auto">
                          {treemapError && (
                            <div className="mb-4 rounded-lg border border-akari-danger/30 bg-akari-card/50 p-3 text-center">
                              <p className="text-xs text-akari-danger mb-1">Treemap failed, showing list fallback</p>
                              <p className="text-xs text-akari-muted">{treemapError.message}</p>
                            </div>
                          )}
                          <TopProjectsListFallback
                            items={topProjectsData}
                            mode={topProjectsView}
                            timeframe={topProjectsTimeframe}
                            onModeChange={setTopProjectsView}
                            onTimeframeChange={setTopProjectsTimeframe}
                            lastUpdated={topProjectsLastUpdated ?? undefined}
                          />
                        </div>
                      ) : (
                        // Render treemap with ErrorBoundary - if it fails, fallback will show
                        <div className="flex-1 w-full" style={{ minHeight: '400px' }}>
                          <ErrorBoundary
                            onError={(error) => {
                              console.error('[ARC] Treemap ErrorBoundary caught error:', error);
                              setTreemapError(error);
                            }}
                            fallback={
                              <div className="h-full flex flex-col items-center justify-center">
                                <div className="mb-4 rounded-lg border border-akari-danger/30 bg-akari-card/50 p-3 text-center">
                                  <p className="text-xs text-akari-danger mb-1">Treemap failed, showing list fallback</p>
                                </div>
                                <div className="flex-1 w-full overflow-y-auto">
                                  <TopProjectsListFallback
                                    items={topProjectsData}
                                    mode={topProjectsView}
                                    timeframe={topProjectsTimeframe}
                                    onModeChange={setTopProjectsView}
                                    onTimeframeChange={setTopProjectsTimeframe}
                                    lastUpdated={topProjectsLastUpdated ?? undefined}
                                  />
                                </div>
                              </div>
                            }
                          >
                            <SafeTreemapWrapper
                              items={topProjectsData}
                              mode={topProjectsView}
                              timeframe={topProjectsTimeframe}
                              onModeChange={setTopProjectsView}
                              onTimeframeChange={setTopProjectsTimeframe}
                              lastUpdated={topProjectsLastUpdated ?? undefined}
                              onError={(error) => {
                                console.error('[ARC] Treemap error caught:', error);
                                setTreemapError(error);
                              }}
                            />
                          </ErrorBoundary>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

        {/* Request ARC Access - Prominent Section */}
        {akariUser.isLoggedIn && !loading && (
              <section className="mb-8">
                <div className="rounded-xl border border-akari-neon-teal/30 bg-gradient-to-br from-akari-neon-teal/10 to-akari-neon-blue/10 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-2">Request ARC Leaderboard Access</h3>
                      <p className="text-sm text-white/70">
                        Apply for ARC access to enable leaderboards, gamification, and creator management for your project.
                      </p>
                    </div>
                  </div>
                  
                  {myProjectsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-neon-teal border-t-transparent" />
                    </div>
                  ) : myProjects.length > 0 ? (
                    <>
                      <p className="text-sm text-white/60 mb-4">
                        You have admin/moderator access to these projects:
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {myProjects.map((project) => {
                          const needsAccess = !project.arc_active || project.arc_access_level === 'none';
                          const projectName = project.display_name || project.name || 'Unknown Project';
                          const projectSlug = project.slug || project.id;
                          
                          return (
                            <div
                              key={project.id}
                              className="rounded-lg border border-white/10 bg-black/40 p-4 hover:border-akari-neon-teal/50 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-sm font-semibold text-white truncate">{projectName}</h4>
                                  {project.twitter_username && (
                                    <p className="text-xs text-white/60">@{project.twitter_username}</p>
                                  )}
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-2 mb-3">
                                {project.arc_active && project.arc_access_level !== 'none' ? (
                                  <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/50">
                                    ARC Active
                                  </span>
                                ) : (
                                  <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400 border border-yellow-500/50">
                                    No ARC Access
                                  </span>
                                )}
                              </div>
                              
                              {needsAccess ? (
                                <Link
                                  href={`/portal/arc/project/${projectSlug}`}
                                  className="block w-full text-center px-4 py-2.5 bg-akari-neon-teal/20 border border-akari-neon-teal/50 text-akari-neon-teal rounded-lg hover:bg-akari-neon-teal/30 transition-colors text-sm font-semibold"
                                >
                                  Request ARC Access →
                                </Link>
                              ) : (
                                <Link
                                  href={`/portal/arc/project/${projectSlug}`}
                                  className="block w-full text-center px-4 py-2.5 bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20 transition-colors text-sm font-medium"
                                >
                                  View Project →
                                </Link>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-sm text-white/60 mb-4">
                        You don't have admin/moderator access to any projects yet.
                      </p>
                      <p className="text-xs text-white/50 mb-4">
                        To request ARC access, you need to be assigned as owner, admin, or moderator of a project.
                      </p>
                      {userIsSuperAdmin && (
                        <Link
                          href="/portal/admin/projects"
                          className="inline-flex items-center px-4 py-2 bg-akari-neon-teal/20 border border-akari-neon-teal/50 text-akari-neon-teal rounded-lg hover:bg-akari-neon-teal/30 transition-colors font-medium"
                        >
                          Manage Projects →
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </section>
            )}

        {/* Action Cards */}
        {!loading && (
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
              No projects have been approved for ARC yet.
            </p>
          </div>
        )}
        {hasError && errorMessage && (
          <div className="mt-2 text-red-400 text-[10px] break-words">
            Error: {errorMessage}
          </div>
        )}
      </div>
    </div>
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
      <div className="h-full overflow-y-auto">
        <div className="space-y-3">
          {items.map((item) => {
            const name = item.name || item.twitter_username || 'Unknown';
            const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
            const twitterUsername = item.twitter_username || '';
            // arc_active ONLY controls clickability (visual/UX)
            // arc_access_level controls routing (and also locks if 'none')
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
                  if (isClickable) {
                    // Route based on arc_access_level (matches backend logic)
                    const arcAccessLevel = item.arc_access_level || 'none';
                    const projectIdentifier = item.slug || item.projectId;
                    
                    if (arcAccessLevel === 'creator_manager') {
                      router.push(`/portal/arc/creator-manager?projectId=${projectIdentifier}`);
                    } else if (arcAccessLevel === 'leaderboard' || arcAccessLevel === 'gamified') {
                      router.push(`/portal/arc/project/${projectIdentifier}`);
                    }
                    // 'none' → locked (handled by isClickable check above)
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
  const router = useRouter();

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
        onProjectClick={(project) => {
          // Route based on arc_access_level (matches backend logic)
          const arcAccessLevel = project.arc_access_level || 'none';
          const projectIdentifier = project.slug || project.projectId;
          
          if (arcAccessLevel === 'creator_manager') {
            router.push(`/portal/arc/creator-manager?projectId=${projectIdentifier}`);
          } else if (arcAccessLevel === 'leaderboard' || arcAccessLevel === 'gamified') {
            router.push(`/portal/arc/project/${projectIdentifier}`);
          }
          // 'none' → locked (should not reach here if isClickable logic is correct)
        }}
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
