/**
 * ARC Home Page
 * 
 * Campaign Discovery Hub - Modern dashboard for creators and projects
 */

import React, { useEffect, useState, useMemo } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { getUserCampaignStatuses } from '@/lib/arc/helpers';

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
  const [hasProjectAccess, setHasProjectAccess] = useState(false);
  const [isCreator, setIsCreator] = useState(false);

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
        const data: ArcProjectsResponse = await res.json();

        if (!data.ok || !data.projects) {
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

            {/* Top 20 Projects Module */}
            <section className="mb-8 rounded-xl border border-white/10 bg-black/40 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-white">Top 20 Projects</h2>
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
              </div>

              <div className="space-y-2">
                {sortedTopProjects.map((project, index) => {
                  const metric = project.stats?.totalPoints ?? project.stats?.creatorCount ?? 0;
                  const trend = project.stats?.trend || 'stable';
                  
                  const trendColors = {
                    rising: 'bg-green-500/20 border-green-500/40 text-green-300',
                    cooling: 'bg-red-500/20 border-red-500/40 text-red-300',
                    stable: 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted',
                  };

                  return (
                    <Link
                      key={project.project_id}
                      href={project.slug ? `/portal/arc/${project.slug}` : '#'}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-sm font-semibold text-white/40 w-6">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-white truncate">
                            {project.name || 'Unnamed Project'}
                          </div>
                          {project.twitter_username && (
                            <div className="text-xs text-white/60">@{project.twitter_username}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xs text-white/60">Points</div>
                          <div className="text-sm font-semibold text-white">{metric.toLocaleString()}</div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${trendColors[trend]}`}>
                          {trend}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
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
