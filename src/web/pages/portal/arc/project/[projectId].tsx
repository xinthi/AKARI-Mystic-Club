/**
 * ARC Project Page (v1)
 * 
 * Project detail page for ARC projects with leaderboard or gamified access levels
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { getArcFeatureName, getArcFeatureDescription } from '@/lib/arc-naming';

// =============================================================================
// TYPES
// =============================================================================

interface Project {
  id: string;
  name: string;
  display_name: string | null;
  twitter_username: string | null;
  x_handle: string | null;
  avatar_url: string | null;
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active: boolean;
  slug: string | null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getTierLabel(arcAccessLevel: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | undefined | null): string {
  switch (arcAccessLevel) {
    case 'gamified':
      return 'Gamified';
    case 'leaderboard':
      return 'Leaderboard';
    case 'creator_manager':
      return 'Creator Manager';
    case 'none':
    default:
      return 'None';
  }
}

function getTierBadgeColor(arcAccessLevel: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | undefined | null): string {
  switch (arcAccessLevel) {
    case 'gamified':
      return 'bg-purple-500/20 text-purple-400 border-purple-500/50';
    case 'leaderboard':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
    case 'creator_manager':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
    case 'none':
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
  }
}

function getStatusBadgeColor(arcActive: boolean | undefined | null): string {
  if (arcActive === true) {
    return 'bg-green-500/20 text-green-400 border-green-500/50';
  }
  return 'bg-gray-500/20 text-gray-400 border-gray-500/50';
}

// =============================================================================
// COMPONENT
// =============================================================================

interface LeaderboardRequest {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  justification: string | null;
  requested_arc_access_level?: 'creator_manager' | 'leaderboard' | 'gamified' | null;
  created_at: string;
}

interface LeaderboardEntry {
  twitter_username: string;
  avatar_url: string | null;
  rank: number;
  base_points: number;
  multiplier: number;
  score: number;
  is_joined: boolean;
  is_auto_tracked: boolean;
  follow_verified: boolean;
  ring: 'core' | 'momentum' | 'discovery' | null;
  joined_at: string | null;
}

export default function ArcProjectPage() {
  const router = useRouter();
  const { projectId } = router.query;
  const akariUser = useAkariUser();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [existingRequest, setExistingRequest] = useState<LeaderboardRequest | null>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [justification, setJustification] = useState('');
  const [selectedAccessLevel, setSelectedAccessLevel] = useState<'creator_manager' | 'leaderboard' | 'gamified'>('leaderboard');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [canRequest, setCanRequest] = useState<boolean | null>(null); // null = checking, true/false = result
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [followVerified, setFollowVerified] = useState<boolean | null>(null);
  const [checkingFollow, setCheckingFollow] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Fetch project by ID or slug
  useEffect(() => {
    async function fetchProject() {
      if (!projectId || typeof projectId !== 'string') {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch project via API route instead of direct Supabase call
        const res = await fetch(`/api/portal/arc/project/${projectId}`, {
          credentials: 'include',
        });
        
        // Check content type
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.error('[ArcProjectPage] Response is not JSON:', contentType);
          setError('Server returned invalid response. Please refresh the page.');
          setLoading(false);
          return;
        }

        const data = await res.json();

        if (!res.ok || !data.ok) {
          setError(data.error || 'Failed to load project');
          setLoading(false);
          return;
        }

        if (data.project) {
          setProject(data.project as Project);
        } else {
          setError('Project not found');
        }
      } catch (err: any) {
        // Never crash - show error state instead
        console.error('[ArcProjectPage] Fetch error:', err);
        setError('Failed to load project');
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
  }, [projectId]);

  // Check if user can request leaderboard (founder/admin/mod only)
  useEffect(() => {
    async function checkCanRequest() {
      if (!project || !akariUser.isLoggedIn) {
        setCanRequest(false);
        return;
      }

      try {
        const res = await fetch(`/api/portal/arc/check-leaderboard-permission?projectId=${project.id}`, {
          credentials: 'include',
        });
        
        if (!res.ok) {
          setCanRequest(false);
          return;
        }

        const data = await res.json();
        if (data.ok) {
          setCanRequest(data.canRequest);
        } else {
          setCanRequest(false);
        }
      } catch (err) {
        console.debug('[ArcProjectPage] Could not check permission:', err);
        setCanRequest(false);
      }
    }

    checkCanRequest();
  }, [project, akariUser.isLoggedIn]);

  // Fetch existing request if project is not enabled
  useEffect(() => {
    async function fetchExistingRequest() {
      // Only fetch if user is logged in and can request
      if (!project || !akariUser.isLoggedIn || canRequest === false) {
        return;
      }

      const arcAccessLevel = project.arc_access_level || 'none';
      const arcActive = project.arc_active ?? false;

      // Only check for requests if project is not enabled
      if (arcAccessLevel === 'none' || !arcActive) {
        try {
          const res = await fetch(`/api/portal/arc/leaderboard-requests?projectId=${project.id}`, {
            credentials: 'include',
          });
          
          // If not authenticated or forbidden, silently return
          if (res.status === 401 || res.status === 403) {
            return;
          }

          const data = await res.json();

          if (data.ok && data.request) {
            setExistingRequest({
              id: data.request.id,
              status: data.request.status,
              justification: data.request.justification,
              requested_arc_access_level: data.request.requested_arc_access_level || null,
              created_at: data.request.created_at,
            });
          }
        } catch (err) {
          // Silently fail - not critical
          console.debug('[ArcProjectPage] Could not fetch existing request:', err);
        }
      }
    }

    if (canRequest !== null) {
      fetchExistingRequest();
    }
  }, [project, akariUser.isLoggedIn, canRequest]);

  // Fetch leaderboard if project has leaderboard/gamified access
  useEffect(() => {
    async function fetchLeaderboard() {
      if (!project) return;

      const arcAccessLevel = project.arc_access_level || 'none';
      if (arcAccessLevel !== 'leaderboard' && arcAccessLevel !== 'gamified') {
        return;
      }

      setLeaderboardLoading(true);
      setLeaderboardError(null);

      try {
        // Use the new arena-based leaderboard endpoint
        const res = await fetch(`/api/portal/arc/leaderboard/${project.id}`, {
          credentials: 'include',
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to load leaderboard');
        }

        // Use entries directly (already in correct format)
        setLeaderboardEntries(data.entries || []);
      } catch (err: any) {
        console.error('[ArcProjectPage] Leaderboard fetch error:', err);
        setLeaderboardError(err.message || 'Failed to load leaderboard');
      } finally {
        setLeaderboardLoading(false);
      }
    }

    fetchLeaderboard();
  }, [project]);

  // Check follow status for Mindshare Leaderboard
  useEffect(() => {
    async function checkFollowStatus() {
      if (!project || !akariUser.isLoggedIn) {
        setFollowVerified(false);
        return;
      }

      const arcAccessLevel = project.arc_access_level || 'none';
      if (arcAccessLevel !== 'leaderboard') {
        return; // Only for Mindshare Leaderboard
      }

      try {
        const res = await fetch(`/api/portal/arc/follow-status?projectId=${project.id}`, {
          credentials: 'include',
        });
        const data = await res.json();

        if (res.ok && data.ok) {
          setFollowVerified(data.verified || false);
        } else {
          setFollowVerified(false);
        }
      } catch (err) {
        console.debug('[ArcProjectPage] Could not check follow status:', err);
        setFollowVerified(false);
      }
    }

    if (project && akariUser.isLoggedIn) {
      checkFollowStatus();
    }
  }, [project, akariUser.isLoggedIn]);

  // Handle verify follow
  const handleVerifyFollow = async () => {
    if (!project || checkingFollow) return;

    setCheckingFollow(true);
    setJoinError(null);

    try {
      const res = await fetch('/api/portal/arc/verify-follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId: project.id }),
      });

      const data = await res.json();

      if (res.ok && data.ok && data.verified) {
        setFollowVerified(true);
      } else {
        setJoinError(data.error || 'Follow verification failed. Please make sure you follow the project on X.');
      }
    } catch (err: any) {
      setJoinError(err.message || 'Failed to verify follow');
    } finally {
      setCheckingFollow(false);
    }
  };

  // Handle join leaderboard
  const handleJoinLeaderboard = async () => {
    if (!project || joining || !followVerified) return;

    setJoining(true);
    setJoinError(null);

    try {
      const res = await fetch('/api/portal/arc/join-leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId: project.id }),
      });

      const data = await res.json();

      if (res.ok && data.ok) {
        // Reload leaderboard to show new entry
        window.location.reload();
      } else {
        setJoinError(data.error || 'Failed to join leaderboard');
      }
    } catch (err: any) {
      setJoinError(err.message || 'Failed to join leaderboard');
    } finally {
      setJoining(false);
    }
  };

  // Filter leaderboard by search query
  const filteredLeaderboard = useMemo(() => {
    if (!searchQuery.trim()) {
      return leaderboardEntries;
    }

    const query = searchQuery.toLowerCase().trim();
    return leaderboardEntries.filter((entry) =>
      entry.twitter_username.toLowerCase().includes(query)
    );
  }, [leaderboardEntries, searchQuery]);

  // Handle request submission
  const handleSubmitRequest = async () => {
    if (!project || requestLoading) return;

    setRequestLoading(true);
    setRequestError(null);

    try {
      const res = await fetch('/api/portal/arc/leaderboard-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectId: project.id,
          justification: justification.trim() || null,
          requested_arc_access_level: selectedAccessLevel,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }

      // Update state to show request was submitted
      setExistingRequest({
        id: data.requestId,
        status: data.status === 'existing' ? 'pending' : 'pending',
        justification: justification.trim() || null,
        requested_arc_access_level: selectedAccessLevel,
        created_at: new Date().toISOString(),
      });
      setShowRequestForm(false);
      setJustification('');
      setSelectedAccessLevel('leaderboard');
    } catch (err: any) {
      setRequestError(err.message || 'Failed to submit request');
    } finally {
      setRequestLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <PortalLayout title="ARC Project">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-4" />
            <p className="text-akari-muted">Loading project...</p>
          </div>
        </div>
      </PortalLayout>
    );
  }

  // Render page even if project not found - show error message but don't crash
  // This ensures the page never errors if data is missing

  // Safe data access - never error if data missing
  const displayName = project?.display_name || project?.name || 'Unknown Project';
  const twitterHandle = project?.twitter_username || project?.x_handle || null;
  const arcAccessLevel = project?.arc_access_level || 'none';
  const arcActive = project?.arc_active ?? false;
  const tierLabel = getTierLabel(arcAccessLevel);
  const tierBadgeColor = getTierBadgeColor(arcAccessLevel);
  const statusBadgeColor = getStatusBadgeColor(arcActive);
  const statusLabel = arcActive ? 'Active' : 'Inactive';

  return (
    <PortalLayout title={displayName}>
      <div className="space-y-6">
        {/* Error Message (if any) */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-red-400 text-sm">{error}</p>
            <Link
              href="/portal/arc"
              className="text-red-400 hover:text-red-300 text-sm underline mt-2 inline-block"
            >
              Back to ARC Home
            </Link>
          </div>
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link href="/portal/arc" className="hover:text-akari-primary transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <span className="text-white/80">Project</span>
          <span>/</span>
          <span className="text-white/80">{displayName}</span>
        </div>

        {/* Project Header */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <div className="flex items-start gap-4">
            {project?.avatar_url && (
              <img
                src={project.avatar_url}
                alt={displayName}
                className="w-16 h-16 rounded-full border-2 border-white/10 flex-shrink-0"
                onError={(e) => {
                  // Hide image if it fails to load
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold text-white mb-2">{displayName}</h1>
              {twitterHandle && (
                <p className="text-white/60 mb-4">@{twitterHandle}</p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                {/* ARC Tier Badge */}
                <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${tierBadgeColor}`}>
                  {tierLabel}
                </span>
                {/* Active/Inactive Status Badge */}
                <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${statusBadgeColor}`}>
                  {statusLabel}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Overview Section */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Overview</h2>
          <p className="text-white/70">
            This project participates in the AKARI ARC InfluenceFi system.
          </p>
        </div>

        {/* Access Section */}
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Access</h2>
          {arcAccessLevel === 'creator_manager' ? (
            <div className="space-y-4">
              <p className="text-white/70 mb-4">
                This project uses Creator Manager for campaign management.
              </p>
              <Link
                href={`/portal/arc/creator-manager?projectId=${project?.slug || project?.id || projectId || ''}`}
                className="inline-flex items-center px-4 py-2 bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors font-medium"
              >
                View Creator Manager
              </Link>
            </div>
          ) : arcAccessLevel === 'leaderboard' || arcAccessLevel === 'gamified' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Leaderboard</h3>
                {/* Join CTA - Only for Mindshare Leaderboard and normal users */}
                {arcAccessLevel === 'leaderboard' && akariUser.isLoggedIn && (
                  <div className="flex items-center gap-2">
                    {followVerified === false && (
                      <button
                        onClick={handleVerifyFollow}
                        disabled={checkingFollow}
                        className="px-4 py-2 bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {checkingFollow ? 'Verifying...' : 'Verify Follow'}
                      </button>
                    )}
                    {followVerified === true && (
                      <button
                        onClick={handleJoinLeaderboard}
                        disabled={joining}
                        className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/50 rounded-lg hover:bg-green-500/30 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {joining ? 'Joining...' : 'Join Leaderboard'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {joinError && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 mb-4">
                  <p className="text-red-400 text-sm">{joinError}</p>
                </div>
              )}

              {/* Search */}
              <div className="mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by handle..."
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                />
              </div>

              {/* Leaderboard Table */}
              {/* Auto-tracking Banner */}
              {filteredLeaderboard.length > 0 && (
                <div className="rounded-lg border border-akari-neon-teal/30 bg-akari-neon-teal/10 p-4 mb-4">
                  <p className="text-sm text-white/90">
                    We auto-track public CT signal. Join and follow to boost your points.
                  </p>
                </div>
              )}

              {leaderboardLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                  <span className="ml-3 text-white/60">Loading leaderboard...</span>
                </div>
              ) : leaderboardError ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                  <p className="text-red-400 text-sm">{leaderboardError}</p>
                </div>
              ) : filteredLeaderboard.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-black/20 p-8 text-center">
                  <div className="text-4xl mb-4">📊</div>
                  <h3 className="text-lg font-semibold text-white mb-2">No creators yet</h3>
                  <p className="text-white/60 text-sm">
                    Creators who generate signal will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl overflow-hidden shadow-[0_0_30px_rgba(0,246,162,0.1)]">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5">
                          <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-teal">Rank</th>
                          <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-gradient-teal">Creator</th>
                          <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Base Points</th>
                          <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Multiplier</th>
                          <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Score</th>
                          <th className="text-left py-4 px-5 text-xs uppercase tracking-wider font-semibold text-akari-muted">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLeaderboard.map((entry) => {
                          const userIsThisEntry = akariUser.isLoggedIn && 
                            akariUser.user?.xUsername?.toLowerCase().replace('@', '') === entry.twitter_username.toLowerCase();
                          
                          return (
                            <tr
                              key={entry.twitter_username}
                              className="border-b border-akari-neon-teal/10 last:border-0 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5"
                            >
                              <td className="py-4 px-5 text-akari-text font-semibold">
                                {entry.rank <= 3 ? (
                                  <span className="text-lg">{['🥇', '🥈', '🥉'][entry.rank - 1]}</span>
                                ) : (
                                  <span className="text-white/60">#{entry.rank}</span>
                                )}
                              </td>
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-3">
                                  {entry.avatar_url && (
                                    <img
                                      src={entry.avatar_url}
                                      alt={entry.twitter_username}
                                      className="w-8 h-8 rounded-full border border-white/10 flex-shrink-0"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  )}
                                  <div>
                                    <div className="text-sm font-semibold text-white">
                                      @{entry.twitter_username.replace(/^@+/, '')}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-5 text-akari-text font-semibold">
                                {entry.base_points.toLocaleString()}
                              </td>
                              <td className="py-4 px-5">
                                {entry.multiplier > 1.0 ? (
                                  <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/50">
                                    {entry.multiplier}x
                                  </span>
                                ) : (
                                  <span className="text-akari-muted/60 text-xs">1.0x</span>
                                )}
                              </td>
                              <td className="py-4 px-5 text-akari-text font-semibold">
                                {entry.score.toLocaleString()}
                              </td>
                              <td className="py-4 px-5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {entry.is_auto_tracked && !entry.is_joined && (
                                    <>
                                      <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/50">
                                        Auto-tracked
                                      </span>
                                      {akariUser.isLoggedIn && userIsThisEntry && (
                                        <button
                                          onClick={async () => {
                                            if (!followVerified) {
                                              await handleVerifyFollow();
                                            }
                                            if (followVerified) {
                                              await handleJoinLeaderboard();
                                            }
                                          }}
                                          className="px-2 py-1 rounded text-xs font-medium bg-akari-neon-teal/20 text-akari-neon-teal border border-akari-neon-teal/50 hover:bg-akari-neon-teal/30 transition-colors"
                                        >
                                          Join to boost points
                                        </button>
                                      )}
                                    </>
                                  )}
                                  {entry.is_joined && entry.follow_verified && entry.multiplier > 1.0 && (
                                    <span className="px-2 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/50">
                                      Boost active
                                    </span>
                                  )}
                                  {entry.ring && (
                                    <span className="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/50">
                                      {entry.ring}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-white/60 mb-4">
                This project does not have ARC access enabled.
              </p>

              {/* Show existing request status */}
              {existingRequest && (
                <div className={`rounded-lg border p-4 ${
                  existingRequest.status === 'approved'
                    ? 'border-green-500/50 bg-green-500/10'
                    : existingRequest.status === 'rejected'
                    ? 'border-red-500/50 bg-red-500/10'
                    : 'border-yellow-500/50 bg-yellow-500/10'
                }`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-white">
                      {existingRequest.status === 'approved'
                        ? '✅ Request Approved'
                        : existingRequest.status === 'rejected'
                        ? '❌ Request Rejected'
                        : '⏳ Request Pending'}
                    </span>
                  </div>
                  <p className="text-xs text-white/60">
                    {existingRequest.status === 'pending'
                      ? 'Your request is being reviewed by administrators.'
                      : existingRequest.status === 'approved'
                      ? 'ARC access has been enabled for this project.'
                      : 'Your request was not approved.'}
                  </p>
                  {existingRequest.requested_arc_access_level && (
                    <p className="text-xs text-white/70 mt-2">
                      <span className="font-medium">Requested:</span>{' '}
                      {existingRequest.requested_arc_access_level && getArcFeatureName(existingRequest.requested_arc_access_level)}
                    </p>
                  )}
                  {existingRequest.justification && (
                    <p className="text-xs text-white/40 mt-2 italic">
                      &quot;{existingRequest.justification}&quot;
                    </p>
                  )}
                </div>
              )}

              {/* Request form - only show if user can request (founder/admin/mod) */}
              {!existingRequest && akariUser.isLoggedIn && canRequest === true && (
                <>
                  {!showRequestForm ? (
                    <button
                      onClick={() => setShowRequestForm(true)}
                      className="inline-flex items-center px-4 py-2 bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors font-medium"
                    >
                      Request ARC Access
                    </button>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm text-white/70 mb-2">
                          ARC Access Level <span className="text-red-400">*</span>
                        </label>
                        <select
                          value={selectedAccessLevel}
                          onChange={(e) => setSelectedAccessLevel(e.target.value as 'creator_manager' | 'leaderboard' | 'gamified')}
                          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                        >
                          <option value="creator_manager">{getArcFeatureName('creator_manager')}</option>
                          <option value="leaderboard">{getArcFeatureName('leaderboard')}</option>
                          <option value="gamified">{getArcFeatureName('gamified')}</option>
                        </select>
                        <p className="text-xs text-white/50 mt-1">
                          {getArcFeatureDescription(selectedAccessLevel)}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm text-white/70 mb-2">
                          Justification (optional)
                        </label>
                        <textarea
                          value={justification}
                          onChange={(e) => setJustification(e.target.value)}
                          placeholder="Explain why you'd like to enable ARC access for this project..."
                          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary resize-none"
                          rows={4}
                        />
                      </div>
                      {requestError && (
                        <p className="text-sm text-red-400">{requestError}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleSubmitRequest}
                          disabled={requestLoading}
                          className="px-4 py-2 bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {requestLoading ? 'Submitting...' : 'Submit Request'}
                        </button>
                        <button
                          onClick={() => {
                            setShowRequestForm(false);
                            setJustification('');
                            setSelectedAccessLevel('leaderboard');
                            setRequestError(null);
                          }}
                          disabled={requestLoading}
                          className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors font-medium disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Show info box if user cannot request (not founder/admin/mod) */}
              {!existingRequest && akariUser.isLoggedIn && canRequest === false && (
                <div className="rounded-lg border border-white/10 bg-black/20 p-4">
                  <p className="text-sm text-white/60">
                    Only project founders/admins can request ARC leaderboard access.
                  </p>
                </div>
              )}

              {!akariUser.isLoggedIn && (
                <p className="text-sm text-white/40">
                  Please log in to request ARC leaderboard access.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}

