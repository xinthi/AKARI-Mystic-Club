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

interface ArenaDetailResponse {
  ok: boolean;
  arena?: ArenaDetail;
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
  const { slug, arenaSlug } = router.query;

  const [arena, setArena] = useState<ArenaDetail | null>(null);
  const [creators, setCreators] = useState<any[]>([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);
  const [creatorsError, setCreatorsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch arena details
  useEffect(() => {
    async function fetchArenaDetails() {
      if (!slug || typeof slug !== 'string' || !arenaSlug || typeof arenaSlug !== 'string') {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // First, fetch arenas list to get the arena ID
        const arenasRes = await fetch(`/api/portal/arc/arenas?slug=${encodeURIComponent(slug)}`);
        
        if (!arenasRes.ok) {
          throw new Error(`HTTP ${arenasRes.status}: Failed to fetch arenas`);
        }

        const arenasData: ArenasResponse = await arenasRes.json().catch(() => {
          throw new Error('Invalid response from server');
        });

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
        
        if (!detailsRes.ok) {
          throw new Error(`HTTP ${detailsRes.status}: Failed to fetch arena details`);
        }

        const detailsData: ArenaDetailResponse = await detailsRes.json().catch(() => {
          throw new Error('Invalid response from server');
        });

        if (!detailsData.ok || !detailsData.arena) {
          setError(detailsData.error || 'Failed to load arena details');
          setLoading(false);
          return;
        }

        setArena(detailsData.arena);
      } catch (err: any) {
        const errorMessage = err?.message || 'Failed to connect to API';
        setError(errorMessage);
        console.error('[ArenaDetailsPage] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchArenaDetails();
  }, [slug, arenaSlug]);

  // Fetch creators for the arena
  useEffect(() => {
    if (!arena || !arena.id) return;

    const fetchCreators = async () => {
      try {
        setCreatorsLoading(true);
        setCreatorsError(null);

        const res = await fetch(`/api/portal/arc/arena-creators?arenaId=${arena.id}`);
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Failed to fetch creators`);
        }

        const body = await res.json().catch(() => {
          throw new Error('Invalid response from server');
        });

        if (!body.ok) {
          throw new Error(body?.error || 'Failed to load creators');
        }

        setCreators(body.creators || []);
      } catch (err: any) {
        console.error('Failed to load arena creators', err);
        setCreatorsError(err?.message || 'Failed to load creators');
      } finally {
        setCreatorsLoading(false);
      }
    };

    fetchCreators();
  }, [arena?.id]);

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

  // Helper function to get ring badge color
  const getRingColor = (ring: string) => {
    switch (ring) {
      case 'core':
        return 'bg-purple-500/10 border-purple-500/30 text-purple-400';
      case 'momentum':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-400';
      case 'discovery':
        return 'bg-green-500/10 border-green-500/30 text-green-400';
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
    }
  };

  // Safe project slug for navigation
  const safeProjectSlug = typeof slug === 'string' ? slug : '';

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
          {safeProjectSlug && (
            <>
              <Link
                href={`/portal/arc/${safeProjectSlug}`}
                className="hover:text-akari-primary transition-colors"
              >
                Project
              </Link>
              <span>/</span>
            </>
          )}
          <span className="text-akari-text">Arena</span>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
            <span className="ml-3 text-akari-muted">Loading arena details...</span>
          </div>
        )}

        {/* Error state or Arena not found */}
        {!loading && (error || !arena) && (
          <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-6 text-center">
            <p className="text-sm text-akari-danger">
              {error || 'Arena not found'}
            </p>
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
                {creatorsLoading ? (
                  <p className="text-sm text-akari-muted">Loading creators...</p>
                ) : creatorsError ? (
                  <p className="text-sm text-akari-danger">Failed to load creators.</p>
                ) : creators.length === 0 ? (
                  <p className="text-sm text-akari-muted">No creators in this arena yet.</p>
                ) : (
                  <div className="space-y-3">
                    {creators.map((creator, index) => {
                      const rank = index + 1;
                      return (
                        <div
                          key={creator.id || index}
                          className="flex items-center justify-between p-3 rounded-lg bg-akari-cardSoft/30 border border-akari-border/30 hover:border-akari-neon-teal/30 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-semibold text-akari-text w-8">
                              #{rank}
                            </span>
                            <span className="text-sm text-akari-text">
                              {creator.twitter_username || 'Unknown'}
                            </span>
                            {creator.ring && (
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium border ${getRingColor(
                                  creator.ring
                                )}`}
                              >
                                {creator.ring}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-medium text-akari-text">
                            {creator.arc_points ?? 0}
                          </span>
                        </div>
                      );
                    })}
                  </div>
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
