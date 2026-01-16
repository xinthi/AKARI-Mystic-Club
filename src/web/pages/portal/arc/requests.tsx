import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { EmptyState } from '@/components/arc/EmptyState';
import { ErrorState } from '@/components/arc/ErrorState';

export default function ArcRequests() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/brands/requests', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load requests');
      }
      setRequests(data.requests || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load requests');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const handleUpdate = async (requestId: string, status: string, questId: string) => {
    await fetch(`/api/portal/brands/quests/${questId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ creatorId: requestId, status }),
    });
    loadRequests();
  };

  return (
    <ArcPageShell hideRightRail>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Requests</h1>
          <p className="text-white/60">Approve or reject creator join requests.</p>
        </div>

        {loading ? (
          <div className="rounded-xl border border-white/10 bg-black/40 p-6 text-white/60">Loading requests...</div>
        ) : error ? (
          <ErrorState message={error} onRetry={loadRequests} />
        ) : requests.length === 0 ? (
          <EmptyState icon="🧾" title="No requests" description="Creator requests will appear here." />
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 bg-black/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-white">@{r.username || 'unknown'}</div>
                  <div className="text-xs text-white/50">
                    {r.brand_name} • <Link href={`/portal/arc/quests/${r.campaign_id}`} className="text-teal-300">{r.quest_name}</Link>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdate(r.id, 'approved', r.campaign_id)}
                    className="px-2 py-1 text-xs bg-green-500/20 text-green-300 rounded-lg"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleUpdate(r.id, 'rejected', r.campaign_id)}
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
    </ArcPageShell>
  );
}
