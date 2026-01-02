/**
 * ARC Admin - Per-Project Arena Manager
 * 
 * Manage arenas for a specific project
 */

import React, { useState, useEffect } from 'react';
import { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { createPortalClient } from '@/lib/portal/supabase';
import { isSuperAdmin } from '@/lib/permissions';
import { useAkariUser } from '@/lib/akari-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkProjectPermissions, type ProjectPermissionCheck } from '@/lib/project-permissions';
import { getSessionTokenFromRequest } from '@/lib/server-auth';
import { useCurrentMsArena } from '@/lib/arc/hooks';
import { activateMsArena } from '@/lib/arc/api';
import { EmptyState } from '@/components/arc/EmptyState';
import { ErrorState } from '@/components/arc/ErrorState';

// =============================================================================
// TYPES
// =============================================================================

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
  kind?: string | null;
}

interface ProjectInfo {
  id: string;
  name: string;
  twitter_username: string | null;
  slug: string | null;
}

interface ProjectFeatures {
  leaderboard_enabled: boolean;
  leaderboard_start_at: string | null;
  leaderboard_end_at: string | null;
  gamefi_enabled: boolean;
  gamefi_start_at: string | null;
  gamefi_end_at: string | null;
  crm_enabled: boolean;
  crm_start_at: string | null;
  crm_end_at: string | null;
  crm_visibility: 'private' | 'public' | 'hybrid' | null;
}

interface LeaderboardRequest {
  id: string;
  project_id: string;
  product_type: 'ms' | 'gamefi' | 'crm' | null;
  start_at: string | null;
  end_at: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  decided_at: string | null;
  notes: string | null;
}

interface ArenaManagerProps {
  project: ProjectInfo | null;
  arenas: Arena[];
  error: string | null;
  projectSlug: string;
  hasAccess: boolean;
  accessError: string | null;
  features: ProjectFeatures | null;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function ArenaManager({ project, arenas: initialArenas, error, projectSlug, hasAccess, accessError, features: initialFeatures }: ArenaManagerProps) {
  const router = useRouter();
  const akariUser = useAkariUser();
  const userIsSuperAdmin = isSuperAdmin(akariUser.user);
  const [permissions, setPermissions] = useState<ProjectPermissionCheck | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);

  const [arenas, setArenas] = useState<Arena[]>(initialArenas);
  const [activateSuccess, setActivateSuccess] = useState<string | null>(null);
  const [activatingArenaId, setActivatingArenaId] = useState<string | null>(null);

  // Load current MS arena
  const { arena: currentArena, debug, loading: arenaLoading, error: arenaError, refresh: refreshCurrentArena } = useCurrentMsArena(project?.id || null);

  // ARC Access Requests state
  const [requests, setRequests] = useState<LeaderboardRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [latestRequest, setLatestRequest] = useState<LeaderboardRequest | null>(null);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

  // Request form state
  const [formProductType, setFormProductType] = useState<'ms' | 'gamefi' | 'crm'>('ms');
  const [formStartAt, setFormStartAt] = useState('');
  const [formEndAt, setFormEndAt] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // CRM Settings state (SuperAdmin only)
  const [crmEnabled, setCrmEnabled] = useState(initialFeatures?.crm_enabled || false);
  const [crmVisibility, setCrmVisibility] = useState<'private' | 'public' | 'hybrid'>(initialFeatures?.crm_visibility || 'private');
  const [crmSaving, setCrmSaving] = useState(false);
  const [crmError, setCrmError] = useState<string | null>(null);
  const [crmSuccess, setCrmSuccess] = useState<string | null>(null);

