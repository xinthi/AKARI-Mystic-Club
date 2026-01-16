/**
 * Creator Campaign Detail
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { ErrorState } from '@/components/arc/ErrorState';
import { EmptyState } from '@/components/arc/EmptyState';
import { createPortalClient } from '@/lib/portal/supabase';

const PLATFORMS = ['x', 'youtube', 'tiktok', 'telegram', 'linkedin', 'instagram'] as const;
const PLATFORM_ICONS: Record<string, string> = {
  x: '𝕏',
  youtube: '▶️',
  tiktok: '🎵',
  telegram: '✈️',
  linkedin: '💼',
  instagram: '📸',
};

export default function CampaignDetail() {
  const router = useRouter();
  const { campaignId } = router.query;

  const [campaign, setCampaign] = useState<any>(null);
  const [brand, setBrand] = useState<any>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [utmLinks, setUtmLinks] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [creatorStatus, setCreatorStatus] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [platform, setPlatform] = useState<typeof PLATFORMS[number]>('x');
  const [postUrl, setPostUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const loadCampaign = async () => {
    if (!campaignId || typeof campaignId !== 'string') return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/brands/campaigns/${campaignId}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load campaign');
      }
      setCampaign(data.campaign);
      setBrand(data.brand);
      setLinks(data.links || []);
      setCreatorStatus(data.creatorStatus || null);
      setIsMember(!!data.isMember);
      setIsOwner(!!data.isOwner);
      setSubmissions(data.submissions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  };

  const loadUtmLinks = async () => {
    if (!campaignId || typeof campaignId !== 'string') return;
    const res = await fetch(`/api/portal/brands/campaigns/${campaignId}/utm`, { credentials: 'include' });
    const data = await res.json();
    if (res.ok && data.ok) {
      setUtmLinks(data.links || []);
    }
  };

  const loadRequests = async () => {
    if (!campaignId || typeof campaignId !== 'string' || !isOwner) return;
    const res = await fetch(`/api/portal/brands/campaigns/${campaignId}/requests`, { credentials: 'include' });
    const data = await res.json();
    if (res.ok && data.ok) {
      setRequests(data.requests || []);
    }
  };

  const loadLeaderboard = async () => {
    if (!campaignId || typeof campaignId !== 'string') return;
    const res = await fetch(`/api/portal/brands/campaigns/${campaignId}/leaderboard`, { credentials: 'include' });
    const data = await res.json();
    if (res.ok && data.ok) {
      setLeaderboard(data.rows || []);
    }
  };

  useEffect(() => {
    loadCampaign();
  }, [campaignId]);

  useEffect(() => {
    if (campaignId) {
      loadUtmLinks();
      loadLeaderboard();
      loadRequests();
    }
  }, [campaignId, isOwner]);

  useEffect(() => {
    if (!campaignId || typeof campaignId !== 'string') return;
    const supabase = createPortalClient();
    const channel = supabase
      .channel(`campaign-${campaignId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_submissions' }, () => {
        loadCampaign();
        loadLeaderboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_utm_events' }, () => {
        loadLeaderboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brand_campaign_creators' }, () => {
        loadRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaignId, isOwner]);

  const handleJoinBrand = async () => {
    if (!brand?.id) return;
    await fetch(`/api/portal/brands/${brand.id}/join`, { method: 'POST', credentials: 'include' });
    setIsMember(true);
  };

  const handleJoinCampaign = async () => {
    if (!campaignId || typeof campaignId !== 'string') return;
    setJoining(true);
    try {
      const res = await fetch(`/api/portal/brands/campaigns/${campaignId}/join`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setCreatorStatus(data.status || 'pending');
      }
    } finally {
      setJoining(false);
    }
  };

  const handleSubmit = async () => {
    if (!campaignId || typeof campaignId !== 'string') return;
    if (!postUrl.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/brands/campaigns/${campaignId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ platform, postUrl: postUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Failed to submit');
        return;
      }
      setPostUrl('');
      loadCampaign();
      loadLeaderboard();
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRequest = async (creatorId: string, status: string) => {
    if (!campaignId || typeof campaignId !== 'string') return;
    await fetch(`/api/portal/brands/campaigns/${campaignId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ creatorId, status }),
    });
    loadRequests();
    loadLeaderboard();
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(url);
      setTimeout(() => setCopiedLink(null), 1500);
    } catch {
      setCopiedLink(null);
    }
  };

  const brandLinks = useMemo(() => {
    if (!brand) return [];
    return [
      brand.website ? { label: 'Website', url: brand.website } : null,
      brand.tg_community ? { label: 'Community', url: brand.tg_community } : null,
      brand.tg_channel ? { label: 'Channel', url: brand.tg_channel } : null,
    ].filter(Boolean);
  }, [brand]);

  if (loading) {
    return (
      <ArcPageShell>
        <div className="text-white/60">Loading campaign...</div>
      </ArcPageShell>
    );
  }

  if (error || !campaign || !brand) {
    return (
      <ArcPageShell>
        <ErrorState message={error || 'Campaign not found'} onRetry={loadCampaign} />
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell>
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link href="/portal/arc/my-creator-programs" className="hover:text-white transition-colors">
            Campaigns
          </Link>
          <span>/</span>
          <span className="text-white">{campaign.name}</span>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">{campaign.name}</h1>
              <p className="text-sm text-white/60">{brand.name}</p>
              {campaign.pitch && <p className="text-sm text-white/60 mt-3">{campaign.pitch}</p>}
              {campaign.objectives && (
                <div className="mt-3 text-sm text-white/50">Objectives: {campaign.objectives}</div>
              )}
              {!isMember && (
                <div className="mt-3 text-xs text-yellow-300">
                  Join the brand community before requesting access.
                </div>
              )}
            </div>
            {brand.logo_url && (
              <img src={brand.logo_url} alt={brand.name} className="w-12 h-12 rounded-full" />
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-white/50 mt-4">
            <span>Type: {campaign.campaign_type}</span>
            <span>Status: {campaign.status}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {!isMember && (
              <button
                onClick={handleJoinBrand}
                className="px-3 py-1.5 text-xs font-medium bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10"
              >
                Join Brand Community
              </button>
            )}
            <button
              onClick={handleJoinCampaign}
              disabled={joining || !isMember || creatorStatus === 'approved' || creatorStatus === 'pending'}
              className="px-3 py-1.5 text-xs font-medium bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-lg hover:bg-teal-500/30 disabled:opacity-50"
            >
              {creatorStatus ? `Status: ${creatorStatus}` : 'Request to Join'}
            </button>
          </div>
        </div>

        {brandLinks.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-6">
            <h2 className="text-lg font-semibold text-white mb-3">Brand Links</h2>
            <div className="flex flex-wrap gap-3 text-xs text-white/60">
              {brandLinks.map((link: any, idx: number) => (
                <a key={idx} href={link.url} className="text-teal-300 hover:text-teal-200">
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <h2 className="text-lg font-semibold text-white mb-3">Your UTM Links</h2>
          {utmLinks.length === 0 ? (
            <EmptyState
              icon="🔗"
              title="No links yet"
              description="Links will appear once the campaign is configured."
            />
          ) : (
            <div className="space-y-2">
              {utmLinks.map((link: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-sm text-white/70">
                  <span>{link.label || 'Link'}</span>
                  <button
                    onClick={() => handleCopy(link.utmUrl)}
                    className="text-teal-300 hover:text-teal-200 text-xs"
                  >
                    {copiedLink === link.utmUrl ? 'Copied' : 'Copy Link'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <h2 className="text-lg font-semibold text-white mb-3">Submit Content</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as any)}
              className="px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{p.toUpperCase()}</option>
              ))}
            </select>
            <input
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              placeholder="Post URL"
              className="flex-1 px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
            />
            <button
              onClick={handleSubmit}
              disabled={submitting || !postUrl.trim()}
              className="px-4 py-2 text-sm font-medium bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-lg hover:bg-teal-500/30 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
          {submissions.length > 0 && (
            <div className="mt-4 space-y-2 text-xs text-white/60">
              {submissions.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between">
                  <span>{s.platform.toUpperCase()} • {s.status}</span>
                  <a href={s.post_url} className="text-teal-300">View</a>
                </div>
              ))}
            </div>
          )}
        </div>

        {isOwner && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-6">
            <h2 className="text-lg font-semibold text-white mb-3">Pending Requests</h2>
            {requests.length === 0 ? (
              <p className="text-sm text-white/60">No pending requests.</p>
            ) : (
              <div className="space-y-2">
                {requests.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between">
                    <span className="text-sm text-white">@{r.username || 'unknown'}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateRequest(r.id, 'approved')}
                        className="px-2 py-1 text-xs bg-green-500/20 text-green-300 rounded-lg"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleUpdateRequest(r.id, 'rejected')}
                        className="px-2 py-1 text-xs bg-red-500/20 text-red-300 rounded-lg"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <h2 className="text-lg font-semibold text-white mb-3">Analytics Leaderboard</h2>
          <p className="text-xs text-white/50 mb-3">
            Analytics for discovery only — no rewards.
          </p>
          {leaderboard.length === 0 ? (
            <EmptyState icon="📊" title="No data yet" description="Engagement data appears after submissions." />
          ) : (
            <div className="space-y-2 text-sm text-white/70">
              {leaderboard.map((row: any, idx: number) => (
                <div key={row.creator_profile_id || row.username} className="flex items-center justify-between">
                  <span>#{idx + 1} @{row.username}</span>
                  <div className="flex items-center gap-3 text-xs text-white/60">
                    <span>
                      {Object.entries(row.platforms || {}).map(([platform, count]) => (
                        <span key={platform} className="mr-2">
                          {PLATFORM_ICONS[platform] || '🔗'} {count}
                        </span>
                      ))}
                    </span>
                    <span>Clicks: {row.clicks}</span>
                    <span>Score: {row.totalScore}</span>
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
