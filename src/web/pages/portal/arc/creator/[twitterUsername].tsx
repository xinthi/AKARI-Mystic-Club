/**
 * ARC Creator Profile Page
 * 
 * Shows creator profile with stats and all arenas they participate in
 */

import React from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

interface CreatorProfile {
  twitter_username: string;
  primary_ring: string | null;
  primary_style: string | null;
  total_points: number;
  arenas_count: number;
  ring_points: {
    core: number;
    momentum: number;
    discovery: number;
  };
}

interface CreatorArenaEntry {
  arena_id: string;
  arena_name: string;
  arena_slug: string;
  project_id: string;
  project_name: string;
  project_slug: string | null;
  project_twitter_username: string | null;
  ring: string | null;
  arc_points: number;
  style: string | null;
  joined_at: string | null;
  starts_at: string | null;
  ends_at: string | null;
}

interface CreatorProfilePageProps {
  creator: CreatorProfile | null;
  arenas: CreatorArenaEntry[];
  error: string | null;
  twitterUsername: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function CreatorProfilePage({ creator, arenas, error, twitterUsername }: CreatorProfilePageProps) {
  // Helper function to get ring badge color
  const getRingColor = (ring: string | null) => {
    if (!ring) return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
    
    switch (ring.toLowerCase()) {
      case 'core':
        return 'bg-purple-500/20 border-purple-500/40 text-purple-300';
      case 'momentum':
        return 'bg-blue-500/20 border-blue-500/40 text-blue-300';
      case 'discovery':
        return 'bg-green-500/20 border-green-500/40 text-green-300';
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
    }
  };

  // Helper function to get avatar/initial for creator
  const getCreatorAvatar = (username: string, size: 'small' | 'large' = 'small') => {
    if (!username) return null;
    const firstLetter = username.charAt(0).toUpperCase();
    const sizeClasses = size === 'large' ? 'w-16 h-16 text-xl' : 'w-8 h-8 text-sm';
    return (
      <div className={`flex-shrink-0 ${sizeClasses} rounded-full bg-akari-cardSoft/50 border border-akari-border/30 flex items-center justify-center font-semibold text-akari-text`}>
        {firstLetter}
      </div>
    );
  };

  // Helper function to format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return null;
    }
  };

  // Helper function to format date for storyline
  const formatStorylineDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown date';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return 'Unknown date';
    }
  };

  // Generate creator narrative summary text
  const creatorNarrativeSummary = React.useMemo(() => {
    if (!creator) return '';

    if (creator.arenas_count === 0) {
      return `@${creator.twitter_username} has not joined any ARC arenas yet.`;
    }

    const parts: string[] = [];
    
    // Main summary
    const ringText = creator.primary_ring
      ? creator.primary_ring.charAt(0).toUpperCase() + creator.primary_ring.slice(1)
      : 'creator';
    const arenaText = creator.arenas_count === 1 ? 'arena' : 'arenas';
    parts.push(`@${creator.twitter_username} is a ${ringText} creator with ${creator.total_points.toLocaleString()} ARC points across ${creator.arenas_count} ${arenaText}.`);

    // Style
    if (creator.primary_style) {
      parts.push(`Known for ${creator.primary_style}.`);
    }

    // Ring breakdown (only if multiple rings have points)
    const ringParts: string[] = [];
    if (creator.ring_points.core > 0) {
      ringParts.push(`Core: ${creator.ring_points.core.toLocaleString()}`);
    }
    if (creator.ring_points.momentum > 0) {
      ringParts.push(`Momentum: ${creator.ring_points.momentum.toLocaleString()}`);
    }
    if (creator.ring_points.discovery > 0) {
      ringParts.push(`Discovery: ${creator.ring_points.discovery.toLocaleString()}`);
    }

    // Only show ring breakdown if there are multiple rings with points
    if (ringParts.length > 1) {
      parts.push(ringParts.join(' · ') + '.');
    }

    return parts.join(' ');
  }, [creator]);

  // Compute creator storyline events
  const creatorEvents = React.useMemo(() => {
    return arenas
      .map((arena) => {
        const date = arena.joined_at || null;
        const sortKey = date ? new Date(date).getTime() : 0;
        const ringName = arena.ring 
          ? arena.ring.charAt(0).toUpperCase() + arena.ring.slice(1)
          : 'Unknown';
        const dateStr = formatStorylineDate(date);
        const text = `${dateStr} – Joined "${arena.arena_name}" as ${ringName} (${arena.arc_points.toLocaleString()} pts)`;

        return {
          date,
          sortKey,
          text,
        };
      })
      .sort((a, b) => {
        // Newest first, but put items without dates at the bottom
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.sortKey - a.sortKey;
      });
  }, [arenas]);

  // Helper to get project slug - use provided slug or fallback to twitter username
  const getProjectSlug = (arena: CreatorArenaEntry) => {
    if (arena.project_slug) {
      return arena.project_slug;
    }
    // Fallback: use twitter username if available
    if (arena.project_twitter_username) {
      return arena.project_twitter_username.toLowerCase().replace('@', '').replace(/_/g, '-');
    }
    // Last resort: slugify project name
    return arena.project_name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  };

  return (
    <PortalLayout title="ARC Creator">
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
            href="/portal/arc"
            className="hover:text-akari-primary transition-colors"
          >
            Creator
          </Link>
          <span>/</span>
          <span className="text-akari-text">@{twitterUsername}</span>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-6 text-center">
            <p className="text-sm text-akari-danger">
              {error === 'CREATOR_NOT_FOUND' 
                ? 'Creator not found in ARC yet.'
                : 'Failed to load creator profile. Please try again later.'}
            </p>
          </div>
        )}

        {/* Creator not found */}
        {!error && !creator && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
            <p className="text-sm text-akari-muted">
              Creator not found in ARC yet.
            </p>
          </div>
        )}

        {/* Creator content */}
        {!error && creator && (
          <>
            {/* Header card */}
            <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  {getCreatorAvatar(creator.twitter_username, 'large')}
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-3xl font-bold text-akari-text mb-2">
                    @{creator.twitter_username}
                  </h1>
                  {creator.primary_style && (
                    <p className="text-base text-akari-muted mb-4">
                      {creator.primary_style}
                    </p>
                  )}
                </div>
                {creator.primary_ring && (
                  <div className="flex-shrink-0">
                    <span
                      className={`px-4 py-2 rounded-full text-sm font-medium border ${getRingColor(
                        creator.primary_ring
                      )}`}
                    >
                      {creator.primary_ring}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Total ARC Points */}
              <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                <p className="text-xs text-akari-muted mb-1">Total ARC Points</p>
                <p className="text-2xl font-bold text-akari-text">
                  {creator.total_points.toLocaleString()}
                </p>
              </div>

              {/* Arenas Joined */}
              <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                <p className="text-xs text-akari-muted mb-1">Arenas Joined</p>
                <p className="text-2xl font-bold text-akari-text">
                  {creator.arenas_count}
                </p>
              </div>

              {/* Points by Ring */}
              <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                <p className="text-xs text-akari-muted mb-2">Points by Ring</p>
                <div className="flex flex-wrap gap-2">
                  {creator.ring_points.core > 0 && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getRingColor('core')}`}>
                      Core {creator.ring_points.core.toLocaleString()}
                    </span>
                  )}
                  {creator.ring_points.momentum > 0 && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getRingColor('momentum')}`}>
                      Momentum {creator.ring_points.momentum.toLocaleString()}
                    </span>
                  )}
                  {creator.ring_points.discovery > 0 && (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getRingColor('discovery')}`}>
                      Discovery {creator.ring_points.discovery.toLocaleString()}
                    </span>
                  )}
                  {creator.ring_points.core === 0 && creator.ring_points.momentum === 0 && creator.ring_points.discovery === 0 && (
                    <span className="text-sm text-akari-muted">No points yet</span>
                  )}
                </div>
              </div>
            </div>

            {/* Narrative Summary Section */}
            {creator && (
              <section>
                <h2 className="text-xl font-semibold text-akari-text mb-4">Narrative Summary</h2>
                <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                  <p className="text-sm text-akari-muted leading-relaxed">
                    {creatorNarrativeSummary || `@${creator.twitter_username} has not joined any ARC arenas yet.`}
                  </p>
                </div>
              </section>
            )}

            {/* ARC Storyline Section */}
            <section>
              <h2 className="text-xl font-semibold text-akari-text mb-4">ARC Storyline</h2>
              <div className="rounded-xl border border-slate-700 p-6 bg-akari-card">
                {creatorEvents.length === 0 ? (
                  <p className="text-sm text-akari-muted">
                    No ARC activity recorded yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {creatorEvents.map((event, index) => (
                      <div key={index} className="pb-4 border-b border-akari-border/30 last:border-0 last:pb-0">
                        <p className="text-sm text-akari-text">
                          {event.text}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Arenas table */}
            <section>
              <h2 className="text-xl font-semibold text-akari-text mb-4">ARC Arenas</h2>
              <div className="rounded-xl border border-slate-700 bg-akari-card overflow-hidden">
                {arenas.length === 0 ? (
                  <div className="p-6 text-center">
                    <p className="text-sm text-akari-muted">
                      This creator hasn&apos;t joined any arenas yet.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-akari-cardSoft/30 border-b border-akari-border/30">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Project</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Arena</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Ring</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Points</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Joined</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-akari-border/30">
                        {arenas.map((arena) => {
                          const projectSlug = getProjectSlug(arena);
                          return (
                            <tr
                              key={arena.arena_id}
                              className="hover:bg-akari-cardSoft/20 transition-colors group"
                            >
                              <td className="px-4 py-3 text-sm text-akari-text">
                                <div>
                                  <div className="font-medium">{arena.project_name}</div>
                                  {arena.project_twitter_username && (
                                    <div className="text-xs text-akari-muted">
                                      @{arena.project_twitter_username}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-akari-text">
                                <Link
                                  href={`/portal/arc/${projectSlug}/arena/${arena.arena_slug}`}
                                  className="font-medium text-akari-primary hover:text-akari-neon-teal transition-colors underline decoration-akari-primary/30 hover:decoration-akari-neon-teal/50"
                                >
                                  {arena.arena_name}
                                </Link>
                              </td>
                              <td className="px-4 py-3">
                                {arena.ring && (
                                  <span
                                    className={`px-2 py-1 rounded-full text-xs font-medium border ${getRingColor(
                                      arena.ring
                                    )}`}
                                  >
                                    {arena.ring}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-akari-text">
                                {arena.arc_points.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-sm text-akari-muted">
                                {formatDate(arena.joined_at) || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </PortalLayout>
  );
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps<CreatorProfilePageProps> = async (context) => {
  const { twitterUsername } = context.params || {};

  if (!twitterUsername || typeof twitterUsername !== 'string') {
    return {
      props: {
        creator: null,
        arenas: [],
        error: 'Invalid username',
        twitterUsername: '',
      },
    };
  }

  try {
    const supabase = createPortalClient();
    const normalizedUsername = twitterUsername.toLowerCase().trim();

    // Query arena_creators with joins
    const { data: creatorsData, error: creatorsError } = await supabase
      .from('arena_creators')
      .select(`
        id,
        twitter_username,
        arc_points,
        ring,
        style,
        created_at,
        arena_id,
        arenas!inner (
          id,
          name,
          slug,
          starts_at,
          ends_at,
          project_id,
          projects!inner (
            id,
            name,
            slug,
            x_handle
          )
        )
      `)
      .ilike('twitter_username', normalizedUsername);

    if (creatorsError) {
      console.error('[CreatorProfilePage] Supabase error:', creatorsError);
      return {
        props: {
          creator: null,
          arenas: [],
          error: 'Failed to load creator',
          twitterUsername,
        },
      };
    }

    if (!creatorsData || creatorsData.length === 0) {
      return {
        props: {
          creator: null,
          arenas: [],
          error: 'CREATOR_NOT_FOUND',
          twitterUsername,
        },
      };
    }

    // Process the data (same logic as API route)
    const arenas: CreatorArenaEntry[] = [];
    let totalPoints = 0;
    type RingKey = 'core' | 'momentum' | 'discovery';

    const ringPoints: Record<RingKey, number> = {
      core: 0,
      momentum: 0,
      discovery: 0,
    };
    let primaryRing: string | null = null;
    let primaryStyle: string | null = null;
    let maxPoints = -1;

    for (const row of creatorsData) {
      const arena = (row as any).arenas;
      const project = arena?.projects;

      if (!arena || !project) continue;

      const points = Number(row.arc_points) || 0;
      totalPoints += points;

      // Track ring points
      const rawRing = row.ring;

      if (typeof rawRing === 'string') {
        const lower = rawRing.toLowerCase();

        if (lower === 'core' || lower === 'momentum' || lower === 'discovery') {
          const key = lower as RingKey;
          ringPoints[key] += points;
        }
      }

      // Track primary ring and style from highest points arena
      if (points > maxPoints) {
        maxPoints = points;
        primaryRing = row.ring || null;
        primaryStyle = row.style || null;
      }

      arenas.push({
        arena_id: row.arena_id,
        arena_name: arena.name,
        arena_slug: arena.slug,
        project_id: arena.project_id,
        project_name: project.name,
        project_slug: project.slug || null,
        project_twitter_username: project.x_handle || null,
        ring: row.ring || null,
        arc_points: points,
        style: row.style || null,
        joined_at: row.created_at || null,
        starts_at: arena.starts_at || null,
        ends_at: arena.ends_at || null,
      });
    }

    // Get unique arena count
    const uniqueArenas = new Set(arenas.map(a => a.arena_id));
    const arenasCount = uniqueArenas.size;

    // Get the actual twitter_username from the first row
    const twitterUsernameActual = creatorsData[0]?.twitter_username || normalizedUsername;

    const creator: CreatorProfile = {
      twitter_username: twitterUsernameActual,
      primary_ring: primaryRing,
      primary_style: primaryStyle,
      total_points: totalPoints,
      arenas_count: arenasCount,
      ring_points: ringPoints,
    };

    return {
      props: {
        creator,
        arenas: arenas.sort((a, b) => b.arc_points - a.arc_points),
        error: null,
        twitterUsername,
      },
    };
  } catch (error: any) {
    console.error('[CreatorProfilePage] Error:', error);
    return {
      props: {
        creator: null,
        arenas: [],
        error: error.message || 'Internal server error',
        twitterUsername,
      },
    };
  }
};
