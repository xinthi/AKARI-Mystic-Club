/**
 * ARC Feed Card Component
 * 
 * Card component for displaying live/upcoming leaderboard items in the feed
 */

import React from 'react';
import Link from 'next/link';
import { LiveLeaderboard } from '@/lib/arc/useArcHomeData';
import { getLeaderboardRoute } from './arcRouteUtils';

interface ArcFeedCardProps {
  item: LiveLeaderboard;
  status: 'live' | 'upcoming';
  canManageArc?: boolean;
}

export function ArcFeedCard({ item, status, canManageArc }: ArcFeedCardProps) {
  const route = getLeaderboardRoute(item);
  const kindLabel = item.kind === 'arena' ? 'Arena' : item.kind === 'campaign' ? 'Campaign' : 'Gamified';
  const displayTitle = item.arenaName || item.title;

  const timeRemaining = status === 'live' && item.endAt
    ? Math.max(0, new Date(item.endAt).getTime() - Date.now())
    : null;
  const hoursRemaining = timeRemaining ? Math.floor(timeRemaining / (1000 * 60 * 60)) : null;

  const startDate = status === 'upcoming' && item.startAt ? new Date(item.startAt) : null;
  const timeUntilStart = startDate ? Math.max(0, startDate.getTime() - Date.now()) : null;
  const daysUntilStart = timeUntilStart ? Math.floor(timeUntilStart / (1000 * 60 * 60 * 24)) : null;

  return (
    <div className="rounded-xl border border-white/10 bg-black/40 p-5 hover:border-white/20 hover:bg-white/5 transition-all">
      {/* Header */}
      <div className="mb-3.5">
        <div className="flex items-center gap-2 mb-1.5">
          <h3 className="text-base font-semibold text-white truncate flex-1">
            {displayTitle}
          </h3>
          <span className="text-[10px] font-medium px-1.5 py-0.5 bg-white/10 border border-white/20 text-white/70 rounded uppercase">
            {kindLabel}
          </span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase ${
            status === 'live'
              ? 'bg-red-500/20 border border-red-500/30 text-red-400'
              : 'bg-blue-500/20 border border-blue-500/30 text-blue-400'
          }`}>
            {status === 'live' ? 'Live' : 'Upcoming'}
          </span>
        </div>
        <p className="text-sm text-white/70 mb-1 truncate">
          {item.projectName}
        </p>
        {item.xHandle && (
          <p className="text-xs text-white/50 mb-2">@{item.xHandle}</p>
        )}
        
        {/* Metrics */}
        <div className="flex items-center gap-3 text-xs text-white/60 mb-2">
          <span>Creators: {item.creatorCount}</span>
          <span>Posts/Views/Points: N/A</span>
        </div>

        {/* Time info */}
        {status === 'live' && hoursRemaining !== null && hoursRemaining > 0 && (
          <div className="text-xs text-white/60">
            {hoursRemaining}h remaining
          </div>
        )}
        {status === 'upcoming' && startDate && (
          <div className="text-xs text-white/60">
            {startDate.toLocaleDateString()}
            {daysUntilStart !== null && daysUntilStart > 0 && (
              <span> • {daysUntilStart} {daysUntilStart === 1 ? 'day' : 'days'} until start</span>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {route && (
          <Link
            href={route}
            className="flex-1 text-center px-4 py-2 text-sm font-medium bg-akari-primary text-white rounded-lg hover:bg-akari-primary/80 transition-colors"
          >
            View
          </Link>
        )}
        {canManageArc && (
          <div className="relative group">
            <button className="px-3 py-2 text-sm font-medium bg-white/5 border border-white/10 text-white/80 rounded-lg hover:bg-white/10 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
            {/* Dropdown menu - placeholder UI only */}
            <div className="hidden group-hover:block absolute right-0 mt-1 w-48 bg-black/90 border border-white/20 rounded-lg shadow-lg z-10">
              <div className="py-1">
                <button className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10">Pause</button>
                <button className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10">End</button>
                <button className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10">Restart</button>
                <button className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10">Reinstate</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

