import React, { useEffect, useState } from 'react';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { useAkariUser } from '@/lib/akari-auth';
import { isSuperAdmin } from '@/lib/permissions';
import { ErrorState } from '@/components/arc/ErrorState';
import { EmptyState } from '@/components/arc/EmptyState';

export default function SuperAdminQuests() {
  const akariUser = useAkariUser();
  const canAccess = isSuperAdmin(akariUser.user);
  const [quests, setQuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portal/superadmin/quests', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load approvals');
      setQuests(data.quests || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load approvals');
      setQuests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canAccess) load();
  }, [canAccess]);

  const updateStatus = async (questId: string, status: string) => {
    await fetch('/api/portal/superadmin/quests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ questId, status }),
    });
    load();
  };

  const updateQuestState = async (questId: string, status: string) => {
    await fetch(`/api/portal/brands/quests/${questId}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status }),
    });
    load();
  };

  const handleGlobalRefresh = async () => {
    setRefreshingAll(true);
    try {
      await fetch('/api/portal/superadmin/refresh-x', {
        method: 'POST',
        credentials: 'include',
      });
      load();
    } finally {
      setRefreshingAll(false);
    }
  };

  if (!canAccess) {
    return (
      <ArcPageShell hideRightRail>
        <ErrorState message="Superadmin access required." />
      </ArcPageShell>
    );
  }

  return (
    <ArcPageShell hideRightRail>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Quest Approvals</h1>
            <p className="text-sm text-white/60">Approve or reject quest launch requests.</p>
          </div>
          <button
            onClick={handleGlobalRefresh}
            disabled={refreshingAll}
            className="px-3 py-1.5 text-xs font-semibold bg-white/10 border border-white/20 text-white/80 rounded-lg hover:bg-white/20 disabled:opacity-50"
          >
            {refreshingAll ? 'Refreshing…' : 'Refresh X stats (all)'}
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-white/60">Loading approvals...</div>
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : quests.length === 0 ? (
          <EmptyState icon="✅" title="No pending quests" description="All quest launch requests are approved." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {quests.map((quest) => (
              <div key={quest.id} className="rounded-xl border border-white/10 bg-black/40 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Quest</div>
                    <div className="text-base font-semibold text-white">{quest.name}</div>
                    {quest.brand?.name && <div className="text-xs text-white/50">{quest.brand.name}</div>}
                  </div>
                  {quest.brand?.logo_url ? (
                    <img src={quest.brand.logo_url} alt={quest.brand.name} className="w-10 h-10 rounded-full border border-white/10" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-sm text-white/60">
                      {(quest.brand?.name || 'B').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="text-xs text-white/40">
                  Requested: {quest.launch_requested_at ? new Date(quest.launch_requested_at).toLocaleDateString() : 'n/a'}
                </div>
                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => updateStatus(quest.id, 'approved')}
                    className="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-300 rounded-lg"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => updateStatus(quest.id, 'rejected')}
                    className="px-2 py-1 text-xs bg-red-500/20 text-red-300 rounded-lg"
                  >
                    Reject
                  </button>
                </div>
                {quest.launch_status === 'approved' && quest.status !== 'ended' && (
                  <div className="flex gap-2 mt-3">
                    {quest.status === 'active' ? (
                      <button
                        onClick={() => updateQuestState(quest.id, 'paused')}
                        className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-300 rounded-lg"
                      >
                        Pause
                      </button>
                    ) : (
                      <button
                        onClick={() => updateQuestState(quest.id, 'active')}
                        className="px-2 py-1 text-xs bg-emerald-500/20 text-emerald-300 rounded-lg"
                      >
                        Resume
                      </button>
                    )}
                    <button
                      onClick={() => updateQuestState(quest.id, 'ended')}
                      className="px-2 py-1 text-xs bg-red-500/20 text-red-300 rounded-lg"
                    >
                      End
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ArcPageShell>
  );
}
