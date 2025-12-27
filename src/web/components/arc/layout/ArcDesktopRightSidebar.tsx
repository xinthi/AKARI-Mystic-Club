/**
 * ARC Desktop Right Sidebar Component
 * 
 * Filters and widgets for ARC home
 */

import React from 'react';
import { LiveLeaderboard } from '@/lib/arc/useArcHomeData';

interface ArcDesktopRightSidebarProps {
  liveItems: LiveLeaderboard[];
  upcomingItems: LiveLeaderboard[];
  kindFilter: 'all' | 'arena' | 'campaign' | 'gamified';
  timeFilter: 'all' | 'live' | 'upcoming';
  onKindFilterChange: (filter: 'all' | 'arena' | 'campaign' | 'gamified') => void;
  onTimeFilterChange: (filter: 'all' | 'live' | 'upcoming') => void;
}

export function ArcDesktopRightSidebar({
  liveItems,
  upcomingItems,
  kindFilter,
  timeFilter,
  onKindFilterChange,
  onTimeFilterChange,
}: ArcDesktopRightSidebarProps) {
  // Calculate trending projects (top 5 by creatorCount)
  const trendingProjects = [...liveItems, ...upcomingItems]
    .sort((a, b) => b.creatorCount - a.creatorCount)
    .slice(0, 5);

  // Calculate quick stats
  const totalCreators = [...liveItems, ...upcomingItems].reduce(
    (sum, item) => sum + item.creatorCount,
    0
  );

  return (
    <div className="w-80 flex-shrink-0 space-y-6">
      {/* Filters */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Filters</h3>
        
        {/* Kind Filter */}
        <div className="mb-4">
          <div className="text-xs font-medium text-white/60 mb-2 uppercase">Kind</div>
          <div className="space-y-1">
            {(['all', 'arena', 'campaign', 'gamified'] as const).map((kind) => (
              <button
                key={kind}
                onClick={() => onKindFilterChange(kind)}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  kindFilter === kind
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                {kind === 'all' ? 'All' : kind.charAt(0).toUpperCase() + kind.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Time Filter */}
        <div>
          <div className="text-xs font-medium text-white/60 mb-2 uppercase">Time</div>
          <div className="space-y-1">
            {(['all', 'live', 'upcoming'] as const).map((time) => (
              <button
                key={time}
                onClick={() => onTimeFilterChange(time)}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  timeFilter === time
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:bg-white/5 hover:text-white'
                }`}
              >
                {time === 'all' ? 'All' : time.charAt(0).toUpperCase() + time.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Trending Projects Widget */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Trending Projects</h3>
        {trendingProjects.length === 0 ? (
          <p className="text-xs text-white/60">N/A</p>
        ) : (
          <div className="space-y-2">
            {trendingProjects.map((project, index) => (
              <div key={project.projectId} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-white/40 w-4">{index + 1}</span>
                  <span className="text-white/80 truncate">{project.projectName}</span>
                </div>
                <span className="text-white/60">{project.creatorCount}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Stats Widget */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Quick Stats</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Live items</span>
            <span className="text-sm font-medium text-white">{liveItems.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Upcoming items</span>
            <span className="text-sm font-medium text-white">{upcomingItems.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">Total creators</span>
            <span className="text-sm font-medium text-white">{totalCreators}</span>
          </div>
        </div>
      </div>

      {/* Top Creators Today Widget */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Top Creators Today</h3>
        <p className="text-xs text-white/60">N/A</p>
      </div>
    </div>
  );
}

