/**
 * ARC Desktop Center Feed Component
 * 
 * Main feed content with live items, upcoming, and activity
 * Note: Treemap section is rendered separately in the main page
 */

import React from 'react';
import { LiveLeaderboard, Notification } from '@/lib/arc/useArcHomeData';
import { ArcFeedCard } from './ArcFeedCard';

interface ArcDesktopCenterFeedProps {
  // Feed props
  liveItems: LiveLeaderboard[];
  upcomingItems: LiveLeaderboard[];
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  
  // Filters
  kindFilter: 'all' | 'arena' | 'campaign' | 'gamified';
  timeFilter: 'all' | 'live' | 'upcoming';
  
  canManageArc?: boolean;
}

export function ArcDesktopCenterFeed({
  liveItems,
  upcomingItems,
  notifications,
  loading,
  error,
  kindFilter,
  timeFilter,
  canManageArc,
}: ArcDesktopCenterFeedProps) {
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
    <div className="flex-1 min-w-0 space-y-8">
      {/* Live Now Section */}
      <section id="live-section">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold text-white">Live Now</h2>
          <span className="inline-flex items-center gap-2 px-2.5 py-1 text-xs font-medium bg-red-500/20 border border-red-500/30 text-red-400 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400"></span>
            </span>
            Active
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-black/40 p-5 animate-pulse">
                <div className="h-5 bg-white/10 rounded mb-3 w-3/4"></div>
                <div className="h-4 bg-white/5 rounded mb-2 w-1/2"></div>
                <div className="h-3 bg-white/5 rounded mb-4 w-2/3"></div>
                <div className="h-9 bg-white/5 rounded"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : filteredLive.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/40 p-16 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/5 mb-4">
              <svg className="w-6 h-6 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-white/70 text-sm font-medium mb-1">No active leaderboards</p>
            <p className="text-white/50 text-xs">Check back later for new campaigns</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLive.map((item) => (
              <ArcFeedCard
                key={item.arenaId || item.campaignId || item.projectId}
                item={item}
                status="live"
                canManageArc={canManageArc}
              />
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Section */}
      <section id="upcoming-section">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold text-white">Upcoming</h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-black/40 p-5 animate-pulse">
                <div className="h-5 bg-white/10 rounded mb-3 w-3/4"></div>
                <div className="h-4 bg-white/5 rounded mb-2 w-1/2"></div>
                <div className="h-3 bg-white/5 rounded mb-4 w-2/3"></div>
                <div className="h-9 bg-white/5 rounded"></div>
              </div>
            ))}
          </div>
        ) : filteredUpcoming.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/40 p-16 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/5 mb-4">
              <svg className="w-6 h-6 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-white/70 text-sm font-medium mb-1">No upcoming leaderboards</p>
            <p className="text-white/50 text-xs">Scheduled campaigns will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredUpcoming.map((item) => (
              <ArcFeedCard
                key={item.arenaId || item.campaignId || item.projectId}
                item={item}
                status="upcoming"
                canManageArc={canManageArc}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent Activity Section */}
      <section>
        <h2 className="text-xl font-semibold text-white mb-5">Recent Activity</h2>
        {notifications.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/40 p-12 text-center">
            <p className="text-white/60 text-sm">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.slice(0, 20).map((notification) => (
              <div
                key={notification.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-black/40 hover:bg-white/5 transition-colors"
              >
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-akari-primary mt-2" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-white/60 uppercase">{notification.type}</span>
                    <span className="text-xs text-white/40">
                      {new Date(notification.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {notification.context && typeof notification.context === 'object' && (
                    <p className="text-sm text-white/80">
                      {notification.context.message || notification.context.text || 'Activity update'}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

