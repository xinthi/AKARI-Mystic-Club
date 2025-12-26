/**
 * ARC Project Hub Page
 * 
 * Dynamic route for individual ARC project pages
 * Shows project details, arenas, leaderboard, missions, storyline, and map
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Image from 'next/image';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { getUserCampaignStatuses, type UserCampaignStatus } from '@/lib/arc/helpers';
import { ArenaBubbleMap } from '@/components/arc/ArenaBubbleMap';
import { isSuperAdmin } from '@/lib/permissions';
import type { ProjectPermissionCheck } from '@/lib/project-permissions';
import { getAllTemplates, getTemplate, type CampaignTemplate } from '@/lib/arc-campaign-templates';
import { getRankBadgeFromRank, getBadgeDisplayInfo } from '@/lib/arc-ui-helpers';

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

interface UnifiedArcState {
  ok: boolean;
  modules?: {
    leaderboard: { enabled: boolean; active: boolean; startAt: string | null; endAt: string | null };
    gamefi: { enabled: boolean; active: boolean; startAt: string | null; endAt: string | null };
    crm: { enabled: boolean; active: boolean; startAt: string | null; endAt: string | null; visibility: 'private' | 'public' | 'hybrid' };
  };
  requests?: { pending: boolean; lastStatus: 'pending' | 'approved' | 'rejected' | null };
  error?: string;
}

interface ProjectData {
  id: string;
  name: string;
  display_name: string | null;
  twitter_username: string | null;
  x_handle: string | null;
  avatar_url: string | null;
  slug: string | null;
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

interface MindshareLeaderboardEntry {
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

interface ArenaDetailResponse {
  ok: true;
  arena: Arena;
  creators: Creator[];
}

type TabType = 'overview' | 'leaderboard' | 'missions' | 'storyline' | 'map' | 'crm';

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
 * Build missions based on user's join status and completed mission IDs
 */
