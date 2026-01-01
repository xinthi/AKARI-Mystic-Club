/**
 * ARC Facebook-style Center Feed
 * 
 * Main feed content with treemap hero, live items, upcoming, and activity
 */

import React from 'react';
import { LiveItem } from '@/lib/arc/useArcLiveItems';
import { ActivityRow as ActivityRowType } from '@/lib/arc/useArcNotifications';
import { LiveItemCard } from './LiveItemCard';
import { ActivityRow } from './ActivityRow';

interface CenterFeedProps {
  // Treemap props (unchanged from existing implementation)
  treemapRender: React.ReactNode;
  
  // Product cards (new)
  productCardsRender?: React.ReactNode;
  
  // Feed props
  liveItems: LiveItem[];
  upcomingItems: LiveItem[];
  activities: ActivityRowType[];
  loading: boolean;
  error: string | null;
  
  // Filters
  kindFilter: 'all' | 'arena' | 'campaign' | 'gamified';
  timeFilter: 'all' | 'live' | 'upcoming';
  
  canManageArc?: boolean;
  onActionSuccess?: () => void;
}

export function CenterFeed({
  treemapRender,
  productCardsRender,
  liveItems,
  upcomingItems,
  activities,
  loading,
  error,
  kindFilter,
  timeFilter,
  canManageArc,
  onActionSuccess,
}: CenterFeedProps) {
  // Filter items
  const filteredLive = liveItems.filter((item) => {
    if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
    if (timeFilter === 'upcoming') return false;
    return true;
  });

  const filteredUpcoming = upcomingItems.filter((item) => {
    if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
    if (timeFilter === 'live') return false;
    return true;
  });

  return (
    <div className="flex-1 min-w-0 max-w-[1400px] mx-auto px-4 space-y-6 py-6">
      {/* Treemap Hero Section */}
      <section className="w-full">
        {treemapRender}
      </section>

      {/* Product Cards Section */}
      {productCardsRender && (
        <section className="w-full">
          {productCardsRender}
        </section>
      )}

      {/* Market Pulse Summary Card */}
      <section>
        <div className="rounded-lg border border-white/10 bg-black/40 p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Market Pulse Summary</h3>
          <div className="space-y-1 text-xs text-white/60">
            <p>Pulse summary unavailable</p>
          </div>
        </div>
      </section>

      {/* Live Now Section */}
      <section id="live-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Live Now</h2>
          <span className="inline-flex items-center gap-2 px-2.5 py-1 text-xs font-medium bg-red-500/20 border border-red-500/30 text-red-400 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400"></span>
            </span>
            Active
          </span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-black/40 p-4 animate-pulse">
                <div className="h-5 bg-white/10 rounded mb-3 w-3/4"></div>
                <div className="h-4 bg-white/5 rounded mb-2 w-1/2"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : filteredLive.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-black/40 p-12 text-center">
            <p className="text-white/60 text-sm">No active leaderboards</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLive.map((item) => (
              <LiveItemCard
                key={item.id}
                item={item}
                canManageArc={canManageArc}
                onActionSuccess={onActionSuccess}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Section */}
      <section id="upcoming-section">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Upcoming</h2>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-lg border border-white/10 bg-black/40 p-4 animate-pulse">
                <div className="h-5 bg-white/10 rounded mb-3 w-3/4"></div>
                <div className="h-4 bg-white/5 rounded mb-2 w-1/2"></div>
              </div>
            ))}
          </div>
        ) : filteredUpcoming.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-black/40 p-12 text-center">
            <p className="text-white/60 text-sm">No upcoming leaderboards</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUpcoming.map((item) => (
              <LiveItemCard
                key={item.id}
                item={item}
                canManageArc={canManageArc}
                onActionSuccess={onActionSuccess}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent Activity Section */}
      <section id="activity-section">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
        {activities.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-black/40 p-12 text-center">
            <p className="text-white/60 text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

