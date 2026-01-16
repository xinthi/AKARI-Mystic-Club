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

  const getStatusBadge = (status: Campaign['creatorStatus']) => {
    if (!status) {
      return <span className="px-2 py-1 rounded text-xs bg-blue-500/20 text-blue-300">Available</span>;
    }
    if (status === 'approved') return <span className="px-2 py-1 rounded text-xs bg-green-500/20 text-green-300">Approved</span>;
    if (status === 'pending') return <span className="px-2 py-1 rounded text-xs bg-yellow-500/20 text-yellow-300">Pending</span>;
    if (status === 'invited') return <span className="px-2 py-1 rounded text-xs bg-purple-500/20 text-purple-300">Invited</span>;
    return <span className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-300">Rejected</span>;
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
          <div className="text-center py-12 text-white/60">Loading campaigns...</div>
        ) : error ? (
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="🧭"
            title="No campaigns yet"
            description="Public and invited campaigns will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/portal/arc/campaigns/${campaign.id}`}
                className="rounded-lg border border-white/10 bg-black/40 backdrop-blur-sm p-6 hover:border-teal-400/50 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">{campaign.name}</h3>
                    {campaign.brand && (
                      <p className="text-sm text-white/60">{campaign.brand.name}</p>
                    )}
                  </div>
                  {campaign.brand?.logo_url && (
                    <img
                      src={campaign.brand.logo_url}
                      alt={campaign.brand.name}
                      className="w-10 h-10 rounded-full"
                    />
                  )}
                </div>

                {campaign.pitch && (
                  <p className="text-sm text-white/60 mb-4 line-clamp-2">{campaign.pitch}</p>
                )}

                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-white/60">Type</span>
                  <span className="text-xs text-white">{campaign.campaign_type}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/60">Status</span>
                  {getStatusBadge(campaign.creatorStatus)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ArcPageShell>
  );
}
