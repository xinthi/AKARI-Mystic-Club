/**
 * ARC Mobile Feed Component
 * 
 * Feed content for mobile with different tab views
 */

import React, { useState } from 'react';
import Link from 'next/link';
import { LiveLeaderboard, Notification } from '@/lib/arc/useArcHomeData';
import { ArcFeedCard } from '../layout/ArcFeedCard';
import { ArcTopProjectsTreemap } from '@/components/arc/ArcTopProjectsTreemap';
import { ArcTopProjectsCards } from '@/components/arc/ArcTopProjectsCards';

interface TopProjectItem {
  id: string;
  name: string;
  display_name?: string;
  twitter_username?: string;
  growth_pct: number;
  slug?: string | null;
  projectId: string;
  arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active?: boolean;
  value?: number;
}

interface ArcMobileFeedProps {
  activeTab: 'home' | 'live' | 'create' | 'activity' | 'admin';
  
  // Treemap props
  treemapItems: TopProjectItem[];
  treemapMode: 'gainers' | 'losers';
  treemapTimeframe: '24h' | '7d' | '30d' | '90d';
  treemapDisplayMode: 'cards' | 'treemap';
  onTreemapProjectClick: (item: TopProjectItem) => void;
  
  // Feed props
  liveItems: LiveLeaderboard[];
  upcomingItems: LiveLeaderboard[];
  notifications: Notification[];
  loading: boolean;
  error: string | null;
  
  canManageArc?: boolean;
}

export function ArcMobileFeed({
  activeTab,
  treemapItems,
  treemapMode,
  treemapTimeframe,
  treemapDisplayMode,
  onTreemapProjectClick,
  liveItems,
  upcomingItems,
  notifications,
  loading,
  error,
  canManageArc,
}: ArcMobileFeedProps) {
  const [treemapCollapsed, setTreemapCollapsed] = useState(false);

  // Home Tab
  if (activeTab === 'home') {
    return (
      <div className="pb-20 space-y-6">
        {/* Treemap Section (Collapsible) */}
        <section>
          <div className="rounded-xl border border-white/10 bg-black/40">
            <button
              onClick={() => setTreemapCollapsed(!treemapCollapsed)}
              className="w-full flex items-center justify-between p-4"
            >
              <h2 className="text-lg font-semibold text-white">Top Projects</h2>
              <svg
                className={`w-5 h-5 text-white/60 transition-transform ${treemapCollapsed ? '' : 'rotate-180'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {!treemapCollapsed && (
              <div className="p-4">
                {treemapDisplayMode === 'treemap' ? (
                  <div className="w-full h-[400px]">
                    <ArcTopProjectsTreemap
                      key={`${treemapMode}-${treemapTimeframe}-${treemapItems.length}`}
                      items={treemapItems as any}
                      mode={treemapMode}
                      timeframe={treemapTimeframe}
                      onProjectClick={(project) => {
                        const item = treemapItems.find(
                          (i) => (i.projectId || i.id) === project.projectId
                        );
                        if (item) {
                          onTreemapProjectClick(item);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <ArcTopProjectsCards
                    items={treemapItems as any}
                    onClickItem={onTreemapProjectClick as any}
                  />
                )}
              </div>
            )}
          </div>
        </section>

        {/* Live Now (first 3) */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Live Now</h2>
          <div className="space-y-3">
            {liveItems.slice(0, 3).map((item) => (
              <ArcFeedCard
                key={item.arenaId || item.campaignId || item.projectId}
                item={item}
                status="live"
                canManageArc={canManageArc}
              />
            ))}
          </div>
        </section>

        {/* Activity (first 10) */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4">Recent Activity</h2>
          <div className="space-y-2">
            {notifications.slice(0, 10).map((notification) => (
              <div
                key={notification.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-black/40"
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
        </section>
      </div>
    );
  }

  // Live Tab
  if (activeTab === 'live') {
    return (
      <div className="pb-20 space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-black/40 p-5 animate-pulse">
                <div className="h-5 bg-white/10 rounded mb-3 w-3/4"></div>
                <div className="h-4 bg-white/5 rounded mb-2 w-1/2"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...liveItems, ...upcomingItems].map((item) => (
              <ArcFeedCard
                key={item.arenaId || item.campaignId || item.projectId}
                item={item}
                status={liveItems.includes(item) ? 'live' : 'upcoming'}
                canManageArc={canManageArc}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Create Tab
  if (activeTab === 'create') {
    return (
      <div className="pb-20">
        <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
          <p className="text-white/60 text-sm">Create functionality coming soon</p>
        </div>
      </div>
    );
  }

  // Activity Tab
  if (activeTab === 'activity') {
    return (
      <div className="pb-20 space-y-2">
        {notifications.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-black/40 p-12 text-center">
            <p className="text-white/60 text-sm">No recent activity</p>
          </div>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-black/40"
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
          ))
        )}
      </div>
    );
  }

  // Admin Tab
  if (activeTab === 'admin') {
    return (
      <div className="pb-20 space-y-3">
        <Link
          href="/portal/admin/arc"
          className="block p-4 rounded-xl border border-white/10 bg-black/40 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-white font-medium">ARC Admin</span>
            <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
        <Link
          href="/portal/admin/arc/leaderboard-requests"
          className="block p-4 rounded-xl border border-white/10 bg-black/40 hover:bg-white/5 transition-colors"
        >
          <div className="flex items-center justify-between">
            <span className="text-white font-medium">Leaderboard Requests</span>
            <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      </div>
    );
  }

  return null;
}

