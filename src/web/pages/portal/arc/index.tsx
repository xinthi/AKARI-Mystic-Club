/**
 * ARC Home Page
 * 
 * Campaign Discovery Hub - Modern dashboard for creators and projects
 */

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { FeaturedCampaigns } from '@/components/arc/FeaturedCampaigns';
import { MyCampaigns } from '@/components/arc/MyCampaigns';
import { CampaignGrid } from '@/components/arc/CampaignGrid';
import { TrendingNarratives } from '@/components/arc/TrendingNarratives';
import { ArcUniverseMap } from '@/components/arc/ArcUniverseMap';
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
// COMPONENT
// =============================================================================

export default function ArcHome() {
  const akariUser = useAkariUser();
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);
  const [projects, setProjects] = useState<ArcProject[]>([]);
  const [myCampaigns, setMyCampaigns] = useState<UserCampaign[]>([]);
  const [userCampaignStatuses, setUserCampaignStatuses] = useState<Map<string, { isFollowing: boolean; hasJoined: boolean }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joiningProjectId, setJoiningProjectId] = useState<string | null>(null);

  // Get user's Twitter username
  const userTwitterUsername = akariUser.user?.xUsername || null;
  
  // Dev mode: treat user as following all projects
  const isDevMode = process.env.NODE_ENV === 'development';

  // Map projects to ArcUniverseMap format
  const mappedProjectsForUniverse = useMemo(() => {
    return projects.map(project => {
      const status = userCampaignStatuses.get(project.project_id);
      const userIsParticipant = status?.hasJoined || false;
      
      return {
        id: project.project_id,
        name: project.name || 'Unknown',
        slug: project.slug || '',
        twitter_username: project.twitter_username,
        meta: project.meta,
        stats: {
          activeCreators: project.stats?.creatorCount || 0,
          totalPoints: project.stats?.totalPoints || 0,
          trend: project.stats?.trend || 'stable',
          userIsParticipant,
          userRank: status?.arcPoints ? undefined : null, // Rank would need to be computed separately
        },
      };
    });
  }, [projects, userCampaignStatuses]);

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

        // Fetch user campaign statuses
        if (data.projects.length > 0) {
          const projectIds = data.projects.map(p => p.project_id);
          
          if (userTwitterUsername) {
            const statuses = await getUserCampaignStatuses(projectIds, userTwitterUsername);
            setUserCampaignStatuses(statuses);
            
            // Build my campaigns list
            const joinedCampaigns: UserCampaign[] = [];
            statuses.forEach((status, projectId) => {
              if (status.hasJoined) {
                const project = data.projects.find(p => p.project_id === projectId);
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
  }, [userTwitterUsername, isDevMode]);

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
            {/* Hero Section - Two Column Layout */}
            <section className="mb-10 rounded-2xl bg-gradient-to-b from-[#15192D] to-black/80 border border-white/5 px-6 py-6 lg:px-10 lg:py-8 flex flex-col lg:flex-row gap-8 items-stretch">
              {/* Left: text + user stats */}
              <div className="flex-1 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center justify-between mb-4">
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
                  <p className="text-white/60 mt-2">
                    Track how narratives move across campaigns. Join projects, earn ARC points, and grow your influence.
                  </p>
                </div>

                {/* User stats row */}
                {userTwitterUsername && (
                  <div className="flex flex-wrap gap-3 mt-4">
                    <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60">Projects joined</div>
                      <div className="text-lg font-semibold text-white">{userStats.projectsJoined}</div>
                    </div>
                    <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60">Total ARC points</div>
                      <div className="text-lg font-semibold text-white">{userStats.totalArcPoints.toLocaleString()}</div>
                    </div>
                    <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60">Active campaigns</div>
                      <div className="text-lg font-semibold text-white">{userStats.activeCampaigns}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: project bubble map */}
              <div className="flex-1 min-h-[400px]">
                <ArcUniverseMap projects={mappedProjectsForUniverse} />
              </div>
            </section>

            {/* Featured Campaigns */}
            <FeaturedCampaigns
              projects={projects}
              userTwitterUsername={userTwitterUsername}
              userCampaignStatuses={userCampaignStatuses}
              onJoinCampaign={(projectId) => {
                console.log('[ArcHome] FeaturedCampaigns onJoinCampaign called:', projectId);
                handleJoinCampaign(projectId);
              }}
            />

            {/* My Campaigns */}
            {myCampaigns.length > 0 && (
              <MyCampaigns campaigns={myCampaigns} />
            )}

            {/* All Campaigns */}
            <CampaignGrid
              projects={projects}
              userTwitterUsername={userTwitterUsername}
              userCampaignStatuses={userCampaignStatuses}
              onJoinCampaign={(projectId) => {
                console.log('[ArcHome] CampaignGrid onJoinCampaign called:', projectId);
                handleJoinCampaign(projectId);
              }}
            />

            {/* Trending Narratives */}
            <TrendingNarratives />
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
