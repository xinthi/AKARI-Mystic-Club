/**
 * ARC Creator Profile Page
 * 
 * Shows creator profile with stats and all arenas they participate in
 */

import React, { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { createPortalClient, fetchProfileImagesForHandles } from '@/lib/portal/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getSmartFollowers, getSmartFollowersDeltas } from '@/server/smart-followers/calculate';
import { useAkariUser } from '@/lib/akari-auth';

// =============================================================================
// TYPES
// =============================================================================

interface CreatorProfile {
  twitter_username: string;
  avatar_url: string | null;
  primary_ring: string | null;
  primary_style: string | null;
  total_points: number;
  arenas_count: number;
  ring_points: {
    core: number;
    momentum: number;
    discovery: number;
  };
  smart_followers?: {
    count: number | null;
    pct: number | null;
    delta_7d: number | null;
    delta_30d: number | null;
  } | null;
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

interface DetailedStats {
  twitter_username: string;
  total_arc_points: number;
  total_arenas: number;
  total_contributions: number;
  total_mindshare: number;
  average_mindshare: number;
  total_ct_heat: number | null;
  total_noise: number | null;
  total_signal: number | null;
  total_signal_score: number | null;
  total_trust_band: string | null;
  total_smart_followers: number | null;
  smart_followers_pct: number | null;
  engagement_types: {
    threader: number;
    video: number;
    clipper: number;
    meme: number;
  };
  projects: Array<{
    project_id: string;
    project_name: string;
    project_slug: string | null;
    arena_id: string | null;
    arena_name: string | null;
    contribution_pct: number | null;
    mindshare_points: number;
    ct_heat: number | null;
    noise: number | null;
    signal: number | null;
    signal_score: number | null;
    trust_band: 'A' | 'B' | 'C' | 'D' | null;
    contributions_count: number;
  }>;
}

interface PublicStats {
  twitter_username: string;
  total_arc_points: number;
  total_arenas: number;
  total_smart_followers: number | null;
  smart_followers_pct: number | null;
  average_ct_heat: number | null;
  average_noise: number | null;
  average_signal: number | null;
  average_signal_score: number | null;
  most_common_trust_band: string | null;
  engagement_types: {
    threader: number;
    video: number;
    clipper: number;
    meme: number;
  };
}

interface CreatorProfilePageProps {
  creator: CreatorProfile | null;
  arenas: CreatorArenaEntry[];
  error: string | null;
  twitterUsername: string;
}

// =============================================================================
// HELPERS
// =============================================================================

// Helper function to normalize username (remove @ if present)
function normalizeUsername(username: string): string {
  if (!username) return '';
  return username.replace(/^@+/, ''); // Remove leading @ symbols
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function CreatorProfilePage({ creator, arenas, error, twitterUsername }: CreatorProfilePageProps) {
  const akariUser = useAkariUser();
  const [detailedStats, setDetailedStats] = useState<DetailedStats | null>(null);
  const [publicStats, setPublicStats] = useState<PublicStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingPublicStats, setLoadingPublicStats] = useState(false);

  // Circle connection state
  const [circleStatus, setCircleStatus] = useState<'none' | 'pending' | 'accepted' | 'loading'>('loading');
  const [circleId, setCircleId] = useState<string | null>(null);
  const [isAddingToCircle, setIsAddingToCircle] = useState(false);
  const [viewedCreatorProfileId, setViewedCreatorProfileId] = useState<string | null>(null);

  // Check if current user is viewing their own profile
  const normalizedViewingUsername = normalizeUsername(twitterUsername);
  const normalizedCurrentUsername = akariUser.xUsername 
    ? normalizeUsername(akariUser.xUsername) 
    : null;
  const isOwner = normalizedCurrentUsername && 
    normalizedCurrentUsername.toLowerCase() === normalizedViewingUsername.toLowerCase();

  // Fetch detailed stats if owner
  useEffect(() => {
    if (isOwner && creator && !detailedStats && !loadingStats) {
      setLoadingStats(true);
      fetch(`/api/portal/arc/creator/${encodeURIComponent(twitterUsername)}/detailed-stats`, {
        credentials: 'include',
      })
        .then(res => res.json())
        .then(data => {
          if (data.ok && data.stats) {
            setDetailedStats(data.stats);
          }
        })
        .catch(err => {
          console.error('[CreatorProfile] Error fetching detailed stats:', err);
        })
        .finally(() => {
          setLoadingStats(false);
        });
    }
  }, [isOwner, creator, twitterUsername, detailedStats, loadingStats]);

  // Fetch public stats if not owner
  useEffect(() => {
    if (!isOwner && creator && !publicStats && !loadingPublicStats) {
      setLoadingPublicStats(true);
      fetch(`/api/portal/arc/creator/${encodeURIComponent(twitterUsername)}/public-stats`, {
        credentials: 'include',
      })
        .then(res => res.json())
        .then(data => {
          if (data.ok && data.stats) {
            setPublicStats(data.stats);
          }
        })
        .catch(err => {
          console.error('[CreatorProfile] Error fetching public stats:', err);
        })
        .finally(() => {
          setLoadingPublicStats(false);
        });
    }
  }, [isOwner, creator, twitterUsername, publicStats, loadingPublicStats]);

  // Fetch creator profile ID and check circle connection status
  useEffect(() => {
    if (isOwner || !akariUser.isLoggedIn || !creator) {
      setCircleStatus('none');
      return;
    }

    // Get creator profile ID from creator data
    const fetchCreatorProfileId = async () => {
      try {
        const res = await fetch(`/api/portal/arc/creator/${encodeURIComponent(twitterUsername)}/public-stats`, {
          credentials: 'include',
        });
        const data = await res.json();
        
        if (data.ok && data.stats) {
          // We need to get the profile ID - let's fetch it from the circles API
          const circlesRes = await fetch('/api/portal/creator-circles', {
            credentials: 'include',
          });
          const circlesData = await circlesRes.json();
          
          if (circlesData.ok) {
            // Find if there's a connection with this creator
            const connection = circlesData.circles.find((c: any) => {
              const otherProfile = c.creator_profile_id === viewedCreatorProfileId 
                ? c.circle_member_profile_id 
                : c.circle_member_profile_id === viewedCreatorProfileId
                ? c.creator_profile_id
                : null;
              
              // We need to match by username since we don't have profile ID yet
              // For now, let's check the connection status differently
              return false; // We'll update this after getting profile ID
            });
            
            if (connection) {
              setCircleStatus(connection.status === 'accepted' ? 'accepted' : 'pending');
              setCircleId(connection.id);
            } else {
              setCircleStatus('none');
            }
          }
        }
      } catch (err) {
        console.error('[CreatorProfile] Error checking circle status:', err);
        setCircleStatus('none');
      }
    };

    // Get profile ID from username
    const getProfileIdFromUsername = async () => {
      try {
        const supabase = createPortalClient();
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', normalizedViewingUsername)
          .single();
        
        if (profile) {
          setViewedCreatorProfileId(profile.id);
          
          // Now check circle status
          const circlesRes = await fetch('/api/portal/creator-circles', {
            credentials: 'include',
          });
          const circlesData = await circlesRes.json();
          
          if (circlesData.ok) {
            const connection = circlesData.circles.find((c: any) => 
              c.creator_profile_id === profile.id || c.circle_member_profile_id === profile.id
            );
            
            if (connection) {
              setCircleStatus(connection.status === 'accepted' ? 'accepted' : 'pending');
              setCircleId(connection.id);
            } else {
              setCircleStatus('none');
            }
          } else {
            setCircleStatus('none');
          }
        } else {
          setCircleStatus('none');
        }
      } catch (err) {
        console.error('[CreatorProfile] Error fetching profile ID:', err);
        setCircleStatus('none');
      }
    };

    getProfileIdFromUsername();
  }, [isOwner, akariUser.isLoggedIn, creator, twitterUsername, normalizedViewingUsername, viewedCreatorProfileId]);

  // Handle adding to circle
  const handleAddToCircle = async () => {
    if (!viewedCreatorProfileId || isAddingToCircle) return;

    setIsAddingToCircle(true);
    try {
      const res = await fetch('/api/portal/creator-circles/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          creatorProfileId: viewedCreatorProfileId,
        }),
      });

      const data = await res.json();
      
      if (data.ok) {
        setCircleStatus('pending');
        setCircleId(data.circle.id);
      } else {
        alert(data.error || 'Failed to add to network');
      }
    } catch (err) {
      console.error('[CreatorProfile] Error adding to circle:', err);
      alert('Failed to add to network. Please try again.');
    } finally {
      setIsAddingToCircle(false);
    }
  };
  // Helper function to get ring badge color
  const getRingColor = (ring: string | null) => {
    if (!ring) return 'bg-white/10 border-white/20 text-white/60';
    
    switch (ring.toLowerCase()) {
      case 'core':
        return 'bg-purple-500/20 border-purple-500/40 text-purple-300';
      case 'momentum':
        return 'bg-blue-500/20 border-blue-500/40 text-blue-300';
      case 'discovery':
        return 'bg-green-500/20 border-green-500/40 text-green-300';
      default:
        return 'bg-white/10 border-white/20 text-white/60';
    }
  };

  // Helper function to get avatar/initial for creator
  const getCreatorAvatar = (username: string, avatarUrl: string | null = null, size: 'small' | 'large' = 'small') => {
    if (!username) return null;
    const normalizedUsername = normalizeUsername(username);
    const firstLetter = normalizedUsername.charAt(0).toUpperCase();
    const sizeClasses = size === 'large' ? 'w-16 h-16 text-xl' : 'w-8 h-8 text-sm';
    
    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt={normalizedUsername}
          className={`flex-shrink-0 ${sizeClasses} rounded-full border border-white/10 object-cover`}
        />
      );
    }
    
    return (
      <div className={`flex-shrink-0 ${sizeClasses} rounded-full bg-white/10 border border-white/20 flex items-center justify-center font-semibold text-white`}>
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

    const normalizedUsername = normalizeUsername(creator.twitter_username);

    if (creator.arenas_count === 0) {
      return `@${normalizedUsername} has not joined any ARC arenas yet.`;
    }

    const parts: string[] = [];
    
    // Main summary
    const ringText = creator.primary_ring
      ? creator.primary_ring.charAt(0).toUpperCase() + creator.primary_ring.slice(1)
      : 'creator';
    const arenaText = creator.arenas_count === 1 ? 'arena' : 'arenas';
    parts.push(`@${normalizedUsername} is a ${ringText} creator with ${creator.total_points.toLocaleString()} ARC points across ${creator.arenas_count} ${arenaText}.`);

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
    <ArcPageShell>
      <div className="space-y-6">
        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link
            href="/portal/arc"
            className="hover:text-white transition-colors"
          >
            ARC Home
          </Link>
          <span>/</span>
          <Link
            href="/portal/arc"
            className="hover:text-white transition-colors"
          >
            Creator
          </Link>
          <span>/</span>
          <span className="text-white">@{twitterUsername}</span>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-400">
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
                  {getCreatorAvatar(creator.twitter_username, creator.avatar_url, 'large')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h1 className="text-3xl font-bold text-akari-text">
                      @{normalizeUsername(creator.twitter_username)}
                    </h1>
                    {/* Add to Network Button */}
                    {!isOwner && akariUser.isLoggedIn && (
                      <div className="flex-shrink-0">
                        {circleStatus === 'loading' ? (
                          <button
                            disabled
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-white/60 border border-white/10 cursor-not-allowed"
                          >
                            Loading...
                          </button>
                        ) : circleStatus === 'accepted' ? (
                          <button
                            disabled
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-500/20 text-green-300 border border-green-500/40 cursor-default"
                          >
                            ✓ Connected
                          </button>
                        ) : circleStatus === 'pending' ? (
                          <button
                            disabled
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 cursor-default"
                          >
                            Request Pending
                          </button>
                        ) : (
                          <button
                            onClick={handleAddToCircle}
                            disabled={isAddingToCircle}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-akari-primary text-black hover:bg-akari-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isAddingToCircle ? 'Adding...' : '+ Add to Network'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
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

              {/* Smart Followers */}
              {creator.smart_followers && creator.smart_followers.count !== null && (
                <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                  <p className="text-xs text-akari-muted mb-1">Smart Followers</p>
                  <p className="text-2xl font-bold text-akari-text mb-1">
                    {creator.smart_followers.count.toLocaleString()}
                  </p>
                  {creator.smart_followers.pct !== null && (
                    <p className="text-xs text-akari-muted mb-2">{creator.smart_followers.pct.toFixed(1)}% of total</p>
                  )}
                  {(creator.smart_followers.delta_7d !== null || creator.smart_followers.delta_30d !== null) && (
                    <div className="flex gap-3 text-xs">
                      {creator.smart_followers.delta_7d !== null && (
                        <span className={creator.smart_followers.delta_7d > 0 ? 'text-green-400' : creator.smart_followers.delta_7d < 0 ? 'text-red-400' : 'text-akari-muted'}>
                          7d: {creator.smart_followers.delta_7d > 0 ? '+' : ''}{creator.smart_followers.delta_7d.toLocaleString()}
                        </span>
                      )}
                      {creator.smart_followers.delta_30d !== null && (
                        <span className={creator.smart_followers.delta_30d > 0 ? 'text-green-400' : creator.smart_followers.delta_30d < 0 ? 'text-red-400' : 'text-akari-muted'}>
                          30d: {creator.smart_followers.delta_30d > 0 ? '+' : ''}{creator.smart_followers.delta_30d.toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

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

            {/* Owner View: Detailed Stats */}
            {isOwner && (
              <>
                {loadingStats ? (
                  <div className="rounded-xl border border-slate-700 p-6 bg-akari-card text-center">
                    <p className="text-sm text-akari-muted">Loading detailed stats...</p>
                  </div>
                ) : detailedStats ? (
                  <>
                    {/* Detailed Stats Section */}
                    <section>
                      <h2 className="text-xl font-semibold text-akari-text mb-4">Your Detailed Stats</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Total Contributions */}
                        <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                          <p className="text-xs text-akari-muted mb-1">Total Contributions</p>
                          <p className="text-2xl font-bold text-akari-text">
                            {detailedStats.total_contributions.toLocaleString()}
                          </p>
                        </div>

                        {/* Total Mindshare */}
                        <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                          <p className="text-xs text-akari-muted mb-1">Total Mindshare</p>
                          <p className="text-2xl font-bold text-akari-text">
                            {detailedStats.total_mindshare.toLocaleString()}
                          </p>
                        </div>

                        {/* Average Mindshare */}
                        <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                          <p className="text-xs text-akari-muted mb-1">Avg Mindshare per Project</p>
                          <p className="text-2xl font-bold text-akari-text">
                            {detailedStats.average_mindshare.toFixed(0)}
                          </p>
                        </div>

                        {/* CT Heat */}
                        {detailedStats.total_ct_heat !== null && (
                          <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                            <p className="text-xs text-akari-muted mb-1">CT Heat</p>
                            <p className="text-2xl font-bold text-akari-text">
                              {detailedStats.total_ct_heat.toFixed(1)}
                            </p>
                          </div>
                        )}

                        {/* Noise */}
                        {detailedStats.total_noise !== null && (
                          <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                            <p className="text-xs text-akari-muted mb-1">Noise</p>
                            <p className="text-2xl font-bold text-akari-text">
                              {detailedStats.total_noise.toFixed(1)}
                            </p>
                          </div>
                        )}

                        {/* Signal */}
                        {detailedStats.total_signal !== null && (
                          <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                            <p className="text-xs text-akari-muted mb-1">Signal</p>
                            <p className="text-2xl font-bold text-akari-text">
                              {detailedStats.total_signal.toFixed(1)}
                            </p>
                          </div>
                        )}

                        {/* Signal Score */}
                        {detailedStats.total_signal_score !== null && (
                          <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                            <p className="text-xs text-akari-muted mb-1">Signal Score</p>
                            <p className="text-2xl font-bold text-akari-text">
                              {detailedStats.total_signal_score.toFixed(1)}
                            </p>
                          </div>
                        )}

                        {/* Trust Band */}
                        {detailedStats.total_trust_band && (
                          <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                            <p className="text-xs text-akari-muted mb-1">Trust Band</p>
                            <p className="text-2xl font-bold text-akari-text">
                              {detailedStats.total_trust_band}
                            </p>
                          </div>
                        )}

                        {/* Engagement Types */}
                        <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                          <p className="text-xs text-akari-muted mb-2">Engagement Types</p>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-akari-muted">Threader:</span>
                              <span className="text-akari-text font-medium">{detailedStats.engagement_types.threader}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-akari-muted">Video:</span>
                              <span className="text-akari-text font-medium">{detailedStats.engagement_types.video}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-akari-muted">Clipper:</span>
                              <span className="text-akari-text font-medium">{detailedStats.engagement_types.clipper}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-akari-muted">Meme:</span>
                              <span className="text-akari-text font-medium">{detailedStats.engagement_types.meme}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Project Breakdown */}
                    {detailedStats.projects.length > 0 && (
                      <section>
                        <h2 className="text-xl font-semibold text-akari-text mb-4">Project Breakdown</h2>
                        <div className="rounded-xl border border-slate-700 bg-akari-card overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead className="bg-akari-cardSoft/30 border-b border-akari-border/30">
                                <tr>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Project</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Contributions</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Mindshare</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Contribution %</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">CT Heat</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Signal Score</th>
                                  <th className="px-4 py-3 text-left text-xs font-medium text-akari-muted">Trust</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-akari-border/30">
                                {detailedStats.projects.map((project) => (
                                  <tr key={project.project_id} className="hover:bg-akari-cardSoft/20 transition-colors">
                                    <td className="px-4 py-3 text-sm text-akari-text">
                                      {project.project_slug ? (
                                        <Link
                                          href={`/portal/arc/${project.project_slug}`}
                                          className="font-medium text-akari-primary hover:text-akari-neon-teal transition-colors"
                                        >
                                          {project.project_name}
                                        </Link>
                                      ) : (
                                        <span className="font-medium">{project.project_name}</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-akari-text">
                                      {project.contributions_count.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-akari-text">
                                      {project.mindshare_points.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-akari-text">
                                      {project.contribution_pct !== null 
                                        ? `${project.contribution_pct.toFixed(2)}%`
                                        : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-akari-text">
                                      {project.ct_heat !== null ? project.ct_heat.toFixed(1) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-akari-text">
                                      {project.signal_score !== null ? project.signal_score.toFixed(1) : '—'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-akari-text">
                                      {project.trust_band || '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </section>
                    )}
                  </>
                ) : null}
              </>
            )}

            {/* Public View: Basic Stats */}
            {!isOwner && (
              <section>
                <h2 className="text-xl font-semibold text-akari-text mb-4">Public Stats</h2>
                {loadingPublicStats ? (
                  <div className="rounded-xl border border-slate-700 p-6 bg-akari-card text-center">
                    <p className="text-sm text-akari-muted">Loading stats...</p>
                  </div>
                ) : publicStats ? (
                  <div className="rounded-xl border border-slate-700 p-4 sm:p-6 bg-akari-card">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                        <p className="text-xs text-akari-muted mb-1">Total ARC Points</p>
                        <p className="text-lg font-semibold text-akari-text">{publicStats.total_arc_points.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                        <p className="text-xs text-akari-muted mb-1">Arenas Joined</p>
                        <p className="text-lg font-semibold text-akari-text">{publicStats.total_arenas}</p>
                      </div>
                      {publicStats.total_smart_followers !== null && (
                        <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                          <p className="text-xs text-akari-muted mb-1">Smart Followers</p>
                          <p className="text-lg font-semibold text-akari-text">
                            {publicStats.total_smart_followers.toLocaleString()}
                            {publicStats.smart_followers_pct !== null && (
                              <span className="text-xs text-akari-muted ml-1">({publicStats.smart_followers_pct.toFixed(1)}%)</span>
                            )}
                          </p>
                        </div>
                      )}
                      {publicStats.average_ct_heat !== null && (
                        <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                          <p className="text-xs text-akari-muted mb-1">CT Heat</p>
                          <p className="text-lg font-semibold text-akari-text">{publicStats.average_ct_heat.toFixed(1)}</p>
                        </div>
                      )}
                      {publicStats.average_noise !== null && (
                        <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                          <p className="text-xs text-akari-muted mb-1">Noise</p>
                          <p className="text-lg font-semibold text-akari-text">{publicStats.average_noise.toFixed(1)}</p>
                        </div>
                      )}
                      {publicStats.average_signal !== null && (
                        <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                          <p className="text-xs text-akari-muted mb-1">Signal</p>
                          <p className="text-lg font-semibold text-akari-text">{publicStats.average_signal.toFixed(1)}</p>
                        </div>
                      )}
                      {publicStats.average_signal_score !== null && (
                        <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                          <p className="text-xs text-akari-muted mb-1">Signal Score</p>
                          <p className="text-lg font-semibold text-akari-text">{publicStats.average_signal_score.toFixed(1)}</p>
                        </div>
                      )}
                      {publicStats.most_common_trust_band && (
                        <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                          <p className="text-xs text-akari-muted mb-1">Trust Band</p>
                          <p className="text-lg font-semibold text-akari-text">{publicStats.most_common_trust_band}</p>
                        </div>
                      )}
                      <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                        <p className="text-xs text-akari-muted mb-2">Engagement Types</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-akari-muted">Threader:</span>
                            <span className="text-akari-text font-medium">{publicStats.engagement_types.threader}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-akari-muted">Video:</span>
                            <span className="text-akari-text font-medium">{publicStats.engagement_types.video}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-akari-muted">Clipper:</span>
                            <span className="text-akari-text font-medium">{publicStats.engagement_types.clipper}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-akari-muted">Meme:</span>
                            <span className="text-akari-text font-medium">{publicStats.engagement_types.meme}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-700 p-4 sm:p-6 bg-akari-card">
                    <p className="text-sm text-akari-muted mb-4">
                      Viewing basic public information. Log in as this creator to see detailed stats including all contributions, mindshare breakdown, and engagement metrics.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                        <p className="text-xs text-akari-muted mb-1">Total ARC Points</p>
                        <p className="text-lg font-semibold text-akari-text">{creator.total_points.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                        <p className="text-xs text-akari-muted mb-1">Arenas Joined</p>
                        <p className="text-lg font-semibold text-akari-text">{creator.arenas_count}</p>
                      </div>
                      {creator.smart_followers && creator.smart_followers.count !== null && (
                        <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                          <p className="text-xs text-akari-muted mb-1">Smart Followers</p>
                          <p className="text-lg font-semibold text-akari-text">
                            {creator.smart_followers.count.toLocaleString()}
                            {creator.smart_followers.pct !== null && (
                              <span className="text-xs text-akari-muted ml-1">({creator.smart_followers.pct.toFixed(1)}%)</span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Detailed Metrics Section - Only show for public view */}
            {!isOwner && (
              <section>
                <h2 className="text-xl font-semibold text-akari-text mb-4">Detailed Metrics</h2>
                <div className="rounded-xl border border-slate-700 p-4 sm:p-6 bg-akari-card">
                  <p className="text-sm text-akari-muted mb-4">
                    These metrics are calculated per project and available in individual arena leaderboards. 
                    Visit each arena&apos;s leaderboard to see detailed Signal, Noise, CT Heat, Engagement, Signal Score, and Trust Band metrics.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                      <p className="text-xs text-akari-muted mb-1">Signal</p>
                      <p className="text-sm text-akari-text">View in arena leaderboards</p>
                    </div>
                    <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                      <p className="text-xs text-akari-muted mb-1">Noise</p>
                      <p className="text-sm text-akari-text">View in arena leaderboards</p>
                    </div>
                    <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                      <p className="text-xs text-akari-muted mb-1">CT Heat</p>
                      <p className="text-sm text-akari-text">View in arena leaderboards</p>
                    </div>
                    <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                      <p className="text-xs text-akari-muted mb-1">Engagement Types</p>
                      <p className="text-sm text-akari-text">View in arena leaderboards</p>
                    </div>
                    <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                      <p className="text-xs text-akari-muted mb-1">Signal Score</p>
                      <p className="text-sm text-akari-text">View in arena leaderboards</p>
                    </div>
                    <div className="rounded-lg border border-slate-600/50 p-3 bg-akari-cardSoft/30">
                      <p className="text-xs text-akari-muted mb-1">Trust Band</p>
                      <p className="text-sm text-akari-text">View in arena leaderboards</p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Narrative Summary Section */}
            {creator && (
              <section>
                <h2 className="text-xl font-semibold text-akari-text mb-4">Narrative Summary</h2>
                <div className="rounded-xl border border-slate-700 p-4 bg-akari-card">
                  <p className="text-sm text-akari-muted leading-relaxed">
                    {creatorNarrativeSummary || `@${normalizeUsername(creator.twitter_username)} has not joined any ARC arenas yet.`}
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
                                {formatDate(arena.joined_at) || 'N/A'}
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
    </ArcPageShell>
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

    // Query arena_creators with joins (removed profiles join - will fetch separately for consistency)
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
        profile_id,
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

    // Get the actual twitter_username and avatar from the first row
    const firstRow = creatorsData[0];
    const twitterUsernameActual = firstRow?.twitter_username || normalizedUsername;
    
    // Fetch profile image using the helper function for consistent fetching
    let avatarUrl: string | null = null;
    try {
      const supabaseAdmin = getSupabaseAdmin();
      const cleanUsername = twitterUsernameActual.replace(/^@+/, '').toLowerCase();
      const { profilesMap, akariUsersMap } = await fetchProfileImagesForHandles(supabaseAdmin, [cleanUsername]);
      // akariUsersMap takes precedence if both exist
      avatarUrl = akariUsersMap.get(cleanUsername) || profilesMap.get(cleanUsername) || null;
    } catch (error) {
      console.error('[CreatorProfilePage] Error fetching profile image:', error);
      // Continue without avatar - will show placeholder
    }

    // Calculate Smart Followers for the creator
    let smartFollowersData: {
      count: number | null;
      pct: number | null;
      delta_7d: number | null;
      delta_30d: number | null;
    } | null = null;

    try {
      const supabaseAdmin = getSupabaseAdmin();
      const cleanUsername = twitterUsernameActual.replace('@', '').toLowerCase().trim();
      let xUserId: string | null = null;

      // Try to get x_user_id from profiles or tracked_profiles
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('twitter_id')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (profile?.twitter_id) {
        xUserId = profile.twitter_id;
      } else {
        const { data: tracked } = await supabaseAdmin
          .from('tracked_profiles')
          .select('x_user_id')
          .eq('username', cleanUsername)
          .maybeSingle();

        xUserId = tracked?.x_user_id || null;
      }

      if (xUserId) {
        const smartFollowersResult = await getSmartFollowers(
          supabaseAdmin,
          'creator',
          xUserId, // entityId for creator is x_user_id
          xUserId,
          new Date()
        );
        const deltas = await getSmartFollowersDeltas(
          supabaseAdmin,
          'creator',
          xUserId, // entityId for creator is x_user_id
          xUserId
        );

        smartFollowersData = {
          count: smartFollowersResult.smart_followers_count,
          pct: smartFollowersResult.smart_followers_pct,
          delta_7d: deltas.delta_7d,
          delta_30d: deltas.delta_30d,
        };
      }
    } catch (error) {
      console.error('[CreatorProfilePage] Error calculating smart followers:', error);
      // Continue with null
    }

    const creator: CreatorProfile = {
      twitter_username: twitterUsernameActual,
      avatar_url: avatarUrl,
      primary_ring: primaryRing,
      primary_style: primaryStyle,
      total_points: totalPoints,
      arenas_count: arenasCount,
      ring_points: ringPoints,
      smart_followers: smartFollowersData,
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
