/**
 * Creator My Submissions
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { EmptyState } from '@/components/arc/EmptyState';
import { ErrorState } from '@/components/arc/ErrorState';
import { createPortalClient } from '@/lib/portal/supabase';

const PLATFORM_ICONS: Record<string, string> = {
  x: '𝕏',
  youtube: '▶️',
  tiktok: '🎵',
  telegram: '✈️',
  linkedin: '💼',
  instagram: '📸',
};

export default function MySubmissions() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSubmissions = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/brands/quests/my-submissions', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load submissions');
      }
      setSubmissions(data.submissions || []);
      setProfileId(data.profileId || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load submissions');
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubmissions();
  }, []);

  useEffect(() => {
    if (!profileId) return;
    const supabase = createPortalClient();
    const channel = supabase
      .channel(`my-submissions-${profileId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaign_submissions', filter: `creator_profile_id=eq.${profileId}` },
        () => loadSubmissions()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaign_utm_events', filter: `creator_profile_id=eq.${profileId}` },
        () => loadSubmissions()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId]);

  const skeletons = useMemo(
    () =>
      Array.from({ length: 6 }).map((_, idx) => (
        <div key={idx} className="rounded-xl border border-white/10 bg-black/40 p-5 animate-pulse">
          <div className="h-4 w-24 bg-white/10 rounded mb-3" />
          <div className="h-5 w-2/3 bg-white/10 rounded mb-2" />
          <div className="h-3 w-full bg-white/10 rounded" />
        </div>
      )),
    []
  );

  return (
    <ArcPageShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">My Submissions</h1>
          <p className="text-white/60">Track everything you submitted across quests.</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{skeletons}</div>
        ) : error ? (
          <ErrorState message={error} onRetry={loadSubmissions} />
        ) : submissions.length === 0 ? (
          <EmptyState icon="🧾" title="No submissions yet" description="Join a campaign and submit your posts." />
        ) : (
          <>
            {/* Mobile cards */}
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {submissions.map((s) => (
                <div key={s.id} className="rounded-xl border border-white/10 bg-black/40 p-5">
                  <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-white/40">Quest</div>
                    <span className="px-2 py-1 rounded-full text-[11px] bg-white/10 border border-white/10 text-white/70">
                      {s.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {s.campaign?.brand?.logo_url ? (
                      <img src={s.campaign.brand.logo_url} alt={s.campaign.brand.name} className="w-8 h-8 rounded-full border border-white/10" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xs text-white/60">
                        {(s.campaign?.brand?.name || 'B').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div>
                  <Link href={`/portal/arc/quests/${s.campaign_id}`} className="text-lg text-white font-semibold block">
                    {s.campaign?.name || 'Quest'}
                      </Link>
                      <div className="text-xs text-white/50">{s.campaign?.brand?.name || 'Brand'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-white/60 mt-3">
                    <span>{PLATFORM_ICONS[s.platform] || '🔗'} {s.platform?.toUpperCase()}</span>
                    <a href={s.post_url} className="text-teal-300">Open Post</a>
                  </div>
                  <div className="flex items-center justify-between text-xs text-white/50 mt-3">
                    <span>{new Date(s.submitted_at).toLocaleDateString()}</span>
                    <span>Clicks: {s.clicks}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block rounded-xl border border-white/10 bg-black/40 p-6 overflow-x-auto">
              <table className="w-full text-sm text-white/70">
                <thead>
                  <tr className="text-xs text-white/40 uppercase">
                    <th className="text-left py-2">Quest</th>
                    <th className="text-left py-2">Brand</th>
                    <th className="text-left py-2">Platform</th>
                    <th className="text-left py-2">Post</th>
                    <th className="text-left py-2">Submitted</th>
                    <th className="text-left py-2">Status</th>
                    <th className="text-right py-2">Clicks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {submissions.map((s) => (
                    <tr key={s.id} className="hover:bg-white/5">
                      <td className="py-3">
                      <Link href={`/portal/arc/quests/${s.campaign_id}`} className="text-white hover:text-teal-300">
                          {s.campaign?.name || 'Quest'}
                        </Link>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2 text-white/60">
                          {s.campaign?.brand?.logo_url ? (
                            <img src={s.campaign.brand.logo_url} alt={s.campaign.brand.name} className="w-6 h-6 rounded-full border border-white/10" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-[10px] text-white/60">
                              {(s.campaign?.brand?.name || 'B').slice(0, 1).toUpperCase()}
                            </div>
                          )}
                          <span>{s.campaign?.brand?.name || 'Brand'}</span>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs">
                          {PLATFORM_ICONS[s.platform] || '🔗'} {s.platform?.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3">
                        <a href={s.post_url} className="text-teal-300 hover:text-teal-200">
                          View
                        </a>
                      </td>
                      <td className="py-3 text-white/60">{new Date(s.submitted_at).toLocaleDateString()}</td>
                      <td className="py-3">
                        <span className="px-2 py-1 rounded-full text-[11px] bg-white/10 border border-white/10 text-white/70">
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 text-right">{s.clicks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </ArcPageShell>
  );
}
