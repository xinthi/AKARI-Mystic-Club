/**
 * Brand Detail Page
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { ErrorState } from '@/components/arc/ErrorState';
import { EmptyState } from '@/components/arc/EmptyState';

export default function BrandDetail() {
  const router = useRouter();
  const { brandId } = router.query;

  const [brand, setBrand] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    pitch: '',
    objectives: '',
    campaignType: 'public',
    languages: '',
    links: [{ label: '', url: '' }],
  });

  const loadBrand = async () => {
    if (!brandId || typeof brandId !== 'string') return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/brands/${brandId}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load brand');
      }
      setBrand(data.brand);
      setCampaigns(data.campaigns || []);
      setIsOwner(!!data.isOwner);
    } catch (err: any) {
      setError(err.message || 'Failed to load brand');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBrand();
  }, [brandId]);

  const handleCreateCampaign = async () => {
    if (!brandId || typeof brandId !== 'string') return;
    if (!campaignForm.name.trim()) return;
    const links = campaignForm.links.filter((l) => l.url.trim().length > 0).slice(0, 6);
    const languages = campaignForm.languages
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);

    const res = await fetch(`/api/portal/brands/${brandId}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: campaignForm.name.trim(),
        pitch: campaignForm.pitch.trim(),
        objectives: campaignForm.objectives.trim(),
        campaignType: campaignForm.campaignType,
        languages,
        links,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || 'Failed to create campaign');
      return;
    }
    setShowCreate(false);
    setCampaignForm({
      name: '',
      pitch: '',
      objectives: '',
      campaignType: 'public',
      languages: '',
      links: [{ label: '', url: '' }],
    });
    loadBrand();
  };

  const handleJoinBrand = async () => {
    if (!brandId || typeof brandId !== 'string') return;
    await fetch(`/api/portal/brands/${brandId}/join`, {
      method: 'POST',
      credentials: 'include',
    });
  };

  if (loading) {
    return (
      <ArcPageShell>
        <div className="text-white/60">Loading brand...</div>
      </ArcPageShell>
    );
  }

  if (error || !brand) {
    return (
      <ArcPageShell>
        <ErrorState message={error || 'Brand not found'} onRetry={loadBrand} />
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell>
      <div className="space-y-6">
        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{brand.name}</h1>
              {brand.x_handle && <div className="text-sm text-white/60">@{brand.x_handle}</div>}
              {brand.brief_text && <p className="text-sm text-white/60 mt-2">{brand.brief_text}</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/50">
                {brand.website && <span>Website: {brand.website}</span>}
                {brand.tg_community && <span>Community: {brand.tg_community}</span>}
                {brand.tg_channel && <span>Channel: {brand.tg_channel}</span>}
              </div>
            </div>
            <button
              onClick={handleJoinBrand}
              className="px-3 py-1.5 text-xs font-medium bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10 transition-colors"
            >
              Join Brand
            </button>
          </div>
        </div>

        {isOwner && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-4">
            <button
              onClick={() => setShowCreate((prev) => !prev)}
              className="px-3 py-1.5 text-xs font-medium bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10 transition-colors"
            >
              {showCreate ? 'Close' : 'Create Campaign'}
            </button>
            {showCreate && (
              <div className="mt-4 space-y-3">
                <input
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                  placeholder="Campaign name"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                />
                <textarea
                  value={campaignForm.pitch}
                  onChange={(e) => setCampaignForm({ ...campaignForm, pitch: e.target.value })}
                  placeholder="Pitch/overview"
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                />
                <textarea
                  value={campaignForm.objectives}
                  onChange={(e) => setCampaignForm({ ...campaignForm, objectives: e.target.value })}
                  placeholder="Objectives"
                  rows={2}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                />
                <input
                  value={campaignForm.languages}
                  onChange={(e) => setCampaignForm({ ...campaignForm, languages: e.target.value })}
                  placeholder="Languages (comma-separated)"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                />
                <div className="grid gap-2">
                  {campaignForm.links.map((link, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        value={link.label}
                        onChange={(e) => {
                          const next = [...campaignForm.links];
                          next[idx] = { ...next[idx], label: e.target.value };
                          setCampaignForm({ ...campaignForm, links: next });
                        }}
                        placeholder="Link label"
                        className="w-1/3 px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                      />
                      <input
                        value={link.url}
                        onChange={(e) => {
                          const next = [...campaignForm.links];
                          next[idx] = { ...next[idx], url: e.target.value };
                          setCampaignForm({ ...campaignForm, links: next });
                        }}
                        placeholder="URL"
                        className="flex-1 px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleCreateCampaign}
                  className="px-4 py-2 text-sm font-medium bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-lg hover:bg-teal-500/30 transition-colors"
                >
                  Create Campaign
                </button>
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Campaigns</h2>
          {campaigns.length === 0 ? (
            <EmptyState
              icon="🚀"
              title="No campaigns yet"
              description="Campaigns will appear here when available."
            />
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="rounded-lg border border-white/10 bg-black/30 p-4">
                  <div className="text-sm font-medium text-white">{campaign.name}</div>
                  {campaign.pitch && <div className="text-xs text-white/60 mt-1">{campaign.pitch}</div>}
                  <div className="text-xs text-white/50 mt-2">
                    Type: {campaign.campaign_type} • Status: {campaign.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ArcPageShell>
  );
}
