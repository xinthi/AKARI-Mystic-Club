/**
 * ARC Creator Manager (CRM) Page
 * 
 * Campaign management interface for Option 1: CRM Creator Manager
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';

// =============================================================================
// TYPES
// =============================================================================

interface Campaign {
  id: string;
  project_id: string;
  name: string;
  brief_objective: string | null;
  participation_mode: 'invite_only' | 'public' | 'hybrid';
  leaderboard_visibility: 'public' | 'private';
  start_at: string;
  end_at: string;
  website_url: string | null;
  docs_url: string | null;
  reward_pool_text: string | null;
  winners_count: number;
  status: 'draft' | 'live' | 'paused' | 'ended';
  created_at: string;
}

interface Participant {
  id: string;
  campaign_id: string;
  profile_id: string | null;
  twitter_username: string;
  status: 'invited' | 'accepted' | 'declined' | 'tracked';
  joined_at: string | null;
  created_at: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function CreatorManagerPage() {
  const router = useRouter();
  const { projectId } = router.query;

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [participantsLoading, setParticipantsLoading] = useState(false);

  // Fetch campaigns
  useEffect(() => {
    async function fetchCampaigns() {
      if (!projectId || typeof projectId !== 'string') {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/portal/arc/campaigns?projectId=${encodeURIComponent(projectId)}`);
        const data = await res.json();

        if (!res.ok || !data.ok) {
          setError(data.error || 'Failed to load campaigns');
          setLoading(false);
          return;
        }

        setCampaigns(data.campaigns || []);
      } catch (err: any) {
        console.error('[CreatorManager] Error fetching campaigns:', err);
        setError(err.message || 'Failed to load campaigns');
      } finally {
        setLoading(false);
      }
    }

    fetchCampaigns();
  }, [projectId]);

  // Fetch participants when campaign is selected
  useEffect(() => {
    async function fetchParticipants() {
      if (!selectedCampaign) {
        setParticipants([]);
        return;
      }

      try {
        setParticipantsLoading(true);
        const res = await fetch(`/api/portal/arc/campaigns/${selectedCampaign.id}/participants`);
        const data = await res.json();

        if (res.ok && data.ok && data.participants) {
          setParticipants(data.participants || []);
        }
      } catch (err: any) {
        console.error('[CreatorManager] Error fetching participants:', err);
      } finally {
        setParticipantsLoading(false);
      }
    }

    fetchParticipants();
  }, [selectedCampaign]);

  return (
    <PortalLayout title="ARC Creator Manager">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Creator Manager</h1>
            <p className="text-sm text-white/60">Manage campaigns and participants</p>
          </div>
          <Link
            href="/portal/arc"
            className="px-4 py-2 text-sm font-medium border border-white/20 text-white rounded-lg hover:bg-white/10 transition-all"
          >
            Back to ARC
          </Link>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
            <span className="ml-3 text-white/60">Loading campaigns...</span>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Campaigns list */}
        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Campaigns List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Campaigns</h2>
                <button
                  onClick={() => {
                    alert('Create campaign functionality coming soon');
                  }}
                  className="px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
                >
                  Create Campaign
                </button>
              </div>

              {campaigns.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
                  <p className="text-sm text-white/60">No campaigns yet. Create one to get started.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {campaigns.map((campaign) => (
                    <div
                      key={campaign.id}
                      onClick={() => setSelectedCampaign(campaign)}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        selectedCampaign?.id === campaign.id
                          ? 'border-akari-primary bg-akari-primary/10'
                          : 'border-white/10 bg-black/40 hover:border-white/20 hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="text-base font-semibold text-white">{campaign.name}</h3>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          campaign.status === 'live' ? 'bg-green-500/20 text-green-400' :
                          campaign.status === 'ended' ? 'bg-gray-500/20 text-gray-400' :
                          campaign.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>
                          {campaign.status}
                        </span>
                      </div>
                      {campaign.brief_objective && (
                        <p className="text-sm text-white/60 mb-2 line-clamp-2">{campaign.brief_objective}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-white/40">
                        <span>
                          {new Date(campaign.start_at).toLocaleDateString()} - {new Date(campaign.end_at).toLocaleDateString()}
                        </span>
                        <span className="capitalize">{campaign.participation_mode.replace('_', ' ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Campaign Details */}
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">
                {selectedCampaign ? 'Campaign Details' : 'Select a Campaign'}
              </h2>

              {selectedCampaign ? (
                <div className="rounded-xl border border-white/10 bg-black/40 p-6 space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-white mb-2">{selectedCampaign.name}</h3>
                    {selectedCampaign.brief_objective && (
                      <p className="text-sm text-white/60 mb-4">{selectedCampaign.brief_objective}</p>
                    )}
                  </div>

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

                  {/* Participants */}
                  <div className="mt-6">
                    <h4 className="text-sm font-semibold text-white mb-3">Participants</h4>
                    {participantsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                      </div>
                    ) : participants.length === 0 ? (
                      <p className="text-sm text-white/60">No participants yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {participants.map((participant) => (
                          <div
                            key={participant.id}
                            className="flex items-center justify-between p-2 rounded border border-white/5 bg-white/5"
                          >
                            <span className="text-sm text-white">@{participant.twitter_username}</span>
                            <span className={`px-2 py-1 text-xs rounded-full capitalize ${
                              participant.status === 'accepted' ? 'bg-green-500/20 text-green-400' :
                              participant.status === 'declined' ? 'bg-red-500/20 text-red-400' :
                              'bg-yellow-500/20 text-yellow-400'
                            }`}>
                              {participant.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
                  <p className="text-sm text-white/60">Select a campaign to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}


