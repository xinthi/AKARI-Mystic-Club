/**
 * ARC Arena Details Page
 * 
 * Dynamic route for individual arena pages
 * Shows arena details, creators leaderboard, tasks, and analytics
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { ArenaBubbleMap } from '@/components/arc/ArenaBubbleMap';
import type { ProjectPermissionCheck } from '@/lib/project-permissions';

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
  header_image_url: string | null;
  slug?: string | null;
  arc_access_level?: string | null;
}

interface Creator {
  id?: string;
  twitter_username: string;
  arc_points: number;
  adjusted_points: number;
  ring?: 'core' | 'momentum' | 'discovery' | string;
  style?: string | null;
  meta?: Record<string, any>;
  joined_at?: string | null;
  profile_id?: string;
}

interface AdjustmentHistoryItem {
  id: string;
  arena_id: string;
  creator_profile_id: string;
  points_delta: number;
  reason: string;
  created_by_profile_id: string;
  created_at: string;
  metadata: Record<string, any> | null;
}

interface ArenaDetailResponse {
  ok: true;
  arena: ArenaDetail;
  project: ProjectInfo;
  creators: Creator[];
  sentiment: {
    enabled: boolean;
    summary: null;
    series: any[];
  };
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
  const rawProjectSlug = router.query.slug;
  const rawArenaSlug = router.query.arenaSlug;
  // Normalize slugs: string, trim, toLowerCase
  const projectSlug = typeof rawProjectSlug === 'string' ? String(rawProjectSlug).trim().toLowerCase() : null;
  const arenaSlug = typeof rawArenaSlug === 'string' ? String(rawArenaSlug).trim().toLowerCase() : null;
  const akariUser = useAkariUser();

  // Canonicalize slugs: redirect if normalized differs from original
  useEffect(() => {
    if (!router.isReady) return;
    
    const rawProjectSlugValue = router.query.slug;
    const rawArenaSlugValue = router.query.arenaSlug;
    
    if (typeof rawProjectSlugValue === 'string' && rawProjectSlugValue && typeof rawArenaSlugValue === 'string' && rawArenaSlugValue) {
      const normalizedProject = String(rawProjectSlugValue).trim().toLowerCase();
      const normalizedArena = String(rawArenaSlugValue).trim().toLowerCase();
      
      if (normalizedProject !== rawProjectSlugValue || normalizedArena !== rawArenaSlugValue) {
        // Redirect to canonical URL (no full reload)
        router.replace(
          `/portal/arc/${encodeURIComponent(normalizedProject)}/arena/${encodeURIComponent(normalizedArena)}`,
          undefined,
          { shallow: false }
        );
        return;
      }
    }
  }, [router.isReady, router.query.slug, router.query.arenaSlug, router]);

  const [arena, setArena] = useState<ArenaDetail | null>(null);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [permissionsState, setPermissionsState] = useState<ProjectPermissionCheck | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Mindshare Leaderboard join flow state
  const [followVerified, setFollowVerified] = useState<boolean | null>(null);
  const [verifyingFollow, setVerifyingFollow] = useState(false);
  const [joiningLeaderboard, setJoiningLeaderboard] = useState(false);

  // Compute permission flags using safe local variable
  const perms = permissionsState;
  const canWrite = !!perms && (perms.isSuperAdmin || perms.isOwner || perms.isAdmin || perms.isModerator);
  const canManageArenas = !!perms && (perms.isSuperAdmin || perms.isOwner || perms.isAdmin);

  // Tab state
  const [activeTab, setActiveTab] = useState<'leaderboard' | 'storyline' | 'map' | 'quests'>('leaderboard');
  
  // Quests state (Quest Leaderboard)
  const [quests, setQuests] = useState<any[]>([]);
  const [questsLoading, setQuestsLoading] = useState(false);
  const [questLeaderboards, setQuestLeaderboards] = useState<Map<string, any[]>>(new Map());
  const [questLeaderboardsLoading, setQuestLeaderboardsLoading] = useState<Set<string>>(new Set());
  const [showCreateQuestModal, setShowCreateQuestModal] = useState(false);
  const [questForm, setQuestForm] = useState({
    name: '',
    narrative_focus: '',
    starts_at: '',
    ends_at: '',
    reward_desc: '',
    status: 'draft' as 'draft' | 'active' | 'paused' | 'ended',
    quest_type: 'normal' as 'normal' | 'crm', // New field for quest type
    crm_program_id: '' as string | '', // For CRM quests
  });
  const [gamefiEnabled, setGamefiEnabled] = useState(false);

  // Leaderboard filter/sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [ringFilter, setRingFilter] = useState<'all' | 'core' | 'momentum' | 'discovery'>('all');
  const [sortBy, setSortBy] = useState<'points_desc' | 'points_asc' | 'joined_newest' | 'joined_oldest'>('points_desc');
  
  // Paginated leaderboard state
  const [leaderboardEntries, setLeaderboardEntries] = useState<any[]>([]);
  const [leaderboardPage, setLeaderboardPage] = useState(1);
  const [leaderboardTotal, setLeaderboardTotal] = useState(0);
  const [leaderboardTotalPages, setLeaderboardTotalPages] = useState(0);
  const [leaderboardSearch, setLeaderboardSearch] = useState('');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  
  // Team members state
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  
  // CRM visibility state
  const [crmStatus, setCrmStatus] = useState<{
    isCRM: boolean;
    visibility: 'public' | 'private' | 'hybrid' | null;
    isInvited: boolean;
    isApproved: boolean;
    utmLink: string | null;
    canViewLeaderboard: boolean;
    canApply: boolean;
  } | null>(null);

  // Admin modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [editingCreator, setEditingCreator] = useState<Creator | null>(null);
  const [adjustingCreator, setAdjustingCreator] = useState<Creator | null>(null);
  const [adjustmentHistory, setAdjustmentHistory] = useState<AdjustmentHistoryItem[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState({
    pointsDelta: 0,
    reason: '',
  });

  // Form state for Add/Edit
  const [formData, setFormData] = useState({
    twitter_username: '',
    arc_points: 0,
    ring: 'discovery' as 'core' | 'momentum' | 'discovery',
    style: '',
  });

  // Fetch arena details using the arena slug
  useEffect(() => {
    async function fetchArenaDetails() {
      // Wait for router to be ready and ensure we have the arena slug
      if (!router.isReady) {
        return;
      }

      // Ensure arenaSlug is a non-empty string before making the request
      if (!arenaSlug || typeof arenaSlug !== 'string' || arenaSlug.trim().length === 0) {
        console.warn('[ArenaDetailsPage] Invalid arenaSlug:', {
          arenaSlug,
          type: typeof arenaSlug,
          length: arenaSlug?.length,
          rawArenaSlug: rawArenaSlug,
        });
        setLoading(false);
        setError('Arena slug is required');
        return;
      }

      // Ensure we never accidentally use projectSlug instead of arenaSlug
      if (arenaSlug === projectSlug) {
        console.warn('[ArenaDetailsPage] Warning: arenaSlug matches projectSlug, this may be incorrect:', {
          arenaSlug,
          projectSlug,
        });
      }

      try {
        setLoading(true);
        setError(null);

        // Normalize arena slug for API call (only trim and toLowerCase, no other modifications)
        const normalizedArenaSlug = arenaSlug.trim().toLowerCase();
        const fetchUrl = `/api/portal/arc/arenas/${encodeURIComponent(normalizedArenaSlug)}`;
        
        // Debug logging (development only)
        console.log('[ArenaDetailsPage] Fetching arena:', {
          rawArenaSlug: rawArenaSlug,
          arenaSlug: arenaSlug,
          normalizedArenaSlug,
          projectSlug: projectSlug,
          fetchUrl,
          routerReady: router.isReady,
        });

        // Use the correct API route that returns arena, project, and creators in one call
        // NEVER call /api/portal/arc/admin/arena-creators from this public page
        const res = await fetch(fetchUrl, { credentials: 'include' });
        
        // Debug logging (development only)
        if (process.env.NODE_ENV === 'development') {
          console.log('[ArenaDetailsPage] Fetch response:', {
            url: fetchUrl,
            ok: res.ok,
            status: res.status,
            statusText: res.statusText,
          });
        }
        
        if (!res.ok) {
          const errorData: ArenaErrorResponse = await res.json().catch(() => ({
            ok: false,
            error: `HTTP ${res.status}: Failed to fetch arena`,
          }));
          
          // Check if error is due to ARC access not approved
          if (res.status === 403 && (errorData.error?.includes('ARC access not approved') || errorData.error?.includes('ARC access denied'))) {
            setError('ARC access not approved for this project');
          } else {
          setError(errorData.error || 'Failed to load arena');
          }
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

        // Canonicalize slug: if API returns a different slug than requested, redirect to canonical URL
        const canonicalArenaSlug = data.arena.slug;
        const normalizedCanonical = canonicalArenaSlug.trim().toLowerCase();
        const normalizedRequested = normalizedArenaSlug.trim().toLowerCase();
        
        if (normalizedCanonical !== normalizedRequested) {
          // Dev-only warning for debugging
          if (process.env.NODE_ENV === 'development') {
            console.warn('[ArenaDetailsPage] Slug mismatch detected:', {
              requested: normalizedRequested,
              canonical: normalizedCanonical,
              redirecting: true,
            });
          }
          
          // Redirect to canonical URL using arena.slug from DB
          const canonicalProjectSlug = (data.project?.slug || projectSlug || '').trim().toLowerCase();
          if (canonicalProjectSlug && canonicalArenaSlug) {
            router.replace(
              `/portal/arc/${encodeURIComponent(canonicalProjectSlug)}/arena/${encodeURIComponent(canonicalArenaSlug)}`,
              undefined,
              { shallow: true }
            );
            return; // Don't set state, let redirect handle it
          }
        }

        // Data is valid, set all state
        setArena(data.arena);
        setProject(data.project);
        // Creators are already sorted by adjusted_points DESC from the API
        setCreators(data.creators || []);

        // Fetch project permissions
        if (data.project?.id) {
          try {
            const permissionsRes = await fetch(`/api/portal/arc/permissions?projectId=${encodeURIComponent(data.project.id)}`, {
              credentials: 'include',
            });
            if (permissionsRes.ok) {
              const permissionsData = await permissionsRes.json();
              if (permissionsData.ok) {
                setPermissionsState(permissionsData.permissions);
                
                // Check follow verification status (read-only check)
                if (akariUser.user && !permissionsData.permissions.isInvestorView && data.project?.id) {
                  try {
                    const verifyRes = await fetch(`/api/portal/arc/follow-status?projectId=${encodeURIComponent(data.project.id)}`, {
                      credentials: 'include',
                    });
                    if (verifyRes.ok) {
                      const verifyData = await verifyRes.json();
                      if (verifyData.ok) {
                        setFollowVerified(verifyData.verified);
                      }
                    }
                  } catch (verifyErr) {
                    console.warn('[ArenaDetailsPage] Failed to check follow verification:', verifyErr);
                  }
                }
              }
            }
          } catch (permErr) {
            console.warn('[ArenaDetailsPage] Failed to fetch permissions:', permErr);
          }
        }

        // Fetch quests if Quest Leaderboard is enabled (check project state)
        if (data.arena?.id && data.project?.id) {
          try {
            const stateRes = await fetch(`/api/portal/arc/state?projectId=${encodeURIComponent(data.project.id)}`, {
              credentials: 'include',
            });
            if (stateRes.ok) {
              const stateData = await stateRes.json();
              const gamefiEnabled = stateData.ok && stateData.modules?.gamefi?.enabled === true;
              setGamefiEnabled(gamefiEnabled);
              
              if (gamefiEnabled) {
                setQuestsLoading(true);
                try {
                  const questsRes = await fetch(`/api/portal/arc/quests?arenaId=${encodeURIComponent(data.arena.id)}`, {
                    credentials: 'include',
                  });
                  if (questsRes.ok) {
                    const questsData = await questsRes.json();
                    if (questsData.ok && questsData.quests) {
                      setQuests(questsData.quests);
                      // Fetch leaderboards for all quests
                      fetchQuestLeaderboards(questsData.quests);
                    }
                  }
                } catch (err) {
                  console.error('[ArenaDetailsPage] Error fetching quests:', err);
                } finally {
                  setQuestsLoading(false);
                }
              }
            }
          } catch (err) {
            console.error('[ArenaDetailsPage] Error checking gamefi state:', err);
          }
        }
      } catch (err: any) {
        const errorMessage = err?.message || 'Failed to connect to API';
        setError(errorMessage);
        console.error('[ArenaDetailsPage] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchArenaDetails();
  }, [router.isReady, arenaSlug, akariUser.user, projectSlug, rawArenaSlug, router]);

  // Fetch team members
  useEffect(() => {
    async function fetchTeamMembers() {
      if (!arenaSlug || typeof arenaSlug !== 'string') return;
      
      setTeamLoading(true);
      try {
        const res = await fetch(`/api/portal/arc/arenas/${encodeURIComponent(arenaSlug)}/team`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.members) {
            setTeamMembers(data.members);
          }
        }
      } catch (err) {
        console.error('[ArenaDetailsPage] Error fetching team members:', err);
      } finally {
        setTeamLoading(false);
      }
    }
    
    if (arenaSlug) {
      fetchTeamMembers();
    }
  }, [arenaSlug]);

  // Fetch paginated leaderboard
  useEffect(() => {
    async function fetchLeaderboard() {
      if (!arenaSlug || typeof arenaSlug !== 'string') return;
      
      setLeaderboardLoading(true);
      try {
        const res = await fetch(`/api/portal/arc/arenas/${encodeURIComponent(arenaSlug)}/leaderboard?page=${leaderboardPage}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            // Debug: Log first few entries to see if avatar_url is present
            const entries = data.entries || [];
            console.log('[ArenaDetailsPage] Leaderboard entries received:', entries.length);
            if (entries.length > 0) {
              console.log('[ArenaDetailsPage] First entry:', {
                username: entries[0].twitter_username,
                avatar_url: entries[0].avatar_url ? entries[0].avatar_url.substring(0, 50) + '...' : 'null',
                rank: entries[0].rank,
              });
            }
            setLeaderboardEntries(entries);
            setLeaderboardTotal(data.total || 0);
            setLeaderboardTotalPages(data.totalPages || 0);
          }
        }
      } catch (err) {
        console.error('[ArenaDetailsPage] Error fetching leaderboard:', err);
      } finally {
        setLeaderboardLoading(false);
      }
    }
    
    if (arenaSlug) {
      fetchLeaderboard();
    }
  }, [arenaSlug, leaderboardPage]);

  // Fetch CRM status
  useEffect(() => {
    async function fetchCrmStatus() {
      if (!arenaSlug || typeof arenaSlug !== 'string') return;
      
      try {
        const res = await fetch(`/api/portal/arc/arenas/${encodeURIComponent(arenaSlug)}/status`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.status) {
            setCrmStatus(data.status);
          }
        }
      } catch (err) {
        console.error('[ArenaDetailsPage] Error fetching CRM status:', err);
      }
    }
    
    if (arenaSlug) {
      fetchCrmStatus();
    }
  }, [arenaSlug]);

  // Fetch quest leaderboards
  const fetchQuestLeaderboards = async (questsList: any[]) => {
    const leaderboardMap = new Map<string, any[]>();
    const loadingSet = new Set<string>();

    for (const quest of questsList) {
      if (quest.status === 'ended' || quest.status === 'active') {
        loadingSet.add(quest.id);
        try {
          const res = await fetch(`/api/portal/arc/quests/${quest.id}/leaderboard`, {
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            if (data.ok && data.entries) {
              leaderboardMap.set(quest.id, data.entries);
            }
          }
        } catch (err) {
          console.error(`[ArenaDetailsPage] Error fetching leaderboard for quest ${quest.id}:`, err);
        } finally {
          loadingSet.delete(quest.id);
        }
      }
    }

    setQuestLeaderboards(leaderboardMap);
    setQuestLeaderboardsLoading(loadingSet);
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

  // Helper function to get ring badge color
  const getRingColor = (ring: string) => {
    switch (ring) {
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
  const getCreatorAvatar = (username: string | null | undefined) => {
    if (!username) return null;
    const firstLetter = username.charAt(0).toUpperCase();
    return (
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-akari-cardSoft/50 border border-akari-border/30 flex items-center justify-center text-sm font-semibold text-akari-text">
        {firstLetter}
      </div>
    );
  };

  // Helper function to format date for storyline
  const formatStorylineDate = (dateString: string | null | undefined) => {
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

  // Compute arena narrative summary
  interface ArenaNarrativeSummary {
    creatorCount: number;
    totalPoints: number;
    topCreator?: { username: string; points: number; ring?: string | null };
    pointsByRing: Record<string, number>;
  }

  const narrativeSummary = React.useMemo((): ArenaNarrativeSummary => {
    const creatorCount = creators.length;
    let totalPoints = 0;
    const pointsByRing: Record<string, number> = {};
    let topCreator: { username: string; points: number; ring?: string | null } | undefined;

    for (const creator of creators) {
      // effective_points = base_points + adjustments_sum
      const points = creator.adjusted_points ?? creator.arc_points ?? 0;
      totalPoints += points;

      // Track points by ring
      if (creator.ring) {
        const ring = creator.ring.toLowerCase();
        pointsByRing[ring] = (pointsByRing[ring] || 0) + points;
      }

      // Track top creator (using adjusted points)
      if (!topCreator || points > topCreator.points) {
        topCreator = {
          username: creator.twitter_username || 'Unknown',
          points,
          ring: creator.ring || null,
        };
      }
    }

    return {
      creatorCount,
      totalPoints,
      topCreator,
      pointsByRing,
    };
  }, [creators]);

  // Generate narrative summary text
  const narrativeSummaryText = React.useMemo(() => {
    if (narrativeSummary.creatorCount === 0) {
      return 'No creators have joined this arena yet.';
    }

    const parts: string[] = [];
    
    // Main summary
    const creatorText = narrativeSummary.creatorCount === 1 ? 'creator has' : 'creators have';
    parts.push(`${narrativeSummary.creatorCount} ${creatorText} joined this arena so far.`);

    // Top creator
    if (narrativeSummary.topCreator) {
      const ringText = narrativeSummary.topCreator.ring
        ? narrativeSummary.topCreator.ring.charAt(0).toUpperCase() + narrativeSummary.topCreator.ring.slice(1)
        : '';
      const ringPart = ringText ? ` as ${ringText}` : '';
      parts.push(`Top creator is @${narrativeSummary.topCreator.username} with ${narrativeSummary.topCreator.points.toLocaleString()} ARC points${ringPart}.`);
    }

    // Ring breakdown (only if there are meaningful totals)
    const ringParts: string[] = [];
    if (narrativeSummary.pointsByRing.core > 0) {
      ringParts.push(`Core: ${narrativeSummary.pointsByRing.core.toLocaleString()}`);
    }
    if (narrativeSummary.pointsByRing.momentum > 0) {
      ringParts.push(`Momentum: ${narrativeSummary.pointsByRing.momentum.toLocaleString()}`);
    }
    if (narrativeSummary.pointsByRing.discovery > 0) {
      ringParts.push(`Discovery: ${narrativeSummary.pointsByRing.discovery.toLocaleString()}`);
    }

    if (ringParts.length > 0) {
      parts.push(ringParts.join(' · ') + '.');
    }

    return parts.join(' ');
  }, [narrativeSummary]);

  // Compute arena storyline events
  const storyEvents = React.useMemo(() => {
    return creators
      .map((creator) => {
        const date = creator.joined_at || null;
        const sortKey = date ? new Date(date).getTime() : 0;
        const ringName = creator.ring 
          ? creator.ring.charAt(0).toUpperCase() + creator.ring.slice(1)
          : 'Unknown';
        // effective_points = base_points + adjustments_sum
        const effective = creator.adjusted_points ?? creator.arc_points ?? 0;
        const text = `@${(creator.twitter_username || 'Unknown').replace(/^@+/, '')} joined this arena as ${ringName} with ${effective} ARC points.`;

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
  }, [creators]);

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
          // effective_points = base_points + adjustments_sum
          return (b.adjusted_points ?? b.arc_points ?? 0) - (a.adjusted_points ?? a.arc_points ?? 0);
        case 'points_asc':
          // effective_points = base_points + adjustments_sum
          return (a.adjusted_points ?? a.arc_points ?? 0) - (b.adjusted_points ?? b.arc_points ?? 0);
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

  // Check if user is already in creators list
  const userTwitterUsername = akariUser.user?.xUsername || null;
  const userIsInCreators = React.useMemo(() => {
    if (!userTwitterUsername || !creators.length) return false;
    const normalized = userTwitterUsername.toLowerCase().replace('@', '').trim();
    return creators.some(c => 
      c.twitter_username?.toLowerCase().replace('@', '').trim() === normalized
    );
  }, [userTwitterUsername, creators]);

  // Handle verify follow
  const handleVerifyFollow = async () => {
    if (!project?.id || verifyingFollow) return;

    try {
      setVerifyingFollow(true);
      const res = await fetch('/api/portal/arc/verify-follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId: project.id }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to verify follow');
      }

      setFollowVerified(data.verified);
      
      if (!data.verified) {
        alert('Please follow the project on X first, then try again.');
      }
    } catch (err: any) {
      console.error('[ArenaDetailsPage] Verify follow error:', err);
      alert(err?.message || 'Failed to verify follow. Please try again.');
    } finally {
      setVerifyingFollow(false);
    }
  };

  // Handle join leaderboard
  const handleJoinLeaderboard = async () => {
    if (!project?.id || joiningLeaderboard) return;

    try {
      setJoiningLeaderboard(true);
      const res = await fetch('/api/portal/arc/join-leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId: project.id }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (data.reason === 'not_verified') {
          alert('Please verify that you follow the project first.');
          return;
        }
        throw new Error(data.error || 'Failed to join leaderboard');
      }

      // Refresh creators list
      await refreshCreators();
    } catch (err: any) {
      console.error('[ArenaDetailsPage] Join leaderboard error:', err);
      alert(err?.message || 'Failed to join leaderboard. Please try again.');
    } finally {
      setJoiningLeaderboard(false);
    }
  };

  // Refresh creators list
  // Uses the same endpoint as initial fetch: /api/portal/arc/arenas/${arenaSlug}
  // NEVER calls /api/portal/arc/admin/arena-creators
  const refreshCreators = async () => {
    if (!arenaSlug || typeof arenaSlug !== 'string') return;

    try {
      const normalizedArenaSlug = arenaSlug.trim().toLowerCase();
      const fetchUrl = `/api/portal/arc/arenas/${encodeURIComponent(normalizedArenaSlug)}`;
      
      // Debug logging (development only)
      if (process.env.NODE_ENV === 'development') {
        console.log('[ArenaDetailsPage] Refreshing creators:', {
          arenaSlug: normalizedArenaSlug,
          fetchUrl,
        });
      }

      const res = await fetch(fetchUrl, { credentials: 'include' });
      
      // Debug logging (development only)
      if (process.env.NODE_ENV === 'development') {
        console.log('[ArenaDetailsPage] Refresh response:', {
          url: fetchUrl,
          ok: res.ok,
          status: res.status,
        });
      }

      if (!res.ok) return;

      const data: ArenaResponse = await res.json();
      if (data.ok) {
        setCreators(data.creators || []);
      }
    } catch (err) {
      console.error('[ArenaDetailsPage] Error refreshing creators:', err);
    }
  };

  // Handle Add Creator
  const handleAddCreator = async () => {
    if (!arena || !formData.twitter_username.trim()) {
      setModalError('Twitter username is required');
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch('/api/portal/arc/arena-creators-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          arenaId: arena.id,
          twitter_username: formData.twitter_username.trim(),
          arc_points: formData.arc_points,
          ring: formData.ring,
          style: formData.style.trim() || null,
        }),
      });

      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Failed to add creator');
      }

      // Refresh the list
      await refreshCreators();

      // Reset form and close modal
      setFormData({
        twitter_username: '',
        arc_points: 0,
        ring: 'discovery',
        style: '',
      });
      setShowAddModal(false);
      setModalError(null);
    } catch (err: any) {
      console.error('[ArenaDetailsPage] Error adding creator:', err);
      setModalError(err?.message || 'Failed to save creator. Please try again.');
    } finally {
      setModalLoading(false);
    }
  };

  // Handle Edit Creator
  const handleEditCreator = async () => {
    if (!editingCreator || !editingCreator.id || !arena) {
      setModalError('Invalid creator data');
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch('/api/portal/arc/arena-creators-admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingCreator.id,
          arc_points: formData.arc_points,
          ring: formData.ring,
          style: formData.style.trim() || null,
        }),
      });

      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Failed to update creator');
      }

      // Refresh the list
      await refreshCreators();

      // Close modal and reset state
      closeModals();
    } catch (err: any) {
      console.error('[ArenaDetailsPage] Error updating creator:', err);
      setModalError(err?.message || 'Failed to save creator. Please try again.');
    } finally {
      setModalLoading(false);
    }
  };

  // Handle Remove Creator
  const handleRemoveCreator = async (creatorId: string) => {
    if (!window.confirm('Are you sure you want to remove this creator from the arena?')) {
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch(`/api/portal/arc/arena-creators-admin?id=${encodeURIComponent(creatorId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      // Check if response is JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await res.text();
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Failed to remove creator');
      }

      // Refresh the list
      await refreshCreators();

      // Close modal and reset state
      closeModals();
    } catch (err: any) {
      console.error('[ArenaDetailsPage] Error removing creator:', err);
      setModalError(err?.message || 'Failed to remove creator. Please try again.');
    } finally {
      setModalLoading(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (creator: Creator) => {
    setEditingCreator(creator);
    setFormData({
      twitter_username: creator.twitter_username,
      arc_points: creator.arc_points,
      ring: (creator.ring as 'core' | 'momentum' | 'discovery') || 'discovery',
      style: creator.style || '',
    });
    setModalError(null);
    setShowEditModal(true);
  };

  // Open history modal
  const openHistoryModal = async (creator: Creator) => {
    if (!arena || !creator.profile_id) {
      setModalError('Creator profile ID is missing');
      return;
    }

    setAdjustingCreator(creator);
    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch(
        `/api/portal/arc/admin/point-adjustments?arenaId=${encodeURIComponent(arena.id)}&creatorProfileId=${encodeURIComponent(creator.profile_id)}`
      );
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to fetch history');
      }

      setAdjustmentHistory(data.adjustments || []);
      setShowHistoryModal(true);
    } catch (err: any) {
      console.error('[ArenaDetailsPage] Error fetching history:', err);
      setModalError(err?.message || 'Failed to load history');
    } finally {
      setModalLoading(false);
    }
  };

  // Handle point adjustment
  const handleAdjustPoints = async () => {
    if (!arena || !adjustingCreator || !adjustingCreator.profile_id) {
      setModalError('Missing required data');
      return;
    }

    if (!adjustmentForm.reason.trim()) {
      setModalError('Reason is required');
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch('/api/portal/arc/admin/point-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          arenaId: arena.id,
          creatorProfileId: adjustingCreator.profile_id,
          pointsDelta: adjustmentForm.pointsDelta,
          reason: adjustmentForm.reason.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create adjustment');
      }

      // Refresh creators list to show updated arc_points (now updated directly in DB)
      await refreshCreators();

      // If history modal was open, refresh it too
      if (showHistoryModal && adjustingCreator?.profile_id) {
        try {
          const historyRes = await fetch(
            `/api/portal/arc/admin/point-adjustments?arenaId=${encodeURIComponent(arena.id)}&creatorProfileId=${encodeURIComponent(adjustingCreator.profile_id)}`
          );
          const historyData = await historyRes.json();
          if (historyRes.ok && historyData.ok) {
            setAdjustmentHistory(historyData.adjustments || []);
          }
        } catch (err) {
          console.error('[ArenaDetailsPage] Error refreshing history:', err);
        }
      }

      // Close modal
      setShowAdjustModal(false);
      setAdjustingCreator(null);
      setAdjustmentForm({ pointsDelta: 0, reason: '' });
      setModalError(null);
    } catch (err: any) {
      console.error('[ArenaDetailsPage] Error adjusting points:', err);
      setModalError(err?.message || 'Failed to adjust points');
    } finally {
      setModalLoading(false);
    }
  };

  // Close modals
  const closeModals = () => {
    setShowAddModal(false);
    setShowEditModal(false);
    setShowAdjustModal(false);
    setShowHistoryModal(false);
    setEditingCreator(null);
    setAdjustingCreator(null);
    setAdjustmentHistory([]);
    setFormData({
      twitter_username: '',
      arc_points: 0,
      ring: 'discovery',
      style: '',
    });
    setAdjustmentForm({ pointsDelta: 0, reason: '' });
    setModalError(null);
  };

  // Safe project slug for navigation (use project.slug from API if available, otherwise normalized router slug)
  const safeProjectSlug = (project?.slug || projectSlug || '').trim().toLowerCase();

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
            {/* Combined Project & Arena Header */}
            {project && arena && (
              <div className="rounded-xl border border-slate-700 overflow-hidden bg-akari-card relative">
                {/* Dimmed background header image */}
                {project.header_image_url && (
                  <div className="absolute inset-0 z-0">
                    <img
                      src={project.header_image_url}
                      alt={`${project.name} header`}
                      className="w-full h-full object-cover opacity-10"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/60" />
                  </div>
                )}
                <div className="relative z-10 p-4 sm:p-6">
                  {/* Top Section: Project & Arena Info */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4 sm:mb-6">
                    <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                      {project.avatar_url && (
                        <img
                          src={project.avatar_url}
                          alt={project.name}
                          className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-full border-2 border-akari-border flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm text-akari-muted mb-0.5">
                          {project.name}
                        </p>
                        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-akari-text mb-1">
                          {arena.name}
                        </h1>
                        {project.twitter_username && (
                          <p className="text-[10px] sm:text-xs text-akari-muted">
                            @{project.twitter_username.replace(/^@/, '')}
                          </p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium border flex-shrink-0 ${getArenaStatusColor(
                        arena.status
                      )}`}
                    >
                      {arena.status}
                    </span>
                  </div>

                  {/* Arena Description */}
                  {arena.description && (
                    <p className="text-xs sm:text-sm text-akari-muted mb-4 sm:mb-6">
                      {arena.description}
                    </p>
                  )}

                  {/* Arena Metadata & Project Team Row */}
                  <div className="space-y-4 sm:space-y-6">
                    {/* Arena metadata */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div>
                        <p className="text-[10px] sm:text-xs text-akari-muted mb-1">Date Range</p>
                        <p className="text-xs sm:text-sm text-akari-text">
                          {formatDateRange(arena.starts_at, arena.ends_at)}
                        </p>
                      </div>
                      <div className="group relative">
                        <p className="text-[10px] sm:text-xs text-akari-muted mb-1 flex items-center gap-1">
                          Reward Depth
                          <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-akari-muted cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div className="absolute bottom-full left-0 mb-2 hidden w-48 rounded-lg bg-black/90 p-2 text-[10px] text-white/80 shadow-lg group-hover:block z-20 border border-white/10">
                            Number of top participants who will receive rewards. Set by the project team.
                          </div>
                        </p>
                        <p className="text-xs sm:text-sm font-medium text-akari-text">
                          Top {arena.reward_depth}
                        </p>
                      </div>
                    </div>

                    {/* Project Team Profiles - Smaller */}
                    {teamMembers.length > 0 && (
                      <div>
                        <h2 className="text-xs sm:text-sm font-semibold text-akari-text mb-2 sm:mb-3">Project Team</h2>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                          {teamMembers.map((member) => (
                            <div
                              key={member.id}
                              className="flex flex-col items-center gap-1 p-1.5 sm:p-2 rounded-lg bg-akari-cardSoft/30 border border-akari-border/30 hover:bg-akari-cardSoft/40 transition-colors"
                            >
                              {member.profile?.profile_image_url ? (
                                <img
                                  src={member.profile.profile_image_url}
                                  alt={member.profile.username}
                                  className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full border border-akari-border/30 object-cover flex-shrink-0"
                                />
                              ) : (
                                <div className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 rounded-full bg-akari-cardSoft/50 border border-akari-border/30 flex items-center justify-center font-semibold text-[8px] sm:text-[9px] md:text-[10px] text-akari-text flex-shrink-0">
                                  {member.profile?.username?.[0]?.toUpperCase() || '?'}
                                </div>
                              )}
                              <div className="w-full text-center min-w-0">
                                <p className="text-[8px] sm:text-[9px] md:text-[10px] font-medium text-akari-text truncate">
                                  @{(member.profile?.username || 'Unknown').replace(/^@+/, '')}
                                </p>
                                {member.affiliate_title && (
                                  <p className="text-[7px] sm:text-[8px] text-akari-muted truncate mt-0.5">
                                    {member.affiliate_title}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Creators Leaderboard / Storyline Section */}
            <section>
              {/* Tabs */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2 border-b border-akari-border/30">
                  <button
                    onClick={() => setActiveTab('leaderboard')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === 'leaderboard'
                        ? 'text-akari-primary border-b-2 border-akari-primary'
                        : 'text-akari-muted hover:text-akari-text'
                    }`}
                  >
                    Leaderboard
                  </button>
                  <button
                    onClick={() => setActiveTab('storyline')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === 'storyline'
                        ? 'text-akari-primary border-b-2 border-akari-primary'
                        : 'text-akari-muted hover:text-akari-text'
                    }`}
                  >
                    Storyline
                  </button>
                  <button
                    onClick={() => setActiveTab('map')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === 'map'
                        ? 'text-akari-primary border-b-2 border-akari-primary'
                        : 'text-akari-muted hover:text-akari-text'
                    }`}
                  >
                    Map
                  </button>
                  {project && gamefiEnabled && (
                    <button
                      onClick={() => setActiveTab('quests')}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        activeTab === 'quests'
                          ? 'text-akari-primary border-b-2 border-akari-primary'
                          : 'text-akari-muted hover:text-akari-text'
                      }`}
                    >
                      Quests
                    </button>
                  )}
                </div>
                {canWrite && activeTab === 'leaderboard' && project?.arc_access_level === 'creator_manager' && (
                  <button
                    onClick={() => {
                      setFormData({
                        twitter_username: '',
                        arc_points: 0,
                        ring: 'discovery',
                        style: '',
                      });
                      setModalError(null);
                      setShowAddModal(true);
                    }}
                    className="px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
                  >
                    Add Creator
                  </button>
                )}
                {canWrite && activeTab === 'leaderboard' && project?.arc_access_level !== 'creator_manager' && (
                  <div className="text-xs text-akari-muted italic">
                    Creators are automatically tracked from X contributions
                  </div>
                )}
              </div>

              {/* Leaderboard Tab Content */}
              {activeTab === 'leaderboard' && (
                <div className="rounded-xl border border-slate-700 p-4 sm:p-6 bg-akari-card">
                  {/* CRM Private Placeholder */}
                  {crmStatus?.isCRM && crmStatus.visibility === 'private' && !crmStatus.canViewLeaderboard && (
                    <div className="text-center py-12">
                      <div className="mb-4">
                        <svg className="w-16 h-16 mx-auto text-akari-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-akari-text mb-2">Private Creator Program</h3>
                      <p className="text-sm text-akari-muted mb-4">
                        This leaderboard is private. Only invited participants can view it.
                      </p>
                      {crmStatus.isInvited && !crmStatus.isApproved && (
                        <p className="text-xs text-akari-muted">
                          Your invitation is pending approval.
                        </p>
                      )}
                      {!crmStatus.isInvited && (
                        <p className="text-xs text-akari-muted">
                          Contact the project admin to request access.
                        </p>
                      )}
                    </div>
                  )}
                  
                  {/* CRM Public with Apply Button */}
                  {crmStatus?.isCRM && crmStatus.visibility === 'public' && !crmStatus.isApproved && crmStatus.canApply && (
                    <div className="mb-6 p-4 rounded-lg bg-akari-primary/10 border border-akari-primary/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-akari-text mb-1">Join This Creator Program</h4>
                          <p className="text-xs text-akari-muted">
                            Apply to participate and track your contributions on the leaderboard.
                          </p>
                        </div>
                        <button
                          onClick={async () => {
                            if (!arenaSlug) return;
                            
                            try {
                              const res = await fetch(`/api/portal/arc/arenas/${encodeURIComponent(arenaSlug)}/apply`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                              });
                              
                              const data = await res.json();
                              
                              if (res.ok && data.ok) {
                                alert(data.message || 'Application submitted successfully!');
                                // Refresh status
                                const statusRes = await fetch(`/api/portal/arc/arenas/${encodeURIComponent(arenaSlug)}/status`, {
                                  credentials: 'include',
                                });
                                if (statusRes.ok) {
                                  const statusData = await statusRes.json();
                                  if (statusData.ok) {
                                    setCrmStatus(statusData.status);
                                  }
                                }
                              } else {
                                alert(data.error || 'Failed to apply');
                              }
                            } catch (err) {
                              console.error('Error applying:', err);
                              alert('Failed to submit application. Please try again.');
                            }
                          }}
                          className="px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
                        >
                          Apply to Join
                        </button>
                      </div>
                    </div>
                  )}

                  {/* UTM Link for Participants */}
                  {crmStatus?.isCRM && crmStatus.isApproved && crmStatus.utmLink && (
                    <div className="mb-6 p-4 rounded-lg bg-akari-cardSoft/50 border border-akari-border/30">
                      <h4 className="text-sm font-semibold text-akari-text mb-2">Your Tracking Link</h4>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={crmStatus.utmLink}
                          readOnly
                          className="flex-1 px-3 py-2 text-sm bg-akari-card/50 border border-akari-border/30 rounded-lg text-akari-text"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}${crmStatus.utmLink}`);
                            alert('Link copied to clipboard!');
                          }}
                          className="px-3 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
                        >
                          Copy
                        </button>
                      </div>
                      <p className="text-xs text-akari-muted mt-2">
                        Use this link to track your contributions and referrals.
                      </p>
                    </div>
                  )}

                  {leaderboardLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                      <span className="ml-3 text-akari-muted">Loading leaderboard…</span>
                    </div>
                  ) : (!crmStatus?.isCRM || crmStatus.canViewLeaderboard) ? (
                    leaderboardEntries.length === 0 ? (
                      <p className="text-sm text-akari-muted">
                        No contributors found yet. Be the first to contribute!
                      </p>
                    ) : (
                      <>
                        {/* Leaderboard Header with Search */}
                        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <div>
                            <h3 className="text-lg font-semibold text-akari-text mb-2">
                              Public Leaderboard
                            </h3>
                            <p className="text-sm text-akari-muted">
                              Showing {((leaderboardPage - 1) * 100) + 1} - {Math.min(leaderboardPage * 100, leaderboardTotal)} of {leaderboardTotal} contributors
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <input
                              type="text"
                              placeholder="Search for user"
                              value={leaderboardSearch}
                              onChange={(e) => setLeaderboardSearch(e.target.value)}
                              className="px-4 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors w-full sm:w-64"
                            />
                          </div>
                        </div>

                        {/* Table-based Leaderboard - Responsive */}
                        <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8 lg:-mx-12 lg:px-12 xl:-mx-16 xl:px-16">
                          <table className="w-full border-collapse min-w-[280px] sm:min-w-[400px] md:min-w-[600px] lg:min-w-[800px] xl:min-w-[900px]">
                            <thead>
                              <tr className="border-b border-akari-border/30">
                                <th className="text-left py-2 px-1 sm:py-2 sm:px-1.5 md:px-3 text-[10px] sm:text-xs font-semibold text-akari-muted uppercase tracking-wider">#</th>
                                <th className="text-left py-2 px-1 sm:py-2 sm:px-1.5 md:px-3 text-[10px] sm:text-xs font-semibold text-akari-muted uppercase tracking-wider min-w-[100px] sm:min-w-[120px] md:min-w-[140px]">Name</th>
                                <th className="text-right py-2 px-1 sm:py-2 sm:px-1.5 md:px-3 text-[10px] sm:text-xs font-semibold text-akari-muted uppercase tracking-wider whitespace-nowrap">ARC Points</th>
                                <th className="text-right py-2 px-1 sm:py-2 sm:px-1.5 md:px-3 text-[10px] sm:text-xs font-semibold text-akari-muted uppercase tracking-wider hidden sm:table-cell">
                                  Ring
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {leaderboardEntries
                                .filter((entry) => {
                                  if (!leaderboardSearch.trim()) return true;
                                  const searchLower = leaderboardSearch.toLowerCase();
                                  const username = entry.twitter_username.replace(/^@+/, '').toLowerCase();
                                  return username.includes(searchLower);
                                })
                                .map((entry, index) => {
                                  const creatorUrl = `/portal/arc/creator/${encodeURIComponent(entry.twitter_username.replace(/^@/, '').toLowerCase())}`;
                                  const isTopThree = entry.rank <= 3;
                                  const engagementTypeCounts = entry.engagement_types || { threader: 0, video: 0, clipper: 0, meme: 0 };
                                  const primaryEngagementType = Object.entries(engagementTypeCounts)
                                    .sort(([, a], [, b]) => (b as number) - (a as number))[0]?.[0] || null;
                                  
                                  // Calculate points using a restrictive formula (hard to earn, limited)
                                  // Formula: (signal * 2 + sentiment_bonus + ct_heat * 1 - noise * 0.5) / 15
                                  // This keeps points low and makes them look valuable
                                  const signalValue = entry.signal || 0;
                                  const noiseValue = entry.noise || 0;
                                  const sentimentValue = entry.sentiment !== null ? entry.sentiment : 50;
                                  const ctHeatValue = entry.ct_heat !== null ? entry.ct_heat : 0;
                                  
                                  // Sentiment bonus: only positive sentiment (>50) contributes
                                  const sentimentBonus = sentimentValue > 50 ? (sentimentValue - 50) * 0.3 : 0;
                                  
                                  // Calculate raw points
                                  const rawPoints = (signalValue * 2) + sentimentBonus + (ctHeatValue * 1) - (noiseValue * 0.5);
                                  
                                  // Scale down to make points scarce (divide by 15, floor to keep them low)
                                  const calculatedPoints = Math.floor(Math.max(0, rawPoints) / 15);
                                  
                                  return (
                                    <tr
                                      key={entry.twitter_username}
                                      className={`border-b border-akari-border/10 transition-colors hover:bg-akari-cardSoft/20 ${
                                        isTopThree ? 'bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5' : ''
                                      }`}
                                    >
                                      <td className="py-2 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-3">
                                        <span className={`text-[10px] sm:text-[11px] md:text-xs lg:text-sm font-semibold whitespace-nowrap ${isTopThree ? 'text-akari-primary' : 'text-akari-text'}`}>
                                          #{entry.rank}
                                        </span>
                                      </td>
                                      <td className="py-2 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-3">
                                        <Link href={creatorUrl} className="flex items-center gap-1 sm:gap-1.5 md:gap-2 group">
                                          {entry.avatar_url && entry.avatar_url.trim() !== '' ? (
                                            <img
                                              src={entry.avatar_url}
                                              alt={entry.twitter_username}
                                              className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 lg:w-10 lg:h-10 rounded-full border border-akari-border/30 object-cover flex-shrink-0"
                                              onError={(e) => {
                                                const target = e.target as HTMLImageElement;
                                                target.style.display = 'none';
                                                const placeholder = target.nextElementSibling as HTMLElement;
                                                if (placeholder) placeholder.style.display = 'flex';
                                              }}
                                            />
                                          ) : null}
                                          <div className={`w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 lg:w-10 lg:h-10 rounded-full bg-akari-cardSoft/50 border border-akari-border/30 flex items-center justify-center font-semibold text-[9px] sm:text-[10px] md:text-xs lg:text-sm text-akari-text flex-shrink-0 ${entry.avatar_url && entry.avatar_url.trim() !== '' ? 'hidden' : ''}`}>
                                            {entry.twitter_username.replace(/^@/, '')[0]?.toUpperCase() || '?'}
                                          </div>
                                          <div className="flex flex-col min-w-0">
                                            <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-medium text-akari-text group-hover:text-akari-primary transition-colors truncate">
                                              @{entry.twitter_username.replace(/^@+/, '')}
                                            </span>
                                            <div className="flex items-center gap-0.5 sm:gap-1 mt-0.5">
                                              {entry.ring && (
                                                <span className={`px-0.5 sm:px-1 md:px-1.5 lg:px-2 py-0.5 rounded-full text-[7px] sm:text-[8px] md:text-[10px] lg:text-xs font-medium border ${getRingColor(entry.ring)}`}>
                                                  {entry.ring}
                                                </span>
                                              )}
                                              {primaryEngagementType && (
                                                <span className="text-[7px] sm:text-[8px] md:text-[10px] lg:text-xs text-akari-muted capitalize hidden md:inline">
                                                  {primaryEngagementType}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </Link>
                                      </td>
                                      <td className="py-2 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-3 text-right">
                                        <span className={`text-[10px] sm:text-[11px] md:text-xs lg:text-sm font-bold whitespace-nowrap ${isTopThree ? 'text-akari-neon-teal' : 'text-akari-primary'}`}>
                                          {calculatedPoints}
                                        </span>
                                      </td>
                                      <td className="py-2 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-3 text-right hidden sm:table-cell whitespace-nowrap">
                                        <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-medium text-akari-text">
                                          {entry.signal ? entry.signal.toLocaleString() : '0'}
                                        </span>
                                      </td>
                                      <td className="py-2 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-3 text-right hidden lg:table-cell whitespace-nowrap">
                                        <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-medium text-akari-muted">
                                          {entry.noise ? entry.noise.toLocaleString() : '0'}
                                        </span>
                                      </td>
                                      <td className="py-2 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-3 text-right hidden xl:table-cell whitespace-nowrap">
                                        <span className={`text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-medium ${
                                          entry.sentiment !== null && entry.sentiment > 50 
                                            ? 'text-green-400' 
                                            : entry.sentiment !== null && entry.sentiment < 50 
                                            ? 'text-red-400' 
                                            : 'text-akari-muted'
                                        }`}>
                                          {entry.sentiment !== null ? entry.sentiment : 'N/A'}
                                        </span>
                                      </td>
                                      <td className="py-2 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-3 text-right hidden xl:table-cell whitespace-nowrap">
                                        <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-medium text-akari-text">
                                          {entry.ct_heat !== null ? entry.ct_heat : 'N/A'}
                                        </span>
                                      </td>
                                      <td className="py-2 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-3 text-right hidden lg:table-cell">
                                        <div className="flex flex-col items-end gap-0.5 sm:gap-1">
                                          {Object.entries(engagementTypeCounts).some(([, count]) => (count as number) > 0) ? (
                                            <div className="flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] md:text-xs">
                                              {engagementTypeCounts.threader > 0 && (
                                                <span className="px-1 sm:px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                                  T:{engagementTypeCounts.threader}
                                                </span>
                                              )}
                                              {engagementTypeCounts.video > 0 && (
                                                <span className="px-1 sm:px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                                  V:{engagementTypeCounts.video}
                                                </span>
                                              )}
                                              {engagementTypeCounts.clipper > 0 && (
                                                <span className="px-1 sm:px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                                  C:{engagementTypeCounts.clipper}
                                                </span>
                                              )}
                                              {engagementTypeCounts.meme > 0 && (
                                                <span className="px-1 sm:px-1.5 py-0.5 rounded bg-pink-500/20 text-pink-400 border border-pink-500/30">
                                                  M:{engagementTypeCounts.meme}
                                                </span>
                                              )}
                                            </div>
                                          ) : (
                                            <span className="text-[9px] sm:text-[10px] md:text-xs text-akari-muted">N/A</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="py-2 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-3 text-right whitespace-nowrap">
                                        <span className="text-[9px] sm:text-[10px] md:text-xs lg:text-sm font-semibold text-akari-primary">
                                          {entry.mindshare ? entry.mindshare.toLocaleString() : entry.score.toLocaleString()}
                                        </span>
                                      </td>
                                      <td className="py-2 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-3 text-right hidden xl:table-cell whitespace-nowrap">
                                        {entry.smart_followers_count !== null ? (
                                          <div className="flex flex-col items-end gap-0.5">
                                            <span className="text-[9px] sm:text-[10px] md:text-xs font-medium text-akari-text">
                                              {entry.smart_followers_count.toLocaleString()}
                                            </span>
                                            {entry.smart_followers_pct !== null && (
                                              <span className="text-[8px] sm:text-[9px] text-akari-muted">
                                                {entry.smart_followers_pct.toFixed(1)}%
                                              </span>
                                            )}
                                          </div>
                                        ) : (
                                          <span className="text-[9px] sm:text-[10px] md:text-xs text-akari-muted">N/A</span>
                                        )}
                                      </td>
                                      <td className="py-2 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-3 text-right hidden lg:table-cell whitespace-nowrap">
                                        {entry.signal_score !== null ? (
                                          <span className={`text-[9px] sm:text-[10px] md:text-xs font-medium ${
                                            entry.signal_score >= 80 ? 'text-green-400' :
                                            entry.signal_score >= 60 ? 'text-akari-primary' :
                                            entry.signal_score >= 40 ? 'text-yellow-400' :
                                            'text-akari-muted'
                                          }`}>
                                            {Math.round(entry.signal_score)}
                                          </span>
                                        ) : (
                                          <span className="text-[9px] sm:text-[10px] md:text-xs text-akari-muted">N/A</span>
                                        )}
                                      </td>
                                      <td className="py-2 sm:py-2.5 md:py-3 px-1 sm:px-1.5 md:px-3 text-right hidden lg:table-cell whitespace-nowrap">
                                        {entry.trust_band ? (
                                          <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] md:text-[10px] font-medium border ${
                                            entry.trust_band === 'A' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                                            entry.trust_band === 'B' ? 'bg-akari-primary/20 text-akari-primary border-akari-primary/30' :
                                            entry.trust_band === 'C' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                                            'bg-akari-cardSoft/50 text-akari-muted border-akari-border/30'
                                          }`}>
                                            {entry.trust_band}
                                          </span>
                                        ) : (
                                          <span className="text-[9px] sm:text-[10px] md:text-xs text-akari-muted">N/A</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>

                        {/* Pagination */}
                        {leaderboardTotalPages > 1 && (
                          <div className="flex items-center justify-between mt-6 pt-6 border-t border-akari-border/30">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setLeaderboardPage(prev => Math.max(1, prev - 1))}
                                disabled={leaderboardPage === 1}
                                className="px-3 py-2 text-sm font-medium bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text hover:bg-akari-cardSoft/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                Previous
                              </button>
                              <div className="flex items-center gap-1">
                                {Array.from({ length: Math.min(5, leaderboardTotalPages) }, (_, i) => {
                                  let pageNum: number;
                                  if (leaderboardTotalPages <= 5) {
                                    pageNum = i + 1;
                                  } else if (leaderboardPage <= 3) {
                                    pageNum = i + 1;
                                  } else if (leaderboardPage >= leaderboardTotalPages - 2) {
                                    pageNum = leaderboardTotalPages - 4 + i;
                                  } else {
                                    pageNum = leaderboardPage - 2 + i;
                                  }
                                  return (
                                    <button
                                      key={pageNum}
                                      onClick={() => setLeaderboardPage(pageNum)}
                                      className={`px-3 py-2 text-sm font-medium rounded-lg border transition-colors ${
                                        leaderboardPage === pageNum
                                          ? 'bg-akari-primary/20 border-akari-primary/50 text-akari-primary'
                                          : 'bg-akari-cardSoft/30 border-akari-border/30 text-akari-text hover:bg-akari-cardSoft/50'
                                      }`}
                                    >
                                      {pageNum}
                                    </button>
                                  );
                                })}
                              </div>
                              <button
                                onClick={() => setLeaderboardPage(prev => Math.min(leaderboardTotalPages, prev + 1))}
                                disabled={leaderboardPage >= leaderboardTotalPages}
                                className="px-3 py-2 text-sm font-medium bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text hover:bg-akari-cardSoft/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                              >
                                Next
                              </button>
                            </div>
                            <p className="text-sm text-akari-muted">
                              Page {leaderboardPage} of {leaderboardTotalPages}
                            </p>
                          </div>
                        )}
                      </>
                    )
                  ) : null}
                </div>
              )}

              {/* Storyline Tab Content */}
              {activeTab === 'storyline' && (
                <>
                  {/* Narrative Summary */}
                  <div className="rounded-xl border border-slate-700 p-4 bg-akari-card mb-4">
                    <h3 className="text-sm font-semibold text-akari-text mb-2">Narrative Summary</h3>
                    <p className="text-sm text-akari-muted leading-relaxed">
                      {narrativeSummaryText}
                    </p>
                  </div>

                  {/* Arena Storyline */}
                  <div className="rounded-xl border border-slate-700 p-4 sm:p-6 bg-akari-card">
                    <h2 className="text-xl font-semibold text-akari-text mb-4">Arena Storyline</h2>
                  {storyEvents.length === 0 ? (
                    <p className="text-sm text-akari-muted">
                      No storyline events yet. Add creators to start the narrative.
                    </p>
                  ) : (
                    <div className="space-y-6">
                      {storyEvents.map((event, index) => (
                        <div key={index} className="flex gap-4">
                          {/* Timeline visual */}
                          <div className="flex flex-col items-center">
                            <div className="w-2 h-2 rounded-full bg-akari-primary mt-1" />
                            {index < storyEvents.length - 1 && (
                              <div className="w-px h-full min-h-[40px] bg-akari-border/30 mt-2" />
                            )}
                          </div>
                          {/* Event content */}
                          <div className="flex-1 pb-4">
                            <p className="text-xs text-akari-muted mb-1">
                              {formatStorylineDate(event.date)}
                            </p>
                            <p className="text-sm text-akari-text">
                              {event.text}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                </>
              )}

              {/* Map Tab Content */}
              {activeTab === 'map' && (
                <div className="rounded-xl border border-slate-700 p-4 sm:p-6 bg-akari-card">
                  <h2 className="text-xl font-semibold text-akari-text mb-4">Creator Map</h2>
                  {creators && creators.length > 0 ? (
                    <ArenaBubbleMap creators={creators.filter(c => c && c.twitter_username)} />
                  ) : (
                    <div className="flex items-center justify-center py-12">
                      <p className="text-sm text-akari-muted">No creators to display.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Quests Tab Content (Quest Leaderboard) */}
              {activeTab === 'quests' && (
                <div className="rounded-xl border border-slate-700 p-4 sm:p-6 bg-akari-card">
                  {!gamefiEnabled ? (
                    <div className="flex items-center justify-center py-12">
                      <p className="text-sm text-akari-muted">Quest Leaderboard is not enabled for this project.</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-akari-text">Quests</h2>
                        {canWrite && project && (
                          <button
                            onClick={() => {
                              setQuestForm({
                                name: '',
                                narrative_focus: '',
                                starts_at: '',
                                ends_at: '',
                                reward_desc: '',
                                status: 'draft',
                                quest_type: 'normal',
                                crm_program_id: '',
                              });
                              setShowCreateQuestModal(true);
                            }}
                            className="px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
                          >
                            Create Quest
                          </button>
                        )}
                      </div>
                      {questsLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                          <span className="ml-3 text-akari-muted">Loading quests...</span>
                        </div>
                      ) : quests.length === 0 ? (
                        <div className="flex items-center justify-center py-12">
                          <p className="text-sm text-akari-muted">No quests available yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {quests.map((quest) => {
                            const leaderboard = questLeaderboards.get(quest.id) || [];
                            const isLoading = questLeaderboardsLoading.has(quest.id);
                            
                            return (
                              <div
                                key={quest.id}
                                className="p-6 rounded-xl border border-akari-border/30 bg-akari-cardSoft/30"
                              >
                                <div className="flex items-start justify-between mb-4">
                                  <div className="flex-1">
                                    <h3 className="text-lg font-semibold text-akari-text mb-1">{quest.name}</h3>
                                    {quest.narrative_focus && (
                                      <p className="text-sm text-akari-muted mb-2">{quest.narrative_focus}</p>
                                    )}
                                    <div className="flex items-center gap-4 text-xs text-akari-muted">
                                      <span>
                                        {new Date(quest.starts_at).toLocaleDateString()} - {new Date(quest.ends_at).toLocaleDateString()}
                                      </span>
                                      {quest.reward_desc && (
                                        <span>Reward: {quest.reward_desc}</span>
                                      )}
                                    </div>
                                  </div>
                                  <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                                    quest.status === 'active' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                    quest.status === 'ended' ? 'bg-gray-500/20 text-gray-400 border border-gray-500/30' :
                                    quest.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                    'bg-akari-cardSoft/50 text-akari-muted border border-akari-border/30'
                                  }`}>
                                    {quest.status}
                                  </span>
                                </div>

                                {/* Mini Leaderboard */}
                                {(quest.status === 'active' || quest.status === 'ended') && (
                                  <div className="mt-4 pt-4 border-t border-akari-border/20">
                                    <h4 className="text-sm font-medium text-akari-text mb-3">Top Contributors</h4>
                                    {isLoading ? (
                                      <div className="flex items-center justify-center py-6">
                                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                                      </div>
                                    ) : leaderboard.length === 0 ? (
                                      <p className="text-xs text-akari-muted text-center py-4">
                                        No contributions yet. Be the first!
                                      </p>
                                    ) : (
                                      <div className="space-y-2">
                                        {leaderboard.slice(0, 10).map((entry) => (
                                          <div
                                            key={entry.twitter_username}
                                            className="flex items-center gap-3 p-2 rounded-lg bg-akari-card/30 hover:bg-akari-card/50 transition-colors"
                                          >
                                            <span className="text-xs font-semibold text-akari-text w-6 flex-shrink-0">
                                              #{entry.rank}
                                            </span>
                                            {entry.avatar_url ? (
                                              <img
                                                src={entry.avatar_url}
                                                alt={entry.twitter_username}
                                                className="w-8 h-8 rounded-full border border-akari-border/30"
                                              />
                                            ) : (
                                              <div className="w-8 h-8 rounded-full bg-akari-cardSoft/50 border border-akari-border/30 flex items-center justify-center font-semibold text-akari-text text-xs">
                                                {entry.twitter_username.replace(/^@/, '')[0]?.toUpperCase() || '?'}
                                              </div>
                                            )}
                                            <span className="text-sm text-akari-text flex-1 min-w-0 truncate">
                                              @{entry.twitter_username.replace(/^@+/, '')}
                                            </span>
                                            {entry.ring && (
                                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${getRingColor(entry.ring)}`}>
                                                {entry.ring}
                                              </span>
                                            )}
                                            <span className="text-sm font-medium text-akari-text whitespace-nowrap">
                                              {Math.floor(entry.points).toLocaleString()} pts
                                            </span>
                                          </div>
                                        ))}
                                        {leaderboard.length > 10 && (
                                          <p className="text-xs text-akari-muted text-center pt-2">
                                            Showing top 10 of {leaderboard.length} contributors
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* Add Creator Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-700 bg-akari-card p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-akari-text">Add Creator</h3>
                <button
                  onClick={closeModals}
                  className="text-akari-muted hover:text-akari-text transition-colors"
                  disabled={modalLoading}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Twitter Username</label>
                  <input
                    type="text"
                    value={formData.twitter_username}
                    onChange={(e) => setFormData({ ...formData, twitter_username: e.target.value })}
                    placeholder="username (without @)"
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Base ARC Points (non-negative)</label>
                  <input
                    type="number"
                    value={formData.arc_points}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      if (val < 0) return; // Prevent negative values
                      setFormData({ ...formData, arc_points: val });
                    }}
                    min="0"
                    step="0.01"
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  />
                  <p className="mt-1 text-xs text-akari-muted">
                    Note: To slash points (negative adjustments), use the &quot;Adjust&quot; button instead.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Ring</label>
                  <select
                    value={formData.ring}
                    onChange={(e) => setFormData({ ...formData, ring: e.target.value as 'core' | 'momentum' | 'discovery' })}
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  >
                    <option value="core">Core</option>
                    <option value="momentum">Momentum</option>
                    <option value="discovery">Discovery</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Style (optional)</label>
                  <input
                    type="text"
                    value={formData.style}
                    onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                    placeholder="e.g., Threads + deep dives"
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  />
                </div>

                {modalError && (
                  <div className="rounded-lg border border-akari-danger/30 bg-akari-danger/10 p-2">
                    <p className="text-xs text-akari-danger">{modalError}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={closeModals}
                    className="flex-1 px-4 py-2 text-sm font-medium border border-akari-border/30 rounded-lg text-akari-text hover:bg-akari-cardSoft/30 transition-colors"
                    disabled={modalLoading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddCreator}
                    disabled={modalLoading}
                    className="flex-1 px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {modalLoading ? 'Adding...' : 'Add Creator'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Creator Modal */}
        {showEditModal && editingCreator && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-700 bg-akari-card p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-akari-text">Edit Creator (Base Points Only)</h3>
                <button
                  onClick={closeModals}
                  className="text-akari-muted hover:text-akari-text transition-colors"
                  disabled={modalLoading}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Twitter Username</label>
                  <input
                    type="text"
                    value={formData.twitter_username}
                    disabled
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/20 border border-akari-border/20 rounded-lg text-akari-muted cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">ARC Points (Auto-calculated)</label>
                  <input
                    type="number"
                    value={formData.arc_points}
                    readOnly
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/20 border border-akari-border/20 rounded-lg text-akari-muted cursor-not-allowed"
                    disabled={true}
                  />
                  <p className="mt-1 text-xs text-akari-muted">
                    Points are calculated automatically from creator activity. For manual adjustments, use the &quot;Adjust&quot; button after the creator is added.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Ring</label>
                  <select
                    value={formData.ring}
                    onChange={(e) => setFormData({ ...formData, ring: e.target.value as 'core' | 'momentum' | 'discovery' })}
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  >
                    <option value="core">Core</option>
                    <option value="momentum">Momentum</option>
                    <option value="discovery">Discovery</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Style (optional)</label>
                  <input
                    type="text"
                    value={formData.style}
                    onChange={(e) => setFormData({ ...formData, style: e.target.value })}
                    placeholder="e.g., Threads + deep dives"
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  />
                </div>

                {modalError && (
                  <div className="rounded-lg border border-akari-danger/30 bg-akari-danger/10 p-2">
                    <p className="text-xs text-akari-danger">{modalError}</p>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-2">
                  <div className="flex gap-2">
                    <button
                      onClick={closeModals}
                      className="flex-1 px-4 py-2 text-sm font-medium border border-akari-border/30 rounded-lg text-akari-text hover:bg-akari-cardSoft/30 transition-colors"
                      disabled={modalLoading}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleEditCreator}
                      disabled={modalLoading}
                      className="flex-1 px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {modalLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                  {editingCreator.id && (
                    <button
                      onClick={() => editingCreator.id && handleRemoveCreator(editingCreator.id)}
                      disabled={modalLoading}
                      className="w-full px-4 py-2 text-sm font-medium border border-akari-danger/30 text-akari-danger rounded-lg hover:bg-akari-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Remove from Arena
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Adjust Points Modal */}
        {showAdjustModal && adjustingCreator && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-xl border border-slate-700 bg-akari-card p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-akari-text">Adjust Points</h3>
                <button
                  onClick={closeModals}
                  className="text-akari-muted hover:text-akari-text transition-colors"
                  disabled={modalLoading}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Creator</label>
                  <input
                    type="text"
                    value={`@${(adjustingCreator.twitter_username || 'Unknown').replace(/^@+/, '')}`}
                    disabled
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/20 border border-akari-border/20 rounded-lg text-akari-muted cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Points Delta (can be negative for slashing)</label>
                  <input
                    type="number"
                    value={adjustmentForm.pointsDelta}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setAdjustmentForm({ ...adjustmentForm, pointsDelta: val });
                    }}
                    step="0.01"
                    placeholder="e.g., -5 for slashing 5 points"
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors"
                    disabled={modalLoading}
                  />
                  <p className="mt-1 text-xs text-akari-muted">
                    Current effective: {adjustingCreator.adjusted_points ?? adjustingCreator.arc_points ?? 0} pts
                    {adjustmentForm.pointsDelta !== 0 && (
                      <span className="ml-2">
                        → {((adjustingCreator.adjusted_points ?? adjustingCreator.arc_points ?? 0) + adjustmentForm.pointsDelta).toFixed(2)} pts
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-akari-muted">
                    Base: {adjustingCreator.arc_points ?? 0} pts
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-akari-muted">Reason (required)</label>
                  <textarea
                    value={adjustmentForm.reason}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })}
                    placeholder="e.g., Manual correction for scoring error"
                    rows={3}
                    className="w-full px-3 py-2 text-sm bg-akari-cardSoft/30 border border-akari-border/30 rounded-lg text-akari-text placeholder-akari-muted focus:outline-none focus:border-akari-neon-teal/50 transition-colors resize-none"
                    disabled={modalLoading}
                  />
                </div>

                {modalError && (
                  <div className="rounded-lg border border-akari-danger/30 bg-akari-danger/10 p-2">
                    <p className="text-xs text-akari-danger">{modalError}</p>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={closeModals}
                    className="flex-1 px-4 py-2 text-sm font-medium border border-akari-border/30 rounded-lg text-akari-text hover:bg-akari-cardSoft/30 transition-colors"
                    disabled={modalLoading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAdjustPoints}
                    disabled={modalLoading || !adjustmentForm.reason.trim()}
                    className="flex-1 px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {modalLoading ? 'Adjusting...' : 'Apply Adjustment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Adjustment History Modal */}
        {showHistoryModal && adjustingCreator && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-akari-card p-6 shadow-xl max-h-[80vh] overflow-y-auto">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-akari-text">
                  Adjustment History: @{(adjustingCreator.twitter_username || 'Unknown').replace(/^@+/, '')}
                </h3>
                <button
                  onClick={closeModals}
                  className="text-akari-muted hover:text-akari-text transition-colors"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {modalLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                  <span className="ml-3 text-sm text-akari-muted">Loading history...</span>
                </div>
              ) : adjustmentHistory.length === 0 ? (
                <p className="text-sm text-akari-muted text-center py-8">No adjustments yet.</p>
              ) : (
                <div className="space-y-3">
                  {adjustmentHistory.map((adj) => (
                    <div
                      key={adj.id}
                      className="p-3 rounded-lg bg-akari-cardSoft/30 border border-akari-border/30"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-sm font-medium ${adj.points_delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {adj.points_delta >= 0 ? '+' : ''}{adj.points_delta} pts
                            </span>
                          </div>
                          <p className="text-sm text-akari-text mb-2">{adj.reason}</p>
                          <div className="flex items-center gap-4 text-xs text-akari-muted">
                            <span>
                              {new Date(adj.created_at).toLocaleString()}
                            </span>
                            {adj.created_by_profile_id && (
                              <span>
                                By: {adj.created_by_profile_id.substring(0, 8)}...
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Create Quest Modal */}
        {showCreateQuestModal && project && arena && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-black/90 border border-white/20 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-white mb-4">Create Quest</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">Name *</label>
                  <input
                    type="text"
                    value={questForm.name}
                    onChange={(e) => setQuestForm({ ...questForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                    placeholder="Quest name"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Narrative Focus</label>
                  <textarea
                    value={questForm.narrative_focus}
                    onChange={(e) => setQuestForm({ ...questForm, narrative_focus: e.target.value })}
                    className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                    rows={3}
                    placeholder="Quest narrative focus"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Start Date *</label>
                    <input
                      type="datetime-local"
                      value={questForm.starts_at}
                      onChange={(e) => setQuestForm({ ...questForm, starts_at: e.target.value })}
                      className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">End Date *</label>
                    <input
                      type="datetime-local"
                      value={questForm.ends_at}
                      onChange={(e) => setQuestForm({ ...questForm, ends_at: e.target.value })}
                      className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Reward Description</label>
                  <textarea
                    value={questForm.reward_desc}
                    onChange={(e) => setQuestForm({ ...questForm, reward_desc: e.target.value })}
                    className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                    rows={2}
                    placeholder="Reward description"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Quest Type</label>
                  <select
                    value={questForm.quest_type}
                    onChange={(e) => setQuestForm({ ...questForm, quest_type: e.target.value as 'normal' | 'crm' })}
                    className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                  >
                    <option value="normal">Normal Quest</option>
                    <option value="crm">CRM (KOL/Creator Manager) Quest</option>
                  </select>
                  <p className="mt-1 text-xs text-white/40">
                    {questForm.quest_type === 'crm' 
                      ? 'This quest will link to a Creator Manager program for participant tracking'
                      : 'Standard quest with contribution-based leaderboard'}
                  </p>
                </div>
                {questForm.quest_type === 'crm' && project && (
                  <div>
                    <label className="block text-sm text-white/60 mb-1">CRM Program (Optional)</label>
                    <select
                      value={questForm.crm_program_id}
                      onChange={(e) => setQuestForm({ ...questForm, crm_program_id: e.target.value })}
                      className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                    >
                      <option value="">Select a CRM program (optional)</option>
                      {/* TODO: Fetch and populate creator_manager_programs for this project */}
                    </select>
                    <p className="mt-1 text-xs text-white/40">
                      Link this quest to an existing Creator Manager program. If not selected, a new program can be created.
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm text-white/60 mb-1">Status</label>
                  <select
                    value={questForm.status}
                    onChange={(e) => setQuestForm({ ...questForm, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                  >
                    <option value="draft">Draft</option>
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="ended">Ended</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={async () => {
                      if (!questForm.name || !questForm.starts_at || !questForm.ends_at) {
                        alert('Please fill in required fields: name, start date, end date');
                        return;
                      }
                      try {
                        const res = await fetch('/api/portal/arc/quests', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({
                            project_id: project.id,
                            arena_id: arena.id,
                            name: questForm.name,
                            narrative_focus: questForm.narrative_focus || undefined,
                            starts_at: new Date(questForm.starts_at).toISOString(),
                            ends_at: new Date(questForm.ends_at).toISOString(),
                            reward_desc: questForm.reward_desc || undefined,
                            status: questForm.status,
                            quest_type: questForm.quest_type,
                            crm_program_id: questForm.crm_program_id || undefined,
                          }),
                        });
                        const data = await res.json();
                        if (res.ok && data.ok) {
                          setQuests([...quests, data.quest]);
                          setShowCreateQuestModal(false);
                          setQuestForm({
                            name: '',
                            narrative_focus: '',
                            starts_at: '',
                            ends_at: '',
                            reward_desc: '',
                            status: 'draft',
                            quest_type: 'normal',
                            crm_program_id: '',
                          });
                        } else {
                          alert(data.error || 'Failed to create quest');
                        }
                      } catch (err: any) {
                        alert(err.message || 'Failed to create quest');
                      }
                    }}
                    className="flex-1 px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowCreateQuestModal(false)}
                    className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </ArcPageShell>
  );
}
