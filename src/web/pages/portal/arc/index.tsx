/**
 * ARC Home Page
 * 
 * Campaign Discovery Hub - Modern dashboard for creators and projects
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { FeaturedCampaigns } from '@/components/arc/FeaturedCampaigns';
import { MyCampaigns } from '@/components/arc/MyCampaigns';
import { CampaignGrid } from '@/components/arc/CampaignGrid';
import { TrendingNarratives } from '@/components/arc/TrendingNarratives';
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
        if (userTwitterUsername && data.projects.length > 0) {
          const projectIds = data.projects.map(p => p.project_id);
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
        }
      } catch (err) {
        setError('Failed to connect to API');
        console.error('[ArcHome] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [userTwitterUsername]);

  // Handle join campaign
  const handleJoinCampaign = async (projectId: string) => {
    if (joiningProjectId) return; // Prevent double-clicks

    try {
      setJoiningProjectId(projectId);

      const res = await fetch('/api/portal/arc/join-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Failed to join campaign');
      }

      // Refresh campaign statuses
      if (userTwitterUsername) {
        const projectIds = projects.map(p => p.project_id);
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
    <PortalLayout title="ARC">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gradient-teal">
            ARC Narrative Universe
          </h1>
          {userIsSuperAdmin && (
            <Link
              href="/portal/arc/admin"
              className="px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
            >
              ARC Admin
            </Link>
          )}
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
            <span className="ml-3 text-akari-muted">Loading ARC projects...</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-6 text-center">
            <p className="text-sm text-akari-danger">Failed to load ARC projects.</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && projects.length === 0 && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
            <p className="text-sm text-akari-muted">
              No ARC projects yet. ARC will light up as soon as campaigns go live.
            </p>
          </div>
        )}

        {/* Projects grid */}
        {!loading && !error && projects.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const cardContent = (
                <div className={`rounded-xl border border-slate-700 p-4 bg-akari-card hover:border-akari-neon-teal/50 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] transition-all duration-300 ${project.slug ? 'cursor-pointer' : ''}`}>
                  {/* Project name */}
                  <h3 className="text-lg font-semibold text-akari-text mb-2">
                    {project.name || 'Unnamed Project'}
                  </h3>

                  {/* Twitter username */}
                  {project.twitter_username && (
                    <p className="text-sm text-akari-muted mb-4">
                      @{project.twitter_username}
                    </p>
                  )}

                  {/* Status badges */}
                  <div className="flex flex-wrap gap-2">
                    {/* ARC Tier */}
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${getTierColor(
                        project.arc_tier
                      )}`}
                    >
                      {project.arc_tier}
                    </span>

                    {/* ARC Status */}
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                        project.arc_status
                      )}`}
                    >
                      {project.arc_status}
                    </span>

                    {/* Security Status */}
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${getSecurityColor(
                        project.security_status
                      )}`}
                    >
                      {project.security_status}
                    </span>
                  </div>
                </div>
              );

              // Wrap in Link if slug exists, otherwise render as-is
              if (project.slug) {
                return (
                  <Link
                    key={project.project_id}
                    href={`/portal/arc/${project.slug}`}
                  >
                    {cardContent}
                  </Link>
                );
              }

              return (
                <div key={project.project_id}>
                  {cardContent}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
