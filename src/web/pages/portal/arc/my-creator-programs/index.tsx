/**
 * Creator Quests - Creator View
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
  approvedCount: number;
}

const CAMPAIGN_TABS: Array<{ key: Campaign['campaign_type'] | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'exclusive', label: 'Exclusive' },
  { key: 'invite', label: 'Invite Only' },
  { key: 'public', label: 'Public' },
  { key: 'monad', label: 'Monad' },
];

export default function CreatorQuestsHome() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<typeof CAMPAIGN_TABS[number]['key']>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showLanguageFilter, setShowLanguageFilter] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);

  useEffect(() => {
    async function loadCampaigns() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/portal/brands/quests', { credentials: 'include' });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to load quests');
        }
        setCampaigns(data.quests || data.campaigns || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load quests');
        setCampaigns([]);
      } finally {
        setLoading(false);
      }
    }

    loadCampaigns();
  }, []);

  const availableLanguages = useMemo(() => {
    const all = new Set<string>();
    campaigns.forEach((c) => (c.languages || []).forEach((l) => all.add(l)));
    return Array.from(all);
  }, [campaigns]);

  const filtered = useMemo(() => {
    let list = activeTab === 'all' ? campaigns : campaigns.filter((c) => c.campaign_type === activeTab);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter((c) =>
        [c.name, c.pitch, c.brand?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
      );
    }
    if (selectedLanguages.length > 0) {
      list = list.filter((c) => (c.languages || []).some((l) => selectedLanguages.includes(l)));
    }
    return list;
  }, [campaigns, activeTab, searchQuery, selectedLanguages]);

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
          <h1 className="text-3xl font-bold text-white mb-2">Creator Quests</h1>
          <p className="text-white/60">
            Join quests, share content across platforms, and track analytics.
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

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search quests..."
              className="w-full px-4 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/20"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowLanguageFilter((prev) => !prev)}
              className="px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white/80 hover:bg-white/10"
            >
              Languages
            </button>
            {showLanguageFilter && (
              <div className="absolute right-0 mt-2 w-48 rounded-lg border border-white/10 bg-black/90 p-2 z-10">
                {availableLanguages.length === 0 ? (
                  <div className="text-xs text-white/50 px-2 py-1">No languages</div>
                ) : (
                  availableLanguages.map((lang) => (
                    <label key={lang} className="flex items-center gap-2 px-2 py-1 text-xs text-white/70">
                      <input
                        type="checkbox"
                        checked={selectedLanguages.includes(lang)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedLanguages((prev) => [...prev, lang]);
                          } else {
                            setSelectedLanguages((prev) => prev.filter((l) => l !== lang));
                          }
                        }}
                      />
                      <span>{lang}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
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
            title="No quests yet"
            description="Public and invited quests will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((campaign) => (
              <Link
                key={campaign.id}
                href={`/portal/arc/quests/${campaign.id}`}
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
                  {campaign.brand?.logo_url ? (
                    <img
                      src={campaign.brand.logo_url}
                      alt={campaign.brand.name}
                      className="w-11 h-11 rounded-full border border-white/10"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-sm text-white/60">
                      {(campaign.brand?.name || 'B').slice(0, 1).toUpperCase()}
                    </div>
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
                  <span>{campaign.approvedCount} creators joined</span>
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
