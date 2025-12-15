/**
 * ARC Project Hub Page
 * 
 * Dynamic route for individual ARC project pages
 * Shows project details, arenas, leaderboard, missions, storyline, and map
 */

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Image from 'next/image';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { getUserCampaignStatuses, type UserCampaignStatus } from '@/lib/arc/helpers';
import { ArenaBubbleMap } from '@/components/arc/ArenaBubbleMap';

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
  arena: Arena;
  creators: Creator[];
}

type TabType = 'overview' | 'leaderboard' | 'missions' | 'storyline' | 'map';

// =============================================================================
// MISSION TYPES AND HELPERS
// =============================================================================

type MissionStatus = 'locked' | 'available' | 'completed';

interface Mission {
  id: string;
  title: string;
  description: string;
  rewardPoints: number;
  recommendedContent: string; // e.g. "Thread", "Meme", "Quote RT"
  status: MissionStatus;
}

/**
 * Build missions based on user's join status and ARC points
 */
function buildMissions(
  hasJoined: boolean,
  projectArcPoints: number
): Mission[] {
  const baseMissions: Omit<Mission, 'status'>[] = [
    {
      id: 'intro-thread',
      title: 'Share your first thread',
      description: 'Write a thread explaining why this project matters and tag the project account.',
      rewardPoints: 40,
      recommendedContent: 'Thread',
    },
    {
      id: 'meme-drop',
      title: 'Post a meme',
      description: 'Post a meme about the project using the main hashtag.',
      rewardPoints: 25,
      recommendedContent: 'Meme',
    },
    {
      id: 'signal-boost',
      title: 'Quote RT an announcement',
      description: 'Quote-retweet the latest project update with your commentary.',
      rewardPoints: 20,
      recommendedContent: 'Quote RT',
    },
    {
      id: 'deep-dive',
      title: 'Publish a deep dive',
      description: 'Publish a detailed analysis or recap of a key feature, product, or roadmap item.',
      rewardPoints: 80,
      recommendedContent: 'Deep dive',
    },
  ];

  return baseMissions.map((m) => {
    let status: MissionStatus;

    if (!hasJoined) {
      status = 'locked';
    } else if (projectArcPoints >= m.rewardPoints * 2) {
      // simple placeholder heuristic: if user has at least 2x rewardPoints, treat as completed
      status = 'completed';
    } else {
      status = 'available';
    }

    return { ...m, status };
  });
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArcProjectHub() {
  const router = useRouter();
  const { slug } = router.query;
  const akariUser = useAkariUser();
  const userTwitterUsername = akariUser.user?.xUsername || null;

  const [project, setProject] = useState<ArcProject | null>(null);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [allCreators, setAllCreators] = useState<Creator[]>([]);
  const [userStatus, setUserStatus] = useState<UserCampaignStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joiningProjectId, setJoiningProjectId] = useState<string | null>(null);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedArenaId, setSelectedArenaId] = useState<string | null>(null);

  // Leaderboard filter/sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [ringFilter, setRingFilter] = useState<'all' | 'core' | 'momentum' | 'discovery'>('all');
  const [sortBy, setSortBy] = useState<'points_desc' | 'points_asc' | 'joined_newest' | 'joined_oldest'>('points_desc');

  // Fetch project from projects list
  useEffect(() => {
    async function fetchProject() {
      if (!slug || typeof slug !== 'string') {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/portal/arc/projects');
        const data: ArcProjectsResponse = await res.json();

        if (!data.ok || !data.projects) {
          setError(data.error || 'Failed to load project');
          setLoading(false);
          return;
        }

        const foundProject = data.projects.find((p) => p.slug === slug);
        setProject(foundProject || null);
      } catch (err) {
        setError('Failed to connect to API');
        console.error('[ArcProjectHub] Fetch project error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
  }, [slug]);

  // Fetch arenas for this project
  useEffect(() => {
    async function fetchArenas() {
      if (!slug || typeof slug !== 'string' || !project) {
        return;
      }

      try {
        const res = await fetch(`/api/portal/arc/arenas?slug=${encodeURIComponent(slug)}`);
        const data: ArenasResponse = await res.json();

        if (!data.ok) {
          setArenas([]);
          return;
        }

        const fetchedArenas = data.arenas || [];
        setArenas(fetchedArenas);

        // Set selected arena to first active arena, or first arena if none active
        if (fetchedArenas.length > 0 && !selectedArenaId) {
          const activeArena = fetchedArenas.find(a => a.status === 'active') || fetchedArenas[0];
          if (activeArena) {
            setSelectedArenaId(activeArena.id);
          }
        }
      } catch (err) {
        console.error('[ArcProjectHub] Fetch arenas error:', err);
        setArenas([]);
      }
    }

    fetchArenas();
  }, [slug, project, selectedArenaId]);

  // Fetch creators for selected arena
  useEffect(() => {
    async function fetchCreators() {
      if (!selectedArenaId) {
        setAllCreators([]);
        return;
      }

      try {
        const arena = arenas.find(a => a.id === selectedArenaId);
        if (!arena) {
          setAllCreators([]);
          return;
        }

        const res = await fetch(`/api/portal/arc/arenas/${encodeURIComponent(arena.slug)}`);
        const data: ArenaDetailResponse = await res.json();

        if (data.ok) {
          setAllCreators(data.creators || []);
        } else {
          setAllCreators([]);
        }
      } catch (err) {
        console.error('[ArcProjectHub] Fetch creators error:', err);
        setAllCreators([]);
      }
    }

    fetchCreators();
  }, [selectedArenaId, arenas]);

  // Fetch user campaign status
  useEffect(() => {
    async function fetchUserStatus() {
      if (!project || !userTwitterUsername) {
        setUserStatus(null);
        return;
      }

      try {
        const statuses = await getUserCampaignStatuses([project.project_id], userTwitterUsername);
        const status = statuses.get(project.project_id);
        setUserStatus(status || { isFollowing: false, hasJoined: false });
      } catch (err) {
        console.error('[ArcProjectHub] Error fetching user status:', err);
        setUserStatus({ isFollowing: false, hasJoined: false });
      }
    }

    fetchUserStatus();
  }, [project, userTwitterUsername]);

  // Calculate project stats from arenas
  const projectStats = useMemo(() => {
    const activeArenas = arenas.filter(a => a.status === 'active');
    const totalCreators = new Set(allCreators.map(c => c.twitter_username)).size;
    const totalPoints = allCreators.reduce((sum, c) => sum + (c.arc_points || 0), 0);
    
    // Get date range from active arenas
    let earliestStart: string | null = null;
    let latestEnd: string | null = null;
    activeArenas.forEach(arena => {
      if (arena.starts_at && (!earliestStart || arena.starts_at < earliestStart)) {
        earliestStart = arena.starts_at;
      }
      if (arena.ends_at && (!latestEnd || arena.ends_at > latestEnd)) {
        latestEnd = arena.ends_at;
      }
    });

    return {
      activeCreators: totalCreators,
      totalPoints,
      dateRange: earliestStart && latestEnd 
        ? `${new Date(earliestStart).toLocaleDateString()} → ${new Date(latestEnd).toLocaleDateString()}`
        : earliestStart 
        ? `From ${new Date(earliestStart).toLocaleDateString()}`
        : latestEnd
        ? `Until ${new Date(latestEnd).toLocaleDateString()}`
        : 'Ongoing',
    };
  }, [arenas, allCreators]);

  // Handle join campaign
  const handleJoinCampaign = async () => {
    if (!project || joiningProjectId) return;

    try {
      setJoiningProjectId(project.project_id);

      const res = await fetch('/api/portal/arc/join-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.project_id }),
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Failed to join campaign');
      }

      // Refresh user status
      if (userTwitterUsername) {
        const statuses = await getUserCampaignStatuses([project.project_id], userTwitterUsername);
        const status = statuses.get(project.project_id);
        setUserStatus(status || { isFollowing: false, hasJoined: false });
      }

      // Switch to Missions tab
      setActiveTab('missions');
    } catch (err: any) {
      console.error('[ArcProjectHub] Join campaign error:', err);
      alert(err?.message || 'Failed to join campaign. Please try again.');
    } finally {
      setJoiningProjectId(null);
    }
  };

  // Compute narrative summary
  const narrativeSummary = useMemo(() => {
    if (arenas.length === 0) {
      return 'No arenas have been created for this project yet.';
    }

    const activeArenas = arenas.filter(a => a.status === 'active');
    const parts: string[] = [];

    if (activeArenas.length > 0) {
      parts.push(`${activeArenas.length} active arena${activeArenas.length > 1 ? 's' : ''} ${activeArenas.length > 1 ? 'are' : 'is'} running.`);
    }

    if (projectStats.activeCreators > 0) {
      parts.push(`${projectStats.activeCreators} creator${projectStats.activeCreators > 1 ? 's have' : ' has'} joined, earning ${projectStats.totalPoints.toLocaleString()} total ARC points.`);
    }

    return parts.length > 0 ? parts.join(' ') : 'This project is preparing to launch campaigns.';
  }, [arenas, projectStats]);

  // Filter and sort creators for leaderboard
  const visibleCreators = useMemo(() => {
    let filtered = [...allCreators];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((creator) => {
        const usernameMatch = creator.twitter_username?.toLowerCase().includes(term);
        const styleMatch = creator.style?.toLowerCase().includes(term);
        return usernameMatch || styleMatch;
      });
    }

    if (ringFilter !== 'all') {
      filtered = filtered.filter((creator) => {
        return creator.ring?.toLowerCase() === ringFilter.toLowerCase();
      });
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'points_desc':
          return (b.arc_points ?? 0) - (a.arc_points ?? 0);
        case 'points_asc':
          return (a.arc_points ?? 0) - (b.arc_points ?? 0);
        case 'joined_newest':
          if (!a.joined_at && !b.joined_at) return 0;
          if (!a.joined_at) return 1;
          if (!b.joined_at) return -1;
          return new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime();
        case 'joined_oldest':
          if (!a.joined_at && !b.joined_at) return 0;
          if (!a.joined_at) return 1;
          if (!b.joined_at) return -1;
          return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [allCreators, searchTerm, ringFilter, sortBy]);

  // Compute storyline events
  const storyEvents = useMemo(() => {
    return allCreators
      .map((creator) => {
        const date = creator.joined_at || null;
        const sortKey = date ? new Date(date).getTime() : 0;
        const ringName = creator.ring 
          ? creator.ring.charAt(0).toUpperCase() + creator.ring.slice(1)
          : 'Unknown';
        const text = `@${creator.twitter_username || 'Unknown'} joined as ${ringName} with ${creator.arc_points ?? 0} ARC points.`;

        return {
          date,
          sortKey,
          text,
        };
      })
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.sortKey - a.sortKey;
      });
  }, [allCreators]);

  // Get accent color
  const accentColor = project?.meta?.accent_color || '#00f6a2';

  // Helper functions
  const getRingColor = (ring?: string | null) => {
    const r = (ring || '').toLowerCase();
    if (r === 'core') return 'bg-purple-500/20 border-purple-500/50 text-purple-400';
    if (r === 'momentum') return 'bg-blue-500/20 border-blue-500/50 text-blue-400';
    if (r === 'discovery') return 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400';
    return 'bg-slate-500/20 border-slate-500/50 text-slate-400';
  };

  const formatDateRange = (startsAt: string | null, endsAt: string | null) => {
    if (!startsAt && !endsAt) return 'No dates set';
    if (!startsAt) return `Until ${new Date(endsAt!).toLocaleDateString()}`;
    if (!endsAt) return `From ${new Date(startsAt).toLocaleDateString()}`;
    return `${new Date(startsAt).toLocaleDateString()} → ${new Date(endsAt).toLocaleDateString()}`;
  };

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
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
    }
  };

  return (
    <PortalLayout title={project?.name || 'ARC Project'}>
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
            {/* Project Hero Section */}
            <section className="mb-8 rounded-2xl overflow-hidden border border-white/5 bg-black/60">
              {/* Banner */}
              <div className="relative h-32 md:h-40">
                {project.meta?.banner_url ? (
                  <Image
                    src={project.meta.banner_url}
                    alt={`${project.name || 'Project'} banner`}
                    fill
                    className="object-cover"
                    unoptimized
                    sizes="100vw"
                  />
                ) : (
                  <div 
                    className="w-full h-full"
                    style={{
                      background: `linear-gradient(135deg, ${accentColor}20 0%, ${accentColor}05 100%)`,
                    }}
                  />
                )}
                {/* Dark overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/80" />
              </div>

              {/* Content row */}
              <div className="px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                {/* Left: logo + name + tagline */}
                <div className="flex items-start gap-4 flex-1">
                  {/* Project logo/avatar placeholder */}
                  <div 
                    className="flex-shrink-0 w-16 h-16 rounded-xl border-2 flex items-center justify-center text-2xl font-bold"
                    style={{
                      borderColor: accentColor,
                      backgroundColor: `${accentColor}10`,
                      color: accentColor,
                    }}
                  >
                    {project.name?.charAt(0).toUpperCase() || '?'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h1 
                      className="text-2xl font-bold mb-1"
                      style={{
                        color: accentColor,
                        textShadow: `0 0 10px ${accentColor}40`,
                      }}
                    >
                      {project.name || 'Unnamed Project'}
                    </h1>
                    {project.twitter_username && (
                      <p className="text-sm text-akari-muted mb-2">
                        @{project.twitter_username}
                      </p>
                    )}
                    {project.meta?.tagline && (
                      <p className="text-sm text-akari-muted">
                        {project.meta.tagline}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right: stats + CTA buttons */}
                <div className="flex flex-col gap-4 md:items-end">
                  {/* Stats cards */}
                  <div className="flex gap-3">
                    <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60">Active creators</div>
                      <div className="text-lg font-semibold text-white">{projectStats.activeCreators}</div>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60">Total ARC points</div>
                      <div className="text-lg font-semibold text-white">{projectStats.totalPoints.toLocaleString()}</div>
                    </div>
                    <div className="px-3 py-2 rounded-lg bg-white/5 border border-white/10">
                      <div className="text-xs text-white/60">Campaign dates</div>
                      <div className="text-sm font-semibold text-white">{projectStats.dateRange}</div>
                    </div>
                  </div>

                  {/* CTA buttons */}
                  <div className="flex gap-2">
                    {!userStatus?.isFollowing ? (
                      <button
                        onClick={() => setShowFollowModal(true)}
                        className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-akari-neon-teal to-akari-neon-teal/80 text-black rounded-lg hover:shadow-[0_0_20px_rgba(0,246,162,0.4)] transition-all"
                      >
                        Follow on X to join
                      </button>
                    ) : !userStatus?.hasJoined ? (
                      <button
                        onClick={handleJoinCampaign}
                        disabled={joiningProjectId === project.project_id}
                        className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-akari-neon-teal to-akari-neon-teal/80 text-black rounded-lg hover:shadow-[0_0_20px_rgba(0,246,162,0.4)] transition-all disabled:opacity-50"
                      >
                        {joiningProjectId === project.project_id ? 'Joining...' : 'Join campaign'}
                      </button>
                    ) : (
                      <button
                        onClick={() => setActiveTab('missions')}
                        className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-akari-neon-teal to-akari-neon-teal/80 text-black rounded-lg hover:shadow-[0_0_20px_rgba(0,246,162,0.4)] transition-all"
                      >
                        View missions
                      </button>
                    )}
                    {project.twitter_username && (
                      <a
                        href={`https://x.com/${project.twitter_username}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-all"
                      >
                        View on X
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* Tab Navigation */}
            <div className="flex items-center gap-2 border-b border-white/10 pb-2">
              {(['overview', 'leaderboard', 'missions', 'storyline', 'map'] as TabType[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                    activeTab === tab
                      ? 'text-black bg-gradient-to-r from-akari-neon-teal to-akari-neon-teal/80 shadow-[0_0_15px_rgba(0,246,162,0.3)]'
                      : 'text-akari-muted hover:text-akari-text hover:bg-white/5'
                  }`}
                  style={
                    activeTab === tab
                      ? {}
                      : {}
                  }
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="mt-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Narrative summary */}
                  <div className="rounded-xl border border-white/10 bg-black/40 p-6">
                    <h2 className="text-lg font-semibold text-white mb-3">Campaign Overview</h2>
                    <p className="text-sm text-akari-muted leading-relaxed">{narrativeSummary}</p>
                  </div>

                  {/* Key stats */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                      <div className="text-xs text-white/60 mb-1">Active Arenas</div>
                      <div className="text-2xl font-bold text-white">{arenas.filter(a => a.status === 'active').length}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                      <div className="text-xs text-white/60 mb-1">Total Creators</div>
                      <div className="text-2xl font-bold text-white">{projectStats.activeCreators}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/40 p-4">
                      <div className="text-xs text-white/60 mb-1">Total Points</div>
                      <div className="text-2xl font-bold text-white">{projectStats.totalPoints.toLocaleString()}</div>
                    </div>
                  </div>

                  {/* Arenas list */}
                  <div>
                    <h2 className="text-lg font-semibold text-white mb-4">Arenas</h2>
                    {arenas.length === 0 ? (
                      <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
                        <p className="text-sm text-akari-muted">
                          No arenas have been created for this project yet.
                        </p>
                      </div>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {arenas.map((arena) => (
                          <Link
                            key={arena.id}
                            href={`/portal/arc/${slug}/arena/${arena.slug}`}
                            className="rounded-xl border border-white/10 bg-black/40 p-4 hover:border-akari-neon-teal/50 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] transition-all"
                          >
                            <h3 className="text-lg font-semibold text-white mb-2">{arena.name}</h3>
                            <div className="mb-3">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getArenaStatusColor(arena.status)}`}>
                                {arena.status}
                              </span>
                            </div>
                            <p className="text-sm text-akari-muted mb-2">
                              {formatDateRange(arena.starts_at, arena.ends_at)}
                            </p>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-akari-muted">Reward Depth:</span>
                              <span className="text-sm font-medium text-white">{arena.reward_depth}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Leaderboard Tab */}
              {activeTab === 'leaderboard' && (
                <div className="rounded-xl border border-white/10 bg-black/40 p-6">
                  {arenas.length === 0 ? (
                    <p className="text-sm text-akari-muted text-center py-8">
                      No arenas available for this project.
                    </p>
                  ) : (
                    <>
                      {/* Arena selector */}
                      {arenas.length > 1 && (
                        <div className="mb-6">
                          <label htmlFor="arena-select" className="text-xs text-white/60 mb-2 block">
            Select Arena:
                          </label>
                          <select
                            id="arena-select"
                            value={selectedArenaId || ''}
                            onChange={(e) => setSelectedArenaId(e.target.value)}
                            className="w-full md:w-auto px-3 py-2 text-sm bg-black/60 border border-white/20 rounded-lg text-white focus:outline-none focus:border-akari-neon-teal/50"
                          >
                            {arenas.map((arena) => (
                              <option key={arena.id} value={arena.id}>
                                {arena.name} ({arena.status})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {allCreators.length === 0 ? (
                        <p className="text-sm text-akari-muted text-center py-8">
                          No creators have joined this arena yet.
                        </p>
                      ) : (
                        <>
                          {/* Controls Bar */}
                          <div className="mb-6 space-y-4">
                            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                              <input
                                type="text"
                                placeholder="Search creators…"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="flex-1 min-w-0 px-3 py-2 text-sm bg-black/60 border border-white/20 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-akari-neon-teal/50"
                              />

                              <div className="flex gap-2 flex-wrap">
                                {(['all', 'core', 'momentum', 'discovery'] as const).map((ring) => (
                                  <button
                                    key={ring}
                                    onClick={() => setRingFilter(ring)}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                      ringFilter === ring
                                        ? ring === 'all'
                                          ? 'bg-akari-neon-teal/20 border-akari-neon-teal/50 text-akari-neon-teal'
                                          : getRingColor(ring)
                                        : 'bg-black/60 border-white/20 text-white/60 hover:border-white/40'
                                    }`}
                                  >
                                    {ring.charAt(0).toUpperCase() + ring.slice(1)}
                                  </button>
                                ))}
                              </div>

                              <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                                className="px-3 py-2 text-sm bg-black/60 border border-white/20 rounded-lg text-white focus:outline-none focus:border-akari-neon-teal/50"
                              >
                                <option value="points_desc">Top points</option>
                                <option value="points_asc">Lowest points</option>
                                <option value="joined_newest">Newest joined</option>
                                <option value="joined_oldest">Oldest joined</option>
                              </select>
                            </div>
                          </div>

                          {/* Creators List */}
                          {visibleCreators.length === 0 ? (
                            <p className="text-sm text-akari-muted text-center py-8">
                              No creators match your filters.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {visibleCreators.map((creator, index) => {
                                const rank = index + 1;
                                return (
                                  <Link
                                    key={creator.id || `creator-${index}`}
                                    href={`/portal/arc/creator/${encodeURIComponent((creator.twitter_username || '').toLowerCase())}`}
                                    className="group flex items-center gap-3 p-3 rounded-lg bg-black/60 border border-white/10 hover:border-akari-neon-teal/40 hover:shadow-[0_0_10px_rgba(0,246,162,0.1)] transition-all"
                                  >
                                    <div className="text-lg font-bold text-white/60 w-8 text-center">
                                      #{rank}
                                    </div>
                                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-sm font-semibold text-white">
                                      {creator.twitter_username?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium text-white truncate">
                                        @{creator.twitter_username || 'Unknown'}
                                      </div>
                                      {creator.style && (
                                        <div className="text-xs text-white/60 truncate">{creator.style}</div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {creator.ring && (
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getRingColor(creator.ring)}`}>
                                          {creator.ring}
                                        </span>
                                      )}
                                      <div className="text-right">
                                        <div className="text-sm font-bold text-white">
                                          {creator.arc_points?.toLocaleString() || 0}
                                        </div>
                                        <div className="text-xs text-white/60">points</div>
                                      </div>
                                    </div>
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Missions Tab */}
              {activeTab === 'missions' && (() => {
                const hasJoined = userStatus?.hasJoined || false;
                const projectArcPoints = userStatus?.arcPoints || 0;
                const missions = buildMissions(hasJoined, projectArcPoints);

                return (
                  <section className="space-y-6">
                    {/* Header / Progress */}
                    <div className="rounded-xl border border-white/10 bg-black/50 px-4 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-white">Creator Missions</h2>
                        <p className="text-sm text-white/60">
                          Complete missions by creating content about this project. ARC points are awarded automatically by the scoring engine.
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div>
                          <div className="text-white/60">Your ARC points</div>
                          <div className="text-xl font-semibold text-white">{projectArcPoints}</div>
                        </div>
                        <div className="h-10 w-px bg-white/10" />
                        <div>
                          <div className="text-white/60">Status</div>
                          <div className="font-semibold text-emerald-400">
                            {hasJoined ? 'Campaign joined' : 'Join required'}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Locked state message */}
                    {!hasJoined && (
                      <div className="rounded-xl border border-yellow-400/30 bg-yellow-400/5 px-4 py-3 text-sm text-yellow-200">
                        Follow the project on X and join this campaign to unlock missions.
                      </div>
                    )}

                    {/* Mission list */}
                    <div className="grid gap-4 md:grid-cols-2">
                      {missions.map((mission) => {
                        const isLocked = mission.status === 'locked';
                        const isCompleted = mission.status === 'completed';

                        return (
                          <div
                            key={mission.id}
                            className={`rounded-xl border px-4 py-4 bg-black/60 transition ${
                              isLocked
                                ? 'border-white/10 opacity-60'
                                : isCompleted
                                ? 'border-emerald-400/60'
                                : 'border-white/15 hover:border-white/40 hover:shadow-lg'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-white">
                                  {mission.title}
                                </div>
                                <div className="mt-1 text-xs text-white/60">
                                  {mission.description}
                                </div>
                                <div className="mt-2 text-xs text-white/50">
                                  Recommended: {mission.recommendedContent}
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                                  +{mission.rewardPoints} pts
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                                    isLocked
                                      ? 'bg-slate-700 text-slate-200'
                                      : isCompleted
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : 'bg-blue-500/15 text-blue-200'
                                  }`}
                                >
                                  {isLocked ? 'Locked' : isCompleted ? 'Completed' : 'Available'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })()}

              {/* Storyline Tab */}
              {activeTab === 'storyline' && (
                <div className="rounded-xl border border-white/10 bg-black/40 p-6">
                  {storyEvents.length === 0 ? (
                    <p className="text-sm text-akari-muted text-center py-8">
                      No events in the storyline yet.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {storyEvents.map((event, index) => (
                        <div key={index} className="flex gap-4 pb-4 border-b border-white/5 last:border-0">
                          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-akari-neon-teal mt-2" />
                          <div className="flex-1">
                            <div className="text-xs text-white/60 mb-1">
                              {event.date ? new Date(event.date).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              }) : 'Unknown date'}
                            </div>
                            <div className="text-sm text-white">{event.text}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Map Tab */}
              {activeTab === 'map' && (
                <div className="rounded-xl border border-white/10 bg-black/40 p-6">
                  <h2 className="text-lg font-semibold text-white mb-4">Creator Map</h2>
                  {arenas.length === 0 ? (
                    <p className="text-sm text-akari-muted text-center py-8">
                      No arenas available for this project.
                    </p>
                  ) : (
                    <>
                      {arenas.length > 1 && (
                        <div className="mb-4">
                          <label htmlFor="map-arena-select" className="text-xs text-white/60 mb-2 block">
                            Select Arena:
                          </label>
                          <select
                            id="map-arena-select"
                            value={selectedArenaId || ''}
                            onChange={(e) => setSelectedArenaId(e.target.value)}
                            className="w-full md:w-auto px-3 py-2 text-sm bg-black/60 border border-white/20 rounded-lg text-white focus:outline-none focus:border-akari-neon-teal/50"
                          >
                            {arenas.map((arena) => (
                              <option key={arena.id} value={arena.id}>
                                {arena.name} ({arena.status})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <ArenaBubbleMap creators={allCreators} />
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Follow Modal */}
      {showFollowModal && project && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-black/90 border border-white/20 rounded-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Follow on X</h3>
            <p className="text-sm text-akari-muted mb-6">
              To join this campaign, you need to follow @{project.twitter_username || 'the project'} on X first.
            </p>
            <div className="flex gap-3">
              {project.twitter_username && (
                <a
                  href={`https://x.com/${project.twitter_username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 px-4 py-2 text-sm font-medium bg-gradient-to-r from-akari-neon-teal to-akari-neon-teal/80 text-black rounded-lg hover:shadow-[0_0_20px_rgba(0,246,162,0.4)] transition-all text-center"
                >
                  Open X Profile
                </a>
              )}
              <button
                onClick={() => setShowFollowModal(false)}
                className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
