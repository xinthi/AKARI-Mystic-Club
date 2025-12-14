/**
 * ARC Project Hub Page
 * 
 * Dynamic route for individual ARC project pages
 * Shows project details and arenas
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';

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

interface Arena {
  id: string;
  project_id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
  starts_at: string | null;
  ends_at: string | null;
  reward_depth: number;
}

interface ArenasResponse {
  ok: boolean;
  arenas?: Arena[];
  error?: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcProjectHub() {
  const router = useRouter();
  const { slug } = router.query;

  const [project, setProject] = useState<ArcProject | null>(null);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectLoading, setProjectLoading] = useState(true);
  const [arenasLoading, setArenasLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch project from projects list
  useEffect(() => {
    async function fetchProject() {
      if (!slug || typeof slug !== 'string') {
        setProjectLoading(false);
        return;
      }

      try {
        setProjectLoading(true);
        setError(null);

        const res = await fetch('/api/portal/arc/projects');
        const data: ArcProjectsResponse = await res.json();

        if (!data.ok || !data.projects) {
          setError(data.error || 'Failed to load project');
          setProjectLoading(false);
          return;
        }

        // Find project matching the slug
        const foundProject = data.projects.find((p) => p.slug === slug);
        setProject(foundProject || null);
      } catch (err) {
        setError('Failed to connect to API');
        console.error('[ArcProjectHub] Fetch project error:', err);
      } finally {
        setProjectLoading(false);
      }
    }

    fetchProject();
  }, [slug]);

  // Fetch arenas for this project
  useEffect(() => {
    async function fetchArenas() {
      if (!slug || typeof slug !== 'string') {
        setArenasLoading(false);
        return;
      }

      try {
        setArenasLoading(true);

        const res = await fetch(`/api/portal/arc/arenas?slug=${encodeURIComponent(slug)}`);
        const data: ArenasResponse = await res.json();

        if (!data.ok) {
          // Don't set error for arenas - just show empty state
          setArenas([]);
          return;
        }

        setArenas(data.arenas || []);
      } catch (err) {
        console.error('[ArcProjectHub] Fetch arenas error:', err);
        setArenas([]);
      } finally {
        setArenasLoading(false);
      }
    }

    fetchArenas();
  }, [slug]);

  // Update overall loading state
  useEffect(() => {
    setLoading(projectLoading || arenasLoading);
  }, [projectLoading, arenasLoading]);

  // Helper function to get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 border-green-500/30 text-green-400';
      case 'suspended':
        return 'bg-red-500/10 border-red-500/30 text-red-400';
      case 'inactive':
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
    }
  };

  // Helper function to get tier badge color
  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'event_host':
        return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
      case 'pro':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      case 'basic':
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-text';
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-text';
    }
  };

  // Helper function to get security status badge color
  const getSecurityColor = (status: string) => {
    switch (status) {
      case 'alert':
        return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400';
      case 'clear':
        return 'bg-green-500/10 border-green-500/30 text-green-400';
      case 'normal':
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-text';
    }
  };

  // Helper function to get arena status badge color
  const getArenaStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 border-green-500/30 text-green-400';
      case 'scheduled':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      case 'ended':
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
      case 'cancelled':
        return 'bg-red-500/10 border-red-500/30 text-red-400';
      case 'draft':
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
    }
  };

  // Helper function to format date range
  const formatDateRange = (startsAt: string | null, endsAt: string | null) => {
    if (!startsAt && !endsAt) return 'No dates set';
    if (!startsAt) return `Until ${new Date(endsAt!).toLocaleDateString()}`;
    if (!endsAt) return `From ${new Date(startsAt).toLocaleDateString()}`;
    
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    return `${start.toLocaleDateString()} → ${end.toLocaleDateString()}`;
  };

  return (
    <PortalLayout title="ARC">
      <div className="space-y-6">
        {/* Back link */}
        <Link
          href="/portal/arc"
          className="inline-flex items-center gap-2 text-sm text-akari-muted hover:text-akari-primary transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to ARC Home
        </Link>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
            <span className="ml-3 text-akari-muted">Loading project...</span>
          </div>
        )}

        {/* Project not found */}
        {!loading && !project && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
            <p className="text-sm text-akari-muted">
              ARC is not enabled for this project.
            </p>
          </div>
        )}

        {/* Project found - show content */}
        {!loading && project && (
          <>
            {/* Project header card */}
            <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
              <h1 className="text-2xl font-bold text-akari-text mb-2">
                {project.name || 'Unnamed Project'}
              </h1>

              {project.twitter_username && (
                <p className="text-base text-akari-muted mb-4">
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

            {/* Arenas section */}
            <section>
              <h2 className="text-xl font-semibold text-akari-text mb-4">Arenas</h2>

              {/* Loading arenas */}
              {arenasLoading && (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                  <span className="ml-3 text-sm text-akari-muted">Loading arenas...</span>
                </div>
              )}

              {/* No arenas */}
              {!arenasLoading && arenas.length === 0 && (
                <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
                  <p className="text-sm text-akari-muted">
                    No active arenas yet. Once campaigns are launched, they will appear here.
                  </p>
                </div>
              )}

              {/* Arenas list */}
              {!arenasLoading && arenas.length > 0 && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {arenas.map((arena) => {
                    const arenaCard = (
                      <div className="rounded-xl border border-slate-700 p-4 bg-akari-card hover:border-akari-neon-teal/50 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] transition-all duration-300 cursor-pointer">
                        {/* Arena name */}
                        <h3 className="text-lg font-semibold text-akari-text mb-2">
                          {arena.name}
                        </h3>

                        {/* Arena status */}
                        <div className="mb-3">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium border ${getArenaStatusColor(
                              arena.status
                            )}`}
                          >
                            {arena.status}
                          </span>
                        </div>

                        {/* Date range */}
                        <p className="text-sm text-akari-muted mb-3">
                          {formatDateRange(arena.starts_at, arena.ends_at)}
                        </p>

                        {/* Reward depth */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-akari-muted">Reward Depth:</span>
                          <span className="text-sm font-medium text-akari-text">
                            {arena.reward_depth}
                          </span>
                        </div>
                      </div>
                    );

                    return (
                      <Link
                        key={arena.id}
                        href={`/portal/arc/${slug}/arena/${arena.slug}`}
                      >
                        {arenaCard}
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
