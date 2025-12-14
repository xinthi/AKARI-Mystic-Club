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

interface ProjectInfo {
  id: string;
  name: string;
  twitter_username: string;
  avatar_url: string | null;
}

interface Creator {
  id?: string;
  twitter_username: string;
  arc_points: number;
  ring?: 'core' | 'momentum' | 'discovery' | string;
  style?: string | null;
  meta?: Record<string, any>;
  joined_at?: string | null;
}

interface ArenaDetailResponse {
  ok: true;
  arena: ArenaDetail;
  project: ProjectInfo;
  creators: Creator[];
}

interface ArenaErrorResponse {
  ok: false;
  error: string;
}

type ArenaResponse = ArenaDetailResponse | ArenaErrorResponse;

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArenaDetailsPage() {
  const router = useRouter();
  const { slug: projectSlug, arenaSlug } = router.query;

  const [arena, setArena] = useState<ArenaDetail | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Leaderboard filter/sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [ringFilter, setRingFilter] = useState<'all' | 'core' | 'momentum' | 'discovery'>('all');
  const [sortBy, setSortBy] = useState<'points_desc' | 'points_asc' | 'joined_newest' | 'joined_oldest'>('points_desc');

  // Fetch arena details using the arena slug
  useEffect(() => {
    async function fetchArenaDetails() {
      // Wait for router to be ready and ensure we have the arena slug
      if (!router.isReady) {
        return;
      }

      if (!arenaSlug || typeof arenaSlug !== 'string') {
        setLoading(false);
        setError('Arena slug is required');
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Use the correct API route that returns arena, project, and creators in one call
        const res = await fetch(`/api/portal/arc/arenas/${encodeURIComponent(arenaSlug)}`);
        
        if (!res.ok) {
          const errorData: ArenaErrorResponse = await res.json().catch(() => ({
            ok: false,
            error: `HTTP ${res.status}: Failed to fetch arena`,
          }));
          setError(errorData.error || 'Failed to load arena');
          setLoading(false);
          return;
        }

        const data: ArenaResponse = await res.json().catch(() => {
          throw new Error('Invalid response from server');
        });

        if (!data.ok) {
          setError(data.error || 'Failed to load arena');
          setLoading(false);
          return;
        }

        // Data is valid, set all state
        setArena(data.arena);
        setProject(data.project);
        // Creators are already sorted by arc_points DESC from the API
        setCreators(data.creators || []);
      } catch (err: any) {
        const errorMessage = err?.message || 'Failed to connect to API';
        setError(errorMessage);
        console.error('[ArenaDetailsPage] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchArenaDetails();
  }, [router.isReady, arenaSlug]);

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

  // Filter and sort creators
  const visibleCreators = React.useMemo(() => {
    let filtered = [...creators];

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((creator) => {
        const usernameMatch = creator.twitter_username?.toLowerCase().includes(term);
        const styleMatch = creator.style?.toLowerCase().includes(term);
        return usernameMatch || styleMatch;
      });
    }

    // Filter by ring
    if (ringFilter !== 'all') {
      filtered = filtered.filter((creator) => {
        return creator.ring?.toLowerCase() === ringFilter.toLowerCase();
      });
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'points_desc':
          return (b.arc_points ?? 0) - (a.arc_points ?? 0);
        case 'points_asc':
          return (a.arc_points ?? 0) - (b.arc_points ?? 0);
        case 'joined_newest':
          if (!a.joined_at && !b.joined_at) return 0;
          if (!a.joined_at) return 1; // Missing dates go to bottom
          if (!b.joined_at) return -1;
          return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime();
        case 'joined_oldest':
          if (!a.joined_at && !b.joined_at) return 0;
          if (!a.joined_at) return 1; // Missing dates go to bottom
          if (!b.joined_at) return -1;
          return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [creators, searchTerm, ringFilter, sortBy]);

  // Safe project slug for navigation
  const safeProjectSlug = typeof projectSlug === 'string' ? projectSlug : '';

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
                {project?.name || 'Project'}
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
            <span className="ml-3 text-akari-muted">Loading arena…</span>
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-6 text-center">
            <p className="text-sm text-akari-danger">
              Failed to load arena. Please try again later.
            </p>
            {error && error !== 'Failed to load arena. Please try again later.' && (
              <p className="text-xs text-akari-muted mt-2">{error}</p>
            )}
          </div>
        )}

        {/* Arena content */}
        {!loading && !error && arena && (
          <>
            {/* Arena header card */}
            <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  {project && (
                    <p className="text-sm text-akari-muted mb-1">
                      {project.name}
                    </p>
                  )}
                  <h1 className="text-2xl font-bold text-akari-text mb-2">
                    {arena.name}
                  </h1>
                  <p className="text-xs text-akari-muted mb-2">
                    Slug: {arena.slug}
                  </p>
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

            {/* Creators Leaderboard Section */}
            <section>
              <h2 className="text-xl font-semibold text-akari-text mb-4">Creators Leaderboard</h2>
              <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
                {creators.length === 0 ? (
                  <p className="text-sm text-akari-muted">
                    No creators have joined this arena yet.
                  </p>
                ) : (
                  <>
                    {/* Controls Bar */}
                    <div className="mb-6 space-y-4">
                      {/* Search and Filters Row */}
                      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        {/* Search Input */}
                        <input
                          type="text"
                          placeholder="Search creators…"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="flex-1 min-w-0 px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                        />

                        {/* Ring Filter Buttons */}
                        <div className="flex gap-2 flex-wrap">
                          {(['all', 'core', 'momentum', 'discovery'] as const).map((ring) => (
                            <button
                              key={ring}
                              onClick={() => setRingFilter(ring)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                ringFilter === ring
                                  ? ring === 'all'
                                    ? 'bg-akari-primary/20 border-akari-primary/50 text-akari-primary'
                                    : getRingColor(ring) + ' border-opacity-50'
                                  : 'bg-akari-cardSoft/30 border-akari-border/30 text-akari-muted hover:border-akari-border/50'
                              }`}
                            >
                              {ring.charAt(0).toUpperCase() + ring.slice(1)}
                            </button>
                          ))}
                        </div>

                        {/* Sort Dropdown */}
                        <div className="flex items-center gap-2">
                          <label htmlFor="sort-select" className="text-xs text-akari-muted">
                            Sort:
                          </label>
                          <select
                            id="sort-select"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                            className="px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                          >
                            <option value="points_desc">Top points</option>
                            <option value="points_asc">Lowest points</option>
                            <option value="joined_newest">Newest joined</option>
                            <option value="joined_oldest">Oldest joined</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Creators List */}
                    {visibleCreators.length === 0 ? (
                      <p className="text-sm text-akari-muted">
                        No creators match your filters.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {visibleCreators.map((creator, index) => {
                          const rank = index + 1;
                          return (
                            <div
                              key={creator.id || `creator-${index}`}
                              className="flex items-center justify-between p-3 rounded-lg bg-akari-cardSoft/30 border border-akari-border/30 hover:border-akari-neon-teal/30 transition-colors"
                            >
                              <div className="flex items-center gap-4">
                                <span className="text-sm font-semibold text-akari-text w-8">
                                  {rank}
                                </span>
                                <span className="text-sm text-akari-text">
                                  @{creator.twitter_username || 'Unknown'}
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
                                {creator.style && (
                                  <span className="text-xs text-akari-muted">
                                    {creator.style}
                                  </span>
                                )}
                              </div>
                              <span className="text-sm font-medium text-akari-text">
                                {creator.arc_points ?? 0} pts
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
