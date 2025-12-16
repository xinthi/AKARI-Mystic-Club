/**
 * Creator Manager - Program Detail Page
 * 
 * Complete admin UI for managing a Creator Manager program
 * Tabs: Overview, Creators, Deals, Missions
 * 
 * Permissions: Only project owner, admin, or moderator can access
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { CREATOR_CLASSES } from '@/lib/creator-gamification';
import { createPortalClient } from '@/lib/portal/supabase';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface Program {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  visibility: 'private' | 'public' | 'hybrid';
  status: 'active' | 'paused' | 'ended';
  start_at: string | null;
  end_at: string | null;
  created_at: string;
  stats?: {
    totalCreators: number;
    approvedCreators: number;
    pendingCreators: number;
    totalArcPoints: number;
    totalXp: number;
  };
}

interface Project {
  id: string;
  name: string;
  slug: string;
  avatar_url: string | null;
  twitter_username: string | null;
}

interface Creator {
  id: string;
  creator_profile_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'removed';
  arc_points: number;
  xp: number;
  creatorLevel: number;
  class: string | null;
  deal_id: string | null;
  profile?: {
    username: string;
    name: string | null;
    profile_image_url: string | null;
  };
  deal?: {
    id: string;
    internal_label: string;
  } | null;
}

interface Deal {
  id: string;
  internal_label: string;
  description: string | null;
  visibility: 'private' | 'public';
  is_default: boolean;
}

interface Mission {
  id: string;
  title: string;
  description: string | null;
  reward_arc_min: number;
  reward_arc_max: number;
  reward_xp: number;
  is_active: boolean;
  order_index: number;
}

interface MissionSubmission {
  id: string;
  mission_id: string;
  mission_title: string;
  creator_profile_id: string;
  creator_username: string;
  creator_name: string | null;
  status: 'in_progress' | 'submitted' | 'approved' | 'rejected';
  post_url: string | null;
  post_tweet_id: string | null;
  notes: string | null;
  last_update_at: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function CreatorManagerProgramDetail() {
  const router = useRouter();
  const { programId } = router.query;
  const akariUser = useAkariUser();

  const [activeTab, setActiveTab] = useState<'overview' | 'creators' | 'deals' | 'missions'>('overview');
  const [program, setProgram] = useState<Program | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [submissions, setSubmissions] = useState<MissionSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [viewingSubmissions, setViewingSubmissions] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  
  // Modals
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAddDealModal, setShowAddDealModal] = useState(false);
  const [showAddMissionModal, setShowAddMissionModal] = useState(false);
  const [showEditMissionModal, setShowEditMissionModal] = useState(false);
  const [editingMission, setEditingMission] = useState<Mission | null>(null);
  
  // Forms
  const [inviteUsernames, setInviteUsernames] = useState('');
  const [inviting, setInviting] = useState(false);
  const [newDeal, setNewDeal] = useState({ internalLabel: '', description: '', visibility: 'private' as 'private' | 'public' });
  const [addingDeal, setAddingDeal] = useState(false);
  const [newMission, setNewMission] = useState({
    title: '',
    description: '',
    reward_arc_min: 0,
    reward_arc_max: 0,
    reward_xp: 0,
  });
  const [addingMission, setAddingMission] = useState(false);
  
  // Updating states
  const [updatingClass, setUpdatingClass] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [updatingDeal, setUpdatingDeal] = useState<string | null>(null);
  const [updatingProgramStatus, setUpdatingProgramStatus] = useState(false);
  const [permissions, setPermissions] = useState<{ isOwner: boolean; isAdmin: boolean; isModerator: boolean } | null>(null);

  const loadProgram = useCallback(async () => {
    if (!programId || typeof programId !== 'string' || !akariUser.userId) return;

    try {
      const supabase = createPortalClient();

      // Get program details
      const { data: programData, error: programError } = await supabase
        .from('creator_manager_programs')
        .select('*')
        .eq('id', programId)
        .single();

      if (programError || !programData) {
        throw new Error('Program not found');
      }

      // Check permissions
      const permissions = await checkProjectPermissions(
        supabase,
        akariUser.userId,
        programData.project_id
      );

      if (!permissions.canManage) {
        setHasPermission(false);
        setLoading(false);
        return;
      }

      setHasPermission(true);
      setPermissions({
        isOwner: permissions.isOwner,
        isAdmin: permissions.isAdmin,
        isModerator: permissions.isModerator,
      });

      // Get project info
      const { data: projectData } = await supabase
        .from('projects')
        .select('id, name, slug, avatar_url, twitter_username')
        .eq('id', programData.project_id)
        .single();

      if (projectData) {
        setProject(projectData);
      }

      // Get stats
      const { count: totalCreators } = await supabase
        .from('creator_manager_creators')
        .select('*', { count: 'exact', head: true })
        .eq('program_id', programId);

      const { count: approvedCreators } = await supabase
        .from('creator_manager_creators')
        .select('*', { count: 'exact', head: true })
        .eq('program_id', programId)
        .eq('status', 'approved');

      const { count: pendingCreators } = await supabase
        .from('creator_manager_creators')
        .select('*', { count: 'exact', head: true })
        .eq('program_id', programId)
        .eq('status', 'pending');

      const { data: creatorsForStats } = await supabase
        .from('creator_manager_creators')
        .select('arc_points, xp')
        .eq('program_id', programId);

      const totalArcPoints = creatorsForStats?.reduce((sum, c) => sum + (c.arc_points || 0), 0) || 0;
      const totalXp = creatorsForStats?.reduce((sum, c) => sum + (c.xp || 0), 0) || 0;

      setProgram({
        ...programData,
        stats: {
          totalCreators: totalCreators || 0,
          approvedCreators: approvedCreators || 0,
          pendingCreators: pendingCreators || 0,
          totalArcPoints,
          totalXp,
        },
      });

      // Load creators
      const creatorsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/creators`);
      const creatorsData = await creatorsRes.json();
      if (creatorsData.ok) {
        setCreators(creatorsData.creators || []);
      }

      // Load deals
      const dealsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/deals`);
      const dealsData = await dealsRes.json();
      if (dealsData.ok) {
        setDeals(dealsData.deals || []);
      }

      // Load missions
      const missionsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/missions`);
      const missionsData = await missionsRes.json();
      if (missionsData.ok) {
        setMissions(missionsData.missions || []);
      }

      // Load submissions
      const submissionsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/missions/submissions`);
      const submissionsData = await submissionsRes.json();
      if (submissionsData.ok) {
        setSubmissions(submissionsData.submissions || []);
      }
    } catch (err: any) {
      console.error('[Program Detail] Error:', err);
      setError(err.message || 'Failed to load program');
    } finally {
      setLoading(false);
    }
  }, [programId, akariUser.userId]);

  useEffect(() => {
    if (akariUser.isLoggedIn) {
      loadProgram();
    } else {
      setLoading(false);
    }
  }, [loadProgram, akariUser.isLoggedIn]);

  // Handlers
  const handleInvite = async () => {
    if (!inviteUsernames.trim()) return;

    setInviting(true);
    try {
      const usernames = inviteUsernames
        .split(/[,\n]/)
        .map(u => u.trim().replace('@', ''))
        .filter(u => u.length > 0);

      const res = await fetch(
        `/api/portal/creator-manager/programs/${programId}/creators/invite`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ twitterUsernames: usernames }),
        }
      );

      const data = await res.json();
      if (data.ok) {
        setShowInviteModal(false);
        setInviteUsernames('');
        await loadProgram();
        alert(data.message || 'Creators invited successfully');
      } else {
        alert(data.error || 'Failed to invite creators');
      }
    } catch (err: any) {
      console.error('[Invite] Error:', err);
      alert('Failed to invite creators');
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateStatus = async (creatorId: string, newStatus: 'pending' | 'approved' | 'rejected' | 'removed') => {
    setUpdatingStatus(creatorId);
    try {
      const res = await fetch(
        `/api/portal/creator-manager/programs/${programId}/creators/${creatorId}/status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      const data = await res.json();
      if (data.ok) {
        await loadProgram();
      } else {
        alert(data.error || 'Failed to update status');
      }
    } catch (err: any) {
      console.error('[Update Status] Error:', err);
      alert('Failed to update status');
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleAssignDeal = async (creatorId: string, dealId: string | null) => {
    setUpdatingDeal(creatorId);
    try {
      const res = await fetch(
        `/api/portal/creator-manager/programs/${programId}/creators/${creatorId}/status`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealId }),
        }
      );

      const data = await res.json();
      if (data.ok) {
        await loadProgram();
      } else {
        alert(data.error || 'Failed to assign deal');
      }
    } catch (err: any) {
      console.error('[Assign Deal] Error:', err);
      alert('Failed to assign deal');
    } finally {
      setUpdatingDeal(null);
    }
  };

  const handleUpdateClass = async (creatorId: string, newClass: string | null) => {
    setUpdatingClass(creatorId);
    try {
      const res = await fetch(
        `/api/portal/creator-manager/programs/${programId}/creators/${creatorId}/class`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ class: newClass }),
        }
      );

      const data = await res.json();
      if (data.ok) {
        await loadProgram();
      } else {
        alert(data.error || 'Failed to update class');
      }
    } catch (err: any) {
      console.error('[Update Class] Error:', err);
      alert('Failed to update class');
    } finally {
      setUpdatingClass(null);
    }
  };

  const handleAddDeal = async () => {
    if (!newDeal.internalLabel.trim()) return;

    setAddingDeal(true);
    try {
      const res = await fetch(`/api/portal/creator-manager/programs/${programId}/deals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDeal),
      });

      const data = await res.json();
      if (data.ok) {
        setShowAddDealModal(false);
        setNewDeal({ internalLabel: '', description: '', visibility: 'private' });
        await loadProgram();
      } else {
        alert(data.error || 'Failed to create deal');
      }
    } catch (err: any) {
      console.error('[Add Deal] Error:', err);
      alert('Failed to create deal');
    } finally {
      setAddingDeal(false);
    }
  };

  const handleAddMission = async () => {
    if (!newMission.title.trim()) return;

    setAddingMission(true);
    try {
      const res = await fetch(`/api/portal/creator-manager/programs/${programId}/missions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMission),
      });

      const data = await res.json();
      if (data.ok) {
        setShowAddMissionModal(false);
        setNewMission({ title: '', description: '', reward_arc_min: 0, reward_arc_max: 0, reward_xp: 0 });
        await loadProgram();
      } else {
        alert(data.error || 'Failed to create mission');
      }
    } catch (err: any) {
      console.error('[Add Mission] Error:', err);
      alert('Failed to create mission');
    } finally {
      setAddingMission(false);
    }
  };

  const handleToggleMission = async (missionId: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/portal/creator-manager/programs/${programId}/missions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId, is_active: !isActive }),
      });

      const data = await res.json();
      if (data.ok) {
        await loadProgram();
      } else {
        alert(data.error || 'Failed to update mission');
      }
    } catch (err: any) {
      console.error('[Toggle Mission] Error:', err);
      alert('Failed to update mission');
    }
  };

  const handleReview = async (missionId: string, creatorProfileId: string, action: 'approve' | 'reject') => {
    setReviewing(`${missionId}-${creatorProfileId}`);
    try {
      const res = await fetch(`/api/portal/creator-manager/missions/${missionId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creatorProfileId, action }),
      });

      const data = await res.json();
      if (data.ok) {
        await loadProgram();
        alert(data.message || `Mission ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
      } else {
        alert(data.error || `Failed to ${action} mission`);
      }
    } catch (err: any) {
      console.error('[Review Mission] Error:', err);
      alert(`Failed to ${action} mission`);
    } finally {
      setReviewing(null);
    }
  };

  const getMissionSubmissions = (missionId: string) => {
    return submissions.filter((s) => s.mission_id === missionId);
  };

  const handleUpdateProgramStatus = async (newStatus: 'active' | 'paused' | 'ended') => {
    if (!programId || typeof programId !== 'string') return;

    setUpdatingProgramStatus(true);
    try {
      const res = await fetch(`/api/portal/creator-manager/programs/${programId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (data.ok) {
        await loadProgram();
        alert(data.message || `Program status updated to ${newStatus}`);
      } else {
        alert(data.error || 'Failed to update program status');
      }
    } catch (err: any) {
      console.error('[Update Program Status] Error:', err);
      alert('Failed to update program status');
    } finally {
      setUpdatingProgramStatus(false);
    }
  };

  if (loading) {
    return (
      <PortalLayout title="Creator Manager Program">
        <div className="text-center py-12">
          <p className="text-akari-muted">Loading...</p>
        </div>
      </PortalLayout>
    );
  }

  if (hasPermission === false) {
    return (
      <PortalLayout title="Creator Manager Program">
        <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-8 text-center">
          <p className="text-sm text-akari-danger">You don&apos;t have permission to access this program</p>
          <Link
            href="/portal/arc/creator-manager"
            className="mt-4 inline-block text-sm text-akari-primary hover:text-akari-neon-teal transition-colors"
          >
            ← Back to Creator Manager
          </Link>
        </div>
      </PortalLayout>
    );
  }

  if (error || !program) {
    return (
      <PortalLayout title="Creator Manager Program">
        <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-8 text-center">
          <p className="text-sm text-akari-danger">{error || 'Program not found'}</p>
          <Link
            href="/portal/arc/creator-manager"
            className="mt-4 inline-block text-sm text-akari-primary hover:text-akari-neon-teal transition-colors"
          >
            ← Back to Creator Manager
          </Link>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title={`Creator Manager - ${program.title}`}>
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-akari-muted">
          <Link href="/portal/arc" className="hover:text-akari-primary transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <Link href="/portal/arc/creator-manager" className="hover:text-akari-primary transition-colors">
            Creator Manager
          </Link>
          <span>/</span>
          <span className="text-akari-text">{program.title}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              {project?.avatar_url && (
                <img src={project.avatar_url} alt={project.name} className="w-12 h-12 rounded-full" />
              )}
              <div>
                <h1 className="text-3xl font-bold text-akari-text">{program.title}</h1>
                {project && (
                  <p className="text-sm text-akari-muted">{project.name}</p>
                )}
              </div>
            </div>
            {program.description && (
              <p className="text-akari-muted mt-2">{program.description}</p>
            )}
            <div className="flex gap-4 mt-4 text-sm">
              <span className="text-akari-muted">
                Visibility: <span className="text-akari-text capitalize">{program.visibility}</span>
              </span>
              <span className="text-akari-muted">
                Status: <span className="text-akari-text capitalize">{program.status}</span>
              </span>
              {program.start_at && (
                <span className="text-akari-muted">
                  Start: <span className="text-akari-text">{new Date(program.start_at).toLocaleDateString()}</span>
                </span>
              )}
              {program.end_at && (
                <span className="text-akari-muted">
                  End: <span className="text-akari-text">{new Date(program.end_at).toLocaleDateString()}</span>
                </span>
              )}
            </div>
          </div>
        </div>


        {/* Tabs */}
        <div className="border-b border-akari-border">
          <div className="flex gap-4">
            {(['overview', 'creators', 'deals', 'missions'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`pb-2 px-1 border-b-2 transition-colors capitalize ${
                  activeTab === tab
                    ? 'border-akari-primary text-akari-primary'
                    : 'border-transparent text-akari-muted hover:text-akari-text'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Program Info */}
            <div className="rounded-xl border border-akari-border bg-akari-card p-6">
              <h2 className="text-xl font-semibold text-akari-text mb-4">Program Information</h2>
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-akari-muted mb-1">Title</div>
                  <div className="text-akari-text font-medium">{program.title}</div>
                </div>
                <div>
                  <div className="text-sm text-akari-muted mb-1">Description</div>
                  <div className="text-akari-text">
                    {program.description || 'No description provided'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-akari-muted mb-1">Visibility</div>
                    <div className="text-akari-text capitalize">{program.visibility}</div>
                  </div>
                  <div>
                    <div className="text-sm text-akari-muted mb-1">Status</div>
                    <div className="text-akari-text capitalize">
                      <span className={`px-2 py-1 rounded text-xs ${
                        program.status === 'active' ? 'bg-green-500/20 text-green-300' :
                        program.status === 'paused' ? 'bg-yellow-500/20 text-yellow-300' :
                        'bg-gray-500/20 text-gray-300'
                      }`}>
                        {program.status}
                      </span>
                    </div>
                  </div>
                </div>
                {(program.start_at || program.end_at) && (
                  <div className="grid grid-cols-2 gap-4">
                    {program.start_at && (
                      <div>
                        <div className="text-sm text-akari-muted mb-1">Start Date</div>
                        <div className="text-akari-text">{new Date(program.start_at).toLocaleDateString()}</div>
                      </div>
                    )}
                    {program.end_at && (
                      <div>
                        <div className="text-sm text-akari-muted mb-1">End Date</div>
                        <div className="text-akari-text">{new Date(program.end_at).toLocaleDateString()}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Stats Cards */}
            {program.stats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="rounded-lg border border-akari-border bg-akari-card p-4">
                  <div className="text-sm text-akari-muted mb-1">Total Creators</div>
                  <div className="text-2xl font-bold text-akari-text">{program.stats.totalCreators}</div>
                </div>
                <div className="rounded-lg border border-akari-border bg-akari-card p-4">
                  <div className="text-sm text-akari-muted mb-1">Approved</div>
                  <div className="text-2xl font-bold text-green-400">{program.stats.approvedCreators}</div>
                </div>
                <div className="rounded-lg border border-akari-border bg-akari-card p-4">
                  <div className="text-sm text-akari-muted mb-1">Pending</div>
                  <div className="text-2xl font-bold text-yellow-400">{program.stats.pendingCreators}</div>
                </div>
                <div className="rounded-lg border border-akari-border bg-akari-card p-4">
                  <div className="text-sm text-akari-muted mb-1">Total ARC</div>
                  <div className="text-2xl font-bold text-akari-text">{program.stats.totalArcPoints.toLocaleString()}</div>
                </div>
                <div className="rounded-lg border border-akari-border bg-akari-card p-4">
                  <div className="text-sm text-akari-muted mb-1">Total XP</div>
                  <div className="text-2xl font-bold text-akari-text">{program.stats.totalXp.toLocaleString()}</div>
                </div>
              </div>
            )}

            {/* Program Actions */}
            {permissions && (permissions.isOwner || permissions.isAdmin || permissions.isModerator) && (
              <div className="rounded-xl border border-akari-border bg-akari-card p-6">
                <h2 className="text-xl font-semibold text-akari-text mb-4">Program Actions</h2>
                <div className="flex flex-wrap gap-3">
                  {program.status === 'active' && (
                    <>
                      <button
                        onClick={() => handleUpdateProgramStatus('paused')}
                        disabled={updatingProgramStatus}
                        className="px-4 py-2 bg-yellow-500/20 text-yellow-300 rounded-lg hover:bg-yellow-500/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {updatingProgramStatus ? 'Updating...' : 'Pause Program'}
                      </button>
                      {(permissions.isOwner || permissions.isAdmin) && (
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to end this program? This action cannot be undone.')) {
                              handleUpdateProgramStatus('ended');
                            }
                          }}
                          disabled={updatingProgramStatus}
                          className="px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {updatingProgramStatus ? 'Updating...' : 'End Program'}
                        </button>
                      )}
                    </>
                  )}
                  {program.status === 'paused' && (
                    <>
                      <button
                        onClick={() => handleUpdateProgramStatus('active')}
                        disabled={updatingProgramStatus}
                        className="px-4 py-2 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {updatingProgramStatus ? 'Updating...' : 'Resume Program'}
                      </button>
                      {(permissions.isOwner || permissions.isAdmin) && (
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to end this program? This action cannot be undone.')) {
                              handleUpdateProgramStatus('ended');
                            }
                          }}
                          disabled={updatingProgramStatus}
                          className="px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {updatingProgramStatus ? 'Updating...' : 'End Program'}
                        </button>
                      )}
                    </>
                  )}
                  {program.status === 'ended' && (
                    <p className="text-sm text-akari-muted">This program has ended and cannot be modified.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Creators Tab */}
        {activeTab === 'creators' && (
          <div className="rounded-xl border border-akari-border bg-akari-card overflow-hidden">
            <div className="p-4 border-b border-akari-border flex items-center justify-between">
              <h2 className="text-xl font-semibold text-akari-text">Creators</h2>
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors text-sm font-medium"
              >
                Invite Creators
              </button>
            </div>
            {creators.length === 0 ? (
              <div className="p-8 text-center text-akari-muted">
                <p>No creators yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-akari-cardSoft border-b border-akari-border">
                    <tr>
                      <th className="text-left p-4 text-sm font-medium text-akari-text">Creator</th>
                      <th className="text-left p-4 text-sm font-medium text-akari-text">Status</th>
                      <th className="text-left p-4 text-sm font-medium text-akari-text">XP</th>
                      <th className="text-left p-4 text-sm font-medium text-akari-text">Level</th>
                      <th className="text-left p-4 text-sm font-medium text-akari-text">Class</th>
                      <th className="text-left p-4 text-sm font-medium text-akari-text">Deal</th>
                      <th className="text-left p-4 text-sm font-medium text-akari-text">
                        ARC Points
                        <span className="block text-xs font-normal text-akari-muted mt-1">
                          (inside this program)
                        </span>
                      </th>
                      <th className="text-left p-4 text-sm font-medium text-akari-text">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creators.map((creator) => (
                      <tr key={creator.id} className="border-b border-akari-border/50">
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            {creator.profile?.profile_image_url && (
                              <img
                                src={creator.profile.profile_image_url}
                                alt={creator.profile.username}
                                className="w-8 h-8 rounded-full"
                              />
                            )}
                            <div>
                              <div className="font-medium text-akari-text">
                                @{creator.profile?.username || 'unknown'}
                              </div>
                              {creator.profile?.name && (
                                <div className="text-sm text-akari-muted">{creator.profile.name}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <select
                            value={creator.status}
                            onChange={(e) =>
                              handleUpdateStatus(creator.id, e.target.value as any)
                            }
                            disabled={updatingStatus === creator.id}
                            className="px-2 py-1 rounded bg-akari-cardSoft border border-akari-border text-akari-text text-sm"
                          >
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="removed">Removed</option>
                          </select>
                        </td>
                        <td className="p-4 text-akari-text">{creator.xp || 0}</td>
                        <td className="p-4">
                          <span className="px-2 py-1 rounded bg-akari-primary/20 text-akari-primary text-sm font-medium">
                            Level {creator.creatorLevel}
                          </span>
                        </td>
                        <td className="p-4">
                          <select
                            value={creator.class || ''}
                            onChange={(e) =>
                              handleUpdateClass(creator.id, e.target.value || null)
                            }
                            disabled={updatingClass === creator.id}
                            className="px-2 py-1 rounded bg-akari-cardSoft border border-akari-border text-akari-text text-sm"
                          >
                            <option value="">None</option>
                            {CREATOR_CLASSES.map((cls) => (
                              <option key={cls} value={cls}>
                                {cls}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-4">
                          <select
                            value={creator.deal_id || ''}
                            onChange={(e) =>
                              handleAssignDeal(creator.id, e.target.value || null)
                            }
                            disabled={updatingDeal === creator.id}
                            className="px-2 py-1 rounded bg-akari-cardSoft border border-akari-border text-akari-text text-sm"
                          >
                            <option value="">None</option>
                            {deals.map((deal) => (
                              <option key={deal.id} value={deal.id}>
                                {deal.internal_label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-4">
                          <div className="text-akari-text font-medium">{creator.arc_points || 0}</div>
                          <div className="text-xs text-akari-muted">ARC inside this program</div>
                        </td>
                        <td className="p-4">
                          {/* TODO: Add mission submission management here */}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Deals Tab */}
        {activeTab === 'deals' && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-akari-text">Deals</h2>
              <button
                onClick={() => setShowAddDealModal(true)}
                className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors text-sm font-medium"
              >
                Add Deal
              </button>
            </div>
            {deals.length === 0 ? (
              <p className="text-akari-muted">No deals created yet</p>
            ) : (
              <div className="space-y-2">
                {deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="p-4 rounded-lg border border-akari-border bg-akari-cardSoft"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-akari-text">{deal.internal_label}</div>
                        {deal.description && (
                          <div className="text-sm text-akari-muted mt-1">{deal.description}</div>
                        )}
                        <div className="flex gap-2 mt-2 text-xs text-akari-muted">
                          <span>Visibility: {deal.visibility}</span>
                          {deal.is_default && <span>• Default</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Missions Tab */}
        {activeTab === 'missions' && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-akari-text">Missions</h2>
              <button
                onClick={() => setShowAddMissionModal(true)}
                className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors text-sm font-medium"
              >
                Add Mission
              </button>
            </div>
            {missions.length === 0 ? (
              <p className="text-akari-muted">No missions created yet</p>
            ) : (
              <div className="space-y-3">
                {missions.map((mission) => {
                  const missionSubmissions = getMissionSubmissions(mission.id);
                  const submittedCount = missionSubmissions.filter((s) => s.status === 'submitted').length;
                  const approvedCount = missionSubmissions.filter((s) => s.status === 'approved').length;
                  
                  return (
                    <div
                      key={mission.id}
                      className="p-4 rounded-lg border border-akari-border bg-akari-cardSoft"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-akari-text">{mission.title}</h3>
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                mission.is_active
                                  ? 'bg-green-500/20 text-green-300'
                                  : 'bg-akari-cardSoft text-akari-muted'
                              }`}
                            >
                              {mission.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          {mission.description && (
                            <p className="text-sm text-akari-muted mt-1">{mission.description}</p>
                          )}
                          <div className="flex gap-4 mt-2 text-sm text-akari-muted">
                            <span>ARC: {mission.reward_arc_min}-{mission.reward_arc_max}</span>
                            <span>XP: {mission.reward_xp}</span>
                            {missionSubmissions.length > 0 && (
                              <>
                                <span>• Submissions: {missionSubmissions.length}</span>
                                <span>• Approved: {approvedCount}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {missionSubmissions.length > 0 && (
                            <button
                              onClick={() => setViewingSubmissions(viewingSubmissions === mission.id ? null : mission.id)}
                              className="px-3 py-1 rounded text-sm bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 transition-colors"
                            >
                              {viewingSubmissions === mission.id ? 'Hide' : 'View'} Submissions ({missionSubmissions.length})
                            </button>
                          )}
                          <button
                            onClick={() => handleToggleMission(mission.id, mission.is_active)}
                            className={`px-3 py-1 rounded text-sm ${
                              mission.is_active
                                ? 'bg-akari-cardSoft text-akari-muted hover:bg-akari-border'
                                : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                            } transition-colors`}
                          >
                            {mission.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </div>
                      
                      {/* Submissions Panel */}
                      {viewingSubmissions === mission.id && missionSubmissions.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-akari-border">
                          <h4 className="text-sm font-medium text-akari-text mb-3">Submissions</h4>
                          <div className="space-y-2">
                            {missionSubmissions.map((submission) => (
                              <div
                                key={submission.id}
                                className="p-3 rounded border border-akari-border bg-akari-card"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-akari-text">
                                        @{submission.creator_username}
                                      </span>
                                      <span
                                        className={`px-2 py-1 rounded text-xs ${
                                          submission.status === 'approved'
                                            ? 'bg-green-500/20 text-green-300'
                                            : submission.status === 'rejected'
                                            ? 'bg-red-500/20 text-red-300'
                                            : submission.status === 'submitted'
                                            ? 'bg-yellow-500/20 text-yellow-300'
                                            : 'bg-akari-cardSoft text-akari-muted'
                                        }`}
                                      >
                                        {submission.status}
                                      </span>
                                    </div>
                                    {submission.post_url && (
                                      <a
                                        href={submission.post_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sm text-akari-primary hover:text-akari-neon-teal mt-1 block"
                                      >
                                        View Post →
                                      </a>
                                    )}
                                    {submission.post_tweet_id && !submission.post_url && (
                                      <p className="text-sm text-akari-muted mt-1">Tweet ID: {submission.post_tweet_id}</p>
                                    )}
                                    {submission.notes && (
                                      <p className="text-sm text-akari-muted mt-2 italic">&quot;{submission.notes}&quot;</p>
                                    )}
                                    <p className="text-xs text-akari-muted mt-1">
                                      Submitted: {new Date(submission.last_update_at).toLocaleString()}
                                    </p>
                                  </div>
                                  {submission.status === 'submitted' && (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleReview(mission.id, submission.creator_profile_id, 'approve')}
                                        disabled={reviewing === `${mission.id}-${submission.creator_profile_id}`}
                                        className="px-3 py-1 rounded text-sm bg-green-500/20 text-green-300 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        onClick={() => handleReview(mission.id, submission.creator_profile_id, 'reject')}
                                        disabled={reviewing === `${mission.id}-${submission.creator_profile_id}`}
                                        className="px-3 py-1 rounded text-sm bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Invite Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-akari-card rounded-xl border border-akari-border p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold text-akari-text mb-4">Invite Creators</h3>
              <p className="text-sm text-akari-muted mb-4">
                Enter Twitter usernames (one per line or comma separated)
              </p>
              <textarea
                value={inviteUsernames}
                onChange={(e) => setInviteUsernames(e.target.value)}
                placeholder="@username1, @username2..."
                className="w-full p-3 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text mb-4 min-h-[100px]"
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteUsernames('');
                  }}
                  className="px-4 py-2 rounded-lg border border-akari-border text-akari-text hover:bg-akari-cardSoft transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleInvite}
                  disabled={inviting || !inviteUsernames.trim()}
                  className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors disabled:opacity-50"
                >
                  {inviting ? 'Inviting...' : 'Invite'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Deal Modal */}
        {showAddDealModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-akari-card rounded-xl border border-akari-border p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold text-akari-text mb-4">Add Deal</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-akari-muted mb-1">Internal Label</label>
                  <input
                    type="text"
                    value={newDeal.internalLabel}
                    onChange={(e) => setNewDeal({ ...newDeal, internalLabel: e.target.value })}
                    placeholder="Deal 1"
                    className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text"
                  />
                </div>
                <div>
                  <label className="block text-sm text-akari-muted mb-1">Description (optional)</label>
                  <textarea
                    value={newDeal.description}
                    onChange={(e) => setNewDeal({ ...newDeal, description: e.target.value })}
                    placeholder="Internal notes..."
                    className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text min-h-[80px]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-akari-muted mb-1">Visibility</label>
                  <select
                    value={newDeal.visibility}
                    onChange={(e) => setNewDeal({ ...newDeal, visibility: e.target.value as any })}
                    className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text"
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-6">
                <button
                  onClick={() => {
                    setShowAddDealModal(false);
                    setNewDeal({ internalLabel: '', description: '', visibility: 'private' });
                  }}
                  className="px-4 py-2 rounded-lg border border-akari-border text-akari-text hover:bg-akari-cardSoft transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddDeal}
                  disabled={addingDeal || !newDeal.internalLabel.trim()}
                  className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors disabled:opacity-50"
                >
                  {addingDeal ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Mission Modal */}
        {showAddMissionModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-akari-card rounded-xl border border-akari-border p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold text-akari-text mb-4">Add Mission</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-akari-muted mb-1">Title</label>
                  <input
                    type="text"
                    value={newMission.title}
                    onChange={(e) => setNewMission({ ...newMission, title: e.target.value })}
                    placeholder="Mission title"
                    className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text"
                  />
                </div>
                <div>
                  <label className="block text-sm text-akari-muted mb-1">Description (optional)</label>
                  <textarea
                    value={newMission.description}
                    onChange={(e) => setNewMission({ ...newMission, description: e.target.value })}
                    placeholder="Mission description..."
                    className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text min-h-[80px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-akari-muted mb-1">ARC Min</label>
                    <input
                      type="number"
                      value={newMission.reward_arc_min}
                      onChange={(e) => setNewMission({ ...newMission, reward_arc_min: parseInt(e.target.value) || 0 })}
                      className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-akari-muted mb-1">ARC Max</label>
                    <input
                      type="number"
                      value={newMission.reward_arc_max}
                      onChange={(e) => setNewMission({ ...newMission, reward_arc_max: parseInt(e.target.value) || 0 })}
                      className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-akari-muted mb-1">XP Reward</label>
                  <input
                    type="number"
                    value={newMission.reward_xp}
                    onChange={(e) => setNewMission({ ...newMission, reward_xp: parseInt(e.target.value) || 0 })}
                    className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-6">
                <button
                  onClick={() => {
                    setShowAddMissionModal(false);
                    setNewMission({ title: '', description: '', reward_arc_min: 0, reward_arc_max: 0, reward_xp: 0 });
                  }}
                  className="px-4 py-2 rounded-lg border border-akari-border text-akari-text hover:bg-akari-cardSoft transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddMission}
                  disabled={addingMission || !newMission.title.trim()}
                  className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors disabled:opacity-50"
                >
                  {addingMission ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
