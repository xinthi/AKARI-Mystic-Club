import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { EmptyState } from '@/components/arc/EmptyState';
import { ErrorState } from '@/components/arc/ErrorState';
import { createPortalClient } from '@/lib/portal/supabase';
import { useArcMode } from '@/lib/arc/useArcMode';

const PLATFORMS = ['x', 'youtube', 'tiktok', 'telegram', 'linkedin', 'instagram', 'other'] as const;
const PLATFORM_ICONS: Record<string, string> = {
  x: 'X',
  youtube: 'YT',
  tiktok: 'TT',
  telegram: 'TG',
  linkedin: 'IN',
  instagram: 'IG',
  other: 'OT',
};

export default function QuestDetail() {
  const router = useRouter();
  const { questId } = router.query;
  const { mode } = useArcMode();

  const [quest, setQuest] = useState<any>(null);
  const [brand, setBrand] = useState<any>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [utmLinks, setUtmLinks] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [creatorStatus, setCreatorStatus] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [detectedTweets, setDetectedTweets] = useState<any[]>([]);
  const [loadingDetected, setLoadingDetected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [platform, setPlatform] = useState<typeof PLATFORMS[number]>('x');
  const [postUrl, setPostUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [origin, setOrigin] = useState('');
  const [refreshingX, setRefreshingX] = useState(false);

  const loadQuest = useCallback(async () => {
    if (!questId || typeof questId !== 'string') return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/brands/quests/${questId}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load quest');
      }
      setQuest(data.campaign);
      setBrand(data.brand);
      setLinks(data.links || []);
      setCreatorStatus(data.creatorStatus || null);
      setIsMember(!!data.isMember);
      setIsOwner(!!data.isOwner);
      setSubmissions(data.submissions || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load quest');
    } finally {
      setLoading(false);
    }
  }, [questId]);

  const loadUtmLinks = useCallback(async () => {
    if (!questId || typeof questId !== 'string') return;
    const res = await fetch(`/api/portal/brands/quests/${questId}/utm`, { credentials: 'include' });
    const data = await res.json();
    if (res.ok && data.ok) {
      setUtmLinks(data.links || []);
    }
  }, [questId]);

  const loadLeaderboard = useCallback(async () => {
    if (!questId || typeof questId !== 'string') return;
    const res = await fetch(`/api/portal/brands/quests/${questId}/leaderboard`, { credentials: 'include' });
    const data = await res.json();
    if (res.ok && data.ok) {
      setLeaderboard(data.rows || []);
    }
  }, [questId]);

  const loadRequests = useCallback(async () => {
    if (!questId || typeof questId !== 'string' || !isOwner) return;
    const res = await fetch(`/api/portal/brands/quests/${questId}/requests`, { credentials: 'include' });
    const data = await res.json();
    if (res.ok && data.ok) {
      setRequests(data.requests || []);
    }
  }, [questId, isOwner]);

  const loadDetectedTweets = useCallback(async () => {
    if (!questId || typeof questId !== 'string' || mode !== 'creator') return;
    setLoadingDetected(true);
    const res = await fetch(`/api/portal/brands/quests/${questId}/detected-x`, { credentials: 'include' });
    const data = await res.json();
    if (res.ok && data.ok) {
      setDetectedTweets(data.tweets || []);
    } else {
      setDetectedTweets([]);
    }
    setLoadingDetected(false);
  }, [questId, mode]);

  useEffect(() => {
    loadQuest();
  }, [loadQuest]);

  useEffect(() => {
    if (questId) {
      loadUtmLinks();
      loadLeaderboard();
      loadRequests();
      loadDetectedTweets();
    }
  }, [questId, loadUtmLinks, loadLeaderboard, loadRequests, loadDetectedTweets]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  useEffect(() => {
    if (!questId || typeof questId !== 'string') return;
    const supabase = createPortalClient();
    const channel = supabase
      .channel(`quest-${questId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_submissions' }, () => {
        loadQuest();
        loadLeaderboard();
        loadDetectedTweets();
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
  }, [questId, loadQuest, loadLeaderboard, loadRequests, loadDetectedTweets]);

  const handleJoinBrand = async () => {
    if (!brand?.id) return;
    await fetch(`/api/portal/brands/${brand.id}/join`, { method: 'POST', credentials: 'include' });
    setIsMember(true);
  };

  const handleJoinQuest = async () => {
    if (!questId || typeof questId !== 'string') return;
    setJoining(true);
    try {
      const res = await fetch(`/api/portal/brands/quests/${questId}/join`, {
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
    if (!questId || typeof questId !== 'string') return;
    if (!postUrl.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/portal/brands/quests/${questId}/submit`, {
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
      loadQuest();
      loadLeaderboard();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefreshX = async () => {
    if (!questId || typeof questId !== 'string') return;
    setRefreshingX(true);
    try {
      await fetch(`/api/portal/brands/quests/${questId}/refresh-x`, {
        method: 'PATCH',
        credentials: 'include',
      });
      loadQuest();
      loadLeaderboard();
      loadDetectedTweets();
    } finally {
      setRefreshingX(false);
    }
  };

  const handleUpdateRequest = async (creatorId: string, status: string) => {
    if (!questId || typeof questId !== 'string') return;
    await fetch(`/api/portal/brands/quests/${questId}/status`, {
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

  const totals = useMemo(() => {
    const participants = leaderboard.length;
    const totalClicks = leaderboard.reduce((acc, row) => acc + Number(row.clicks || 0), 0);
    const totalEngagement = leaderboard.reduce((acc, row) => acc + Number(row.engagementScore || 0), 0);
    const impressions = totalEngagement * 10;
    const engagementRate = totalClicks > 0 ? Math.min(100, (totalEngagement / totalClicks) * 100) : 0;
    return { participants, totalClicks, totalEngagement, impressions, engagementRate };
  }, [leaderboard]);

  const topKols = leaderboard.slice(0, 3);

  if (loading) {
    return (
      <ArcPageShell>
        <div className="text-white/60">Loading quest...</div>
      </ArcPageShell>
    );
  }

  if (error || !quest || !brand) {
    return (
      <ArcPageShell>
        <ErrorState message={error || 'Quest not found'} onRetry={loadQuest} />
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell hideRightRail>
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link href="/portal/arc" className="hover:text-white transition-colors">
            Quests
          </Link>
          <span>/</span>
          <span className="text-white">{quest.name}</span>
        </div>

        <div className="rounded-xl border border-white/10 bg-gradient-to-br from-black/60 to-black/30 backdrop-blur-sm p-6">
          {brand.banner_url && (
            <div className="mb-4 overflow-hidden rounded-xl border border-white/10">
              <img src={brand.banner_url} alt={`${brand.name} banner`} className="w-full h-36 object-cover" />
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wider text-white/40 mb-2">{brand.name}</div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-semibold text-white">{quest.name}</h1>
                <span className="px-2.5 py-1 rounded-full text-[11px] bg-white/10 border border-white/10 text-white/70">
                  {quest.campaign_type === 'invite' ? 'Invite Only' : quest.campaign_type}
                </span>
                {quest.campaign_type === 'exclusive' && (
                  <span className="px-2.5 py-1 rounded-full text-[11px] bg-purple-500/20 border border-purple-500/40 text-purple-300">
                    Private
                  </span>
                )}
              </div>
              {brand.brief_text && <p className="text-sm text-white/70 mt-3">{brand.brief_text}</p>}
              {quest.start_at || quest.end_at ? (
                <div className="mt-3 text-sm text-white/50">
                  {quest.start_at ? new Date(quest.start_at).toLocaleDateString() : 'Now'} — {quest.end_at ? new Date(quest.end_at).toLocaleDateString() : 'Ongoing'}
                </div>
              ) : null}
              {!isMember && (
                <div className="mt-3 text-xs text-yellow-300">
                  Join the brand community before requesting access.
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-3">
              {brand.logo_url || brand.x_profile_image_url ? (
                <img
                  src={brand.logo_url || brand.x_profile_image_url}
                  alt={brand.name}
                  className="w-14 h-14 rounded-full border border-white/10"
                />
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
                onClick={handleJoinQuest}
                disabled={joining || !isMember || creatorStatus === 'approved' || creatorStatus === 'pending'}
                className="px-4 py-2 text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-lg hover:bg-teal-500/30 disabled:opacity-50"
              >
                {creatorStatus ? `Status: ${creatorStatus}` : 'Request to Join'}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="text-xs text-white/40 mb-1">Participants</div>
            <div className="text-2xl font-semibold text-white">{totals.participants}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="text-xs text-white/40 mb-1">Impressions (est.)</div>
            <div className="text-2xl font-semibold text-white">{totals.impressions}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <div className="text-xs text-white/40 mb-1">Engagement Rate</div>
            <div className="text-2xl font-semibold text-white">{totals.engagementRate.toFixed(1)}%</div>
          </div>
        </div>
        <div className="text-xs text-white/40">
          Clicks are tracked from shared links and may update even if a post is not verified yet.
        </div>

        {quest.objectives && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <h2 className="text-lg font-semibold text-white mb-3">Quest Objectives</h2>
            <p className="text-sm text-white/70 whitespace-pre-wrap">{quest.objectives}</p>
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-lg font-semibold text-white mb-3">Quest Guidelines</h2>
          <div className="space-y-2 text-sm text-white/70">
            <div>• Use the provided links below for tracking.</div>
            <div>• Include the brand handle where relevant.</div>
            <div>• Submit your posts before the deadline.</div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">Official Links</h2>
            <span className="text-xs text-white/40">Your tracked URLs per link</span>
          </div>
          {copiedLink && (
            <div className="mb-3 text-xs text-teal-300">Link copied to clipboard.</div>
          )}
          {utmLinks.length === 0 ? (
            <EmptyState icon="🔗" title="No links yet" description="Official links will appear once the quest is configured." />
          ) : (
            <div className="space-y-3">
              {[...utmLinks]
                .sort((a, b) => (a.linkIndex || 0) - (b.linkIndex || 0))
                .map((link: any, idx: number) => {
                  const rawUrl = link.utmUrl || link.url;
                  const fullUrl = origin && rawUrl?.startsWith('/') ? `${origin}${rawUrl}` : rawUrl;
                  return (
                    <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
                      <div>
                        <div className="text-sm text-white/80">
                          {link.linkIndex ? `Link ${link.linkIndex}` : 'Link'}{link.label ? ` • ${link.label}` : ''}
                        </div>
                        <div className="text-xs text-white/40 truncate max-w-[320px]">{fullUrl}</div>
                      </div>
                      <button
                        onClick={() => handleCopy(fullUrl || rawUrl)}
                        className="px-3 py-1.5 text-xs font-semibold bg-white/10 border border-white/20 text-white rounded-lg hover:bg-white/20"
                      >
                        {copiedLink === (fullUrl || rawUrl) ? 'Copied' : 'Copy Link'}
                      </button>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Removed detected tweets helper for cleaner creator UI */}

        {mode === 'creator' ? (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <h2 className="text-lg font-semibold text-white mb-3">Submit Content</h2>
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as any)}
                className="px-3 py-2 text-sm rounded-lg bg-black/80 border border-white/10 text-white"
                style={{ backgroundColor: '#0b0b0b' }}
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p} className="bg-black text-white">
                    {`${PLATFORM_ICONS[p] || ''} ${p.toUpperCase()}`}
                  </option>
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
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white/70 font-semibold">My Submissions</p>
                  {submissions.some((s: any) => String(s.platform).toLowerCase() === 'x') && (
                    <button
                      onClick={handleRefreshX}
                      disabled={refreshingX}
                      className="px-2.5 py-1 text-[11px] bg-white/10 border border-white/20 text-white/80 rounded-lg hover:bg-white/20 disabled:opacity-50"
                    >
                      {refreshingX ? 'Refreshing…' : 'Refresh X stats'}
                    </button>
                  )}
                </div>
                {submissions.map((s: any) => {
                  const platformKey = String(s.platform || '').toLowerCase();
                  const isX = platformKey === 'x';
                  const statusLabel = s.status === 'approved' ? 'approved' : s.status;
                  let trackingLabel = '';
                  if (isX && !s.rejected_reason?.toLowerCase().includes('tweet not found')) {
                    trackingLabel = s.used_campaign_link ? 'Tracked link used' : 'Tracked link not detected';
                  }
                  let postLabel = 'Post received';
                  if (isX) {
                    postLabel = s.status === 'approved' ? 'Post found' : 'Post not verified';
                    if (s.rejected_reason?.toLowerCase().includes('tweet not found')) {
                      postLabel = 'Post not found on X';
                    }
                  }
                  return (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                      <div className="flex flex-col">
                        <span>{PLATFORM_ICONS[s.platform] || '🔗'} {String(s.platform).toUpperCase()} • {statusLabel}</span>
                        <span className="text-[11px] text-white/40">
                          {postLabel}
                          {trackingLabel ? ` • ${trackingLabel}` : ''}
                          {s.rejected_reason ? ` • ${s.rejected_reason}` : ''}
                        </span>
                      </div>
                      <a href={s.post_url} className="text-teal-300">View</a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <h2 className="text-lg font-semibold text-white mb-3">Live Analytics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                <div className="text-xs text-white/40 mb-1">Total Clicks</div>
                <div className="text-2xl font-semibold text-white">{totals.totalClicks}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                <div className="text-xs text-white/40 mb-1">Total Engagement</div>
                <div className="text-2xl font-semibold text-white">{totals.totalEngagement}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                <div className="text-xs text-white/40 mb-1">Engagement Rate</div>
                <div className="text-2xl font-semibold text-white">{totals.engagementRate.toFixed(1)}%</div>
              </div>
            </div>
          </div>
        )}

        {isOwner && mode === 'crm' && (
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
          <h2 className="text-lg font-semibold text-white mb-3">Quest Leaderboard</h2>
          <p className="text-xs text-white/50 mb-3">Analytics for discovery only. No rewards or incentives.</p>
          {leaderboard.length === 0 ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-center text-white/60">
                <div className="text-sm font-semibold text-white/80">Sample Leaderboard</div>
                <div className="text-xs text-white/40">This is how it will look once creators submit content.</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-white/60">
                  <thead>
                    <tr className="text-xs text-white/30 uppercase">
                      <th className="text-left py-2">Rank</th>
                      <th className="text-left py-2">Creator</th>
                      {PLATFORMS.map((p) => (
                        <th key={p} className="text-center py-2">{PLATFORM_ICONS[p]}</th>
                      ))}
                      <th className="text-right py-2">Submitted</th>
                      <th className="text-right py-2">Verified X</th>
                      <th className="text-right py-2">Clicks</th>
                      <th className="text-right py-2">24h</th>
                      <th className="text-right py-2">1h</th>
                      <th className="text-right py-2">Engagement</th>
                      <th className="text-right py-2">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[1, 2, 3].map((rank) => (
                      <tr key={rank} className="opacity-60">
                        <td className="py-3">
                          <span className="px-2 py-1 rounded-md text-xs bg-white/5 text-white/60">{rank}</span>
                        </td>
                        <td className="py-3">@creator_{rank}</td>
                        {PLATFORMS.map((p) => (
                          <td key={p} className="py-3 text-center text-xs text-white/50">—</td>
                        ))}
                        <td className="py-3 text-right">0</td>
                        <td className="py-3 text-right">0</td>
                        <td className="py-3 text-right">0</td>
                        <td className="py-3 text-right">0</td>
                        <td className="py-3 text-right">0</td>
                        <td className="py-3 text-right">0</td>
                        <td className="py-3 text-right">0</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-white/70">
                <thead>
                  <tr className="text-xs text-white/40 uppercase">
                    <th className="text-left py-2">Rank</th>
                    <th className="text-left py-2">Creator</th>
                    {PLATFORMS.map((p) => (
                      <th key={p} className="text-center py-2">{PLATFORM_ICONS[p]}</th>
                    ))}
                    <th className="text-right py-2">Submitted</th>
                    <th className="text-right py-2">Verified X</th>
                    <th className="text-right py-2">X Likes</th>
                    <th className="text-right py-2">X Replies</th>
                    <th className="text-right py-2">X Reposts</th>
                    <th className="text-right py-2">X Views</th>
                    <th className="text-right py-2">Link Clicks</th>
                    <th className="text-right py-2">24h</th>
                    <th className="text-right py-2">1h</th>
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
                            <div className="flex flex-col">
                              <span>@{row.username}</span>
                              {!row.hasSubmissions && (
                                <span className="text-[11px] text-yellow-300">No submissions yet</span>
                              )}
                            </div>
                          </div>
                        </td>
                        {PLATFORMS.map((p) => (
                          <td key={p} className="py-3 text-center text-xs text-white/60">
                            {row.platforms?.[p] || 0}
                          </td>
                        ))}
                        <td className="py-3 text-right">{row.submittedPostsCount || 0}</td>
                        <td className="py-3 text-right">{row.verifiedXPostsCount || 0}</td>
                        <td className="py-3 text-right">{row.xLikes || 0}</td>
                        <td className="py-3 text-right">{row.xReplies || 0}</td>
                        <td className="py-3 text-right">{row.xReposts || 0}</td>
                        <td className="py-3 text-right">{row.xViews || 0}</td>
                        <td className="py-3 text-right">{row.clicks}</td>
                        <td className="py-3 text-right">{row.last24hClicks || 0}</td>
                        <td className="py-3 text-right">{row.last1hClicks || 0}</td>
                        <td className="py-3 text-right font-semibold">{row.totalScore}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          <h2 className="text-lg font-semibold text-white mb-3">Top KOLs</h2>
          {topKols.length === 0 ? (
            <div className="space-y-2">
              <div className="text-sm text-white/60">Sample Top KOLs</div>
              <div className="flex flex-wrap gap-3">
                {['alpha_x', 'beta_yt', 'gamma_tk'].map((name) => (
                  <div key={name} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-black/30 opacity-60">
                    <div className="w-6 h-6 rounded-full bg-white/10" />
                    <span className="text-sm text-white">@{name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {topKols.map((row: any) => (
                <div key={row.creator_profile_id || row.username} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-black/30">
                  {row.avatar_url ? (
                    <img src={row.avatar_url} alt={row.username} className="w-6 h-6 rounded-full border border-white/10" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-white/10" />
                  )}
                  <span className="text-sm text-white">@{row.username}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ArcPageShell>
  );
}