  // Recent Activity state
  const [activityEvents, setActivityEvents] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);

  // CRM Campaigns state
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false);
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  
  // Campaign form state
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    starts_at: '',
    ends_at: '',
    visibility: 'private' as 'private' | 'public',
  });
  const [campaignFormSubmitting, setCampaignFormSubmitting] = useState(false);
  const [campaignFormError, setCampaignFormError] = useState<string | null>(null);
  const [campaignFormSuccess, setCampaignFormSuccess] = useState<string | null>(null);

  // Participants state
  const [participants, setParticipants] = useState<Array<{
    id: string;
    twitter_username: string;
    joined_at: string | null;
    links?: Array<{
      id: string;
      code: string;
      short_code: string;
      target_url: string;
      label: string | null;
      created_at: string;
    }>;
  }>>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState<string | null>(null);
  
  // UTM Links modal state
  const [showUtmLinksModal, setShowUtmLinksModal] = useState(false);
  const [selectedParticipantForLinks, setSelectedParticipantForLinks] = useState<{
    id: string;
    twitter_username: string;
    links: Array<{
      id: string;
      code: string;
      short_code: string;
      target_url: string;
      label: string | null;
      created_at: string;
    }>;
  } | null>(null);
  const [newLinkForm, setNewLinkForm] = useState({ label: '', destination_url: '' });
  const [newLinkSubmitting, setNewLinkSubmitting] = useState(false);
  const [newLinkError, setNewLinkError] = useState<string | null>(null);
  
  // Add participant form state
  const [participantForm, setParticipantForm] = useState({
    twitter_username: '',
  });
  const [participantFormSubmitting, setParticipantFormSubmitting] = useState(false);
  const [participantFormError, setParticipantFormError] = useState<string | null>(null);

  // Leaderboard state
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);


  // Fetch permissions client-side to determine what actions are allowed
  useEffect(() => {
    async function fetchPermissions() {
      if (!project?.id || !akariUser.isLoggedIn) {
        setPermissionsLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/portal/arc/permissions?projectId=${encodeURIComponent(project.id)}`, {
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) {
            setPermissions(data.permissions);
          }
        }
      } catch (err) {
        console.warn('[ArenaManager] Failed to fetch permissions:', err);
      } finally {
        setPermissionsLoading(false);
      }
    }

    fetchPermissions();
  }, [project?.id, akariUser.isLoggedIn]);

  // Fetch ARC access requests
  useEffect(() => {
    async function fetchRequests() {
      if (!project?.id) {
        setRequestsLoading(false);
        return;
      }

      setRequestsLoading(true);
      setRequestsError(null);

      try {
        const res = await fetch(`/api/portal/arc/leaderboard-requests?projectId=${encodeURIComponent(project.id)}`, {
          credentials: 'include',
        });
        const data = await res.json();

        if (!data.ok) {
          throw new Error(data.error || 'Failed to load requests');
        }

        const requestsList: LeaderboardRequest[] = data.requests || [];
        setRequests(requestsList);

        // Find latest request
        if (requestsList.length > 0) {
          const latest = requestsList[0];
          setLatestRequest(latest);
          setHasPendingRequest(latest.status === 'pending');
        } else {
          setLatestRequest(null);
          setHasPendingRequest(false);
        }
      } catch (err: any) {
        setRequestsError(err.message || 'Failed to load requests');
      } finally {
        setRequestsLoading(false);
      }
    }

    fetchRequests();

    // Listen for reload event
    const handleReload = () => {
      fetchRequests();
    };
    window.addEventListener('arc-requests-reload', handleReload);
    return () => {
      window.removeEventListener('arc-requests-reload', handleReload);
    };
  }, [project?.id]);

  // Fetch recent activity events
  useEffect(() => {
    async function fetchActivity() {
      if (!project?.id || !userIsSuperAdmin) {
        setActivityLoading(false);
        return;
      }

      setActivityLoading(true);
      setActivityError(null);

      try {
        const res = await fetch(`/api/portal/admin/arc/activity?projectId=${encodeURIComponent(project.id)}&limit=20`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const data = await res.json();

        if (!data.ok) {
          throw new Error(data.error || 'Failed to load activity events');
        }

        setActivityEvents(data.events || []);
      } catch (err: any) {
        setActivityError(err.message || 'Failed to load activity events');
      } finally {
        setActivityLoading(false);
      }
    }

    fetchActivity();
  }, [project?.id, userIsSuperAdmin]);

  // Fetch CRM Campaigns
  const fetchCampaigns = async () => {
    if (!project?.id) {
      setCampaignsLoading(false);
      return;
    }

    setCampaignsLoading(true);
    setCampaignsError(null);

    try {
      const res = await fetch(`/api/portal/arc/campaigns?projectId=${encodeURIComponent(project.id)}`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to load campaigns');
      }

      setCampaigns(data.campaigns || []);
    } catch (err: any) {
      setCampaignsError(err.message || 'Failed to load campaigns');
    } finally {
      setCampaignsLoading(false);
    }
  };

  useEffect(() => {
    if (initialFeatures?.crm_enabled && (canManage || userIsSuperAdmin)) {
      fetchCampaigns();
    }
  }, [project?.id, initialFeatures?.crm_enabled, canManage, userIsSuperAdmin]);

  // Fetch participants for selected campaign
  const fetchParticipants = async (campaignId: string) => {
    setParticipantsLoading(true);
    setParticipantsError(null);

    try {
      const res = await fetch(`/api/portal/arc/campaigns/${campaignId}/participants`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to load participants');
      }

      // Participants now include links array from API
      const participantsList = (data.participants || []).map((p: any) => ({
        id: p.id,
        twitter_username: p.twitter_username,
        joined_at: p.joined_at,
        links: p.links || [],
      }));
      setParticipants(participantsList);
    } catch (err: any) {
      setParticipantsError(err.message || 'Failed to load participants');
    } finally {
      setParticipantsLoading(false);
    }
  };

  // Fetch leaderboard for selected campaign
  const fetchLeaderboard = async (campaignId: string) => {
    setLeaderboardLoading(true);
    setLeaderboardError(null);

    try {
      const res = await fetch(`/api/portal/arc/campaigns/${campaignId}/leaderboard`, {
        credentials: 'include',
      });
      const data = await res.json();

      if (!data.ok) {
        throw new Error(data.error || 'Failed to load leaderboard');
      }

      setLeaderboard(data.entries || []);
    } catch (err: any) {
      setLeaderboardError(err.message || 'Failed to load leaderboard');
    } finally {
      setLeaderboardLoading(false);
    }
  };

  // Handle campaign selection
  useEffect(() => {
    if (selectedCampaign) {
      fetchParticipants(selectedCampaign);
      fetchLeaderboard(selectedCampaign);
    } else {
      setParticipants([]);
      setLeaderboard([]);
      setParticipantLinks({});
    }
  }, [selectedCampaign]);

  // Handle create campaign
  const handleCreateCampaign = async () => {
    if (!project?.id) {
      setCampaignFormError('Project ID is required');
      return;
    }

    if (!campaignForm.name.trim()) {
      setCampaignFormError('Campaign name is required');
      return;
    }

    // Validate dates if both provided
    if (campaignForm.starts_at && campaignForm.ends_at) {
      const startDate = new Date(campaignForm.starts_at);
      const endDate = new Date(campaignForm.ends_at);
      if (startDate >= endDate) {
        setCampaignFormError('End date must be after start date');
        return;
      }
    }

    setCampaignFormSubmitting(true);
    setCampaignFormError(null);
    setCampaignFormSuccess(null);

    try {
      const res = await fetch('/api/portal/arc/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          project_id: project.id,
          name: campaignForm.name.trim(),
          starts_at: campaignForm.starts_at || undefined,
          ends_at: campaignForm.ends_at || undefined,
          leaderboard_visibility: campaignForm.visibility,
          participation_mode: 'invite_only',
          type: 'crm',
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create campaign');
      }

      setCampaignFormSuccess('Campaign created successfully');
      setCampaignForm({
        name: '',
        starts_at: '',
        ends_at: '',
        visibility: 'private',
      });
      setShowCreateCampaignModal(false);
      await fetchCampaigns();

      setTimeout(() => setCampaignFormSuccess(null), 3000);
    } catch (err: any) {
      setCampaignFormError(err.message || 'Failed to create campaign');
    } finally {
      setCampaignFormSubmitting(false);
    }
  };

  // Handle add participant
  const handleAddParticipant = async () => {
    if (!selectedCampaign) {
      setParticipantFormError('No campaign selected');
      return;
    }

    const username = participantForm.twitter_username.trim().toLowerCase().replace('@', '');
    if (!username) {
      setParticipantFormError('Twitter username is required');
      return;
    }

    if (username.includes(' ') || username.includes('@')) {
      setParticipantFormError('Username must not contain spaces or @ symbol');
      return;
    }

    setParticipantFormSubmitting(true);
    setParticipantFormError(null);

    try {
      const res = await fetch(`/api/portal/arc/campaigns/${selectedCampaign}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          twitter_username: username,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to add participant');
      }

      setParticipantForm({ twitter_username: '' });
      setShowAddParticipantModal(false);
      await fetchParticipants(selectedCampaign);
    } catch (err: any) {
      setParticipantFormError(err.message || 'Failed to add participant');
    } finally {
      setParticipantFormSubmitting(false);
    }
  };

  // Handle open UTM Links modal
  const handleOpenUtmLinksModal = (participant: any) => {
    setSelectedParticipantForLinks({
      id: participant.id,
      twitter_username: participant.twitter_username,
      links: participant.links || [],
    });
    setNewLinkForm({ label: '', destination_url: '' });
    setNewLinkError(null);
    setShowUtmLinksModal(true);
  };

  // Handle create new UTM link
  const handleCreateUtmLink = async () => {
    if (!selectedCampaign || !selectedParticipantForLinks) return;

    if (!newLinkForm.destination_url.trim()) {
      setNewLinkError('Destination URL is required');
      return;
    }

    if (!newLinkForm.label.trim()) {
      setNewLinkError('Label is required');
      return;
    }

    try {
      new URL(newLinkForm.destination_url);
    } catch {
      setNewLinkError('Invalid URL format');
      return;
    }

    setNewLinkSubmitting(true);
    setNewLinkError(null);

    try {
      const res = await fetch(`/api/portal/arc/campaigns/${selectedCampaign}/participants/${selectedParticipantForLinks.id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          target_url: newLinkForm.destination_url.trim(),
          label: newLinkForm.label.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to create UTM link');
      }

      // Refetch participants to get updated link info
      await fetchParticipants(selectedCampaign);
      
      // Update modal state
      const updatedParticipants = await fetch(`/api/portal/arc/campaigns/${selectedCampaign}/participants`, {
        credentials: 'include',
      }).then((r) => r.json());
      if (updatedParticipants.ok) {
        const updatedParticipant = (updatedParticipants.participants || []).find((p: any) => p.id === selectedParticipantForLinks.id);
        if (updatedParticipant) {
          setSelectedParticipantForLinks({
            id: updatedParticipant.id,
            twitter_username: updatedParticipant.twitter_username,
            links: updatedParticipant.links || [],
          });
        }
      }

      // Clear form
      setNewLinkForm({ label: '', destination_url: '' });
    } catch (err: any) {
      setNewLinkError(err.message || 'Failed to create UTM link');
    } finally {
      setNewLinkSubmitting(false);
    }
  };

  // Handle request form submission
  const handleSubmitRequest = async () => {
    if (!project?.id) {
      setFormError('Project ID is required');
      return;
    }

    // Validate dates for ms and gamefi
    if ((formProductType === 'ms' || formProductType === 'gamefi') && (!formStartAt || !formEndAt)) {
      setFormError('Start date and end date are required for Mindshare and GameFi');
      return;
    }

    // Validate date order
    if (formStartAt && formEndAt) {
      const startDate = new Date(formStartAt);
      const endDate = new Date(formEndAt);
      if (startDate >= endDate) {
        setFormError('End date must be after start date');
        return;
      }
    }

    setFormSubmitting(true);
    setFormError(null);
    setFormSuccess(null);

    try {
      const res = await fetch('/api/portal/arc/leaderboard-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectId: project.id,
          productType: formProductType,
          startAt: formStartAt || undefined,
          endAt: formEndAt || undefined,
          notes: formNotes.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        const errorCode = data.error || 'unknown_error';
        let errorMessage = 'Failed to submit request';
        
        switch (errorCode) {
          case 'invalid_project_id':
            errorMessage = 'Invalid project ID';
            break;
          case 'invalid_product_type':
            errorMessage = 'Invalid product type';
            break;
          case 'missing_dates':
            errorMessage = 'Start date and end date are required';
            break;
          case 'invalid_dates':
            errorMessage = 'Invalid date range';
            break;
          case 'not_authenticated':
            errorMessage = 'Authentication required';
            break;
          default:
            errorMessage = data.error || 'Failed to submit request';
        }
        
        throw new Error(errorMessage);
      }

      // Success - reset form and refetch requests
      setFormSuccess('Request submitted successfully');
      setFormProductType('ms');
      setFormStartAt('');
      setFormEndAt('');
      setFormNotes('');

      // Refetch requests
      const res2 = await fetch(`/api/portal/arc/leaderboard-requests?projectId=${encodeURIComponent(project.id)}`, {
        credentials: 'include',
      });
      const data2 = await res2.json();
      if (data2.ok && data2.requests) {
        const requestsList: LeaderboardRequest[] = data2.requests || [];
        setRequests(requestsList);
        if (requestsList.length > 0) {
          const latest = requestsList[0];
          setLatestRequest(latest);
          setHasPendingRequest(latest.status === 'pending');
        }
      }

      // Clear success message after 3 seconds
      setTimeout(() => setFormSuccess(null), 3000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to submit request');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Compute if user can manage (create/edit arenas)
  const canManage = userIsSuperAdmin || permissions?.canManage || false;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingArena, setEditingArena] = useState<Arena | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    starts_at: '',
    ends_at: '',
    reward_depth: 0,
    status: 'draft' as 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled',
  });

  // Refresh arenas list
  const refreshArenas = async () => {
    if (!projectSlug) return;

    try {
      const res = await fetch(`/api/portal/arc/arenas?slug=${encodeURIComponent(projectSlug)}`, { credentials: 'include' });
      if (!res.ok) return;

      const data = await res.json();
      if (data.ok && data.arenas) {
        setArenas(data.arenas);
      }
    } catch (err) {
      console.error('[ArenaManager] Error refreshing arenas:', err);
    }
  };

  // Handle Create Arena
  const handleCreateArena = async () => {
    if (!project || !formData.name.trim() || !formData.slug.trim()) {
      setModalError('Name and slug are required');
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch('/api/portal/arc/arenas-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          projectId: project.id,
          name: formData.name.trim(),
          slug: formData.slug.trim(),
          description: formData.description.trim() || null,
          starts_at: formData.starts_at ? new Date(formData.starts_at).toISOString() : null,
          ends_at: formData.ends_at ? new Date(formData.ends_at).toISOString() : null,
          reward_depth: formData.reward_depth || 0,
          status: formData.status,
        }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Failed to create arena');
      }

      // Refresh list and close modal
      await refreshArenas();
      refreshCurrentArena();
      closeModals();
    } catch (err: any) {
      console.error('[ArenaManager] Error creating arena:', err);
      setModalError(err?.message || 'Failed to create arena. Please try again.');
    } finally {
      setModalLoading(false);
    }
  };

  // Handle Edit Arena
  const handleEditArena = async () => {
    if (!editingArena || !formData.name.trim() || !formData.slug.trim()) {
      setModalError('Name and slug are required');
      return;
    }

    setModalLoading(true);
    setModalError(null);

    try {
      const res = await fetch('/api/portal/arc/arenas-admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          id: editingArena.id,
          name: formData.name.trim(),
          slug: formData.slug.trim(),
          description: formData.description.trim() || null,
          starts_at: formData.starts_at ? new Date(formData.starts_at).toISOString() : null,
          ends_at: formData.ends_at ? new Date(formData.ends_at).toISOString() : null,
          reward_depth: formData.reward_depth || 0,
          status: formData.status,
        }),
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Server error: ${res.status} ${res.statusText}`);
      }

      const result = await res.json();

      if (!res.ok || !result.ok) {
        throw new Error(result.error || 'Failed to update arena');
      }

      // Refresh list and close modal
      await refreshArenas();
      refreshCurrentArena();
      closeModals();
    } catch (err: any) {
      console.error('[ArenaManager] Error updating arena:', err);
      setModalError(err?.message || 'Failed to update arena. Please try again.');
    } finally {
      setModalLoading(false);
    }
  };

  // Open Edit Modal
  const openEditModal = (arena: Arena) => {
    setEditingArena(arena);
    setFormData({
      name: arena.name,
      slug: arena.slug,
      description: arena.description || '',
      starts_at: arena.starts_at ? new Date(arena.starts_at).toISOString().slice(0, 16) : '',
      ends_at: arena.ends_at ? new Date(arena.ends_at).toISOString().slice(0, 16) : '',
      reward_depth: arena.reward_depth || 0,
      status: arena.status,
    });
    setModalError(null);
    setShowEditModal(true);
  };

  // Close modals
  const closeModals = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setEditingArena(null);
    setFormData({
      name: '',
      slug: '',
      description: '',
      starts_at: '',
      ends_at: '',
      reward_depth: 0,
      status: 'draft',
    });
    setModalError(null);
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

  // Helper function to get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/20 border-green-500/40 text-green-300';
      case 'scheduled':
        return 'bg-blue-500/20 border-blue-500/40 text-blue-300';
      case 'ended':
        return 'bg-akari-cardSoft/50 border-akari-border/30 text-akari-muted';
      case 'cancelled':
        return 'bg-red-500/20 border-red-500/40 text-red-300';
      case 'draft':
      default:
        return 'bg-white/10 border-white/20 text-white/60';
    }
  };

  // Update CRM settings when initialFeatures change
  useEffect(() => {
    if (initialFeatures) {
      setCrmEnabled(initialFeatures.crm_enabled || false);
      setCrmVisibility(initialFeatures.crm_visibility || 'private');
    }
  }, [initialFeatures]);

  // Handle CRM Settings Update
  const handleUpdateCrmSettings = async () => {
    if (!project?.id || !userIsSuperAdmin) {
      return;
    }

    setCrmSaving(true);
    setCrmError(null);
    setCrmSuccess(null);

    try {
      const res = await fetch(`/api/portal/admin/arc/projects/${encodeURIComponent(project.id)}/update-features`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          crm_enabled: crmEnabled,
          crm_visibility: crmVisibility,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to update CRM settings');
      }

      setCrmSuccess('CRM settings updated successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setCrmSuccess(null);
      }, 3000);

      // Reload page to get updated features
      setTimeout(() => {
        router.reload();
      }, 1500);
    } catch (err: any) {
      console.error('[ArenaManager] Error updating CRM settings:', err);
      setCrmError(err.message || 'Failed to update CRM settings');
    } finally {
      setCrmSaving(false);
    }
  };

  // Handle Activate Arena
  const handleActivateArena = async (arenaId: string) => {
    setActivatingArenaId(arenaId);
    setActivateSuccess(null);

    try {
      await activateMsArena(arenaId);
      setActivateSuccess(`Arena activated successfully`);
      
      // Refresh both arenas list and current arena
      await refreshArenas();
      refreshCurrentArena();

      // Clear success message after 3 seconds
      setTimeout(() => {
        setActivateSuccess(null);
      }, 3000);
    } catch (err: any) {
      console.error('[ArenaManager] Error activating arena:', err);
      setModalError(err?.message || 'Failed to activate arena. Please try again.');
    } finally {
      setActivatingArenaId(null);
    }
  };

  // Check access (server-side check)
  if (!hasAccess) {
    return (
      <ArcPageShell canManageArc={true}>
        <div>
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-8 text-center">
            <p className="text-sm text-red-400">
              {accessError || 'Access denied. You do not have permission to manage this project.'}
            </p>
            {project?.slug && (
              <Link
                href={`/portal/arc/${encodeURIComponent(project.slug)}`}
                className="mt-4 inline-block text-sm text-teal-400 hover:text-teal-300 transition-colors"
              >
                ← Back to Project Hub
              </Link>
            )}
            <Link
              href="/portal/arc"
              className="mt-2 inline-block text-sm text-teal-400 hover:text-teal-300 transition-colors"
            >
              ← Back to ARC Home
            </Link>
          </div>
        </div>
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell canManageArc={true}>
      <div className="space-y-6">
        {/* Breadcrumb navigation */}
        <div className="flex items-center gap-2 text-sm text-white/60">
          {project?.slug && (
            <>
              <Link
                href={`/portal/arc/${encodeURIComponent(project.slug)}`}
                className="hover:text-white transition-colors"
              >
                {project.name || 'Project'}
              </Link>
              <span>/</span>
            </>
          )}
          {!project?.slug && (
            <>
              <Link
                href="/portal/arc"
                className="hover:text-white transition-colors"
              >
                ARC Home
              </Link>
              <span>/</span>
            </>
          )}
          {userIsSuperAdmin && (
            <>
              <Link
                href="/portal/arc/admin"
                className="hover:text-white transition-colors"
              >
                Admin
              </Link>
              <span>/</span>
            </>
          )}
          <span className="text-white">Leaderboard Dashboard</span>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-6 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Project not found */}
        {!error && !project && (
          <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-8 text-center">
            <p className="text-white/60">
              Project not found.
            </p>
          </div>
        )}

        {/* Project content */}
        {!error && project && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-1">
                  {project.name}
                </h1>
                {project.twitter_username && (
                  <p className="text-white/60">
                    @{project.twitter_username}
                  </p>
                )}
              </div>
              {canManage && (
                <button
                  onClick={() => {
                    setFormData({
                      name: '',
                      slug: '',
                      description: '',
                      starts_at: '',
                      ends_at: '',
                      reward_depth: 0,
                      status: 'draft',
                    });
                    setModalError(null);
                    setShowCreateModal(true);
                  }}
                  className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity"
                >
                  Create Arena
                </button>
              )}
            </div>

            {/* ARC Access Requests Card */}
            <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
              <h2 className="text-lg font-semibold text-white mb-4">ARC Access Requests</h2>
              
              {requestsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                  <span className="ml-3 text-white/60 text-sm">Loading requests...</span>
                </div>
              ) : requestsError ? (
                <div className="mb-4">
                  <ErrorState
                    message={requestsError}
                    onRetry={() => {
                      setRequestsError(null);
                      // Trigger reload
                      window.dispatchEvent(new Event('arc-requests-reload'));
                    }}
                  />
                </div>
              ) : !latestRequest ? (
                <div className="mb-4">
                  <EmptyState
                    title="No requests yet"
                    description="Submit a request to enable ARC features for this project"
                    icon="📝"
                  />
                </div>
              ) : (
                <div className="space-y-3 mb-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-white/60">Product Type:</span>
                      <span className="ml-2 text-white">
                        {latestRequest.product_type === 'ms' ? 'Mindshare' : 
                         latestRequest.product_type === 'gamefi' ? 'GameFi' : 
                         latestRequest.product_type === 'crm' ? 'CRM' : 
                         'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Status:</span>
                      <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                        latestRequest.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                        latestRequest.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {latestRequest.status}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Start Date:</span>
                      <span className="ml-2 text-white">
                        {latestRequest.start_at ? new Date(latestRequest.start_at).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">End Date:</span>
                      <span className="ml-2 text-white">
                        {latestRequest.end_at ? new Date(latestRequest.end_at).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Created:</span>
                      <span className="ml-2 text-white">
                        {new Date(latestRequest.created_at).toLocaleString()}
                      </span>
                    </div>
                    {latestRequest.decided_at && (
                      <div>
                        <span className="text-white/60">Decided:</span>
                        <span className="ml-2 text-white">
                          {new Date(latestRequest.decided_at).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {hasPendingRequest && (
                    <div className="mt-3 p-3 rounded bg-yellow-500/10 border border-yellow-500/30">
                      <p className="text-yellow-400 text-sm">Pending approval - request form is disabled</p>
                    </div>
                  )}
                </div>
              )}

              {/* Show enabled badges for already enabled products */}
              {initialFeatures && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {initialFeatures.leaderboard_enabled && (
                    <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/50">
                      Leaderboard Enabled
                    </span>
                  )}
                  {initialFeatures.gamefi_enabled && (
                    <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/50">
                      GameFi Enabled
                    </span>
                  )}
                  {initialFeatures.crm_enabled && (
                    <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-400 border border-green-500/50">
                      CRM Enabled
                    </span>
                  )}
                </div>
              )}

              {/* Request Form */}
              {canManage && !hasPendingRequest && (
                <div className="border-t border-white/10 pt-4 mt-4">
                  <h3 className="text-sm font-semibold text-white mb-3">Request New Access</h3>
                  
                  {formSuccess && (
                    <div className="mb-3 p-3 rounded bg-green-500/10 border border-green-500/30">
                      <p className="text-green-400 text-sm">{formSuccess}</p>
                    </div>
                  )}
                  
                  {formError && (
                    <div className="mb-3 p-3 rounded bg-red-500/10 border border-red-500/30">
                      <p className="text-red-400 text-sm">{formError}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-white/60 mb-1">Product Type</label>
                      <select
                        value={formProductType}
                        onChange={(e) => setFormProductType(e.target.value as 'ms' | 'gamefi' | 'crm')}
                        className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                      >
                        <option value="ms">Mindshare (Leaderboard)</option>
                        <option value="gamefi">GameFi (Gamified)</option>
                        <option value="crm">CRM (Creator Manager)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-1">
                        Start Date {(formProductType === 'ms' || formProductType === 'gamefi') && <span className="text-red-400">*</span>}
                      </label>
                      <input
                        type="datetime-local"
                        value={formStartAt}
                        onChange={(e) => setFormStartAt(e.target.value)}
                        required={formProductType === 'ms' || formProductType === 'gamefi'}
                        className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-1">
                        End Date {(formProductType === 'ms' || formProductType === 'gamefi') && <span className="text-red-400">*</span>}
                      </label>
                      <input
                        type="datetime-local"
                        value={formEndAt}
                        onChange={(e) => setFormEndAt(e.target.value)}
                        required={formProductType === 'ms' || formProductType === 'gamefi'}
                        className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-1">Notes (Optional)</label>
                      <textarea
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        rows={3}
                        className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400 resize-none"
                        placeholder="Additional information about your request..."
                      />
                    </div>

                    <button
                      onClick={handleSubmitRequest}
                      disabled={formSubmitting || (formProductType !== 'crm' && (!formStartAt || !formEndAt))}
                      className="w-full px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {formSubmitting ? 'Submitting...' : 'Submit Request'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Current Active MS Arena Card */}
            <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Current Active MS Arena</h2>
              
              {arenaLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                  <span className="ml-3 text-white/60 text-sm">Loading current arena...</span>
                </div>
              ) : arenaError ? (
                <ErrorState
                  message={arenaError}
                  onRetry={refreshCurrentArena}
                />
              ) : !currentArena ? (
                <EmptyState
                  title="No active Mindshare arena"
                  description="Activate an arena to start tracking."
                  icon="📊"
                />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-white/60">Name:</span>
                      <span className="ml-2 text-white">{currentArena.name || currentArena.slug || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-white/60">ID:</span>
                      <span className="ml-2 text-white font-mono text-xs">{currentArena.id}</span>
                    </div>
                    <div>
                      <span className="text-white/60">Kind:</span>
                      <span className="ml-2 text-white">{currentArena.kind || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-white/60">Status:</span>
                      <span className={`ml-2 px-2 py-0.5 rounded text-xs ${getStatusColor(currentArena.status)}`}>
                        {currentArena.status}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Starts:</span>
                      <span className="ml-2 text-white">
                        {currentArena.starts_at ? new Date(currentArena.starts_at).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Ends:</span>
                      <span className="ml-2 text-white">
                        {currentArena.ends_at ? new Date(currentArena.ends_at).toLocaleString() : 'No end date'}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Updated:</span>
                      <span className="ml-2 text-white">
                        {currentArena.updated_at ? new Date(currentArena.updated_at).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                  
                  {debug && (
                    <div className="pt-3 border-t border-white/10">
                      <p className="text-xs text-white/60 mb-2">Debug Info:</p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <span className="text-white/40">Live Active:</span>
                          <span className="ml-1 text-white">{debug.live_active_count}</span>
                        </div>
                        <div>
                          <span className="text-white/40">Live:</span>
                          <span className="ml-1 text-white">{debug.live_count}</span>
                        </div>
                        <div>
                          <span className="text-white/40">Active:</span>
                          <span className="ml-1 text-white">{debug.active_count}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Success message */}
            {activateSuccess && (
              <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3">
                <p className="text-sm text-green-400">{activateSuccess}</p>
              </div>
            )}

            {/* Recent Activity Card (SuperAdmin only) */}
            {userIsSuperAdmin && (
              <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
                
                {activityLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                    <span className="ml-3 text-white/60 text-sm">Loading activity...</span>
                  </div>
                ) : activityError ? (
                  <ErrorState
                    message={activityError}
                    onRetry={() => {
                      setActivityError(null);
                      // Trigger reload
                      const fetchActivity = async () => {
                        if (!project?.id) return;
                        setActivityLoading(true);
                        try {
                          const res = await fetch(`/api/portal/admin/arc/activity?projectId=${encodeURIComponent(project.id)}&limit=20`, {
                            credentials: 'include',
                            cache: 'no-store',
                          });
                          const data = await res.json();
                          if (data.ok) {
                            setActivityEvents(data.events || []);
                          } else {
                            setActivityError(data.error || 'Failed to load activity');
                          }
                        } catch (err: any) {
                          setActivityError(err.message || 'Failed to load activity');
                        } finally {
                          setActivityLoading(false);
                        }
                      };
                      fetchActivity();
                    }}
                  />
                ) : activityEvents.length === 0 ? (
                  <EmptyState
                    title="No activity yet"
                    description="Activity events will appear here as actions are performed."
                    icon="📋"
                  />
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {activityEvents.map((event) => (
                      <div
                        key={event.id}
                        className="p-3 rounded border border-white/5 bg-black/20 hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                event.success
                                  ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                  : 'bg-red-500/20 text-red-400 border border-red-500/50'
                              }`}>
                                {event.success ? '✓' : '✗'}
                              </span>
                              <span className="text-sm font-medium text-white">
                                {event.action.split('_').map((word: string) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                              </span>
                              <span className="text-xs text-white/40">
                                {event.entity_type}
                              </span>
                            </div>
                            {event.message && (
                              <p className="text-xs text-white/60 truncate" title={event.message}>
                                {event.message}
                              </p>
                            )}
                            <p className="text-xs text-white/40 mt-1">
                              {new Date(event.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* CRM Settings Card (SuperAdmin only) */}
            {userIsSuperAdmin && (
              <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                <h2 className="text-lg font-semibold text-white mb-4">CRM Settings</h2>
                
                {/* Current Settings Display */}
                <div className="mb-4 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-white/60">CRM Enabled:</span>
                      <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                        initialFeatures?.crm_enabled 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {initialFeatures?.crm_enabled ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div>
                      <span className="text-white/60">Visibility:</span>
                      <span className="ml-2 text-white capitalize">
                        {initialFeatures?.crm_visibility || 'private'}
                      </span>
                    </div>
                    {initialFeatures?.crm_start_at && (
                      <div>
                        <span className="text-white/60">Start Date:</span>
                        <span className="ml-2 text-white">
                          {new Date(initialFeatures.crm_start_at).toLocaleString()}
                        </span>
                      </div>
                    )}
                    {initialFeatures?.crm_end_at && (
                      <div>
                        <span className="text-white/60">End Date:</span>
                        <span className="ml-2 text-white">
                          {new Date(initialFeatures.crm_end_at).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Update Form */}
                <div className="space-y-4 pt-4 border-t border-white/10">
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={crmEnabled}
                        onChange={(e) => setCrmEnabled(e.target.checked)}
                        className="w-4 h-4 rounded bg-black/60 border-white/20 text-teal-400 focus:ring-2 focus:ring-teal-400 focus:ring-offset-0"
                      />
                      <span className="text-sm text-white">Enable CRM</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs text-white/60 mb-1">Visibility</label>
                    <select
                      value={crmVisibility}
                      onChange={(e) => setCrmVisibility(e.target.value as 'private' | 'public' | 'hybrid')}
                      className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    >
                      <option value="private">Private</option>
                      <option value="public">Public</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </div>

                  {/* Error state */}
                  {crmError && (
                    <ErrorState
                      message={crmError}
                      onRetry={() => setCrmError(null)}
                    />
                  )}

                  {/* Success message */}
                  {crmSuccess && (
                    <div className="rounded-lg border border-green-500/50 bg-green-500/10 p-3">
                      <p className="text-sm text-green-400">{crmSuccess}</p>
                    </div>
                  )}

                  <button
                    onClick={handleUpdateCrmSettings}
                    disabled={crmSaving}
                    className="w-full px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {crmSaving ? 'Saving...' : 'Save CRM Settings'}
                  </button>
                </div>
              </div>
            )}

            {/* CRM Campaigns Card */}
            {initialFeatures?.crm_enabled && (canManage || userIsSuperAdmin) ? (
              <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white">CRM Campaigns</h2>
                  {canManage && (
                    <button
                      onClick={() => {
                        setCampaignForm({
                          name: '',
                          starts_at: '',
                          ends_at: '',
                          visibility: 'private',
                        });
                        setCampaignFormError(null);
                        setCampaignFormSuccess(null);
                        setShowCreateCampaignModal(true);
                      }}
                      className="px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity"
                    >
                      Create Campaign
                    </button>
                  )}
                </div>

                {campaignsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                    <span className="ml-3 text-white/60 text-sm">Loading campaigns...</span>
                  </div>
                ) : campaignsError ? (
                  <ErrorState
                    message={campaignsError}
                    onRetry={fetchCampaigns}
                  />
                ) : campaigns.length === 0 ? (
                  <EmptyState
                    title="No CRM campaigns yet"
                    description="Create a campaign to onboard creators and track performance."
                    icon="📢"
                  />
                ) : (
                  <div className="space-y-4">
                    {/* Campaign List */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-white/5 border-b border-white/10">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Campaign Name</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Date Range</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Visibility</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Participants</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {campaigns.map((campaign) => {
                            const now = new Date();
                            const startAt = campaign.start_at ? new Date(campaign.start_at) : null;
                            const endAt = campaign.end_at ? new Date(campaign.end_at) : null;
                            let status = 'upcoming';
                            if (startAt && endAt) {
                              if (now >= startAt && now <= endAt) {
                                status = 'active';
                              } else if (now > endAt) {
                                status = 'ended';
                              }
                            } else if (startAt && now >= startAt) {
                              status = 'active';
                            } else if (endAt && now > endAt) {
                              status = 'ended';
                            }

                            return (
                              <tr
                                key={campaign.id}
                                className={`hover:bg-white/5 transition-colors cursor-pointer ${selectedCampaign === campaign.id ? 'bg-white/10' : ''}`}
                                onClick={() => setSelectedCampaign(selectedCampaign === campaign.id ? null : campaign.id)}
                              >
                                <td className="px-4 py-3 text-sm text-white font-medium">{campaign.name}</td>
                                <td className="px-4 py-3 text-sm text-white/80">
                                  {startAt && endAt
                                    ? `${startAt.toLocaleDateString()} - ${endAt.toLocaleDateString()}`
                                    : startAt
                                    ? `From ${startAt.toLocaleDateString()}`
                                    : endAt
                                    ? `Until ${endAt.toLocaleDateString()}`
                                    : 'No dates'}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded text-xs ${
                                    campaign.leaderboard_visibility === 'public'
                                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                                      : 'bg-gray-500/20 text-gray-400 border border-gray-500/50'
                                  }`}>
                                    {campaign.leaderboard_visibility}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-white/80">
                                  {selectedCampaign === campaign.id ? participants.length : '-'}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-1 rounded text-xs ${
                                    status === 'active'
                                      ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                                      : status === 'ended'
                                      ? 'bg-gray-500/20 text-gray-400 border border-gray-500/50'
                                      : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50'
                                  }`}>
                                    {status}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedCampaign(campaign.id);
                                      }}
                                      className="px-2 py-1 text-xs text-white/60 hover:text-white transition-colors"
                                    >
                                      View
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedCampaign(campaign.id);
                                        // Scroll to leaderboard
                                        setTimeout(() => {
                                          const leaderboardEl = document.getElementById(`leaderboard-${campaign.id}`);
                                          leaderboardEl?.scrollIntoView({ behavior: 'smooth' });
                                        }, 100);
                                      }}
                                      className="px-2 py-1 text-xs text-white/60 hover:text-white transition-colors"
                                    >
                                      Leaderboard
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Campaign Detail View */}
                    {selectedCampaign && (
                      <div className="mt-6 pt-6 border-t border-white/10 space-y-6">
                        {(() => {
                          const campaign = campaigns.find((c) => c.id === selectedCampaign);
                          if (!campaign) return null;

                          return (
                            <>
                              {/* Campaign Header */}
                              <div className="flex items-start justify-between">
                                <div>
                                  <h3 className="text-lg font-semibold text-white mb-2">{campaign.name}</h3>
                                  <div className="flex items-center gap-4 text-sm text-white/60">
                                    {campaign.start_at && (
                                      <span>Start: {new Date(campaign.start_at).toLocaleString()}</span>
                                    )}
                                    {campaign.end_at && (
                                      <span>End: {new Date(campaign.end_at).toLocaleString()}</span>
                                    )}
                                    <span className={`px-2 py-1 rounded text-xs ${
                                      campaign.leaderboard_visibility === 'public'
                                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                                        : 'bg-gray-500/20 text-gray-400 border border-gray-500/50'
                                    }`}>
                                      {campaign.leaderboard_visibility}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  onClick={() => setSelectedCampaign(null)}
                                  className="text-white/60 hover:text-white transition-colors"
                                >
                                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>

                              {/* Participants Section */}
                              <div>
                                <div className="flex items-center justify-between mb-4">
                                  <h4 className="text-md font-semibold text-white">Participants</h4>
                                  {canManage && (
                                    <button
                                      onClick={() => {
                                        setParticipantForm({ twitter_username: '' });
                                        setParticipantFormError(null);
                                        setShowAddParticipantModal(true);
                                      }}
                                      className="px-3 py-1.5 text-xs font-medium bg-teal-500/20 text-teal-400 border border-teal-500/50 rounded hover:bg-teal-500/30 transition-colors"
                                    >
                                      Add Participant
                                    </button>
                                  )}
                                </div>

                                {participantsLoading ? (
                                  <div className="flex items-center justify-center py-8">
                                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                                    <span className="ml-3 text-white/60 text-sm">Loading participants...</span>
                                  </div>
                                ) : participantsError ? (
                                  <ErrorState
                                    message={participantsError}
                                    onRetry={() => fetchParticipants(selectedCampaign)}
                                  />
                                ) : participants.length === 0 ? (
                                  <EmptyState
                                    title="No participants yet"
                                    description="Add participants to start tracking their performance."
                                    icon="👥"
                                  />
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full">
                                      <thead className="bg-white/5 border-b border-white/10">
                                        <tr>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Twitter Username</th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Joined At</th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-white/60">UTM Links</th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-white/10">
                                        {participants.map((participant) => {
                                          const linksCount = participant.links?.length || 0;
                                          const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

                                          return (
                                            <tr key={participant.id} className="hover:bg-white/5 transition-colors">
                                              <td className="px-4 py-3 text-sm text-white">@{participant.twitter_username}</td>
                                              <td className="px-4 py-3 text-sm text-white/80">
                                                {participant.joined_at ? new Date(participant.joined_at).toLocaleString() : 'N/A'}
                                              </td>
                                              <td className="px-4 py-3 text-sm text-white/80">
                                                <span className="text-white/80">{linksCount} link{linksCount !== 1 ? 's' : ''}</span>
                                              </td>
                                              <td className="px-4 py-3">
                                                {canManage && (
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      handleOpenUtmLinksModal(participant);
                                                    }}
                                                    className="px-2 py-1 text-xs bg-teal-500/20 text-teal-400 border border-teal-500/50 rounded hover:bg-teal-500/30 transition-colors"
                                                  >
                                                    Manage UTM Links
                                                  </button>
                                                )}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>

                              {/* Leaderboard Section */}
                              <div id={`leaderboard-${campaign.id}`}>
                                <h4 className="text-md font-semibold text-white mb-4">Leaderboard</h4>

                                {leaderboardLoading ? (
                                  <div className="flex items-center justify-center py-8">
                                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                                    <span className="ml-3 text-white/60 text-sm">Loading leaderboard...</span>
                                  </div>
                                ) : leaderboardError ? (
                                  <ErrorState
                                    message={leaderboardError}
                                    onRetry={() => fetchLeaderboard(selectedCampaign)}
                                  />
                                ) : leaderboard.length === 0 ? (
                                  <EmptyState
                                    title="No leaderboard data yet"
                                    description="Participants will appear here once they generate UTM links and receive clicks."
                                    icon="🏆"
                                  />
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full">
                                      <thead className="bg-white/5 border-b border-white/10">
                                        <tr>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Rank</th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Twitter Username</th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Unique Clicks</th>
                                          <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Total Clicks</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-white/10">
                                        {leaderboard.map((entry, idx) => (
                                          <tr key={entry.participant_id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3 text-sm font-semibold text-white">#{idx + 1}</td>
                                            <td className="px-4 py-3 text-sm text-white">@{entry.twitter_username}</td>
                                            <td className="px-4 py-3 text-sm text-white font-medium">{entry.unique_clicks}</td>
                                            <td className="px-4 py-3 text-sm text-white">{entry.clicks}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : initialFeatures && !initialFeatures.crm_enabled ? (
              <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6">
                <h2 className="text-lg font-semibold text-white mb-4">CRM Campaigns</h2>
                <EmptyState
                  title="CRM is not enabled"
                  description={userIsSuperAdmin 
                    ? "Enable CRM in the CRM Settings section above to start creating campaigns."
                    : "CRM is not enabled for this project. Contact a project admin to request access."}
                  icon="🔒"
                />
              </div>
            ) : null}

            {/* Arenas table */}
            <div className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm overflow-hidden">
              {arenas.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-white/60">
                    No arenas found for this project.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-white/5 border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Slug</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Date Range</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Reward Depth</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-white/60">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {arenas.map((arena) => (
                        <tr
                          key={arena.id}
                          className="hover:bg-white/5 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm text-white">
                            <Link
                              href={`/portal/arc/${projectSlug}/arena/${arena.slug}`}
                              className="font-medium text-teal-400 hover:text-teal-300 transition-colors"
                            >
                              {arena.name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-sm text-white/60">
                            {arena.slug}
                          </td>
                          <td className="px-4 py-3 text-sm text-white">
                            {formatDateRange(arena.starts_at, arena.ends_at)}
                          </td>
                          <td className="px-4 py-3 text-sm text-white">
                            {arena.reward_depth}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                                arena.status
                              )}`}
                            >
                              {arena.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {userIsSuperAdmin && (arena.kind === 'ms' || arena.kind === 'legacy_ms') && (
                                <button
                                  onClick={() => handleActivateArena(arena.id)}
                                  disabled={activatingArenaId === arena.id}
                                  className="px-2 py-1 text-xs bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {activatingArenaId === arena.id ? 'Activating...' : 'Activate'}
                                </button>
                              )}
                              {canManage && (
                                <button
                                  onClick={() => openEditModal(arena)}
                                  className="px-2 py-1 text-xs text-white/60 hover:text-white transition-colors"
                                >
                                  Edit
                                </button>
                              )}
                              <Link
                                href={`/portal/arc/${projectSlug}/arena/${arena.slug}`}
                                className="px-2 py-1 text-xs text-white/60 hover:text-white transition-colors"
                              >
                                View
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* Create Arena Modal */}
        {showCreateModal && (
          <ArenaModal
            title="Create Arena"
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleCreateArena}
            onClose={closeModals}
            loading={modalLoading}
            error={modalError}
          />
        )}

        {/* Edit Arena Modal */}
        {showEditModal && editingArena && (
          <ArenaModal
            title="Edit Arena"
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleEditArena}
            onClose={closeModals}
            loading={modalLoading}
            error={modalError}
          />
        )}

        {/* Create Campaign Modal */}
        {showCreateCampaignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Create Campaign</h3>
                <button
                  onClick={() => {
                    setShowCreateCampaignModal(false);
                    setCampaignFormError(null);
                    setCampaignFormSuccess(null);
                  }}
                  className="text-white/60 hover:text-white transition-colors"
                  disabled={campaignFormSubmitting}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {campaignFormSuccess && (
                <div className="mb-4 p-3 rounded bg-green-500/10 border border-green-500/30">
                  <p className="text-green-400 text-sm">{campaignFormSuccess}</p>
                </div>
              )}

              {campaignFormError && (
                <div className="mb-4 p-3 rounded bg-red-500/10 border border-red-500/30">
                  <p className="text-red-400 text-sm">{campaignFormError}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-white/60 mb-1">
                    Campaign Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={campaignForm.name}
                    onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                    placeholder="e.g., Q1 Creator Campaign"
                    className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    disabled={campaignFormSubmitting}
                  />
                </div>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Start Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={campaignForm.starts_at}
                    onChange={(e) => setCampaignForm({ ...campaignForm, starts_at: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    disabled={campaignFormSubmitting}
                  />
                </div>

                <div>
                  <label className="block text-xs text-white/60 mb-1">End Date (Optional)</label>
                  <input
                    type="datetime-local"
                    value={campaignForm.ends_at}
                    onChange={(e) => setCampaignForm({ ...campaignForm, ends_at: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    disabled={campaignFormSubmitting}
                  />
                </div>

                <div>
                  <label className="block text-xs text-white/60 mb-1">Visibility</label>
                  <select
                    value={campaignForm.visibility}
                    onChange={(e) => setCampaignForm({ ...campaignForm, visibility: e.target.value as 'private' | 'public' })}
                    className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    disabled={campaignFormSubmitting}
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <button
                    onClick={handleCreateCampaign}
                    disabled={campaignFormSubmitting || !campaignForm.name.trim()}
                    className="flex-1 px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {campaignFormSubmitting ? 'Creating...' : 'Create Campaign'}
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateCampaignModal(false);
                      setCampaignFormError(null);
                      setCampaignFormSuccess(null);
                    }}
                    disabled={campaignFormSubmitting}
                    className="px-4 py-2 text-sm font-medium border border-white/20 text-white/80 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Manage UTM Links Modal */}
        {showUtmLinksModal && selectedParticipantForLinks && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6 shadow-xl max-h-[90vh] overflow-y-auto">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">
                  Manage UTM Links - @{selectedParticipantForLinks.twitter_username}
                </h3>
                <button
                  onClick={() => {
                    setShowUtmLinksModal(false);
                    setSelectedParticipantForLinks(null);
                    setNewLinkForm({ label: '', destination_url: '' });
                    setNewLinkError(null);
                  }}
                  className="text-white/60 hover:text-white transition-colors"
                  disabled={newLinkSubmitting}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Existing Links */}
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-white mb-3">Existing Links ({selectedParticipantForLinks.links.length}/5)</h4>
                {selectedParticipantForLinks.links.length === 0 ? (
                  <EmptyState
                    title="No links yet"
                    description="Create your first UTM link below."
                    icon="🔗"
                  />
                ) : (
                  <div className="space-y-3">
                    {selectedParticipantForLinks.links.map((link) => {
                      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                      const shortUrl = `${baseUrl}/r/${link.short_code || link.code}`;
                      
                      return (
                        <div
                          key={link.id}
                          className="p-4 rounded-lg border border-white/10 bg-black/20"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-medium text-white">
                                  {link.label || 'Untitled Link'}
                                </span>
                              </div>
                              <div className="space-y-1 text-xs">
                                <div>
                                  <span className="text-white/60">Short URL: </span>
                                  <a
                                    href={shortUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-teal-400 hover:text-teal-300 font-mono"
                                  >
                                    {shortUrl}
                                  </a>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(shortUrl);
                                      alert('Link copied to clipboard!');
                                    }}
                                    className="ml-2 px-2 py-1 bg-white/10 hover:bg-white/20 rounded transition-colors"
                                  >
                                    Copy
                                  </button>
                                </div>
                                <div>
                                  <span className="text-white/60">Destination: </span>
                                  <span className="text-white/80 truncate block">{link.target_url}</span>
                                </div>
                                <div>
                                  <span className="text-white/60">Created: </span>
                                  <span className="text-white/80">
                                    {new Date(link.created_at).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Create New Link Form */}
              {selectedParticipantForLinks.links.length < 5 ? (
                <div className="border-t border-white/10 pt-6">
                  <h4 className="text-sm font-semibold text-white mb-3">Create New Link</h4>
                  
                  {newLinkError && (
                    <div className="mb-4 p-3 rounded bg-red-500/10 border border-red-500/30">
                      <p className="text-red-400 text-sm">{newLinkError}</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-white/60 mb-1">
                        Label <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={newLinkForm.label}
                        onChange={(e) => setNewLinkForm({ ...newLinkForm, label: e.target.value })}
                        placeholder="e.g., Main Landing Page"
                        className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                        disabled={newLinkSubmitting}
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-white/60 mb-1">
                        Destination URL <span className="text-red-400">*</span>
                      </label>
                      <input
                        type="url"
                        value={newLinkForm.destination_url}
                        onChange={(e) => setNewLinkForm({ ...newLinkForm, destination_url: e.target.value })}
                        placeholder="https://example.com/page"
                        className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                        disabled={newLinkSubmitting}
                      />
                    </div>

                    <button
                      onClick={handleCreateUtmLink}
                      disabled={newLinkSubmitting || !newLinkForm.label.trim() || !newLinkForm.destination_url.trim()}
                      className="w-full px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {newLinkSubmitting ? 'Creating...' : 'Create Link'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-white/10 pt-6">
                  <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                    <p className="text-yellow-400 text-sm">
                      Maximum of 5 links per participant reached. Delete an existing link to create a new one.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add Participant Modal */}
        {showAddParticipantModal && selectedCampaign && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Add Participant</h3>
                <button
                  onClick={() => {
                    setShowAddParticipantModal(false);
                    setParticipantFormError(null);
                  }}
                  className="text-white/60 hover:text-white transition-colors"
                  disabled={participantFormSubmitting}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {participantFormError && (
                <div className="mb-4 p-3 rounded bg-red-500/10 border border-red-500/30">
                  <p className="text-red-400 text-sm">{participantFormError}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-white/60 mb-1">
                    Twitter Username <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={participantForm.twitter_username}
                    onChange={(e) => setParticipantForm({ twitter_username: e.target.value })}
                    placeholder="username (without @)"
                    className="w-full px-3 py-2 rounded-lg bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    disabled={participantFormSubmitting}
                  />
                  <p className="mt-1 text-xs text-white/40">Enter username without @ symbol</p>
                </div>

                <div className="flex items-center gap-3 pt-4">
                  <button
                    onClick={handleAddParticipant}
                    disabled={participantFormSubmitting || !participantForm.twitter_username.trim()}
                    className="flex-1 px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {participantFormSubmitting ? 'Adding...' : 'Add Participant'}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddParticipantModal(false);
                      setParticipantFormError(null);
                    }}
                    disabled={participantFormSubmitting}
                    className="px-4 py-2 text-sm font-medium border border-white/20 text-white/80 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
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

// =============================================================================
// ARENA MODAL COMPONENT
// =============================================================================

interface ArenaModalProps {
  title: string;
  formData: {
    name: string;
    slug: string;
    description: string;
    starts_at: string;
    ends_at: string;
    reward_depth: number;
    status: 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled';
  };
  setFormData: (data: any) => void;
  onSubmit: () => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
}

function ArenaModal({ title, formData, setFormData, onSubmit, onClose, loading, error }: ArenaModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors"
            disabled={loading}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-white/60">Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-teal-400/50 transition-colors"
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">Slug *</label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-teal-400/50 transition-colors"
              disabled={loading}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-white/60">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-teal-400/50 transition-colors"
              disabled={loading}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-white/60">Start Date</label>
              <input
                type="datetime-local"
                value={formData.starts_at}
                onChange={(e) => setFormData({ ...formData, starts_at: e.target.value })}
                min="2000-01-01T00:00"
                max="2099-12-31T23:59"
                className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-teal-400/50 transition-colors"
                disabled={loading}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">End Date</label>
              <input
                type="datetime-local"
                value={formData.ends_at}
                onChange={(e) => setFormData({ ...formData, ends_at: e.target.value })}
                min="2000-01-01T00:00"
                max="2099-12-31T23:59"
                className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-teal-400/50 transition-colors"
                disabled={loading}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-white/60 group relative">
                <span className="flex items-center gap-1">
                  Reward Depth
                  <svg className="w-3 h-3 text-white/40 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="absolute bottom-full left-0 mb-2 hidden w-56 rounded-lg bg-black/90 p-2 text-xs text-white/80 shadow-lg group-hover:block z-20 border border-white/10">
                    Number of top participants who will receive rewards (e.g., 100 = top 100 will be rewarded)
                  </div>
                </span>
              </label>
              <input
                type="number"
                value={formData.reward_depth}
                onChange={(e) => setFormData({ ...formData, reward_depth: Number(e.target.value) || 0 })}
                min="0"
                placeholder="100"
                className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-teal-400/50 transition-colors"
                disabled={loading}
              />
              <p className="mt-1 text-[10px] text-white/40">Top {formData.reward_depth || 0} participants will be eligible for rewards</p>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/60">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 text-sm bg-black/40 border border-white/10 rounded-lg text-white focus:outline-none focus:border-teal-400/50 transition-colors"
                disabled={loading}
              >
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
                <option value="ended">Ended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-2">
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium border border-white/10 rounded-lg text-white hover:bg-white/10 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// SERVER-SIDE PROPS
// =============================================================================

export const getServerSideProps: GetServerSideProps<ArenaManagerProps> = async (context) => {
  const { projectSlug } = context.params || {};

  if (!projectSlug || typeof projectSlug !== 'string') {
      return {
        props: {
          project: null,
          arenas: [],
          error: 'Invalid project slug',
          projectSlug: '',
          hasAccess: false,
          accessError: 'Invalid project slug',
          features: null,
        },
      };
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Get session token and user ID
    const sessionToken = getSessionTokenFromRequest(context.req);
    if (!sessionToken) {
      return {
        props: {
          project: null,
          arenas: [],
          error: null,
          projectSlug,
          hasAccess: false,
          accessError: 'Authentication required',
          features: null,
        },
      };
    }

    // Get user ID from session
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session || new Date(session.expires_at) < new Date()) {
      return {
        props: {
          project: null,
          arenas: [],
          error: null,
          projectSlug,
          hasAccess: false,
          accessError: 'Invalid or expired session',
          features: null,
        },
      };
    }

    const userId = session.user_id;

    // Resolve project by slug
    const { data: projectData, error: projectError } = await supabaseAdmin
      .from('projects')
      .select('id, name, twitter_username, slug')
      .eq('slug', projectSlug)
      .single();

    if (projectError || !projectData) {
      return {
        props: {
          project: null,
          arenas: [],
          error: 'Project not found',
          projectSlug,
          hasAccess: false,
          accessError: 'Project not found',
          features: null,
        },
      };
    }

    // Check project permissions
    const permissions = await checkProjectPermissions(supabaseAdmin, userId, projectData.id);
    const hasAccess = permissions.canManage || permissions.isSuperAdmin;

    if (!hasAccess) {
      return {
        props: {
          project: {
            id: projectData.id,
            name: projectData.name,
            twitter_username: projectData.twitter_username,
            slug: projectData.slug,
          },
          arenas: [],
          error: null,
          projectSlug,
          hasAccess: false,
          accessError: 'You do not have permission to manage this project. Only project owners, admins, moderators, or super admins can access this page.',
          features: null,
        },
      };
    }

    // Load arenas for this project
    const { data: arenasData, error: arenasError } = await supabaseAdmin
      .from('arenas')
      .select('id, project_id, slug, name, description, status, starts_at, ends_at, reward_depth, kind')
      .eq('project_id', projectData.id)
      .order('created_at', { ascending: false });

    if (arenasError) {
      console.error('[ArenaManager] Error loading arenas:', arenasError);
      return {
        props: {
          project: {
            id: projectData.id,
            name: projectData.name,
            twitter_username: projectData.twitter_username,
            slug: projectData.slug,
          },
          arenas: [],
          error: 'Failed to load arenas',
          projectSlug,
          hasAccess: true,
          accessError: null,
          features: null,
        },
      };
    }

    const arenas: Arena[] = (arenasData || []).map((row: any) => ({
      id: row.id,
      project_id: row.project_id,
      slug: row.slug,
      name: row.name,
      description: row.description ?? null,
      status: row.status,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      reward_depth: row.reward_depth,
      kind: row.kind ?? null,
    }));

    // Load arc_project_features for this project
    const { data: featuresData, error: featuresError } = await supabaseAdmin
      .from('arc_project_features')
      .select('leaderboard_enabled, leaderboard_start_at, leaderboard_end_at, gamefi_enabled, gamefi_start_at, gamefi_end_at, crm_enabled, crm_start_at, crm_end_at, crm_visibility')
      .eq('project_id', projectData.id)
      .maybeSingle();

    let features: ProjectFeatures | null = null;
    if (featuresData) {
      features = {
        leaderboard_enabled: featuresData.leaderboard_enabled || false,
        leaderboard_start_at: featuresData.leaderboard_start_at || null,
        leaderboard_end_at: featuresData.leaderboard_end_at || null,
        gamefi_enabled: featuresData.gamefi_enabled || false,
        gamefi_start_at: featuresData.gamefi_start_at || null,
        gamefi_end_at: featuresData.gamefi_end_at || null,
        crm_enabled: featuresData.crm_enabled || false,
        crm_start_at: featuresData.crm_start_at || null,
        crm_end_at: featuresData.crm_end_at || null,
        crm_visibility: (featuresData.crm_visibility as 'private' | 'public' | 'hybrid') || null,
      };
    }

    return {
      props: {
        project: {
          id: projectData.id,
          name: projectData.name,
          twitter_username: projectData.twitter_username,
          slug: projectData.slug,
        },
        arenas,
        error: null,
        projectSlug,
        hasAccess: true,
        accessError: null,
        features,
      },
    };
  } catch (error: any) {
    console.error('[ArenaManager] Error:', error);
      return {
        props: {
          project: null,
          arenas: [],
          error: error.message || 'Internal server error',
          projectSlug,
          hasAccess: false,
          accessError: error.message || 'Internal server error',
          features: null,
        },
      };
  }
};
