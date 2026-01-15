/**
 * ARC Private Board Detail
 */

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArcPageShell } from '@/components/arc/fb/ArcPageShell';
import { ErrorState } from '@/components/arc/ErrorState';
import { EmptyState } from '@/components/arc/EmptyState';

export default function PrivateBoardDetail() {
  const router = useRouter();
  const { boardId } = router.query;

  const [board, setBoard] = useState<any>(null);
  const [kols, setKols] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [inviteUsernames, setInviteUsernames] = useState('');
  const [inviting, setInviting] = useState(false);
  const [updatingKol, setUpdatingKol] = useState<string | null>(null);

  const loadBoard = async () => {
    if (!boardId || typeof boardId !== 'string') return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/arc/private-boards/${boardId}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load board');
      }
      setBoard(data.board);
      setKols(data.kols || []);
      setCanManage(!!data.canManage);
    } catch (err: any) {
      setError(err.message || 'Failed to load board');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
  }, [boardId]);

  const handleInvite = async () => {
    if (!boardId || typeof boardId !== 'string') return;
    const usernames = inviteUsernames
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
    if (usernames.length === 0) return;

    setInviting(true);
    try {
      const res = await fetch(`/api/portal/arc/private-boards/${boardId}/kols`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ usernames }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to add KOLs');
      }
      setInviteUsernames('');
      await loadBoard();
    } catch (err: any) {
      setError(err.message || 'Failed to add KOLs');
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateStatus = async (kolId: string, status: string) => {
    if (!boardId || typeof boardId !== 'string') return;
    setUpdatingKol(kolId);
    try {
      const res = await fetch(`/api/portal/arc/private-boards/${boardId}/kols/${kolId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to update status');
      }
      await loadBoard();
    } catch (err: any) {
      setError(err.message || 'Failed to update status');
    } finally {
      setUpdatingKol(null);
    }
  };

  if (loading) {
    return (
      <ArcPageShell>
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
          <span className="ml-3 text-white/60 text-sm">Loading board...</span>
        </div>
      </ArcPageShell>
    );
  }

  if (error || !board) {
    return (
      <ArcPageShell>
        <ErrorState message={error || 'Board not found'} onRetry={loadBoard} />
      </ArcPageShell>
    );
  }

  const displayKols = canManage
    ? [...kols].sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0))
    : kols;

  return (
    <ArcPageShell>
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm text-white/60">
          <Link href="/portal/arc" className="hover:text-white transition-colors">
            ARC Home
          </Link>
          <span>/</span>
          <span className="text-white">Private Board</span>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <h1 className="text-2xl font-bold text-white mb-2">{board.title}</h1>
          {board.description && <p className="text-white/60 mb-2">{board.description}</p>}
          <p className="text-xs text-white/50 mb-2">
            Analytics-only rankings (no post-to-earn incentives).
          </p>
          <div className="text-xs text-white/50">Status: {board.status}</div>
        </div>

        {canManage && (
          <div className="rounded-lg border border-white/10 bg-black/40 p-6">
            <h2 className="text-lg font-semibold text-white mb-3">Invite KOLs</h2>
            <p className="text-xs text-white/60 mb-3">Add comma-separated X usernames.</p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={inviteUsernames}
                onChange={(e) => setInviteUsernames(e.target.value)}
                className="flex-1 px-3 py-2 text-sm rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                placeholder="alice, bob, charlie"
              />
              <button
                onClick={handleInvite}
                disabled={inviting || !inviteUsernames.trim()}
                className="px-4 py-2 text-sm font-medium bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-lg hover:bg-teal-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {inviting ? 'Adding...' : 'Add KOLs'}
              </button>
            </div>
          </div>
        )}

        <div className="rounded-lg border border-white/10 bg-black/40 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">KOLs</h2>
          {displayKols.length === 0 ? (
            <EmptyState
              icon="👥"
              title="No KOLs yet"
              description="Invite creators to start tracking performance."
            />
          ) : (
            <div className="space-y-3">
              {displayKols.map((kol) => (
                <div
                  key={kol.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-white/10 bg-black/30 p-4"
                >
                  <div>
                    <div className="text-sm text-white">@{kol.twitter_username}</div>
                    <div className="text-xs text-white/50">Status: {kol.status}</div>
                  </div>
                  {canManage && (
                    <select
                      value={kol.status}
                      onChange={(e) => handleUpdateStatus(kol.id, e.target.value)}
                      disabled={updatingKol === kol.id}
                      className="px-2 py-1 text-xs rounded bg-white/5 border border-white/10 text-white/80"
                    >
                      <option value="invited">Invited</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  )}
                  <div className="text-xs text-white/60">
                    {kol.clicks !== undefined && (
                      <span className="mr-3">Clicks: {kol.clicks}</span>
                    )}
                    {kol.conversions !== undefined && <span>Conversions: {kol.conversions}</span>}
                  </div>
                  {kol.utm_url && (
                    <a
                      href={kol.utm_url}
                      className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
                    >
                      UTM Link
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ArcPageShell>
  );
}
