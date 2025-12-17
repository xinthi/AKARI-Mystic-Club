/**
 * ARC Home Page
 * 
 * Campaign Discovery Hub - Modern dashboard for creators and projects
 */

import React, { useEffect, useState, useRef } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { getUserCampaignStatuses } from '@/lib/arc/helpers';
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
  const [treemapSegment, setTreemapSegment] = useState<'all' | 'gainers' | 'losers' | 'stable'>('all');
  const [treemapDateRange, setTreemapDateRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [topProjectsLoading, setTopProjectsLoading] = useState(false);
  const [topProjectsError, setTopProjectsError] = useState<string | null>(null);
  const [rawApiItems, setRawApiItems] = useState<any[]>([]); // For debug display
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [treemapError, setTreemapError] = useState<Error | null>(null);
  const [showTreemap, setShowTreemap] = useState(true);
  const [treemapStats, setTreemapStats] = useState<{ minValue: number; maxValue: number; invalidOrZeroCount: number } | null>(null);
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
    if (!listContainerRef.current) {
      return;
    }

    const updateDimensions = () => {
      if (listContainerRef.current) {
        const rect = listContainerRef.current.getBoundingClientRect();
        setContainerDimensions({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
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
        
        // Map to consistent format - use twitter_username from API
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

        {/* Header Section - Always show when canManageArc */}
        {!loading && (
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
                  onClick={() => {
                    // Trigger reload by toggling a refresh state
                    const refreshKey = Date.now();
                    setTopProjectsTimeframe(prev => prev === '7d' ? '24h' : '7d');
                    setTimeout(() => setTopProjectsTimeframe(prev => prev === '7d' ? '24h' : '7d'), 100);
                  }}
                  disabled={topProjectsLoading}
                  className="pill-neon inline-flex items-center gap-2 bg-akari-neon-teal/10 border border-akari-neon-teal/50 px-4 py-2 text-sm text-akari-neon-teal hover:bg-akari-neon-teal/20 hover:shadow-soft-glow disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {topProjectsLoading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-akari-neon-teal border-t-transparent" />
                      Loading...
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
        )}

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

        {/* Top Projects List - ARC UI v1.1: Simple list first */}
        <section className="mb-8">
          <div className="rounded-xl border border-white/10 bg-black/40 overflow-hidden">
            {/* Frame Header */}
            <div className="px-4 py-3 border-b border-white/10 bg-black/60 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Top Projects</h2>
            </div>

            {/* Treemap Controls */}
            <div className="px-4 py-3 border-b border-white/10 bg-black/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              {/* Segment Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTreemapSegment('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    treemapSegment === 'all'
                      ? 'bg-akari-primary text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setTreemapSegment('gainers')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    treemapSegment === 'gainers'
                      ? 'bg-akari-primary text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  Top Gainers
                </button>
                <button
                  onClick={() => setTreemapSegment('losers')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    treemapSegment === 'losers'
                      ? 'bg-akari-primary text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  Top Losers
                </button>
                <button
                  onClick={() => setTreemapSegment('stable')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    treemapSegment === 'stable'
                      ? 'bg-akari-primary text-white'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  Stable
                </button>
              </div>
              {/* Date Range Dropdown */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-white/70">Timeframe:</label>
                <select
                  value={treemapDateRange}
                  onChange={(e) => setTreemapDateRange(e.target.value as '24h' | '7d' | '30d')}
                  className="px-3 py-1.5 text-xs bg-white/10 text-white border border-white/20 rounded-md hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-akari-primary"
                >
                  <option value="24h">24h</option>
                  <option value="7d">7d</option>
                  <option value="30d">30d</option>
                </select>
              </div>
            </div>

            {/* Debug Panel - ARC UI v1.1: Only visible when ?debug=1 */}
            {router.query.debug === '1' && (
            <div className="px-4 py-3 border-b border-white/10 bg-blue-500/10">
              <div className="text-blue-400 font-semibold mb-2 text-xs">🔍 ARC Debug Panel (v1.1)</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-blue-200/80 text-xs">
                <div>
                  <span className="text-blue-300">Loading:</span>{' '}
                  <span className="text-white font-bold">{topProjectsLoading ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span className="text-blue-300">Error:</span>{' '}
                  <span className="text-white font-bold">{topProjectsError ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span className="text-blue-300">Item Count:</span>{' '}
                  <span className="text-white font-bold">{topProjectsData.length}</span>
                </div>
                <div>
                  <span className="text-blue-300">Container:</span>{' '}
                  <span className="text-white font-bold">{containerDimensions.width}px × {containerDimensions.height}px</span>
                </div>
              </div>
              {topProjectsError && (
                <div className="mt-2 text-red-400 text-xs break-words">
                  API Error: {topProjectsError}
                </div>
              )}
              {treemapError && (
                <div className="mt-2 text-red-400 text-xs break-words">
                  Treemap Error: {treemapError.message}
                </div>
              )}
              {topProjectsData.length > 0 && (
                <div className="mt-2 text-blue-300 text-xs">
                  First item keys: {Object.keys(topProjectsData[0]).join(', ')}
                </div>
              )}
              {treemapStats && (
                <div className="mt-2 text-blue-300 text-xs">
                  Treemap Stats: min={treemapStats.minValue.toFixed(2)}, max={treemapStats.maxValue.toFixed(2)}, invalid={treemapStats.invalidOrZeroCount}
                </div>
              )}
            </div>
            )}

            {/* Content Container - ARC UI v1.1: Treemap with list fallback */}
            <div className="p-4" style={{ minHeight: '400px' }} ref={listContainerRef}>
              {topProjectsLoading ? (
                <div className="flex items-center justify-center h-full min-h-[200px]">
                  <div className="text-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-3" />
                    <span className="text-white/60 text-sm">Loading projects...</span>
                  </div>
                </div>
              ) : topProjectsError ? (
                <div className="text-center py-8">
                  <p className="text-sm text-akari-danger mb-2">Failed to load projects</p>
                  <p className="text-xs text-akari-muted">{topProjectsError}</p>
                </div>
              ) : topProjectsData.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-white/60">0 projects returned</p>
                </div>
              ) : treemapError || !showTreemap ? (
                // Show fallback list if treemap failed
                <div>
                  {treemapError && (
                    <div className="mb-4 rounded-lg border border-akari-danger/30 bg-akari-card/50 p-3">
                      <p className="text-xs text-akari-danger mb-1">Treemap error, showing list fallback</p>
                      <p className="text-xs text-akari-muted">{treemapError.message}</p>
                    </div>
                  )}
                  <div className="space-y-3">
                    {(() => {
                      // Apply same filtering logic as treemap
                      let filteredData = [...topProjectsData];
                      
                      if (treemapSegment === 'gainers') {
                        filteredData = topProjectsData
                          .filter((item: any) => typeof item.growth_pct === 'number' && !isNaN(item.growth_pct))
                          .sort((a: any, b: any) => (b.growth_pct || 0) - (a.growth_pct || 0))
                          .slice(0, 20);
                      } else if (treemapSegment === 'losers') {
                        filteredData = topProjectsData
                          .filter((item: any) => typeof item.growth_pct === 'number' && !isNaN(item.growth_pct))
                          .sort((a: any, b: any) => (a.growth_pct || 0) - (b.growth_pct || 0))
                          .slice(0, 20);
                      } else if (treemapSegment === 'stable') {
                        filteredData = topProjectsData
                          .filter((item: any) => {
                            const growthPct = typeof item.growth_pct === 'number' && !isNaN(item.growth_pct) ? item.growth_pct : null;
                            return growthPct !== null && Math.abs(growthPct) <= 0.5;
                          })
                          .slice(0, 20);
                      }
                      
                      return filteredData.map((item: any, index: number) => {
                        const name = item.display_name || item.name || 'Unknown';
                        const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
                        const twitterUsername = item.twitter_username || '';
                        
                        return (
                          <div
                            key={item.id || index}
                            className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-white truncate">{name}</div>
                              {twitterUsername && (
                                <div className="text-xs text-white/60 truncate">@{twitterUsername}</div>
                              )}
                            </div>
                            <div className={`text-sm font-bold ml-4 ${
                              growthPct > 0 ? 'text-green-400' : growthPct < 0 ? 'text-red-400' : 'text-white/60'
                            }`}>
                              {growthPct >= 0 ? '+' : ''}{growthPct.toFixed(2)}%
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              ) : (
                // Try to render treemap with error handling
                <div style={{ width: '100%', height: '400px', position: 'relative' }}>
                  {(() => {
                    try {
                      const treemapWidth = Math.max(containerDimensions.width - 32, 400); // Account for padding
                      const treemapHeight = 400;
                      
                      // Filter and sort data based on selected segment
                      let filteredData = [...topProjectsData];
                      
                      if (treemapSegment === 'gainers') {
                        // Sort desc by growth_pct and show top 20
                        filteredData = topProjectsData
                          .filter((item: any) => typeof item.growth_pct === 'number' && !isNaN(item.growth_pct))
                          .sort((a: any, b: any) => (b.growth_pct || 0) - (a.growth_pct || 0))
                          .slice(0, 20);
                      } else if (treemapSegment === 'losers') {
                        // Sort asc by growth_pct and show top 20
                        filteredData = topProjectsData
                          .filter((item: any) => typeof item.growth_pct === 'number' && !isNaN(item.growth_pct))
                          .sort((a: any, b: any) => (a.growth_pct || 0) - (b.growth_pct || 0))
                          .slice(0, 20);
                      } else if (treemapSegment === 'stable') {
                        // abs(growth_pct) <= 0.5, show up to 20
                        filteredData = topProjectsData
                          .filter((item: any) => {
                            const growthPct = typeof item.growth_pct === 'number' && !isNaN(item.growth_pct) ? item.growth_pct : null;
                            return growthPct !== null && Math.abs(growthPct) <= 0.5;
                          })
                          .slice(0, 20);
                      }
                      // 'all' segment: show all items (no filtering)
                      
                      const treemapData: TreemapProjectItem[] = filteredData.map((item: any) => ({
                        id: item.id,
                        display_name: item.display_name,
                        name: item.name,
                        twitter_username: item.twitter_username, // Use twitter_username consistently
                        growth_pct: item.growth_pct,
                        slug: item.slug,
                        arc_access_level: item.arc_access_level,
                        arc_active: item.arc_active,
                      }));
                      
                      const treemapResult = (
                        <ArcProjectsTreemapV3
                          data={treemapData}
                          width={treemapWidth}
                          height={treemapHeight}
                          onError={(error) => {
                            console.error('[ARC] Treemap error:', error);
                            setTreemapError(error);
                            setShowTreemap(false);
                          }}
                          onStatsUpdate={(stats) => {
                            setTreemapStats(stats);
                          }}
                          onProjectClick={(item) => {
                            // Handle project click navigation
                            const arcAccessLevel = item.arc_access_level || 'none';
                            const projectIdentifier = item.slug || item.id;
                            
                            if (arcAccessLevel === 'creator_manager') {
                              router.push(`/portal/arc/creator-manager?projectId=${projectIdentifier}`);
                            } else if (arcAccessLevel === 'leaderboard' || arcAccessLevel === 'gamified') {
                              router.push(`/portal/arc/project/${projectIdentifier}`);
                            }
                          }}
                        />
                      );
                      
                      // If treemap returns null, show fallback
                      if (!treemapResult) {
                        setTreemapError(new Error('Treemap returned null'));
                        setShowTreemap(false);
                        return null;
                      }
                      
                      return treemapResult;
                    } catch (error: any) {
                      console.error('[ARC] Treemap render error:', error);
                      setTreemapError(error instanceof Error ? error : new Error(String(error)));
                      setShowTreemap(false);
                      return null;
                    }
                  })()}
                  {/* If treemap returns null or fails, show list fallback */}
                  {(treemapError || !showTreemap) && (
                    <div className="mt-4">
                      <div className="mb-4 rounded-lg border border-akari-danger/30 bg-akari-card/50 p-3">
                        <p className="text-xs text-akari-danger mb-1">Treemap error, showing list fallback</p>
                        <p className="text-xs text-akari-muted">{treemapError?.message || 'Treemap unavailable'}</p>
                      </div>
                      <div className="space-y-3">
                        {topProjectsData.map((item: any, index: number) => {
                          const name = item.display_name || item.name || 'Unknown';
                          const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
                          const twitterUsername = item.twitter_username || '';
                          
                          return (
                            <div
                              key={item.id || index}
                              className="flex items-center justify-between p-4 rounded-lg border border-white/10 bg-white/5"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-white truncate">{name}</div>
                                {twitterUsername && (
                                  <div className="text-xs text-white/60 truncate">@{twitterUsername}</div>
                                )}
                              </div>
                              <div className={`text-sm font-bold ml-4 ${
                                growthPct > 0 ? 'text-green-400' : growthPct < 0 ? 'text-red-400' : 'text-white/60'
                              }`}>
                                {growthPct >= 0 ? '+' : ''}{growthPct.toFixed(2)}%
                              </div>
                            </div>
                          );
                        })}
                      </div>
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
        )}
      </div>
    </PortalLayout>
  );
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
