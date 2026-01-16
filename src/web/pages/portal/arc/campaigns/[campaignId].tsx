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

        <div className="rounded-xl border border-white/10 bg-gradient-to-br from-black/60 to-black/30 backdrop-blur-sm p-6">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div className="flex-1">
                <div className="text-xs uppercase tracking-wider text-white/40 mb-2">{brand.name}</div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-white">{campaign.name}</h1>
              {campaign.pitch && <p className="text-sm text-white/70 mt-3">{campaign.pitch}</p>}
              {campaign.objectives && (
                <div className="mt-3 text-sm text-white/50">Objectives: {campaign.objectives}</div>
              )}
              {!isMember && (
                <div className="mt-3 text-xs text-yellow-300">
                  Join the brand community before requesting access.
                </div>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-white/50 mt-4">
                <span>Type: {campaign.campaign_type}</span>
                <span>Status: {campaign.status}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              {brand.logo_url ? (
                <img src={brand.logo_url} alt={brand.name} className="w-14 h-14 rounded-full border border-white/10" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-sm text-white/60">
                  {(brand.name || 'B').slice(0, 1).toUpperCase()}
                </div>
              )}
              {!isMember && (
                <button
                  onClick={handleJoinBrand}
                  className="px-4 py-2 text-xs font-semibold bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20"
                >
                  Join Brand Community
                </button>
              )}
              <button
                onClick={handleJoinCampaign}
                disabled={joining || !isMember || creatorStatus === 'approved' || creatorStatus === 'pending'}
                className="px-4 py-2 text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-lg hover:bg-teal-500/30 disabled:opacity-50"
              >
                {creatorStatus ? `Status: ${creatorStatus}` : 'Request to Join'}
              </button>
            </div>
          </div>
        </div>

        {brandLinks.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
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

        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">Your UTM Links</h2>
            <span className="text-xs text-white/40">Personalized tracking links</span>
          </div>
          {copiedLink && (
            <div className="mb-3 text-xs text-teal-300">Link copied to clipboard.</div>
          )}
          {utmLinks.length === 0 ? (
            <EmptyState
              icon="🔗"
              title="No links yet"
              description="Links will appear once the campaign is configured."
            />
          ) : (
            <div className="space-y-3">
              {utmLinks.map((link: any, idx: number) => (
                <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
                  <div>
                    <div className="text-sm text-white/80">{link.label || 'Link'}</div>
                    <div className="text-xs text-white/40 truncate max-w-[320px]">{link.url}</div>
                  </div>
                  <button
                    onClick={() => handleCopy(link.utmUrl)}
                    className="px-3 py-1.5 text-xs font-semibold bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20"
                  >
                    {copiedLink === link.utmUrl ? 'Copied' : 'Copy Link'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-lg font-semibold text-white mb-3">Submit Content</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as any)}
              className="px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>{`${PLATFORM_ICONS[p] || ''} ${p.toUpperCase()}`}</option>
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
              className="px-4 py-2 text-sm font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-lg hover:bg-teal-500/30 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
          {submissions.length > 0 && (
            <div className="mt-4 space-y-2 text-xs text-white/60">
              {submissions.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                  <span>{PLATFORM_ICONS[s.platform] || '🔗'} {s.platform.toUpperCase()} • {s.status}</span>
                  <a href={s.post_url} className="text-teal-300">View</a>
                </div>
              ))}
            </div>
          )}
        </div>

        {isOwner && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-white">Pending Requests</h2>
              {requests.length > 0 && (
                <span className="px-2 py-0.5 text-[11px] rounded-full bg-red-500/20 text-red-300 border border-red-500/40">
                  {requests.length} pending
                </span>
              )}
            </div>
            {requests.length === 0 ? (
              <p className="text-sm text-white/60">No pending requests.</p>
            ) : (
              <div className="space-y-2">
                {requests.map((r: any) => (
                  <div key={r.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2">
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

        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-lg font-semibold text-white mb-3">Analytics Leaderboard</h2>
          <p className="text-xs text-white/50 mb-3">
            Analytics for discovery only — no rewards.
          </p>
          {leaderboard.length === 0 ? (
            <EmptyState icon="📊" title="No data yet" description="Engagement data appears after submissions." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-white/70">
                <thead>
                  <tr className="text-xs text-white/40 uppercase">
                    <th className="text-left py-2">Rank</th>
                    <th className="text-left py-2">Creator</th>
                    <th className="text-left py-2">Platforms</th>
                    <th className="text-right py-2">Clicks</th>
                    <th className="text-right py-2">Engagement</th>
                    <th className="text-right py-2">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {leaderboard.map((row: any, idx: number) => {
                    const rank = idx + 1;
                    const rankStyles = rank === 1
                      ? 'bg-yellow-500/20 text-yellow-300'
                      : rank === 2
                        ? 'bg-white/10 text-white/80'
                        : rank === 3
                          ? 'bg-amber-700/20 text-amber-300'
                          : 'bg-white/5 text-white/60';
                    return (
                      <tr key={row.creator_profile_id || row.username} className="hover:bg-white/5">
                        <td className="py-3">
                          <span className={`px-2 py-1 rounded-md text-xs font-semibold ${rankStyles}`}>{rank}</span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            {row.avatar_url ? (
                              <img src={row.avatar_url} alt={row.username} className="w-6 h-6 rounded-full border border-white/10" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-white/10" />
                            )}
                            {brand.logo_url ? (
                              <img src={brand.logo_url} alt={brand.name} className="w-5 h-5 rounded-full border border-white/10" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-white/10 border border-white/10" />
                            )}
                            <span>@{row.username}</span>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2 text-xs">
                            {Object.entries(row.platforms || {}).map(([platform, count]) => (
                              <span key={platform} className="px-2 py-1 rounded-md bg-white/5 border border-white/10">
                                {PLATFORM_ICONS[platform] || '🔗'} {count}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-3 text-right">{row.clicks}</td>
                        <td className="py-3 text-right">{row.engagementScore}</td>
                        <td className="py-3 text-right font-semibold">{row.totalScore}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="pt-3 text-xs text-white/40">
                Analytics for discovery only — no rewards or incentives.
              </div>
            </div>
          )}
        </div>
      </div>
    </ArcPageShell>
  );
}
