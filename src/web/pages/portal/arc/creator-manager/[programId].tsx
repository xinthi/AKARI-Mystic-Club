/**
 * Creator Manager - Program Detail Page
 * 
 * Shows program details with tabs for Creators, Deals, and Missions
 * Admin/moderator can manage creators, assign classes, view stats
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { CREATOR_CLASSES } from '@/lib/creator-gamification';
import { createPortalClient } from '@/lib/portal/supabase';

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
    totalArcPoints: number;
  };
}

interface Creator {
  id: string;
  creator_profile_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'removed';
  arc_points: number;
  xp: number;
  creatorLevel: number;
  class: string | null;
  profile?: {
    username: string;
    name: string | null;
    profile_image_url: string | null;
  };
  deal?: {
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

// =============================================================================
// COMPONENT
// =============================================================================

export default function CreatorManagerProgramDetail() {
  const router = useRouter();
  const { programId } = router.query;
  const akariUser = useAkariUser();

  const [activeTab, setActiveTab] = useState<'creators' | 'deals' | 'missions'>('creators');
  const [program, setProgram] = useState<Program | null>(null);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingClass, setUpdatingClass] = useState<string | null>(null);

  const loadProgram = useCallback(async () => {
    if (!programId || typeof programId !== 'string') return;

    try {
      // Get program details directly from Supabase
      const supabase = createPortalClient();
      const { data: programData, error: programError } = await supabase
        .from('creator_manager_programs')
        .select('*')
        .eq('id', programId)
        .single();

      if (programError || !programData) {
        throw new Error('Program not found');
      }

      // Get stats for program
      const { count: totalCreators } = await supabase
        .from('creator_manager_creators')
        .select('*', { count: 'exact', head: true })
        .eq('program_id', programId);

      const { count: approvedCreators } = await supabase
        .from('creator_manager_creators')
        .select('*', { count: 'exact', head: true })
        .eq('program_id', programId)
        .eq('status', 'approved');

      const { data: creatorsForStats } = await supabase
        .from('creator_manager_creators')
        .select('arc_points')
        .eq('program_id', programId);

      const totalArcPoints = creatorsForStats?.reduce((sum, c) => sum + (c.arc_points || 0), 0) || 0;

      setProgram({
        ...programData,
        stats: {
          totalCreators: totalCreators || 0,
          approvedCreators: approvedCreators || 0,
          totalArcPoints,
        },
      });

      // Get creators
      const creatorsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/creators`);
      const creatorsData = await creatorsRes.json();
      if (creatorsData.ok) {
        setCreators(creatorsData.creators || []);
      }

      // Get deals
      const dealsRes = await fetch(`/api/portal/creator-manager/programs/${programId}/deals`);
      const dealsData = await dealsRes.json();
      if (dealsData.ok) {
        setDeals(dealsData.deals || []);
      }
    } catch (err: any) {
      console.error('[Program Detail] Error:', err);
      setError(err.message || 'Failed to load program');
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    loadProgram();
  }, [loadProgram]);

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
        // Reload creators
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

  if (loading) {
    return (
      <PortalLayout title="Creator Manager Program">
        <div className="text-center py-12">
          <p className="text-akari-muted">Loading...</p>
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
        <div>
          <h1 className="text-3xl font-bold text-akari-text">{program.title}</h1>
          {program.description && (
            <p className="text-akari-muted mt-2">{program.description}</p>
          )}
          {program.stats && (
            <div className="flex gap-4 mt-4 text-sm">
              <span className="text-akari-muted">
                {program.stats.approvedCreators} approved creators
              </span>
              <span className="text-akari-muted">
                {program.stats.totalArcPoints} total ARC points
              </span>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-akari-border">
          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('creators')}
              className={`pb-2 px-1 border-b-2 transition-colors ${
                activeTab === 'creators'
                  ? 'border-akari-primary text-akari-primary'
                  : 'border-transparent text-akari-muted hover:text-akari-text'
              }`}
            >
              Creators
            </button>
            <button
              onClick={() => setActiveTab('deals')}
              className={`pb-2 px-1 border-b-2 transition-colors ${
                activeTab === 'deals'
                  ? 'border-akari-primary text-akari-primary'
                  : 'border-transparent text-akari-muted hover:text-akari-text'
              }`}
            >
              Deals
            </button>
            <button
              onClick={() => setActiveTab('missions')}
              className={`pb-2 px-1 border-b-2 transition-colors ${
                activeTab === 'missions'
                  ? 'border-akari-primary text-akari-primary'
                  : 'border-transparent text-akari-muted hover:text-akari-text'
              }`}
            >
              Missions
            </button>
          </div>
        </div>

        {/* Creators Tab */}
        {activeTab === 'creators' && (
          <div className="rounded-xl border border-akari-border bg-akari-card overflow-hidden">
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
                      <th className="text-left p-4 text-sm font-medium text-akari-text">ARC Points</th>
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
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              creator.status === 'approved'
                                ? 'bg-green-500/20 text-green-300'
                                : creator.status === 'pending'
                                ? 'bg-yellow-500/20 text-yellow-300'
                                : 'bg-akari-cardSoft text-akari-muted'
                            }`}
                          >
                            {creator.status}
                          </span>
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
                        <td className="p-4 text-akari-muted text-sm">
                          {creator.deal?.internal_label || '-'}
                        </td>
                        <td className="p-4 text-akari-text">{creator.arc_points || 0}</td>
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
              <button className="px-4 py-2 bg-akari-primary text-akari-bg rounded-lg hover:bg-akari-neon-teal transition-colors text-sm font-medium">
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
                    <div className="font-medium text-akari-text">{deal.internal_label}</div>
                    {deal.description && (
                      <div className="text-sm text-akari-muted mt-1">{deal.description}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Missions Tab */}
        {activeTab === 'missions' && (
          <div className="rounded-xl border border-akari-border bg-akari-card p-8 text-center">
            <p className="text-akari-muted">
              Missions will be implemented later. This is just a placeholder.
            </p>
            <p className="text-sm text-akari-muted mt-2">
              TODO: Add mission cards, completion tracking, and XP rewards
            </p>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

