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
  x: 'X',
  youtube: 'YT',
  tiktok: 'TT',
  telegram: 'TG',
  linkedin: 'IN',
  instagram: 'IG',
  other: 'OT',
};
const PLATFORM_LABELS: Record<string, string> = {
  x: 'X',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  telegram: 'Telegram',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  other: 'Other',
};
const PLATFORM_BADGES: Record<string, string> = {
  x: 'bg-white/10 text-white',
  youtube: 'bg-red-500/20 text-red-300',
  tiktok: 'bg-pink-500/20 text-pink-300',
  telegram: 'bg-sky-500/20 text-sky-300',
  linkedin: 'bg-blue-500/20 text-blue-300',
  instagram: 'bg-purple-500/20 text-purple-300',
  other: 'bg-white/10 text-white/70',
};

function PlatformIcon({
  platform,
  size = 'sm',
}: {
  platform: keyof typeof PLATFORM_ICONS;
  size?: 'sm' | 'md';
}) {
  const sizeClass = size === 'md' ? 'w-8 h-8 text-xs' : 'w-6 h-6 text-[10px]';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-black/40 border border-white/10 ${sizeClass} ${PLATFORM_BADGES[platform]}`}
      title={PLATFORM_LABELS[platform]}
    >
      {platform === 'other' ? (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true">
          <path
            fill="currentColor"
            d="M10.6 13.4a4 4 0 0 1 0-5.7l2-2a4 4 0 1 1 5.7 5.7l-1 1a1 1 0 1 1-1.4-1.4l1-1a2 2 0 0 0-2.9-2.9l-2 2a2 2 0 1 0 2.9 2.9 1 1 0 1 1 1.4 1.4 4 4 0 0 1-5.7 0Zm2.8-2.8a1 1 0 1 1 1.4 1.4 2 2 0 0 0 2.9 2.9l2-2a2 2 0 1 0-2.9-2.9 1 1 0 0 1-1.4-1.4 4 4 0 1 1 5.7 5.7l-2 2a4 4 0 0 1-5.7-5.7Z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" aria-hidden="true">
          {platform === 'x' && (
            <path
              fill="currentColor"
              d="M18.244 2H21l-6.75 7.72L22 22h-6.828l-4.25-5.73L4.88 22H2.05l7.25-8.3L2 2h6.999l3.85 5.162L18.244 2zM16.9 19.7h1.502L7.27 4.18H5.68L16.9 19.7z"
            />
          )}
          {platform === 'youtube' && (
            <>
              <path
                fill="currentColor"
                d="M23.5 7.2a2.9 2.9 0 0 0-2.04-2.05C19.6 4.7 12 4.7 12 4.7s-7.6 0-9.46.45A2.9 2.9 0 0 0 .5 7.2 30.3 30.3 0 0 0 0 12c0 1.6.2 3.2.5 4.8a2.9 2.9 0 0 0 2.04 2.05C4.4 19.3 12 19.3 12 19.3s7.6 0 9.46-.45a2.9 2.9 0 0 0 2.04-2.05A30.3 30.3 0 0 0 24 12c0-1.6-.2-3.2-.5-4.8Z"
              />
              <path fill="#0b0b0b" d="M9.75 15.02V8.98L15.5 12l-5.75 3.02Z" />
            </>
          )}
          {platform === 'tiktok' && (
            <path
              fill="currentColor"
              d="M21 8.2a6.5 6.5 0 0 1-3.77-1.2v7.2a5.5 5.5 0 1 1-5.5-5.5c.2 0 .41.02.61.05v2.7a2.8 2.8 0 1 0 2.8 2.75V2h2.7a6.5 6.5 0 0 0 3.16 3.8Z"
            />
          )}
          {platform === 'telegram' && (
            <path
              fill="currentColor"
              d="M22.5 3.5 2.9 11.2c-1.3.5-1.3 1.2-.2 1.6l5 1.6 1.9 5.8c.2.6.4.8 1 .8l2.8-2.7 5.8 4.2c1 .6 1.8.3 2.1-1l3.8-17.8c.4-1.6-.6-2.3-2-1.7Zm-5.4 4.7-8.6 7.8-.3 3.3-1.4-4.4 10.3-6.7Z"
            />
          )}
          {platform === 'linkedin' && (
            <>
              <path fill="currentColor" d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5ZM.2 8h4.6v14H.2V8Zm7.1 0h4.4v1.9h.1c.6-1.1 2.1-2.3 4.4-2.3 4.7 0 5.6 3.1 5.6 7.1V22h-4.6v-6.4c0-1.5 0-3.5-2.1-3.5s-2.4 1.7-2.4 3.4V22H7.3V8Z" />
            </>
          )}
          {platform === 'instagram' && (
            <>
              <path
                fill="currentColor"
                d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2.3A2.7 2.7 0 0 0 4.3 7v10A2.7 2.7 0 0 0 7 19.7h10A2.7 2.7 0 0 0 19.7 17V7A2.7 2.7 0 0 0 17 4.3H7Z"
              />
              <path fill="currentColor" d="M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2.3A2.7 2.7 0 1 0 12 14.7 2.7 2.7 0 0 0 12 9.3Zm5.7-3.1a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z" />
            </>
          )}
        </svg>
      )}
    </span>
  );
}

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
                    <span className="flex items-center gap-2">
                      {PLATFORM_ICONS[s.platform] ? <PlatformIcon platform={s.platform} /> : '🔗'}
                      {PLATFORM_LABELS[s.platform] || s.platform?.toUpperCase()}
                    </span>
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
                          <span className="flex items-center gap-2">
                            {PLATFORM_ICONS[s.platform] ? <PlatformIcon platform={s.platform} /> : '🔗'}
                            {PLATFORM_LABELS[s.platform] || s.platform?.toUpperCase()}
                          </span>
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
