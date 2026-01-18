/**
 * Brand Detail Page
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { ErrorState } from '@/components/arc/ErrorState';
import { EmptyState } from '@/components/arc/EmptyState';
import { useArcMode } from '@/lib/arc/useArcMode';

export default function BrandDetail() {
  const router = useRouter();
  const { brandId } = router.query;
  const { mode } = useArcMode();
  const analyticsView = mode === 'crm' && router.query.view === 'analytics';

  const [brand, setBrand] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [membersCount, setMembersCount] = useState(0);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [inviteHandles, setInviteHandles] = useState<Record<string, string>>({});
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
    startAt: '',
    endAt: '',
    links: [{ label: '', url: '', linkIndex: 1 }],
  });
  const [campaignError, setCampaignError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    xHandle: '',
    website: '',
    tgCommunity: '',
    tgChannel: '',
    briefText: '',
    logoUrl: '',
    bannerUrl: '',
  });

  const loadBrand = useCallback(async () => {
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
      setMembersCount(Number(data.membersCount || 0));
      setPendingRequests(data.pendingRequests || []);
      setAnalytics(data.analytics || null);
      setSeries(data.series || []);
      setEditForm({
        name: data.brand?.name || '',
        xHandle: data.brand?.x_handle ? `@${data.brand.x_handle.replace(/^@+/, '')}` : '',
        website: data.brand?.website || '',
        tgCommunity: data.brand?.tg_community || '',
        tgChannel: data.brand?.tg_channel || '',
        briefText: data.brand?.brief_text || '',
        logoUrl: data.brand?.logo_url || '',
        bannerUrl: data.brand?.banner_url || '',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load brand');
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    loadBrand();
  }, [loadBrand]);

  useEffect(() => {
    if (router.query.create === '1') {
      setShowCreate(true);
    }
  }, [router.query.create]);

  const handleCreateCampaign = async () => {
    if (!brandId || typeof brandId !== 'string') return;
    if (!campaignForm.name.trim()) return;
    if (!campaignForm.startAt || !campaignForm.endAt) {
      setCampaignError('Start and end dates are required.');
      return;
    }
    const startMs = new Date(campaignForm.startAt).getTime();
    const endMs = new Date(campaignForm.endAt).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      setCampaignError('End date must be after start date.');
      return;
    }
    if (endMs - startMs < 7 * 24 * 60 * 60 * 1000) {
      setCampaignError('Quest must run for at least 7 days.');
      return;
    }
    setCampaignError(null);
    const links = campaignForm.links.filter((l) => l.url.trim().length > 0).slice(0, 5);
    const languages = campaignForm.languages
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);

    const res = await fetch(`/api/portal/brands/${brandId}/quests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        name: campaignForm.name.trim(),
        objectives: campaignForm.objectives.trim(),
        campaignType: campaignForm.campaignType,
        languages,
        startAt: campaignForm.startAt || null,
        endAt: campaignForm.endAt || null,
        links,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      setCampaignError(data.error || 'Failed to create campaign');
      return;
    }
    setShowCreate(false);
    setCampaignError(null);
      setCampaignForm({
        name: '',
        pitch: '',
        objectives: '',
        campaignType: 'public',
        languages: '',
        startAt: '',
        endAt: '',
        links: [{ label: '', url: '', linkIndex: 1 }],
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

  const handleRequestUpdate = async (creatorId: string, status: string, campaignId: string) => {
    await fetch(`/api/portal/brands/quests/${campaignId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ creatorId, status }),
    });
    loadBrand();
  };

  const handleInviteCreator = async (campaignId: string) => {
    const handle = inviteHandles[campaignId] || '';
    if (!handle.trim()) return;
    await fetch(`/api/portal/brands/quests/${campaignId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: handle }),
    });
    setInviteHandles((prev) => ({ ...prev, [campaignId]: '' }));
    loadBrand();
  };

  const handleQuestState = async (campaignId: string, nextStatus: 'paused' | 'ended' | 'active') => {
    await fetch(`/api/portal/brands/quests/${campaignId}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: nextStatus }),
    });
    loadBrand();
  };

  const uploadImage = async (file: File, prefix: 'logo' | 'banner') => {
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File size exceeds 10MB limit');
    }
    await fetch('/api/portal/brands/storage/ensure', { credentials: 'include' });
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'png';
    const fileName = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;
    const filePath = `brand-assets/${fileName}`;
    const signRes = await fetch('/api/portal/brands/storage/signed-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ path: filePath }),
    });
    const signData = await signRes.json();
    if (!signRes.ok || !signData.ok) {
      throw new Error(signData.error || 'Failed to prepare upload');
    }
    const putRes = await fetch(signData.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || `image/${safeExt}` },
      body: file,
    });
    if (!putRes.ok) {
      throw new Error('Failed to upload image');
    }
    return signData.publicUrl as string;
  };

  const handleSaveBrand = async () => {
    if (!brandId || typeof brandId !== 'string') return;
    setSavingBrand(true);
    try {
      const res = await fetch(`/api/portal/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to update brand');
      }
      setEditMode(false);
      loadBrand();
    } catch (err: any) {
      setError(err.message || 'Failed to update brand');
    } finally {
      setSavingBrand(false);
    }
  };

  const handleDeleteBrand = async () => {
    if (!brandId || typeof brandId !== 'string') return;
    if (!window.confirm('Delete this brand? This will remove all quests and data.')) return;
    const res = await fetch(`/api/portal/brands/${brandId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.error || 'Failed to delete brand');
      return;
    }
    router.push('/portal/arc/brands');
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
        <div className="rounded-xl border border-white/10 bg-black/40 p-6">
          {brand.banner_url && (
            <div className="mb-4 overflow-hidden rounded-xl border border-white/10">
              <img src={brand.banner_url} alt={`${brand.name} banner`} className="w-full h-36 object-cover" />
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{brand.name}</h1>
              {brand.x_handle && (
                <div className="text-sm text-white/60">@{brand.x_handle.replace(/^@+/, '')}</div>
              )}
              {brand.brief_text && <p className="text-sm text-white/60 mt-2">{brand.brief_text}</p>}
              {brand.verification_status && (
                <div className="mt-2 inline-flex items-center gap-2 text-xs">
                  <span className="text-white/50">Verification:</span>
                  <span
                    className={`px-2 py-0.5 rounded-full border ${
                      brand.verification_status === 'approved'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : brand.verification_status === 'rejected'
                        ? 'bg-red-500/20 text-red-300 border-red-500/40'
                        : 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
                    }`}
                  >
                    {brand.verification_status}
                  </span>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-white/50">
                {brand.website && <span>Website: {brand.website}</span>}
                {brand.tg_community && <span>Community: {brand.tg_community}</span>}
                {brand.tg_channel && <span>Channel: {brand.tg_channel}</span>}
              </div>
              <div className="mt-3 text-xs text-white/40">Members: {membersCount}</div>
            </div>
            <div className="flex flex-col items-end gap-3">
              {brand.logo_url ? (
                <img src={brand.logo_url} alt={brand.name} className="w-14 h-14 rounded-full border border-white/10" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-sm text-white/60">
                  {(brand.name || 'B').slice(0, 1).toUpperCase()}
                </div>
              )}
              {!isOwner && (
                <button
                  onClick={handleJoinBrand}
                  className="px-3 py-1.5 text-xs font-medium bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10 transition-colors"
                >
                  Join Brand
                </button>
              )}
              {isOwner && (
                <div className="px-3 py-1.5 text-xs font-medium bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-lg">
                  Owner
                </div>
              )}
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Brand Settings</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditMode((prev) => !prev)}
                  className="px-3 py-1.5 text-xs font-semibold bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10"
                >
                  {editMode ? 'Close' : 'Edit'}
                </button>
                <button
                  onClick={handleDeleteBrand}
                  className="px-3 py-1.5 text-xs font-semibold bg-red-500/20 border border-red-500/40 text-red-300 rounded-lg hover:bg-red-500/30"
                >
                  Delete
                </button>
              </div>
            </div>
            {editMode && (
              <div className="space-y-3">
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Brand name"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                />
                <input
                  value={editForm.xHandle}
                  onChange={(e) => setEditForm({ ...editForm, xHandle: e.target.value })}
                  placeholder="X handle"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                />
                <input
                  value={editForm.website}
                  onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                  placeholder="Website"
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    value={editForm.tgCommunity}
                    onChange={(e) => setEditForm({ ...editForm, tgCommunity: e.target.value })}
                    placeholder="Telegram community"
                    className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                  />
                  <input
                    value={editForm.tgChannel}
                    onChange={(e) => setEditForm({ ...editForm, tgChannel: e.target.value })}
                    placeholder="Telegram channel"
                    className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-white/60">
                    Logo Image
                    <input
                      type="file"
                      accept="image/*"
                      className="mt-2 w-full text-xs text-white/70"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setUploading(true);
                          uploadImage(file, 'logo')
                            .then((url) => setEditForm((prev) => ({ ...prev, logoUrl: url })))
                            .catch((err: any) => setError(err.message || 'Failed to upload logo'))
                            .finally(() => setUploading(false));
                        }
                      }}
                    />
                  </label>
                  <label className="text-xs text-white/60">
                    Banner Image
                    <input
                      type="file"
                      accept="image/*"
                      className="mt-2 w-full text-xs text-white/70"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setUploading(true);
                          uploadImage(file, 'banner')
                            .then((url) => setEditForm((prev) => ({ ...prev, bannerUrl: url })))
                            .catch((err: any) => setError(err.message || 'Failed to upload banner'))
                            .finally(() => setUploading(false));
                        }
                      }}
                    />
                  </label>
                </div>
                <textarea
                  value={editForm.briefText}
                  onChange={(e) => setEditForm({ ...editForm, briefText: e.target.value })}
                  placeholder="Brief / overview"
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveBrand}
                    disabled={savingBrand || uploading}
                    className="px-4 py-2 text-sm font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-lg hover:bg-teal-500/30 disabled:opacity-50"
                  >
                    {savingBrand ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {isOwner && analytics && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Live Analytics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                <div className="text-xs text-white/40 mb-1">Tracking Since</div>
                <div className="text-sm text-white">
                  {analytics.trackingSince ? new Date(analytics.trackingSince).toLocaleDateString() : '—'}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                <div className="text-xs text-white/40 mb-1">Total Quests</div>
                <div className="text-2xl font-semibold text-white">{analytics.totalQuests || 0}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                <div className="text-xs text-white/40 mb-1">Total Submissions</div>
                <div className="text-2xl font-semibold text-white">{analytics.totalSubmissions || 0}</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/30 p-4">
                <div className="text-xs text-white/40 mb-1">Total Clicks</div>
                <div className="text-2xl font-semibold text-white">{analytics.totalClicks || 0}</div>
              </div>
            </div>
            <p className="text-xs text-white/40 mt-3">Analytics for discovery only. No rewards.</p>
          </div>
        )}

        {analyticsView && isOwner && series.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Performance Trends</h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <AnalyticsChart
                title="Clicks (last 30d)"
                color="#00F6A2"
                data={series.map((d: any) => ({ label: d.date, value: d.clicks }))}
              />
              <AnalyticsChart
                title="Submissions (last 30d)"
                color="#60A5FA"
                data={series.map((d: any) => ({ label: d.date, value: d.submissions }))}
              />
              <AnalyticsChart
                title="Verified X (last 30d)"
                color="#FBBF24"
                data={series.map((d: any) => ({ label: d.date, value: d.verifiedX }))}
              />
            </div>
          </div>
        )}

        {analyticsView && isOwner && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Quest Analytics</h2>
            {campaigns.length === 0 ? (
              <EmptyState icon="📊" title="No quests yet" description="Quest analytics will appear once a quest is launched." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {campaigns.map((campaign) => (
                  <Link
                    key={campaign.id}
                    href={`/portal/arc/quests/${campaign.id}`}
                    className="rounded-xl border border-white/10 bg-black/30 p-5 hover:border-teal-400/40 hover:shadow-[0_0_20px_rgba(0,246,162,0.12)] transition-all hover:-translate-y-0.5"
                  >
                    <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Quest</div>
                    <div className="text-base font-semibold text-white">{campaign.name}</div>
                    <div className="text-xs text-white/50 mt-1">
                      Type: {campaign.campaign_type} • Launch: {campaign.launch_status || 'active'}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/60">
                      <div>Clicks: {campaign.totalClicks || 0}</div>
                      <div>24h: {campaign.last24hClicks || 0}</div>
                      <div>Submissions: {campaign.totalSubmissions || 0}</div>
                      <div>Verified X: {campaign.verifiedX || 0}</div>
                      <div>Engagement: {campaign.engagementScore || 0}</div>
                      <div>Link Uses: {campaign.usedLinkCount || 0}</div>
                    </div>
                    <div className="mt-2 text-xs text-white/50">
                      Started: {campaign.start_at ? new Date(campaign.start_at).toLocaleDateString() : 'TBD'}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {analyticsView && isOwner && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Join Requests</h2>
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-white/60">No pending requests.</p>
            ) : (
              <div className="space-y-2">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="text-sm text-white">
                      @{req.username || 'unknown'} • <span className="text-white/60">{req.campaign_name}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRequestUpdate(req.id, 'approved', req.campaign_id)}
                        className="px-2 py-1 text-xs bg-green-500/20 text-green-300 rounded-lg"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRequestUpdate(req.id, 'rejected', req.campaign_id)}
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

        {analyticsView && isOwner && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Invite Creators / KOLs</h2>
            {campaigns.length === 0 ? (
              <p className="text-sm text-white/60">Create a quest to invite creators.</p>
            ) : (
              <div className="space-y-3">
                {campaigns.map((campaign) => (
                  <div key={campaign.id} className="rounded-lg border border-white/10 bg-black/30 p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-sm text-white font-semibold">{campaign.name}</div>
                        <div className="text-xs text-white/50">Type: {campaign.campaign_type} • Status: {campaign.status}</div>
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <input
                          value={inviteHandles[campaign.id] || ''}
                          onChange={(e) => setInviteHandles((prev) => ({ ...prev, [campaign.id]: e.target.value }))}
                          placeholder="X handle (e.g. @creator)"
                          className="flex-1 sm:w-56 px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-white"
                        />
                        <button
                          onClick={() => handleInviteCreator(campaign.id)}
                          className="px-3 py-2 text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded-lg hover:bg-purple-500/30"
                        >
                          Invite
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!analyticsView && isOwner && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-4">
            <button
              onClick={() => setShowCreate((prev) => !prev)}
              className="px-3 py-1.5 text-xs font-medium bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10 transition-colors"
            >
              {showCreate ? 'Close' : 'Launch Quest'}
            </button>
            {showCreate && (
              <div className="mt-4 space-y-3">
                <input
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })}
                  placeholder="Quest name"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={campaignForm.startAt}
                    onChange={(e) => setCampaignForm({ ...campaignForm, startAt: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                  />
                  <input
                    type="date"
                    value={campaignForm.endAt}
                    onChange={(e) => setCampaignForm({ ...campaignForm, endAt: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                  />
                </div>
                {campaignError && (
                  <div className="text-xs text-red-300">{campaignError}</div>
                )}
                <div className="grid gap-2">
                  {campaignForm.links.map((link, idx) => (
                    <div key={idx} className="flex flex-col sm:flex-row gap-2">
                      <input
                        value={link.label}
                        onChange={(e) => {
                          const next = [...campaignForm.links];
                          next[idx] = { ...next[idx], label: e.target.value };
                          setCampaignForm({ ...campaignForm, links: next });
                        }}
                        placeholder="Link label"
                        className="sm:w-1/3 px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
                      />
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={link.linkIndex || 1}
                        onChange={(e) => {
                          const next = [...campaignForm.links];
                          next[idx] = { ...next[idx], linkIndex: Number(e.target.value) };
                          setCampaignForm({ ...campaignForm, links: next });
                        }}
                        placeholder="Index"
                        className="sm:w-24 px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white"
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
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      if (campaignForm.links.length >= 5) return;
                      const nextIndex = Math.min(5, campaignForm.links.length + 1);
                      setCampaignForm({
                        ...campaignForm,
                        links: [...campaignForm.links, { label: '', url: '', linkIndex: nextIndex }],
                      });
                    }}
                    className="px-3 py-1.5 text-xs font-medium bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    Add Link
                  </button>
                  {campaignForm.links.length > 1 && (
                    <button
                      onClick={() => {
                        setCampaignForm({
                          ...campaignForm,
                          links: campaignForm.links.slice(0, -1),
                        });
                      }}
                      className="px-3 py-1.5 text-xs font-medium bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      Remove Last
                    </button>
                  )}
                </div>
                <button
                  onClick={handleCreateCampaign}
                  className="px-4 py-2 text-sm font-medium bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-lg hover:bg-teal-500/30 transition-colors"
                >
                  Request Quest Launch
                </button>
              </div>
            )}
          </div>
        )}

        {!analyticsView && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Quests</h2>
            {campaigns.length === 0 ? (
              <EmptyState
                icon="🚀"
                title="No quests yet"
                description="Quests will appear here when available."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {campaigns.map((campaign) => (
                  <Link
                    key={campaign.id}
                    href={`/portal/arc/quests/${campaign.id}`}
                    className="block rounded-xl border border-white/10 bg-black/30 p-5 hover:border-teal-400/40 hover:shadow-[0_0_20px_rgba(0,246,162,0.12)] transition-all hover:-translate-y-0.5"
                  >
                    <div className="text-xs uppercase tracking-wider text-white/40 mb-2">Quest</div>
                    <div className="text-base font-semibold text-white">{campaign.name}</div>
                    {campaign.pitch && <div className="text-xs text-white/60 mt-2 line-clamp-2">{campaign.pitch}</div>}
                    <div className="text-xs text-white/50 mt-3">
                      Type: {campaign.campaign_type} • Status: {campaign.status}
                      {campaign.launch_status ? ` • Launch: ${campaign.launch_status}` : ''}
                    </div>
                    {isOwner && campaign.status !== 'ended' && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {campaign.status === 'active' ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              handleQuestState(campaign.id, 'paused');
                            }}
                            className="px-2.5 py-1 text-[11px] bg-yellow-500/20 text-yellow-300 rounded-lg"
                          >
                            Pause
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              handleQuestState(campaign.id, 'active');
                            }}
                            className="px-2.5 py-1 text-[11px] bg-emerald-500/20 text-emerald-300 rounded-lg"
                          >
                            Resume
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            handleQuestState(campaign.id, 'ended');
                          }}
                          className="px-2.5 py-1 text-[11px] bg-red-500/20 text-red-300 rounded-lg"
                        >
                          End
                        </button>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {!analyticsView && isOwner && (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Pending Requests</h2>
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-white/60">No pending requests.</p>
            ) : (
              <div className="space-y-2">
                {pendingRequests.map((req) => (
                  <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/30 p-3">
                    <div className="text-sm text-white">
                      @{req.username || 'unknown'} • <span className="text-white/60">{req.campaign_name}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRequestUpdate(req.id, 'approved', req.campaign_id)}
                        className="px-2 py-1 text-xs bg-green-500/20 text-green-300 rounded-lg"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleRequestUpdate(req.id, 'rejected', req.campaign_id)}
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
      </div>
    </ArcPageShell>
  );
}

type AnalyticsPoint = { label: string; value: number };

function AnalyticsChart({ title, data, color }: { title: string; data: AnalyticsPoint[]; color: string }) {
  const [type, setType] = useState<'line' | 'bar'>('line');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const width = 360;
  const height = 160;
  const paddingX = 24;
  const paddingY = 20;
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const plotWidth = width - paddingX * 2;
  const plotHeight = height - paddingY * 2;

  const getX = (index: number) => paddingX + (index / Math.max(1, data.length - 1)) * plotWidth;
  const getY = (value: number) => paddingY + plotHeight - (value / maxVal) * plotHeight;

  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.value)}`)
    .join(' ');

  const handleHover = (evt: React.MouseEvent<SVGSVGElement>) => {
    if (data.length === 0) return;
    const rect = evt.currentTarget.getBoundingClientRect();
    const x = evt.clientX - rect.left - paddingX;
    const idx = Math.round((x / plotWidth) * (data.length - 1));
    const clamped = Math.max(0, Math.min(data.length - 1, idx));
    setHoverIndex(clamped);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-white/80">{title}</div>
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
          <button
            onClick={() => setType('line')}
            className={`px-2 py-1 text-xs rounded-md ${
              type === 'line' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            Line
          </button>
          <button
            onClick={() => setType('bar')}
            className={`px-2 py-1 text-xs rounded-md ${
              type === 'bar' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            Bar
          </button>
        </div>
      </div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        onMouseMove={handleHover}
        onMouseLeave={() => setHoverIndex(null)}
        className="rounded-lg bg-black/30 border border-white/5"
      >
        <path d={`M ${paddingX} ${paddingY + plotHeight} L ${paddingX + plotWidth} ${paddingY + plotHeight}`} stroke="#1f2937" />
        <path d={`M ${paddingX} ${paddingY} L ${paddingX} ${paddingY + plotHeight}`} stroke="#1f2937" />
        {type === 'line' && data.length > 0 && (
          <>
            <path d={linePath} fill="none" stroke={color} strokeWidth="2" />
            {data.map((d, i) => (
              <circle key={d.label} cx={getX(i)} cy={getY(d.value)} r="2.5" fill={color} />
            ))}
          </>
        )}
        {type === 'bar' &&
          data.map((d, i) => {
            const x = getX(i) - 3;
            const y = getY(d.value);
            const barHeight = paddingY + plotHeight - y;
            return <rect key={d.label} x={x} y={y} width="6" height={barHeight} fill={color} opacity="0.85" />;
          })}
        {hoverIndex !== null && data[hoverIndex] && (
          <>
            <line x1={getX(hoverIndex)} x2={getX(hoverIndex)} y1={paddingY} y2={paddingY + plotHeight} stroke="#ffffff33" />
            <text x={getX(hoverIndex)} y={paddingY - 4} fill="#ffffffb0" fontSize="10" textAnchor="middle">
              {data[hoverIndex].value}
            </text>
          </>
        )}
      </svg>
      {hoverIndex !== null && data[hoverIndex] && (
        <div className="mt-2 text-[11px] text-white/50">
          {data[hoverIndex].label} • {data[hoverIndex].value}
        </div>
      )}
    </div>
  );
}
