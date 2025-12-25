/**
 * Creator Detail Page - Admin/Moderator View
 * 
 * Shows detailed information about a specific creator in a program
 * Route: /portal/arc/creator-manager/[programId]/creators/[creatorProfileId]
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { CREATOR_CLASSES } from '@/lib/creator-gamification';

// =============================================================================
// TYPES
// =============================================================================

interface CreatorDetail {
  creator: {
    id: string;
    creator_profile_id: string;
    status: 'pending' | 'approved' | 'rejected' | 'removed';
    arc_points: number;
    xp: number;
    level: number;
    rank: number;
    class: string | null;
    deal_id: string | null;
    deal_label: string | null;
    joined_at: string;
  };
  profile: {
    id: string;
    username: string;
    name: string | null;
    profile_image_url: string | null;
  };
  missionProgress: Array<{
    mission_id: string;
    mission_title: string;
    status: 'in_progress' | 'submitted' | 'approved' | 'rejected';
    post_url: string | null;
    post_tweet_id: string | null;
    notes: string | null;
    last_update_at: string;
  }>;
  badges: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    awarded_at: string;
  }>;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function CreatorDetailPage() {
  const router = useRouter();
  const { programId, creatorProfileId } = router.query;
  const akariUser = useAkariUser();

  const [data, setData] = useState<CreatorDetail | null>(null);
  const [deals, setDeals] = useState<Array<{ id: string; internal_label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Updating states
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingDeal, setUpdatingDeal] = useState(false);
  const [updatingClass, setUpdatingClass] = useState(false);
  const [awardingBadge, setAwardingBadge] = useState(false);
  
  // Forms
  const [badgeForm, setBadgeForm] = useState({ badgeSlug: '', name: '', description: '' });
  const [showAwardBadgeModal, setShowAwardBadgeModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!programId || !creatorProfileId || typeof programId !== 'string' || typeof creatorProfileId !== 'string') return;

    try {
      const res = await fetch(`/api/portal/creator-manager/programs/${programId}/creators/${creatorProfileId}`);
      const result = await res.json();

      if (result.ok) {
        setData(result.data);
      } else {
        setError(result.error || 'Failed to load creator details');
      }

      // Load deals
      const dealsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/deals`);
      const dealsData = await dealsRes.json();
      if (dealsData.ok) {
        setDeals(dealsData.deals || []);
      }
    } catch (err: any) {
      console.error('[Creator Detail] Error:', err);
      setError(err.message || 'Failed to load creator details');
    } finally {
      setLoading(false);
    }
  }, [programId, creatorProfileId]);

  useEffect(() => {
    if (akariUser.isLoggedIn) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [loadData, akariUser.isLoggedIn]);

  const handleUpdateStatus = async (newStatus: 'pending' | 'approved' | 'rejected' | 'removed') => {
    if (!data) return;
    setUpdatingStatus(true);
    try {
      // Find creator ID from the creators list
      const creatorsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/creators`);
      const creatorsData = await creatorsRes.json();
      if (!creatorsData.ok) {
        alert('Failed to find creator');
        return;
      }
      const creator = creatorsData.creators.find((c: any) => c.creator_profile_id === creatorProfileId);
      if (!creator) {
        alert('Creator not found');
        return;
      }

      const res = await fetch(`/api/portal/creator-manager/programs/${programId}/creators/${creatorProfileId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const result = await res.json();
      if (result.ok) {
        await loadData();
        alert('Status updated successfully');
      } else {
        alert(result.error || 'Failed to update status');
      }
    } catch (err: any) {
      console.error('[Update Status] Error:', err);
      alert('Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAssignDeal = async (dealId: string | null) => {
    if (!data) return;
    setUpdatingDeal(true);
    try {
      const creatorsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/creators`);
      const creatorsData = await creatorsRes.json();
      if (!creatorsData.ok) {
        alert('Failed to find creator');
        return;
      }
      const creator = creatorsData.creators.find((c: any) => c.creator_profile_id === creatorProfileId);
      if (!creator) {
        alert('Creator not found');
        return;
      }

      const res = await fetch(`/api/portal/creator-manager/programs/${programId}/creators/${creatorProfileId}/deal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId }),
      });

      const result = await res.json();
      if (result.ok) {
        await loadData();
        alert('Deal assigned successfully');
      } else {
        alert(result.error || 'Failed to assign deal');
      }
    } catch (err: any) {
      console.error('[Assign Deal] Error:', err);
      alert('Failed to assign deal');
    } finally {
      setUpdatingDeal(false);
    }
  };

  const handleUpdateClass = async (newClass: string | null) => {
    if (!data) return;
    setUpdatingClass(true);
    try {
      const creatorsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/creators`);
      const creatorsData = await creatorsRes.json();
      if (!creatorsData.ok) {
        alert('Failed to find creator');
        return;
      }
      const creator = creatorsData.creators.find((c: any) => c.creator_profile_id === creatorProfileId);
      if (!creator) {
        alert('Creator not found');
        return;
      }

      const res = await fetch(`/api/portal/creator-manager/programs/${programId}/creators/${creatorProfileId}/class`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class: newClass }),
      });

      const result = await res.json();
      if (result.ok) {
        await loadData();
        alert('Class updated successfully');
      } else {
        alert(result.error || 'Failed to update class');
      }
    } catch (err: any) {
      console.error('[Update Class] Error:', err);
      alert('Failed to update class');
    } finally {
      setUpdatingClass(false);
    }
  };

  const handleAwardBadge = async () => {
    if (!badgeForm.badgeSlug.trim()) {
      alert('Badge slug is required');
      return;
    }
    if (!data) return;

    setAwardingBadge(true);
    try {
      const creatorsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/creators`);
      const creatorsData = await creatorsRes.json();
      if (!creatorsData.ok) {
        alert('Failed to find creator');
        return;
      }
      const creator = creatorsData.creators.find((c: any) => c.creator_profile_id === creatorProfileId);
      if (!creator) {
        alert('Creator not found');
        return;
      }

      const res = await fetch(`/api/portal/creator-manager/programs/${programId}/creators/${creatorProfileId}/badges`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          badgeSlug: badgeForm.badgeSlug.trim(),
          name: badgeForm.name.trim() || undefined,
          description: badgeForm.description.trim() || undefined,
        }),
      });

      const result = await res.json();
      if (result.ok) {
        setShowAwardBadgeModal(false);
        setBadgeForm({ badgeSlug: '', name: '', description: '' });
        await loadData();
        alert(result.message || 'Badge awarded successfully');
      } else {
        alert(result.error || 'Failed to award badge');
      }
    } catch (err: any) {
      console.error('[Award Badge] Error:', err);
      alert('Failed to award badge');
    } finally {
      setAwardingBadge(false);
    }
  };

  if (loading) {
    return (
      <PortalLayout title="Creator Detail">
        <div className="text-center py-12">
          <p className="text-akari-muted">Loading...</p>
        </div>
      </PortalLayout>
    );
  }

  if (error || !data) {
    return (
      <PortalLayout title="Creator Detail">
        <div className="rounded-xl border border-akari-danger/30 bg-akari-card p-8 text-center">
          <p className="text-sm text-akari-danger">{error || 'Creator not found'}</p>
          <Link
            href={`/portal/arc/creator-manager/${programId}`}
            className="mt-4 inline-block text-sm text-akari-primary hover:text-akari-neon-teal transition-colors"
          >
            ← Back to Program
          </Link>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout title={`Creator: @${data.profile.username}`}>
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
          <Link href={`/portal/arc/creator-manager/${programId}`} className="hover:text-akari-primary transition-colors">
            Program
          </Link>
          <span>/</span>
          <span className="text-akari-text">@{data.profile.username}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {data.profile.profile_image_url && (
              <img
                src={data.profile.profile_image_url}
                alt={data.profile.username}
                className="w-16 h-16 rounded-full"
              />
            )}
            <div>
              <h1 className="text-3xl font-bold text-akari-text">@{data.profile.username}</h1>
              {data.profile.name && (
                <p className="text-akari-muted mt-1">{data.profile.name}</p>
              )}
            </div>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-lg border border-akari-border bg-akari-card p-4">
            <div className="text-sm text-akari-muted mb-1">Rank</div>
            <div className="text-2xl font-bold text-akari-primary">#{data.creator.rank || 'N/A'}</div>
          </div>
          <div className="rounded-lg border border-akari-border bg-akari-card p-4">
            <div className="text-sm text-akari-muted mb-1">Level</div>
            <div className="text-2xl font-bold text-akari-text">Level {data.creator.level}</div>
          </div>
          <div className="rounded-lg border border-akari-border bg-akari-card p-4">
            <div className="text-sm text-akari-muted mb-1">ARC Points</div>
            <div className="text-2xl font-bold text-akari-text">{data.creator.arc_points.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border border-akari-border bg-akari-card p-4">
            <div className="text-sm text-akari-muted mb-1">XP</div>
            <div className="text-2xl font-bold text-akari-text">{data.creator.xp.toLocaleString()}</div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="rounded-xl border border-akari-border bg-akari-card p-6">
          <h2 className="text-xl font-semibold text-akari-text mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Status */}
            <div>
              <label className="block text-sm text-akari-muted mb-1">Status</label>
              <select
                value={data.creator.status}
                onChange={(e) => handleUpdateStatus(e.target.value as any)}
                disabled={updatingStatus}
                className="w-full px-3 py-2 rounded-lg bg-akari-cardSoft border border-akari-border text-akari-text text-sm"
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="removed">Removed</option>
              </select>
            </div>

            {/* Deal */}
            <div>
              <label className="block text-sm text-akari-muted mb-1">Deal</label>
              <select
                value={data.creator.deal_id || ''}
                onChange={(e) => handleAssignDeal(e.target.value || null)}
                disabled={updatingDeal}
                className="w-full px-3 py-2 rounded-lg bg-akari-cardSoft border border-akari-border text-akari-text text-sm"
              >
                <option value="">None</option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {deal.internal_label}
                  </option>
                ))}
              </select>
            </div>

            {/* Class */}
            <div>
              <label className="block text-sm text-akari-muted mb-1">Class</label>
              <select
                value={data.creator.class || ''}
                onChange={(e) => handleUpdateClass(e.target.value || null)}
                disabled={updatingClass}
                className="w-full px-3 py-2 rounded-lg bg-akari-cardSoft border border-akari-border text-akari-text text-sm"
              >
                <option value="">None</option>
                {CREATOR_CLASSES.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>

            {/* Award Badge */}
            <div>
              <label className="block text-sm text-akari-muted mb-1">Badge</label>
              <button
                onClick={() => setShowAwardBadgeModal(true)}
                className="w-full px-3 py-2 bg-akari-primary/20 text-akari-primary rounded-lg hover:bg-akari-primary/30 transition-colors text-sm font-medium"
              >
                Award Badge
              </button>
            </div>
          </div>
        </div>

        {/* Missions Table */}
        <div className="rounded-xl border border-akari-border bg-akari-card p-6">
          <h2 className="text-xl font-semibold text-akari-text mb-4">Mission Progress</h2>
          {data.missionProgress.length === 0 ? (
            <p className="text-akari-muted">No mission progress yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-akari-cardSoft border-b border-akari-border">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium text-akari-text">Mission</th>
                    <th className="text-left p-3 text-sm font-medium text-akari-text">Status</th>
                    <th className="text-left p-3 text-sm font-medium text-akari-text">Post URL</th>
                    <th className="text-left p-3 text-sm font-medium text-akari-text">Notes</th>
                    <th className="text-left p-3 text-sm font-medium text-akari-text">Last Update</th>
                  </tr>
                </thead>
                <tbody>
                  {data.missionProgress.map((progress) => (
                    <tr key={progress.mission_id} className="border-b border-akari-border/50">
                      <td className="p-3 text-akari-text">{progress.mission_title}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          progress.status === 'approved' ? 'bg-green-500/20 text-green-300' :
                          progress.status === 'rejected' ? 'bg-red-500/20 text-red-300' :
                          progress.status === 'submitted' ? 'bg-yellow-500/20 text-yellow-300' :
                          'bg-gray-500/20 text-gray-300'
                        }`}>
                          {progress.status}
                        </span>
                      </td>
                      <td className="p-3">
                        {progress.post_url ? (
                          <a
                            href={progress.post_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-akari-primary hover:text-akari-neon-teal text-sm"
                          >
                            View Post
                          </a>
                        ) : progress.post_tweet_id ? (
                          <span className="text-akari-muted text-sm">Tweet ID: {progress.post_tweet_id}</span>
                        ) : (
                          <span className="text-akari-muted text-sm">N/A</span>
                        )}
                      </td>
                      <td className="p-3">
                        {progress.notes ? (
                          <span className="text-akari-text text-sm italic">&quot;{progress.notes}&quot;</span>
                        ) : (
                          <span className="text-akari-muted text-sm">N/A</span>
                        )}
                      </td>
                      <td className="p-3 text-akari-muted text-sm">
                        {new Date(progress.last_update_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Badges */}
        <div className="rounded-xl border border-akari-border bg-akari-card p-6">
          <h2 className="text-xl font-semibold text-akari-text mb-4">Badges</h2>
          {data.badges.length === 0 ? (
            <p className="text-akari-muted">No badges awarded yet</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.badges.map((badge) => (
                <div
                  key={badge.id}
                  className="rounded-lg border border-akari-border bg-akari-cardSoft p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">🏆</span>
                    <div className="flex-1">
                      <div className="font-semibold text-akari-text">{badge.name}</div>
                      {badge.description && (
                        <div className="text-sm text-akari-muted mt-1">{badge.description}</div>
                      )}
                      <div className="text-xs text-akari-muted mt-2">
                        Awarded: {new Date(badge.awarded_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Award Badge Modal */}
        {showAwardBadgeModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-akari-card rounded-xl border border-akari-border p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold text-akari-text mb-4">Award Badge</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-akari-muted mb-1">
                    Badge Slug <span className="text-akari-danger">*</span>
                  </label>
                  <input
                    type="text"
                    value={badgeForm.badgeSlug}
                    onChange={(e) => setBadgeForm({ ...badgeForm, badgeSlug: e.target.value })}
                    placeholder="narrative_master"
                    className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text"
                  />
                </div>
                <div>
                  <label className="block text-sm text-akari-muted mb-1">Name (optional)</label>
                  <input
                    type="text"
                    value={badgeForm.name}
                    onChange={(e) => setBadgeForm({ ...badgeForm, name: e.target.value })}
                    placeholder="Narrative Master"
                    className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text"
                  />
                </div>
                <div>
                  <label className="block text-sm text-akari-muted mb-1">Description (optional)</label>
                  <textarea
                    value={badgeForm.description}
                    onChange={(e) => setBadgeForm({ ...badgeForm, description: e.target.value })}
                    placeholder="Awarded for exceptional narrative content..."
                    className="w-full p-2 rounded-lg border border-akari-border bg-akari-cardSoft text-akari-text min-h-[80px]"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end mt-6">
                <button
                  onClick={() => {
                    setShowAwardBadgeModal(false);
                    setBadgeForm({ badgeSlug: '', name: '', description: '' });
                  }}
                  className="px-4 py-2 rounded-lg border border-akari-border text-akari-text hover:bg-akari-cardSoft transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAwardBadge}
                  disabled={awardingBadge || !badgeForm.badgeSlug.trim()}
                  className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors disabled:opacity-50"
                >
                  {awardingBadge ? 'Awarding...' : 'Award Badge'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

