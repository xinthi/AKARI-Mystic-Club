/**
 * ARC Arena Details Page
 * 
 * Dynamic route for individual arena pages
 * Shows arena details, creators leaderboard, tasks, and analytics
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';

// =============================================================================
// TYPES
// =============================================================================

interface ArenaDetail {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
  starts_at: string | null;
  ends_at: string | null;
  reward_depth: number;
  settings: Record<string, any>;
}

interface Creator {
  id: string;
  twitter_username: string;
  arc_points: number;
  ring: 'core' | 'momentum' | 'discovery';
  style: string | null;
  meta: Record<string, any>;
}

interface ArenaDetailResponse {
  ok: boolean;
  arena?: ArenaDetail;
  creators?: Creator[];
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

export default function ArenaDetailsPage() {
  const router = useRouter();
  const { projectSlug, arenaSlug } = router.query;

  const [arena, setArena] = useState<ArenaDetail | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch arena details
  useEffect(() => {
    async function fetchArenaDetails() {
      if (!projectSlug || typeof projectSlug !== 'string' || !arenaSlug || typeof arenaSlug !== 'string') {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // First, fetch arenas list to get the arena ID
        const arenasRes = await fetch(`/api/portal/arc/arenas?slug=${encodeURIComponent(projectSlug)}`);
        const arenasData: ArenasResponse = await arenasRes.json();

        if (!arenasData.ok || !arenasData.arenas) {
          setError(arenasData.error || 'Failed to load arena');
          setLoading(false);
          return;
        }

        // Find the arena matching the slug
        const foundArena = arenasData.arenas.find((a: Arena) => a.slug === arenaSlug);
        if (!foundArena) {
          setError('Arena not found');
          setLoading(false);
          return;
        }

        // Now fetch detailed arena data using the ID
        const detailsRes = await fetch(`/api/portal/arc/arena-details?arenaId=${encodeURIComponent(foundArena.id)}`);
        const detailsData: ArenaDetailResponse = await detailsRes.json();

        if (!detailsData.ok || !detailsData.arena) {
          setError(detailsData.error || 'Failed to load arena details');
          setLoading(false);
          return;
        }

        setArena(detailsData.arena);
        setCreators(detailsData.creators || []);
      } catch (err) {
        setError('Failed to connect to API');
        console.error('[ArenaDetailsPage] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchArenaDetails();
  }, [projectSlug, arenaSlug]);

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
    <PortalLayout title="ARC Arena">
      <div className="space-y-6">
        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-2 text-sm text-akari-muted">
          <Link
            href="/portal/arc"
            className="hover:text-akari-primary transition-colors"
          >
            ARC Home
          </Link>
          <span>/</span>
          <Link
            href={`/portal/arc/${projectSlug}`}
            className="hover:text-akari-primary transition-colors"
          >
            Project
          </Link>
          <span>/</span>
          <span className="text-akari-text">Arena</span>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
            <span className="ml-3 text-akari-muted">Loading arena details...</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-6 text-center">
            <p className="text-sm text-akari-danger">{error}</p>
          </div>
        )}

        {/* Arena content */}
        {!loading && !error && arena && (
          <>
            {/* Arena header card */}
            <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-akari-text mb-2">
                    {arena.name}
                  </h1>
                  {arena.description && (
                    <p className="text-base text-akari-muted mb-4">
                      {arena.description}
                    </p>
                  )}
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium border ${getArenaStatusColor(
                    arena.status
                  )}`}
                >
                  {arena.status}
                </span>
              </div>

              {/* Arena metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-akari-muted mb-1">Date Range</p>
                  <p className="text-sm text-akari-text">
                    {formatDateRange(arena.starts_at, arena.ends_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-akari-muted mb-1">Reward Depth</p>
                  <p className="text-sm font-medium text-akari-text">
                    {arena.reward_depth}
                  </p>
                </div>
              </div>
            </div>

            {/* Overview Section */}
            <section>
              <h2 className="text-xl font-semibold text-akari-text mb-4">Overview</h2>
              <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
                <p className="text-sm text-akari-muted">
                  Arena overview content will be displayed here.
                </p>
              </div>
            </section>

            {/* Creators Leaderboard Section */}
            <section>
              <h2 className="text-xl font-semibold text-akari-text mb-4">Creators Leaderboard</h2>
              <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
                <p className="text-sm text-akari-muted">
                  Creators leaderboard will be displayed here.
                </p>
                {creators.length > 0 && (
                  <p className="text-xs text-akari-muted mt-2">
                    ({creators.length} creators found)
                  </p>
                )}
              </div>
            </section>

            {/* Tasks Section */}
            <section>
              <h2 className="text-xl font-semibold text-akari-text mb-4">Tasks</h2>
              <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
                <p className="text-sm text-akari-muted">
                  Arena tasks will be displayed here.
                </p>
              </div>
            </section>

            {/* Arena Analytics Section */}
            <section>
              <h2 className="text-xl font-semibold text-akari-text mb-4">Arena Analytics</h2>
              <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
                <p className="text-sm text-akari-muted">
                  Arena analytics will be displayed here.
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
