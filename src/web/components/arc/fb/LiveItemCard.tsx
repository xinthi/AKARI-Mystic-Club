/**
 * ARC Facebook-style Live Item Card (Desktop)
 * 
 * Dense, metric-first card for live/upcoming items
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { LiveItem } from '@/lib/arc/useArcLiveItems';
import { getLiveItemRoute } from './routeUtils';

interface LiveItemCardProps {
  item: LiveItem;
  canManageArc?: boolean;
  onActionSuccess?: () => void;
}

export function LiveItemCard({ item, canManageArc, onActionSuccess }: LiveItemCardProps) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const route = getLiveItemRoute(item);
  const kindLabel = item.kind === 'arena' ? 'Arena' : item.kind === 'campaign' ? 'Campaign' : 'Gamified';

  const timeRemaining = item.statusLabel === 'Live' && item.endAt
    ? Math.max(0, new Date(item.endAt).getTime() - Date.now())
    : null;
  const hoursRemaining = timeRemaining ? Math.floor(timeRemaining / (1000 * 60 * 60)) : null;

  const startDate = item.statusLabel === 'Upcoming' && item.startAt ? new Date(item.startAt) : null;
  const timeUntilStart = startDate ? Math.max(0, startDate.getTime() - Date.now()) : null;
  const daysUntilStart = timeUntilStart ? Math.floor(timeUntilStart / (1000 * 60 * 60 * 24)) : null;

  const handleAction = async (action: 'pause' | 'restart' | 'end' | 'reinstate') => {
    if (!canManageArc || loadingAction) return;

    setLoadingAction(action);
    setActionError(null);
    setDropdownOpen(false);

    try {
      const res = await fetch('/api/portal/admin/arc/live-item/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          kind: item.kind,
          id: item.id,
          action,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to perform action');
      }

      // Navigate to report if ending
      if (action === 'end' && data.status === 'ended') {
        window.location.href = `/portal/admin/arc/reports/${item.kind}/${item.id}`;
        return; // Don't trigger refetch since we're navigating away
      }

      // Trigger refetch of live items
      if (onActionSuccess) {
        onActionSuccess();
      }
    } catch (err: any) {
      console.error('[LiveItemCard] Action error:', err);
      setActionError(err.message || 'Failed to perform action');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-black/40 p-4 hover:border-white/20 hover:bg-white/5 transition-all">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-semibold text-white truncate">
              {item.title}
            </h3>
            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-white/10 border border-white/20 text-white/70 rounded uppercase flex-shrink-0">
              {kindLabel}
            </span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase flex-shrink-0 ${
              item.statusLabel === 'Live'
                ? 'bg-red-500/20 border border-red-500/30 text-red-400'
                : 'bg-blue-500/20 border border-blue-500/30 text-blue-400'
            }`}>
              {item.statusLabel}
            </span>
          </div>
          <p className="text-sm text-white/70 truncate mb-1">
            {item.project.name}
          </p>
          {item.project.xHandle && (
            <p className="text-xs text-white/50">@{item.project.xHandle}</p>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="flex items-center gap-4 text-xs text-white/60 mb-3">
        <span>Creators: {item.creatorCount}</span>
        <span>Posts/Views/Points: N/A</span>
      </div>

      {/* Time Info */}
      {item.statusLabel === 'Live' && hoursRemaining !== null && hoursRemaining > 0 && (
        <div className="text-xs text-white/60 mb-3">
          {hoursRemaining}h remaining
        </div>
      )}
      {item.statusLabel === 'Upcoming' && startDate && (
        <div className="text-xs text-white/60 mb-3">
          {startDate.toLocaleDateString()}
          {daysUntilStart !== null && daysUntilStart > 0 && (
            <span> • {daysUntilStart} {daysUntilStart === 1 ? 'day' : 'days'} until start</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {item.statusLabel === 'Live' && route && (
          <Link
            href={route}
            className="flex-1 text-center px-4 py-2 text-sm font-medium bg-gradient-to-r from-teal-400 to-cyan-400 text-black rounded-lg hover:opacity-90 transition-opacity"
          >
            View
          </Link>
        )}
        {canManageArc && (
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              disabled={loadingAction !== null}
              className="px-3 py-2 text-sm font-medium bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingAction ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              )}
            </button>
            {dropdownOpen && !loadingAction && (
              <div className="absolute right-0 mt-1 w-48 bg-black/90 border border-white/20 rounded-lg shadow-lg z-10">
                <div className="py-1">
                  <button
                    onClick={() => handleAction('pause')}
                    disabled={loadingAction !== null}
                    className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Pause
                  </button>
                  <button
                    onClick={() => handleAction('end')}
                    disabled={loadingAction !== null}
                    className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    End
                  </button>
                  <button
                    onClick={() => handleAction('restart')}
                    disabled={loadingAction !== null}
                    className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Restart
                  </button>
                  <button
                    onClick={() => handleAction('reinstate')}
                    disabled={loadingAction !== null}
                    className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reinstate
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {actionError && (
        <div className="mt-2 text-xs text-red-400">{actionError}</div>
      )}
    </div>
  );
}