function buildMissions(
  hasJoined: boolean,
  completedMissionIds: Set<string>
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
    } else if (completedMissionIds.has(m.id)) {
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
  const rawSlug = router.query.slug;
  // Normalize slug: string, trim, toLowerCase
  const slug = typeof rawSlug === 'string' ? String(rawSlug).trim().toLowerCase() : null;
  const akariUser = useAkariUser();
  const userTwitterUsername = akariUser.user?.xUsername || null;

  // Canonicalize slug: redirect if normalized differs from original
  useEffect(() => {
    if (!router.isReady) return;
    
    const rawSlugValue = router.query.slug;
    if (typeof rawSlugValue === 'string' && rawSlugValue) {
      const normalized = String(rawSlugValue).trim().toLowerCase();
      if (normalized !== rawSlugValue) {
        // Redirect to canonical URL (no full reload)
        router.replace(`/portal/arc/${encodeURIComponent(normalized)}`, undefined, { shallow: false });
        return;
      }
    }
  }, [router.isReady, router.query.slug, router]);

  const [project, setProject] = useState<ArcProject | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [unifiedState, setUnifiedState] = useState<UnifiedArcState | null>(null);
  const [permissions, setPermissions] = useState<ProjectPermissionCheck | null>(null);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [allCreators, setAllCreators] = useState<Creator[]>([]);
  const [mindshareLeaderboardEntries, setMindshareLeaderboardEntries] = useState<MindshareLeaderboardEntry[]>([]);
  const [mindshareLeaderboardLoading, setMindshareLeaderboardLoading] = useState(false);
  const [mindshareLeaderboardError, setMindshareLeaderboardError] = useState<string | null>(null);
  
  // Compute permission flags
  const canWrite = !!permissions && (permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator);
  const [userStatus, setUserStatus] = useState<UserCampaignStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Edit project state
  const [editingProject, setEditingProject] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    slug: '',
    x_handle: '',
    header_image_url: '',
  });
  const [savingProject, setSavingProject] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [joiningProjectId, setJoiningProjectId] = useState<string | null>(null);
  const [showFollowModal, setShowFollowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedArenaId, setSelectedArenaId] = useState<string | null>(null);
  const [completedMissionIds, setCompletedMissionIds] = useState<Set<string>>(new Set());
  const [completingMissionId, setCompletingMissionId] = useState<string | null>(null);
  
  // Mindshare Leaderboard join flow state
  const [followVerified, setFollowVerified] = useState<boolean | null>(null);
  const [verifyingFollow, setVerifyingFollow] = useState(false);
  const [joiningLeaderboard, setJoiningLeaderboard] = useState(false);

  // Leaderboard filter/sort state
  const [searchTerm, setSearchTerm] = useState('');
  const [ringFilter, setRingFilter] = useState<'all' | 'core' | 'momentum' | 'discovery'>('all');
  const [sortBy, setSortBy] = useState<'points_desc' | 'points_asc' | 'joined_newest' | 'joined_oldest'>('points_desc');
  const [leaderboardView, setLeaderboardView] = useState<'score' | 'impact' | 'consistency'>('score');

  // CRM state
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<any | null>(null);
  const [participants, setParticipants] = useState<any[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [externalSubmissions, setExternalSubmissions] = useState<any[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showUTMLinkModal, setShowUTMLinkModal] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<any | null>(null);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    brief_objective: '',
    participation_mode: 'invite_only' as 'invite_only' | 'public' | 'hybrid',
    leaderboard_visibility: 'private' as 'public' | 'private',
    start_at: '',
    end_at: '',
    website_url: '',
    docs_url: '',
    reward_pool_text: '',
    winners_count: 100,
    status: 'draft' as 'draft' | 'live' | 'paused' | 'ended',
  });
  const [prizesEnabled, setPrizesEnabled] = useState(false);
  const [prizeBudget, setPrizeBudget] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [templateQuests, setTemplateQuests] = useState<Array<{ mission_id: string; title: string; points: number }>>([]);
  const [inviteForm, setInviteForm] = useState({ twitter_username: '' });
  const [utmForm, setUtmForm] = useState({ target_url: '' });

  // Campaign Pulse state
  const [pulseMetrics, setPulseMetrics] = useState<{
    creatorsParticipating: number;
    totalCompletions: number | null;
    topCreatorScore: number | null;
  } | null>(null);
  const [pulseLoading, setPulseLoading] = useState(false);

  // Fetch project by slug and unified state
  useEffect(() => {
    async function fetchProject() {
      if (!slug) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Step 1: Resolve project by slug (already normalized)
        const projectUrl = `/api/portal/arc/project-by-slug?slug=${encodeURIComponent(slug)}`;
        
        // Debug logging (development only)
        if (process.env.NODE_ENV === 'development') {
          console.log('[ArcProjectHub] Fetching project:', {
            slug,
            fetchUrl: projectUrl,
          });
        }
        
        const projectRes = await fetch(projectUrl, { credentials: 'include' });
        
        // Debug logging (development only)
        if (process.env.NODE_ENV === 'development') {
          console.log('[ArcProjectHub] Project fetch response:', {
            url: projectUrl,
            ok: projectRes.ok,
            status: projectRes.status,
          });
        }
        
        const projectData = await projectRes.json();

        if (!projectData.ok || !projectData.project) {
          setError(projectData.error || 'Project not found');
          setLoading(false);
          return;
        }

        // Map project-by-slug response to ProjectData format
        const projectInfo: ProjectData = {
          id: projectData.project.id,
          name: projectData.project.name,
          display_name: projectData.project.name,
          twitter_username: projectData.project.twitter_username,
          x_handle: projectData.project.twitter_username,
          avatar_url: projectData.project.avatar_url,
          slug: projectData.project.slug,
        };
        setProjectId(projectInfo.id);

        // Step 2: Fetch unified ARC state
        const stateRes = await fetch(`/api/portal/arc/state?projectId=${projectInfo.id}`, {
          credentials: 'include',
        });
        const stateData: UnifiedArcState = await stateRes.json();

        if (!stateData.ok) {
          // Check if error is due to ARC access not approved
          if (stateData.error?.includes('ARC access not approved')) {
            setError('ARC access not approved for this project');
            setLoading(false);
            return;
          }
          // If unified state fails for other reasons, still show project but log warning
          console.warn('[ArcProjectHub] Failed to fetch unified state:', stateData.error);
        } else {
          setUnifiedState(stateData);
          
          // Check if any module is enabled
          const hasEnabledModule = stateData.modules?.leaderboard.enabled || 
                                   stateData.modules?.gamefi.enabled || 
                                   stateData.modules?.crm.enabled;
          
          if (!hasEnabledModule) {
            setError('ARC is not enabled for this project');
            setLoading(false);
            return;
          }
        }

        // Step 3: Fetch project permissions
        try {
          const permissionsRes = await fetch(`/api/portal/arc/permissions?projectId=${encodeURIComponent(projectInfo.id)}`, {
            credentials: 'include',
          });
          if (permissionsRes.ok) {
            const permissionsData = await permissionsRes.json();
            if (permissionsData.ok) {
              setPermissions(permissionsData.permissions);
            }
          }
        } catch (permErr) {
          console.warn('[ArcProjectHub] Failed to fetch permissions:', permErr);
        }

        // Step 4: Build ArcProject object from project data
        // We'll need to fetch project_arc_settings for meta/tier if available
        const arcProject: ArcProject = {
          project_id: projectInfo.id,
          slug: projectInfo.slug,
          name: projectInfo.name || projectInfo.display_name || 'Unnamed Project',
          twitter_username: projectInfo.twitter_username || projectInfo.x_handle,
          arc_tier: 'basic', // Default, will be updated if we have project_arc_settings
          arc_status: 'active', // Default
          security_status: 'normal', // Default
          meta: {}, // Will be populated if we fetch project_arc_settings
        };

        // Try to fetch project_arc_settings for meta/tier
        try {
          const settingsRes = await fetch(`/api/portal/arc/projects`, {
            credentials: 'include',
          });
          const settingsData: ArcProjectsResponse = await settingsRes.json();
          if (settingsData.ok && settingsData.projects) {
            const foundSettings = settingsData.projects.find(p => p.project_id === projectInfo.id);
            if (foundSettings) {
              arcProject.arc_tier = foundSettings.arc_tier;
              arcProject.arc_status = foundSettings.arc_status;
              arcProject.security_status = foundSettings.security_status;
              arcProject.meta = foundSettings.meta;
            }
          }
        } catch (settingsErr) {
          // Optional, use defaults if it fails
          console.warn('[ArcProjectHub] Failed to fetch project settings:', settingsErr);
        }

        setProject(arcProject);
      } catch (err) {
        setError('Failed to connect to API');
        console.error('[ArcProjectHub] Fetch project error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Fetch arenas for this project
  useEffect(() => {
    async function fetchArenas() {
      if (!projectId || !project) {
        return;
      }

      try {
        // Use projectId if available, otherwise fall back to normalized slug
        const res = await fetch(projectId 
          ? `/api/portal/arc/arenas?projectId=${encodeURIComponent(projectId)}`
          : slug
          ? `/api/portal/arc/arenas?slug=${encodeURIComponent(slug)}`
          : '/api/portal/arc/arenas');
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
  }, [projectId, slug, project, selectedArenaId]);

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

        const arenaUrl = `/api/portal/arc/arenas/${encodeURIComponent(arena.slug)}`;
        
        // Debug logging (development only)
        if (process.env.NODE_ENV === 'development') {
          console.log('[ArcProjectHub] Fetching creators for arena:', {
            arenaId: selectedArenaId,
            arenaSlug: arena.slug,
            fetchUrl: arenaUrl,
          });
        }
        
        const res = await fetch(arenaUrl);
        
        // Debug logging (development only)
        if (process.env.NODE_ENV === 'development') {
          console.log('[ArcProjectHub] Arena creators fetch response:', {
            url: arenaUrl,
            ok: res.ok,
            status: res.status,
          });
        }
        
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

  // Fetch Mindshare Leaderboard (auto-tracked + joined participants)
  useEffect(() => {
    async function fetchMindshareLeaderboard() {
      if (!projectId || !unifiedState?.modules?.leaderboard?.enabled) {
        setMindshareLeaderboardEntries([]);
        return;
      }

      // Only fetch when leaderboard tab is active
      if (activeTab !== 'leaderboard') {
        return;
      }

      try {
        setMindshareLeaderboardLoading(true);
        setMindshareLeaderboardError(null);

        const res = await fetch(`/api/portal/arc/leaderboard/${projectId}`, {
          credentials: 'include',
        });
        const data = await res.json();

        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to load leaderboard');
        }

        setMindshareLeaderboardEntries(data.entries || []);
      } catch (err: any) {
        console.error('[ArcProjectHub] Mindshare leaderboard fetch error:', err);
        setMindshareLeaderboardError(err.message || 'Failed to load leaderboard');
        setMindshareLeaderboardEntries([]);
      } finally {
        setMindshareLeaderboardLoading(false);
      }
    }

    fetchMindshareLeaderboard();
  }, [projectId, unifiedState?.modules?.leaderboard?.enabled, activeTab]);

  // Fetch Campaign Pulse metrics
  useEffect(() => {
    async function fetchPulse() {
      if (!projectId || !canWrite) {
        // Only show pulse for founders/admins
        return;
      }

      try {
        setPulseLoading(true);
        const res = await fetch(`/api/portal/arc/pulse?projectId=${encodeURIComponent(projectId)}`, {
          credentials: 'include',
        });
        const data = await res.json();

        if (res.ok && data.ok && data.metrics) {
          setPulseMetrics(data.metrics);
        }
      } catch (err) {
        console.error('[ArcProjectHub] Error fetching pulse:', err);
      } finally {
        setPulseLoading(false);
      }
    }

    fetchPulse();
  }, [projectId, canWrite]);

  // Track if campaigns have been loaded to avoid refetching unnecessarily
  const [campaignsLoaded, setCampaignsLoaded] = useState(false);

  // Reset campaigns loaded flag when project changes
  useEffect(() => {
    setCampaignsLoaded(false);
    setCampaigns([]);
  }, [projectId]);

  // Fetch campaigns when CRM tab is active or project loads
  useEffect(() => {
    async function fetchCampaigns() {
      if (!projectId || !unifiedState?.modules?.crm?.enabled || !canWrite) {
        return;
      }

      // Only fetch if CRM tab is active or if we haven't loaded campaigns yet
      const shouldFetch = activeTab === 'crm' || !campaignsLoaded;
      if (!shouldFetch) {
        return;
      }

      setCampaignsLoading(true);
      try {
        const res = await fetch(`/api/portal/arc/campaigns?projectId=${encodeURIComponent(projectId)}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.campaigns) {
            setCampaigns(data.campaigns || []);
            setCampaignsLoaded(true);
          }
        }
      } catch (err) {
        console.error('[ArcProjectHub] Error fetching campaigns:', err);
      } finally {
        setCampaignsLoading(false);
      }
    }

    fetchCampaigns();
  }, [projectId, unifiedState?.modules?.crm?.enabled, canWrite, activeTab, campaignsLoaded]);

  // Fetch user campaign status
  useEffect(() => {
    async function fetchUserStatus() {
      if ((!project && !projectId) || !userTwitterUsername) {
        setUserStatus(null);
        return;
      }

      try {
        const targetProjectId = projectId || project?.project_id;
        if (!targetProjectId) {
          setUserStatus(null);
          return;
        }

        const statuses = await getUserCampaignStatuses([targetProjectId], userTwitterUsername);
        const status = statuses.get(targetProjectId);
        setUserStatus(status || { isFollowing: false, hasJoined: false });
      } catch (err) {
        console.error('[ArcProjectHub] Error fetching user status:', err);
        setUserStatus({ isFollowing: false, hasJoined: false });
      }
    }

    fetchUserStatus();
  }, [project, projectId, userTwitterUsername]);

  // Fetch quest completions for selected arena
  const fetchQuestCompletions = async () => {
    if (!selectedArenaId || !akariUser.isLoggedIn) {
      setCompletedMissionIds(new Set());
      return;
    }

    try {
      const res = await fetch(`/api/portal/arc/quests/completions?arenaId=${encodeURIComponent(selectedArenaId)}`, {
        credentials: 'include',
      });
      
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.completions) {
          const missionIds = new Set<string>(data.completions.map((c: { mission_id: string }) => c.mission_id));
          setCompletedMissionIds(missionIds);
        } else {
          setCompletedMissionIds(new Set());
        }
      } else {
        // If unauthorized or error, just clear completions
        setCompletedMissionIds(new Set());
      }
    } catch (err) {
      console.error('[ArcProjectHub] Error fetching quest completions:', err);
      setCompletedMissionIds(new Set());
    }
  };

  useEffect(() => {
    fetchQuestCompletions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArenaId, akariUser.isLoggedIn]);

  // Handle mission completion
  const handleCompleteMission = async (missionId: string) => {
    if (!selectedArenaId || !akariUser.isLoggedIn || completingMissionId) {
      return;
    }

    setCompletingMissionId(missionId);

    try {
      const res = await fetch('/api/portal/arc/quests/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          arenaId: selectedArenaId,
          missionId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          // Refresh completions to update UI
          await fetchQuestCompletions();
        } else {
          console.error('[ArcProjectHub] Error completing mission:', data.error);
          alert(data.error || 'Failed to mark mission as complete');
        }
      } else {
        const data = await res.json();
        console.error('[ArcProjectHub] Error completing mission:', data.error);
        alert(data.error || 'Failed to mark mission as complete');
      }
    } catch (err) {
      console.error('[ArcProjectHub] Error completing mission:', err);
      alert('Failed to mark mission as complete');
    } finally {
      setCompletingMissionId(null);
    }
  };

  // Check follow verification status (read-only check)
  useEffect(() => {
    async function checkFollowVerification() {
      if (!projectId || !akariUser.user) {
        setFollowVerified(null);
        return;
      }

      // Skip check for investor_view (read-only)
      if (permissions?.isInvestorView) {
        setFollowVerified(null);
        return;
      }

      try {
        const res = await fetch(`/api/portal/arc/follow-status?projectId=${encodeURIComponent(projectId)}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            setFollowVerified(data.verified);
          }
        }
      } catch (err) {
        console.error('[ArcProjectHub] Error checking follow verification:', err);
      }
    }

    checkFollowVerification();
  }, [projectId, akariUser.user, permissions?.isInvestorView]);

  // Handle image file selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      alert('Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.');
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      alert('File size exceeds 10MB limit.');
      return;
    }

    setSelectedImageFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle image upload
  const handleImageUpload = async () => {
    if (!projectId || !selectedImageFile) return;

    setUploadingImage(true);
    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(selectedImageFile);
      });

      // Upload to API
      const res = await fetch(`/api/portal/projects/${projectId}/upload-header-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ image: base64 }),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to upload image');
      }

      // Update form with new image URL
      setEditForm({ ...editForm, header_image_url: data.url });
      setSelectedImageFile(null);
      setImagePreview('');
      alert('Image uploaded successfully!');
    } catch (err: any) {
      alert(err.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  // Handle save project edit
  const handleSaveProject = async () => {
    if (!projectId) return;

    setSavingProject(true);
    try {
      const res = await fetch(`/api/portal/admin/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editForm),
      });

      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to update project');
      }

      // Reload page to show updated data
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'Failed to update project');
      setSavingProject(false);
    }
  };

  // Check if user is already in creators list
  const userIsInCreators = useMemo(() => {
    if (!userTwitterUsername || !allCreators.length) return false;
    const normalized = userTwitterUsername.toLowerCase().replace('@', '').trim();
    return allCreators.some(c => 
      c.twitter_username?.toLowerCase().replace('@', '').trim() === normalized
    );
  }, [userTwitterUsername, allCreators]);

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

  // Handle verify follow
  const handleVerifyFollow = async () => {
    if (!projectId || verifyingFollow) return;

    try {
      setVerifyingFollow(true);
      const res = await fetch('/api/portal/arc/verify-follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId }),
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
      console.error('[ArcProjectHub] Verify follow error:', err);
      alert(err?.message || 'Failed to verify follow. Please try again.');
    } finally {
      setVerifyingFollow(false);
    }
  };

  // Handle join leaderboard
  const handleJoinLeaderboard = async () => {
    const targetProjectId = projectId || project?.project_id;
    if (!targetProjectId || joiningLeaderboard) return;

    try {
      setJoiningLeaderboard(true);
      const res = await fetch('/api/portal/arc/join-leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId: targetProjectId }),
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
      if (selectedArenaId) {
        const arena = arenas.find(a => a.id === selectedArenaId);
        if (arena?.slug) {
          const arenaRes = await fetch(`/api/portal/arc/arenas/${encodeURIComponent(arena.slug)}`, { credentials: 'include' });
          const arenaData = await arenaRes.json();
          if (arenaData.ok) {
            setAllCreators(arenaData.creators || []);
          }
        }
      }
    } catch (err: any) {
      console.error('[ArcProjectHub] Join leaderboard error:', err);
      alert(err?.message || 'Failed to join leaderboard. Please try again.');
    } finally {
      setJoiningLeaderboard(false);
    }
  };

  // Handle join campaign (legacy - keep for backward compatibility)
  const handleJoinCampaign = async () => {
    const targetProjectId = projectId || project?.project_id;
    if (!targetProjectId || joiningProjectId) return;

    try {
      setJoiningProjectId(targetProjectId);

      const res = await fetch('/api/portal/arc/join-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ projectId: targetProjectId }),
      });

      const result = await res.json();

      if (!res.ok || !result.ok) {
        // Handle not_following case
        if (result.reason === 'not_following') {
          const projectHandle = project?.twitter_username;
          
          if (projectHandle) {
            alert(`You must follow @${projectHandle} on X to join this campaign. Please follow the project and try again.`);
            // Optionally open X profile in new tab
            window.open(`https://x.com/${projectHandle}`, '_blank');
          } else {
            alert(`You must follow ${project?.name || 'this project'} on X to join this campaign.`);
          }
          return;
        }
        
        throw new Error(result.error || 'Failed to join campaign');
      }

      // Refresh user status
      if (userTwitterUsername && targetProjectId) {
        const statuses = await getUserCampaignStatuses([targetProjectId], userTwitterUsername);
        const status = statuses.get(targetProjectId);
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

  // Filter and sort creators for Quest Leaderboard (arena-based)
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

  // Filter and sort entries for Mindshare Leaderboard (auto-tracked + joined)
  const visibleMindshareEntries = useMemo(() => {
    let filtered = [...mindshareLeaderboardEntries];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter((entry) => {
        return entry.twitter_username.toLowerCase().includes(term);
      });
    }

    if (ringFilter !== 'all') {
      filtered = filtered.filter((entry) => {
        return entry.ring?.toLowerCase() === ringFilter.toLowerCase();
      });
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'points_desc':
          return b.score - a.score;
        case 'points_asc':
          return a.score - b.score;
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
  }, [mindshareLeaderboardEntries, searchTerm, ringFilter, sortBy]);

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

        {/* Project not found or no modules enabled */}
        {!loading && (!project || (unifiedState && !unifiedState.modules?.leaderboard?.enabled && !unifiedState.modules?.gamefi?.enabled && !unifiedState.modules?.crm?.enabled)) && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
            <p className="text-sm text-akari-muted">
              {error || 'ARC is not enabled for this project.'}
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
                    <div className="flex items-center gap-2 mb-1">
                      <h1 
                        className="text-2xl font-bold"
                        style={{
                          color: accentColor,
                          textShadow: `0 0 10px ${accentColor}40`,
                        }}
                      >
                        {project.name || 'Unnamed Project'}
                      </h1>
                      {canWrite && (
                        <button
                          onClick={async () => {
                            // Fetch current project data including header_image_url
                            try {
                              const res = await fetch(`/api/portal/admin/projects/${projectId}`, {
                                credentials: 'include',
                              });
                              const data = await res.json();
                              const headerImageUrl = data.project?.header_image_url || project.meta?.banner_url || '';
                              if (res.ok && data.ok && data.project) {
                                setEditForm({
                                  name: data.project.name || project.name || '',
                                  slug: data.project.slug || project.slug || '',
                                  x_handle: data.project.x_handle || project.twitter_username?.replace(/^@+/, '') || '',
                                  header_image_url: headerImageUrl,
                                });
                              } else {
                                // Fallback to current project data
                                setEditForm({
                                  name: project.name || '',
                                  slug: project.slug || '',
                                  x_handle: project.twitter_username?.replace(/^@+/, '') || '',
                                  header_image_url: headerImageUrl,
                                });
                              }
                              // Set preview if there's an existing image
                              setImagePreview(headerImageUrl || '');
                              setSelectedImageFile(null);
                            } catch (err) {
                              // Fallback to current project data
                              const headerImageUrl = project.meta?.banner_url || '';
                              setEditForm({
                                name: project.name || '',
                                slug: project.slug || '',
                                x_handle: project.twitter_username?.replace(/^@+/, '') || '',
                                header_image_url: headerImageUrl,
                              });
                              setImagePreview(headerImageUrl || '');
                              setSelectedImageFile(null);
                            }
                            setEditingProject(true);
                          }}
                          className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 transition-all"
                          title="Edit Project"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                    </div>
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
                  <div className="flex flex-wrap gap-2">
                    {/* Module-specific buttons */}
                    {unifiedState?.modules?.leaderboard?.enabled && (() => {
                      const activeArena = arenas.find(a => a.status === 'active' && (!a.starts_at || new Date(a.starts_at) <= new Date()) && (!a.ends_at || new Date(a.ends_at) >= new Date()));
                      if (activeArena && project?.slug) {
                        return (
                          <Link
                            href={`/portal/arc/${encodeURIComponent(project.slug)}/arena/${encodeURIComponent(activeArena.slug)}`}
                            className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-akari-neon-teal to-akari-neon-teal/80 text-black rounded-lg hover:shadow-[0_0_20px_rgba(0,246,162,0.4)] transition-all"
                          >
                            View Leaderboard
                          </Link>
                        );
                      }
                      return null;
                    })()}
                    
                    {unifiedState?.modules?.crm?.enabled && ((permissions?.isSuperAdmin || permissions?.isOwner || permissions?.isAdmin || permissions?.isModerator) || unifiedState.modules.crm.visibility !== 'private') && (
                      <Link
                        href={`/portal/arc/creator-manager?projectId=${projectId}`}
                        className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-all"
                      >
                        {(permissions?.isSuperAdmin || permissions?.isOwner || permissions?.isAdmin || permissions?.isModerator) ? 'Creator Manager' : 'Apply as Creator'}
                      </Link>
                    )}
                    
                    {unifiedState?.modules?.gamefi?.enabled && projectId && (
                      <Link
                        href={`/portal/arc/gamified/${projectId}`}
                        className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-all"
                      >
                        GameFi Leaderboard
                      </Link>
                    )}

                    {/* Admin dashboard buttons */}
                    {(permissions?.isSuperAdmin || permissions?.isOwner || permissions?.isAdmin) && unifiedState?.modules?.leaderboard?.enabled && project?.slug && (
                      <Link
                        href={`/portal/arc/admin/${encodeURIComponent(project.slug)}`}
                        className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-all"
                      >
                        Leaderboard Dashboard
                      </Link>
                    )}

                    {/* Mindshare Leaderboard Join Flow buttons (for normal users, not investor_view, not admins) */}
                    {akariUser.user && !permissions?.isInvestorView && !canWrite && unifiedState?.modules?.leaderboard?.enabled && (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2">
                          {followVerified === false && (
                            <button
                              onClick={handleVerifyFollow}
                              disabled={verifyingFollow}
                              className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-akari-neon-teal to-akari-neon-teal/80 text-black rounded-lg hover:shadow-[0_0_20px_rgba(0,246,162,0.4)] transition-all disabled:opacity-50"
                            >
                              {verifyingFollow ? 'Verifying...' : 'Verify Follow'}
                            </button>
                          )}
                          {followVerified === true && !userIsInCreators && (
                            <button
                              onClick={handleJoinLeaderboard}
                              disabled={joiningLeaderboard}
                              className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-akari-neon-teal to-akari-neon-teal/80 text-black rounded-lg hover:shadow-[0_0_20px_rgba(0,246,162,0.4)] transition-all disabled:opacity-50"
                            >
                              {joiningLeaderboard ? 'Joining...' : 'Join Leaderboard'}
                            </button>
                          )}
                        </div>
                        {(followVerified === false || (followVerified === true && !userIsInCreators)) && (
                          <p className="text-xs text-white/60">
                            To join, follow the project on X, then verify here.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Original CTA buttons (legacy - keep for backward compatibility when not logged in) */}
                    {!akariUser.user && (
                      <>
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
                            disabled={joiningProjectId === (projectId || project?.project_id)}
                            className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-akari-neon-teal to-akari-neon-teal/80 text-black rounded-lg hover:shadow-[0_0_20px_rgba(0,246,162,0.4)] transition-all disabled:opacity-50"
                          >
                            {joiningProjectId === (projectId || project?.project_id) ? 'Joining...' : 'Join campaign'}
                          </button>
                        ) : (
                          <button
                            onClick={() => setActiveTab('missions')}
                            className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-akari-neon-teal to-akari-neon-teal/80 text-black rounded-lg hover:shadow-[0_0_20px_rgba(0,246,162,0.4)] transition-all"
                          >
                            View missions
                          </button>
                        )}
                      </>
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
              {(['overview', 'leaderboard', 'missions', 'storyline', 'map', ...(unifiedState?.modules?.crm?.enabled && canWrite ? ['crm'] : [])] as TabType[]).map((tab) => (
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
                  {tab === 'crm' ? 'Creator Manager' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="mt-6">
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Hero Section - Founder/Creator Positioning */}
                  <div className="rounded-xl border border-white/10 bg-gradient-to-br from-black/60 to-black/40 p-6">
                    {canWrite ? (
                      <>
                        <h2 className="text-2xl font-bold text-white mb-3">
                          Turn campaigns into measurable Crypto Twitter signal
                        </h2>
                        <p className="text-sm text-akari-muted mb-2">
                          Launch quests, rank creators, and track mindshare output in one place.
                        </p>
                        <p className="text-xs text-akari-muted italic">
                          ARC creates signal, not just tracks it.
                        </p>
                      </>
                    ) : (
                      <>
                        <h2 className="text-2xl font-bold text-white mb-3">
                          Earn status, unlock perks, and climb the ranks
                        </h2>
                        <p className="text-sm text-akari-muted">
                          Transparent scoring. Every point has a reason.
                        </p>
                      </>
                    )}
                  </div>

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

                  {/* Campaign Pulse Section (Founder Dashboard) */}
                  {canWrite && (
                    <div className="rounded-xl border border-white/10 bg-gradient-to-br from-akari-neon-teal/10 to-black/40 p-6">
                      <h2 className="text-lg font-semibold text-white mb-4">Campaign Pulse</h2>
                      
                      {pulseLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-neon-teal border-t-transparent" />
                        </div>
                      ) : pulseMetrics ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="rounded-lg border border-white/10 bg-black/40 p-4">
                            <div className="text-xs text-white/60 mb-1">Creators participating</div>
                            <div className="text-2xl font-bold text-white">{pulseMetrics.creatorsParticipating.toLocaleString()}</div>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/40 p-4">
                            <div className="text-xs text-white/60 mb-1 flex items-center gap-1">
                              Total completions
                              {pulseMetrics.totalCompletions === null && (
                                <span
                                  className="text-xs text-white/40 cursor-help"
                                  title="Quest Leaderboard is not unlocked for this project"
                                >
                                  (Locked)
                                </span>
                              )}
                            </div>
                            <div className="text-2xl font-bold text-white">
                              {pulseMetrics.totalCompletions !== null
                                ? pulseMetrics.totalCompletions.toLocaleString()
                                : 'N/A'}
                            </div>
                          </div>
                          <div className="rounded-lg border border-white/10 bg-black/40 p-4">
                            <div className="text-xs text-white/60 mb-1">Top creator score</div>
                            <div className="text-2xl font-bold text-white">
                              {pulseMetrics.topCreatorScore !== null
                                ? pulseMetrics.topCreatorScore.toLocaleString()
                                : 'N/A'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-white/60 py-4">
                          No active arena found for this project.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Status Perks Section */}
                  <div className="rounded-xl border border-white/10 bg-black/40 p-6">
                    <h2 className="text-lg font-semibold text-white mb-4">Perks you can unlock</h2>
                    
                    {/* Badges by rank */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      {(() => {
                        // Get user's rank if available
                        const userRank = (() => {
                          if (!akariUser.isLoggedIn || !userTwitterUsername) return null;
                          const userCreator = allCreators.find(
                            c => c.twitter_username?.toLowerCase().replace('@', '') === userTwitterUsername.toLowerCase().replace('@', '')
                          );
                          // Calculate rank from sorted creators
                          if (userCreator && allCreators.length > 0) {
                            const sorted = [...allCreators].sort((a, b) => (b.arc_points || 0) - (a.arc_points || 0));
                            const rank = sorted.findIndex(c => 
                              c.twitter_username?.toLowerCase().replace('@', '') === userTwitterUsername.toLowerCase().replace('@', '')
                            ) + 1;
                            return rank > 0 ? rank : null;
                          }
                          return null;
                        })();

                        const badges = [
                          { rank: 3, name: 'Legend' as const },
                          { rank: 20, name: 'Core Raider' as const },
                          { rank: 50, name: 'Signal Contributor' as const },
                          { rank: null, name: 'Verified Raider' as const },
                        ];

                        // Badge border class mapping (fixed classes for Tailwind JIT)
                        const badgeBorderClassMap: Record<string, string> = {
                          'Legend': 'border-purple-500/50 bg-purple-500/10',
                          'Core Raider': 'border-yellow-400/50 bg-yellow-400/10',
                          'Signal Contributor': 'border-blue-400/50 bg-blue-400/10',
                          'Verified Raider': 'border-green-400/50 bg-green-400/10',
                        };

                        return badges.map((badge) => {
                          const badgeInfo = getBadgeDisplayInfo(badge.name);
                          const hasBadge = userRank ? getRankBadgeFromRank(userRank) === badge.name : false;
                          const isExample = !userRank;

                          return (
                            <div
                              key={badge.name}
                              className={`rounded-lg border p-4 ${
                                hasBadge
                                  ? badgeBorderClassMap[badge.name] || 'border-white/10 bg-black/20'
                                  : 'border-white/10 bg-black/20'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${badgeInfo.color}`} />
                                <h3 className="text-sm font-semibold text-white">{badgeInfo.name}</h3>
                                {isExample && (
                                  <span
                                    className="text-xs text-white/40 cursor-help"
                                    title="Example perks - join the leaderboard to see your actual rank"
                                  >
                                    (example)
                                  </span>
                                )}
                                {hasBadge && (
                                  <span className="text-xs text-green-400">✓</span>
                                )}
                              </div>
                              <p className="text-xs text-white/60">{badgeInfo.description}</p>
                            </div>
                          );
                        });
                      })()}
                    </div>

                    {/* Perks list */}
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-white mb-3">Available Perks</h3>
                      <ul className="space-y-2 text-sm text-white/70">
                        <li className="flex items-start gap-2">
                          <span className="text-akari-neon-teal mt-0.5">•</span>
                          <span>Featured on project page</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-akari-neon-teal mt-0.5">•</span>
                          <span>Founder shoutout and follow</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-akari-neon-teal mt-0.5">•</span>
                          <span>Private alpha access</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-akari-neon-teal mt-0.5">•</span>
                          <span>Whitelist spots</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-akari-neon-teal mt-0.5">•</span>
                          <span>Special community role</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-akari-neon-teal mt-0.5">•</span>
                          <span>Early partner deals</span>
                        </li>
                      </ul>
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
                        {arenas.map((arena) => {
                          const projectSlug = project?.slug || slug;
                          if (!projectSlug) return null;
                          return (
                          <Link
                            key={arena.id}
                            href={`/portal/arc/${encodeURIComponent(projectSlug)}/arena/${encodeURIComponent(arena.slug)}`}
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
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Leaderboard Tab */}
              {activeTab === 'leaderboard' && (
                <div className="rounded-xl border border-white/10 bg-black/40 p-6">
                  {/* Mindshare Leaderboard (auto-tracked + joined) */}
                  {unifiedState?.modules?.leaderboard?.enabled ? (
                    <>
                      {/* Auto-tracking Banner */}
                      {mindshareLeaderboardEntries.length > 0 && (
                        <div className="rounded-lg border border-akari-neon-teal/30 bg-akari-neon-teal/10 p-4 mb-6">
                          <p className="text-sm text-white/90">
                            We auto-track public CT signal. Join and follow to boost your points.
                          </p>
                        </div>
                      )}

                      {mindshareLeaderboardLoading ? (
                        <div className="flex items-center justify-center py-12">
                          <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                          <span className="ml-3 text-white/60">Loading leaderboard...</span>
                        </div>
                      ) : mindshareLeaderboardError ? (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                          <p className="text-red-400 text-sm">{mindshareLeaderboardError}</p>
                        </div>
                      ) : visibleMindshareEntries.length === 0 ? (
                        <div className="rounded-lg border border-white/10 bg-black/20 p-8 text-center">
                          <div className="text-4xl mb-4">📊</div>
                          <h3 className="text-lg font-semibold text-white mb-2">No creators yet</h3>
                          <p className="text-white/60 text-sm">
                            Creators who generate signal will appear here automatically.
                          </p>
                        </div>
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
                                <option value="points_desc">Top score</option>
                                <option value="points_asc">Lowest score</option>
                                <option value="joined_newest">Newest joined</option>
                                <option value="joined_oldest">Oldest joined</option>
                              </select>
                            </div>
                          </div>

                          {/* Mindshare Leaderboard Table */}
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
                                  {visibleMindshareEntries.map((entry) => {
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
                        </>
                      )}
                    </>
                  ) : (
                    /* Quest Leaderboard (arena-based, legacy) */
                    <>
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

                          {/* View Toggle Tabs */}
                          <div className="mb-6 flex items-center justify-end">
                            <div className="flex gap-2 bg-white/5 border border-white/10 rounded-lg p-1">
                              <button
                                onClick={() => setLeaderboardView('score')}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                  leaderboardView === 'score'
                                    ? 'bg-white/10 text-white'
                                    : 'text-white/60 hover:text-white'
                                }`}
                              >
                                Score
                              </button>
                              <button
                                onClick={() => {}}
                                disabled
                                className="px-3 py-1.5 text-xs font-medium rounded-md text-white/40 cursor-not-allowed relative"
                                title="Coming soon"
                              >
                                Impact
                              </button>
                              <button
                                onClick={() => {}}
                                disabled
                                className="px-3 py-1.5 text-xs font-medium rounded-md text-white/40 cursor-not-allowed relative"
                                title="Coming soon"
                              >
                                Consistency
                              </button>
                            </div>
                          </div>

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
                                            @{(creator.twitter_username || 'Unknown').replace(/^@+/, '')}
                                          </div>
                                          {creator.style && (
                                            <div className="text-xs text-white/60 truncate">{creator.style}</div>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {leaderboardView === 'score' && (
                                            <div className="text-right">
                                              <div className="text-sm font-bold text-white">
                                                {creator.arc_points?.toLocaleString() || 0}
                                              </div>
                                              <div className="text-xs text-white/60">Score</div>
                                            </div>
                                          )}
                                          {leaderboardView === 'impact' && (
                                            <div className="text-right">
                                              <div className="text-sm font-bold text-white/40">
                                                -
                                              </div>
                                              <div className="text-xs text-white/40">Coming soon</div>
                                            </div>
                                          )}
                                          {leaderboardView === 'consistency' && (
                                            <div className="text-right">
                                              <div className="text-sm font-bold text-white/40">
                                                -
                                              </div>
                                              <div className="text-xs text-white/40">Coming soon</div>
                                            </div>
                                          )}
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
                    </>
                  )}
                </div>
              )}

              {/* Missions Tab */}
              {activeTab === 'missions' && (() => {
                const hasJoined = userIsInCreators || (userStatus?.hasJoined || false);
                const projectArcPoints = userStatus?.arcPoints || 0;
                const missions = buildMissions(hasJoined, completedMissionIds);

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
                          <div className={`font-semibold ${hasJoined ? 'text-emerald-400' : 'text-yellow-300'}`}>
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
                              <div className="flex-1">
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
                              <div className="flex flex-col items-end gap-2">
                                <div className="flex items-center gap-2">
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
                                {!isLocked && !isCompleted && hasJoined && akariUser.isLoggedIn && (
                                  <button
                                    onClick={() => handleCompleteMission(mission.id)}
                                    disabled={completingMissionId === mission.id || !selectedArenaId}
                                    className="px-3 py-1 text-xs font-medium bg-akari-neon-teal/20 text-akari-neon-teal border border-akari-neon-teal/50 rounded-lg hover:bg-akari-neon-teal/30 hover:border-akari-neon-teal/70 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {completingMissionId === mission.id ? 'Marking...' : 'Mark Complete'}
                                  </button>
                                )}
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

              {/* CRM Tab */}
              {activeTab === 'crm' && (
                <div className="space-y-6">
                  {!unifiedState?.modules?.crm?.enabled ? (
                    <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
                      <p className="text-sm text-white/60">CRM (Creator Manager) is not enabled for this project.</p>
                    </div>
                  ) : !canWrite ? (
                    <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
                      <p className="text-sm text-white/60">You do not have permission to manage campaigns.</p>
                    </div>
                  ) : (
                    <>
                      {/* Campaigns List */}
                      <div className="rounded-xl border border-white/10 bg-black/40 p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-lg font-semibold text-white">Campaigns</h2>
                          <button
                            onClick={() => {
                              setCampaignForm({
                                name: '',
                                brief_objective: '',
                                participation_mode: 'invite_only',
                                leaderboard_visibility: 'private',
                                start_at: '',
                                end_at: '',
                                website_url: '',
                                docs_url: '',
                                reward_pool_text: '',
                                winners_count: 100,
                                status: 'draft',
                              });
                              setShowCreateCampaignModal(true);
                            }}
                            className="px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
                          >
                            Create Campaign
                          </button>
                        </div>
                        {campaignsLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                          </div>
                        ) : campaigns.length === 0 ? (
                          <p className="text-sm text-white/60 text-center py-8">No campaigns yet.</p>
                        ) : (
                          <div className="space-y-3">
                            {campaigns.map((campaign) => (
                              <div
                                key={campaign.id}
                                onClick={() => {
                                  setSelectedCampaign(campaign);
                                  // Fetch participants and submissions
                                  fetch(`/api/portal/arc/campaigns/${campaign.id}/participants`, { credentials: 'include' })
                                    .then(r => r.json())
                                    .then(d => d.ok && setParticipants(d.participants || []))
                                    .catch(console.error);
                                  fetch(`/api/portal/arc/campaigns/${campaign.id}/external-submissions`, { credentials: 'include' })
                                    .then(r => r.json())
                                    .then(d => d.ok && setExternalSubmissions(d.submissions || []))
                                    .catch(console.error);
                                }}
                                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                  selectedCampaign?.id === campaign.id
                                    ? 'border-akari-primary bg-akari-primary/10'
                                    : 'border-white/10 bg-white/5 hover:border-white/20'
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h3 className="text-base font-semibold text-white mb-1">{campaign.name}</h3>
                                    {campaign.brief_objective && (
                                      <p className="text-sm text-white/60 mb-2">{campaign.brief_objective}</p>
                                    )}
                                    <div className="flex items-center gap-4 text-xs text-white/40">
                                      <span>{new Date(campaign.start_at).toLocaleDateString()} - {new Date(campaign.end_at).toLocaleDateString()}</span>
                                      <span className="capitalize">{campaign.participation_mode.replace('_', ' ')}</span>
                                    </div>
                                  </div>
                                  <span className={`px-2 py-1 text-xs rounded-full ${
                                    campaign.status === 'live' ? 'bg-green-500/20 text-green-400' :
                                    campaign.status === 'ended' ? 'bg-gray-500/20 text-gray-400' :
                                    'bg-yellow-500/20 text-yellow-400'
                                  }`}>
                                    {campaign.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Campaign Details */}
                      {selectedCampaign && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                          {/* Campaign Info */}
                          <div className="rounded-xl border border-white/10 bg-black/40 p-6 space-y-4">
                            <h3 className="text-base font-semibold text-white">{selectedCampaign.name}</h3>
                            {selectedCampaign.brief_objective && (
                              <p className="text-sm text-white/60">{selectedCampaign.brief_objective}</p>
                            )}
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              <div>
                                <p className="text-white/40 mb-1">Status</p>
                                <p className="text-white capitalize">{selectedCampaign.status}</p>
                              </div>
                              <div>
                                <p className="text-white/40 mb-1">Mode</p>
                                <p className="text-white capitalize">{selectedCampaign.participation_mode.replace('_', ' ')}</p>
                              </div>
                              <div>
                                <p className="text-white/40 mb-1">Visibility</p>
                                <p className="text-white capitalize">{selectedCampaign.leaderboard_visibility}</p>
                              </div>
                              <div>
                                <p className="text-white/40 mb-1">Winners</p>
                                <p className="text-white">{selectedCampaign.winners_count}</p>
                              </div>
                            </div>
                            {selectedCampaign.reward_pool_text && (
                              <div>
                                <p className="text-white/40 mb-1 text-sm">Reward Pool</p>
                                <p className="text-white text-sm">{selectedCampaign.reward_pool_text}</p>
                              </div>
                            )}
                          </div>

                          {/* Participants */}
                          <div className="rounded-xl border border-white/10 bg-black/40 p-6 space-y-4">
                            <div className="flex items-center justify-between">
                              <h4 className="text-base font-semibold text-white">Participants</h4>
                              <button
                                onClick={() => {
                                  setInviteForm({ twitter_username: '' });
                                  setShowInviteModal(true);
                                }}
                                className="px-3 py-1.5 text-xs font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80"
                              >
                                Invite Creator
                              </button>
                            </div>
                            {participantsLoading ? (
                              <div className="flex items-center justify-center py-4">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                              </div>
                            ) : participants.length === 0 ? (
                              <p className="text-sm text-white/60">No participants yet.</p>
                            ) : (
                              <div className="space-y-2">
                                {participants.map((p) => (
                                  <div key={p.id} className="flex items-center justify-between p-2 rounded border border-white/5 bg-white/5">
                                    <span className="text-sm text-white">@{p.twitter_username.replace(/^@+/, '')}</span>
                                    <div className="flex items-center gap-2">
                                      <span className={`px-2 py-1 text-xs rounded-full capitalize ${
                                        p.status === 'accepted' ? 'bg-green-500/20 text-green-400' :
                                        p.status === 'declined' ? 'bg-red-500/20 text-red-400' :
                                        'bg-yellow-500/20 text-yellow-400'
                                      }`}>
                                        {p.status}
                                      </span>
                                      {p.status === 'invited' && (
                                        <>
                                          <button
                                            onClick={() => {
                                              fetch(`/api/portal/arc/campaigns/${selectedCampaign.id}/participants`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                credentials: 'include',
                                                body: JSON.stringify({ participant_id: p.id, status: 'accepted' }),
                                              })
                                                .then(r => r.json())
                                                .then(d => {
                                                  if (d.ok) {
                                                    setParticipants(participants.map(part => part.id === p.id ? d.participant : part));
                                                  }
                                                })
                                                .catch(console.error);
                                            }}
                                            className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                                          >
                                            Approve
                                          </button>
                                          <button
                                            onClick={() => {
                                              fetch(`/api/portal/arc/campaigns/${selectedCampaign.id}/participants`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                credentials: 'include',
                                                body: JSON.stringify({ participant_id: p.id, status: 'declined' }),
                                              })
                                                .then(r => r.json())
                                                .then(d => {
                                                  if (d.ok) {
                                                    setParticipants(participants.map(part => part.id === p.id ? d.participant : part));
                                                  }
                                                })
                                                .catch(console.error);
                                            }}
                                            className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                                          >
                                            Reject
                                          </button>
                                        </>
                                      )}
                                      <button
                                        onClick={() => {
                                          setSelectedParticipant(p);
                                          setUtmForm({ target_url: '' });
                                          setShowUTMLinkModal(true);
                                        }}
                                        className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"
                                      >
                                        UTM Link
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* External Submissions */}
                      {selectedCampaign && (
                        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
                          <h4 className="text-base font-semibold text-white mb-4">External Submissions</h4>
                          {submissionsLoading ? (
                            <div className="flex items-center justify-center py-4">
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                            </div>
                          ) : externalSubmissions.length === 0 ? (
                            <p className="text-sm text-white/60">No submissions yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {externalSubmissions.map((sub) => (
                                <div key={sub.id} className="flex items-center justify-between p-3 rounded border border-white/5 bg-white/5">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-sm text-white">@{((sub.participant?.twitter_username || 'Unknown') as string).replace(/^@+/, '')}</span>
                                      <span className="text-xs text-white/40 capitalize">{sub.platform}</span>
                                    </div>
                                    <a href={sub.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 hover:underline">
                                      {sub.url}
                                    </a>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-1 text-xs rounded-full ${
                                      sub.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                                      sub.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                                      'bg-yellow-500/20 text-yellow-400'
                                    }`}>
                                      {sub.status}
                                    </span>
                                    {sub.status === 'submitted' && (
                                      <>
                                        <button
                                          onClick={() => {
                                            fetch(`/api/portal/arc/campaigns/${selectedCampaign.id}/external-submissions/${sub.id}/review`, {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              credentials: 'include',
                                              body: JSON.stringify({ action: 'approve' }),
                                            })
                                              .then(r => r.json())
                                              .then(d => {
                                                if (d.ok) {
                                                  setExternalSubmissions(externalSubmissions.map(s => s.id === sub.id ? d.submission : s));
                                                }
                                              })
                                              .catch(console.error);
                                          }}
                                          className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
                                        >
                                          Approve
                                        </button>
                                        <button
                                          onClick={() => {
                                            fetch(`/api/portal/arc/campaigns/${selectedCampaign.id}/external-submissions/${sub.id}/review`, {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              credentials: 'include',
                                              body: JSON.stringify({ action: 'reject' }),
                                            })
                                              .then(r => r.json())
                                              .then(d => {
                                                if (d.ok) {
                                                  setExternalSubmissions(externalSubmissions.map(s => s.id === sub.id ? d.submission : s));
                                                }
                                              })
                                              .catch(console.error);
                                          }}
                                          className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                                        >
                                          Reject
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
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

      {/* Create Campaign Modal */}
      {showCreateCampaignModal && projectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-black/90 border border-white/20 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-4">Create Campaign</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-1">Name *</label>
                <input
                  type="text"
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                  placeholder="Campaign name"
                />
              </div>
              <div>
                <label className="block text-sm text-white/60 mb-1">Brief Objective</label>
                <textarea
                  value={campaignForm.brief_objective}
                  onChange={(e) => setCampaignForm({ ...campaignForm, brief_objective: e.target.value })}
                  className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                  rows={3}
                  placeholder="Campaign objective"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">Participation Mode *</label>
                  <select
                    value={campaignForm.participation_mode}
                    onChange={(e) => setCampaignForm({ ...campaignForm, participation_mode: e.target.value as any })}
                    className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                  >
                    <option value="invite_only">Invite Only</option>
                    <option value="public">Public</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Visibility *</label>
                  <select
                    value={campaignForm.leaderboard_visibility}
                    onChange={(e) => setCampaignForm({ ...campaignForm, leaderboard_visibility: e.target.value as any })}
                    className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">Start Date *</label>
                  <input
                    type="datetime-local"
                    value={campaignForm.start_at}
                    onChange={(e) => setCampaignForm({ ...campaignForm, start_at: e.target.value })}
                    className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">End Date *</label>
                  <input
                    type="datetime-local"
                    value={campaignForm.end_at}
                    onChange={(e) => setCampaignForm({ ...campaignForm, end_at: e.target.value })}
                    className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">Website URL</label>
                  <input
                    type="url"
                    value={campaignForm.website_url}
                    onChange={(e) => setCampaignForm({ ...campaignForm, website_url: e.target.value })}
                    className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Docs URL</label>
                  <input
                    type="url"
                    value={campaignForm.docs_url}
                    onChange={(e) => setCampaignForm({ ...campaignForm, docs_url: e.target.value })}
                    className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                    placeholder="https://..."
                  />
                </div>
              </div>
              
              {/* Prize Pool Toggle (Optional) */}
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="prizes-enabled"
                    checked={prizesEnabled}
                    onChange={(e) => setPrizesEnabled(e.target.checked)}
                    className="w-4 h-4 rounded border-white/20 bg-black/60 text-akari-neon-teal focus:ring-akari-neon-teal"
                  />
                  <label htmlFor="prizes-enabled" className="text-sm font-medium text-white">
                    Enable prizes for this campaign (optional)
                  </label>
                </div>
                
                {prizesEnabled && (
                  <div className="space-y-2 pl-7">
                    <div>
                      <label className="block text-sm text-white/60 mb-1">Prize budget (optional)</label>
                      <input
                        type="text"
                        value={prizeBudget}
                        onChange={(e) => setPrizeBudget(e.target.value)}
                        className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                        placeholder="e.g., $10,000"
                      />
                    </div>
                    <p className="text-xs text-white/50">
                      Performance-based rewards can be awarded by rank at campaign end. No purchase required.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm text-white/60 mb-1">Reward Pool Description</label>
                <textarea
                  value={campaignForm.reward_pool_text}
                  onChange={(e) => setCampaignForm({ ...campaignForm, reward_pool_text: e.target.value })}
                  className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                  rows={2}
                  placeholder="Reward pool details"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-white/60 mb-1">Winners Count</label>
                  <input
                    type="number"
                    value={campaignForm.winners_count}
                    onChange={(e) => setCampaignForm({ ...campaignForm, winners_count: parseInt(e.target.value) || 100 })}
                    className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/60 mb-1">Status</label>
                  <select
                    value={campaignForm.status}
                    onChange={(e) => setCampaignForm({ ...campaignForm, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                  >
                    <option value="draft">Draft</option>
                    <option value="live">Live</option>
                    <option value="paused">Paused</option>
                    <option value="ended">Ended</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  onClick={async () => {
                    if (!campaignForm.name || !campaignForm.start_at || !campaignForm.end_at) {
                      alert('Please fill in required fields: name, start date, end date');
                      return;
                    }
                    try {
                      const res = await fetch('/api/portal/arc/campaigns', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                          project_id: projectId,
                          name: campaignForm.name,
                          brief_objective: campaignForm.brief_objective || undefined,
                          participation_mode: campaignForm.participation_mode,
                          leaderboard_visibility: campaignForm.leaderboard_visibility,
                          start_at: new Date(campaignForm.start_at).toISOString(),
                          end_at: new Date(campaignForm.end_at).toISOString(),
                          website_url: campaignForm.website_url || undefined,
                          docs_url: campaignForm.docs_url || undefined,
                          reward_pool_text: (() => {
                            if (!prizesEnabled || !prizeBudget) {
                              // If prizes disabled, return user's text only (remove any existing prize budget line)
                              const text = campaignForm.reward_pool_text || '';
                              return text.replace(/^Prize budget:.*\n?/m, '').trim() || undefined;
                            }
                            
                            // If prizes enabled, add/update prize budget line
                            const existingText = campaignForm.reward_pool_text || '';
                            const prizeLine = `Prize budget: ${prizeBudget}`;
                            
                            // Check if prize budget line already exists
                            if (existingText.includes('Prize budget:')) {
                              // Replace existing prize budget line
                              const updatedText = existingText.replace(/^Prize budget:.*$/m, prizeLine);
                              return updatedText.trim() || undefined;
                            } else {
                              // Prepend prize budget line with newline separator
                              return existingText 
                                ? `${prizeLine}\n${existingText}`.trim()
                                : prizeLine;
                            }
                          })(),
                          winners_count: campaignForm.winners_count,
                          status: campaignForm.status,
                        }),
                      });
                      const data = await res.json();
                      if (res.ok && data.ok) {
                        setCampaigns([...campaigns, data.campaign]);
                        setShowCreateCampaignModal(false);
                        setCampaignForm({
                          name: '',
                          brief_objective: '',
                          participation_mode: 'invite_only',
                          leaderboard_visibility: 'private',
                          start_at: '',
                          end_at: '',
                          website_url: '',
                          docs_url: '',
                          reward_pool_text: (() => {
                            if (!prizesEnabled || !prizeBudget) {
                              // Remove prize budget line if exists
                              const text = campaignForm.reward_pool_text || '';
                              return text.replace(/^Prize budget:.*\n?/m, '').trim();
                            }
                            
                            const existingText = campaignForm.reward_pool_text || '';
                            const prizeLine = `Prize budget: ${prizeBudget}`;
                            
                            if (existingText.includes('Prize budget:')) {
                              return existingText.replace(/^Prize budget:.*$/m, prizeLine).trim();
                            } else {
                              return existingText ? `${prizeLine}\n${existingText}`.trim() : prizeLine;
                            }
                          })(),
                          winners_count: 100,
                          status: 'draft',
                        });
                        setPrizesEnabled(false);
                        setPrizeBudget('');
                        setSelectedTemplate('');
                        setTemplateQuests([]);
                      } else {
                        alert(data.error || 'Failed to create campaign');
                      }
                    } catch (err: any) {
                      alert(err.message || 'Failed to create campaign');
                    }
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowCreateCampaignModal(false);
                    setSelectedTemplate('');
                    setTemplateQuests([]);
                  }}
                  className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Creator Modal */}
      {showInviteModal && selectedCampaign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-black/90 border border-white/20 rounded-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Invite Creator</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-1">Twitter Username</label>
                <input
                  type="text"
                  value={inviteForm.twitter_username}
                  onChange={(e) => setInviteForm({ twitter_username: e.target.value })}
                  className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                  placeholder="username (without @)"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    if (!inviteForm.twitter_username) {
                      alert('Please enter a Twitter username');
                      return;
                    }
                    try {
                      const res = await fetch(`/api/portal/arc/campaigns/${selectedCampaign.id}/participants`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                          twitter_username: inviteForm.twitter_username,
                          status: 'invited',
                        }),
                      });
                      const data = await res.json();
                      if (res.ok && data.ok) {
                        setParticipants([...participants, data.participant]);
                        setShowInviteModal(false);
                        setInviteForm({ twitter_username: '' });
                      } else {
                        alert(data.error || 'Failed to invite creator');
                      }
                    } catch (err: any) {
                      alert(err.message || 'Failed to invite creator');
                    }
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80"
                >
                  Invite
                </button>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UTM Link Modal */}
      {showUTMLinkModal && selectedCampaign && selectedParticipant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-black/90 border border-white/20 rounded-xl p-6 max-w-md mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">Generate UTM Link</h3>
            <p className="text-sm text-white/60 mb-4">For @{selectedParticipant.twitter_username}</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-white/60 mb-1">Target URL *</label>
                <input
                  type="url"
                  value={utmForm.target_url}
                  onChange={(e) => setUtmForm({ target_url: e.target.value })}
                  className="w-full px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-white"
                  placeholder="https://..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={async () => {
                    if (!utmForm.target_url) {
                      alert('Please enter a target URL');
                      return;
                    }
                    try {
                      const res = await fetch(`/api/portal/arc/campaigns/${selectedCampaign.id}/participants/${selectedParticipant.id}/link`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                          target_url: utmForm.target_url,
                        }),
                      });
                      const data = await res.json();
                      if (res.ok && data.ok) {
                        alert(`UTM Link generated: ${data.redirect_url}\n\nCode: ${data.link.code}`);
                        setShowUTMLinkModal(false);
                        setUtmForm({ target_url: '' });
                      } else {
                        alert(data.error || 'Failed to generate UTM link');
                      }
                    } catch (err: any) {
                      alert(err.message || 'Failed to generate UTM link');
                    }
                  }}
                  className="flex-1 px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80"
                >
                  Generate
                </button>
                <button
                  onClick={() => setShowUTMLinkModal(false)}
                  className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Project Modal */}
      {editingProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-white mb-4">Edit Project</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Slug</label>
                <input
                  type="text"
                  value={editForm.slug}
                  onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">X Handle</label>
                <input
                  type="text"
                  value={editForm.x_handle}
                  onChange={(e) => setEditForm({ ...editForm, x_handle: e.target.value.replace('@', '') })}
                  placeholder="handle (without @)"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Header Image</label>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                  onChange={handleImageSelect}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-akari-primary file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:font-medium file:bg-akari-primary/20 file:text-akari-primary hover:file:bg-akari-primary/30 file:cursor-pointer"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Upload a header image for your project (max 10MB, JPEG/PNG/WebP/GIF)
                </p>
                
                {/* Upload button for selected file */}
                {selectedImageFile && (
                  <button
                    type="button"
                    onClick={handleImageUpload}
                    disabled={uploadingImage}
                    className="mt-2 px-4 py-2 text-sm font-medium bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploadingImage ? 'Uploading...' : 'Upload Image'}
                  </button>
                )}

                {/* Preview */}
                {(imagePreview || editForm.header_image_url) && (
                  <div className="mt-2">
                    <img
                      src={imagePreview || editForm.header_image_url}
                      alt="Header preview"
                      className="w-full h-32 object-cover rounded-lg border border-slate-700"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    {editForm.header_image_url && !imagePreview && (
                      <button
                        type="button"
                        onClick={() => setEditForm({ ...editForm, header_image_url: '' })}
                        className="mt-2 text-xs text-red-400 hover:text-red-300"
                      >
                        Remove image
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleSaveProject}
                disabled={savingProject}
                className="flex-1 px-4 py-2 rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingProject ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setEditingProject(false);
                  setSelectedImageFile(null);
                  setImagePreview('');
                }}
                disabled={savingProject}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
