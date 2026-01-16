/**
 * Creator Campaigns - Creator View
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { ErrorState } from '@/components/arc/ErrorState';
import { EmptyState } from '@/components/arc/EmptyState';

interface Campaign {
  id: string;
  name: string;
  pitch: string | null;
  objectives: string | null;
  campaign_type: 'exclusive' | 'invite' | 'public' | 'monad';
  status: 'active' | 'paused' | 'ended';
  languages: string[];
  start_at?: string | null;
  end_at?: string | null;
  brand: {
    id: string;
    name: string;
    logo_url: string | null;
    x_handle: string | null;
  } | null;
  creatorStatus: 'pending' | 'approved' | 'rejected' | 'invited' | null;
  isMember: boolean;
}

const CAMPAIGN_TABS: Array<{ key: Campaign['campaign_type'] | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'exclusive', label: 'Exclusive' },
  { key: 'invite', label: 'Invite Only' },
  { key: 'public', label: 'Public' },
  { key: 'monad', label: 'Monad' },
];

export default function CreatorCampaignsHome() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<typeof CAMPAIGN_TABS[number]['key']>('all');

  useEffect(() => {
    async function loadCampaigns() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/portal/brands/campaigns', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to load campaigns');
        }
        setCampaigns(data.campaigns || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load campaigns');
        setCampaigns([]);
      } finally {
        setLoading(false);
      }
    }

    loadCampaigns();
  }, []);

  const filtered = useMemo(() => {
    if (activeTab === 'all') return campaigns;
    return campaigns.filter((c) => c.campaign_type === activeTab);
  }, [campaigns, activeTab]);

  const getTypeBadge = (type: Campaign['campaign_type']) => {
    const styles: Record<string, string> = {
      exclusive: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
      invite: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      public: 'bg-green-500/20 text-green-300 border-green-500/40',
      monad: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    };
    return (
      <span className={`px-2.5 py-1 rounded-full text-[11px] border ${styles[type] || styles.public}`}>
        {type === 'invite' ? 'Invite Only' : type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const getStatusBadge = (campaign: Campaign) => {
    if (!campaign.isMember) {
      return <span className="px-2.5 py-1 rounded-full text-[11px] bg-white/5 text-white/50 border border-white/10">Join Brand First</span>;
    }
    if (!campaign.creatorStatus) {
      return <span className="px-2.5 py-1 rounded-full text-[11px] bg-blue-500/20 text-blue-300 border border-blue-500/40">Open to Join</span>;
    }
    if (campaign.creatorStatus === 'approved') {
      return <span className="px-2.5 py-1 rounded-full text-[11px] bg-green-500/20 text-green-300 border border-green-500/40">Joined</span>;
    }
    if (campaign.creatorStatus === 'pending') {
      return <span className="px-2.5 py-1 rounded-full text-[11px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">Request Sent</span>;
    }
    if (campaign.creatorStatus === 'invited') {
      return <span className="px-2.5 py-1 rounded-full text-[11px] bg-purple-500/20 text-purple-300 border border-purple-500/40">Invited</span>;
    }
    return <span className="px-2.5 py-1 rounded-full text-[11px] bg-red-500/20 text-red-300 border border-red-500/40">Rejected</span>;
  };

  const getTimeLabel = (campaign: Campaign) => {
    if (!campaign.end_at && !campaign.start_at) return 'Live';
    const now = Date.now();
    if (campaign.start_at) {
      const start = new Date(campaign.start_at).getTime();
      if (start > now) {
        const days = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
        return `Starts in ${days}d`;
      }
    }
    if (campaign.end_at) {
      const end = new Date(campaign.end_at).getTime();
      if (end <= now) return 'Ended';
      const days = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
      return `Ends in ${days}d`;
    }
    return 'Live';
  };

  return (
    <ArcPageShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Creator Campaigns</h1>
          <p className="text-white/60">
            Join campaigns, share content across platforms, and track analytics.
          </p>
          <p className="text-xs text-white/40 mt-2">
            Analytics for discovery only — no rewards.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {CAMPAIGN_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                activeTab === tab.key
                  ? 'bg-white/10 text-white border-white/20'
                  : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="rounded-xl border border-white/10 bg-black/40 p-6 animate-pulse">
                <div className="h-4 w-24 bg-white/10 rounded mb-4" />
                <div className="h-6 w-3/4 bg-white/10 rounded mb-3" />
                <div className="h-3 w-full bg-white/10 rounded mb-2" />
                <div className="h-3 w-2/3 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🧭"
            title="No campaigns yet"
            description="Public and invited campaigns will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/portal/arc/campaigns/${campaign.id}`}
                className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-sm p-6 hover:border-teal-400/50 hover:shadow-[0_0_24px_rgba(0,246,162,0.12)] transition-all hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="text-xs uppercase tracking-wider text-white/40 mb-2">
                      {campaign.brand?.name || 'Brand'}
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-1">{campaign.name}</h3>
                    {campaign.brand && (
                      <p className="text-xs text-white/50">@{campaign.brand.x_handle || campaign.brand.name}</p>
                    )}
                  </div>
                  {campaign.brand?.logo_url && (
                    <img
                      src={campaign.brand.logo_url}
                      alt={campaign.brand.name}
                      className="w-11 h-11 rounded-full border border-white/10"
                    />
                  )}
                </div>

                {campaign.pitch && (
                  <p className="text-sm text-white/70 mb-4 line-clamp-2">{campaign.pitch}</p>
                )}

                <div className="flex items-center gap-2 mb-4">
                  {getTypeBadge(campaign.campaign_type)}
                  {getStatusBadge(campaign)}
                </div>

                <div className="flex items-center justify-between text-xs text-white/50">
                  <span>Participants: N/A</span>
                  <span>{getTimeLabel(campaign)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ArcPageShell>
  );
}
