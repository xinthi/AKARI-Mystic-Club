/**
 * ARC Facebook-style Mobile Layout
 * 
 * Mobile layout with sticky top bar and bottom tabs
 */

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useAkariUser } from '@/lib/akari-auth';
import { LiveItem } from '@/lib/arc/useArcLiveItems';
import { ActivityRow as ActivityRowType } from '@/lib/arc/useArcNotifications';
import { LiveItemCard } from '../LiveItemCard';
import { ActivityRow } from '../ActivityRow';
import { Logo } from '@/components/Logo';

interface MobileLayoutProps {
  // Top bar
  unreadCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  
  // Feed data
  liveItems: LiveItem[];
  upcomingItems: LiveItem[];
  activities: ActivityRowType[];
  loading: boolean;
  error: string | null;
  
  // Treemap
  treemapRender: React.ReactNode | null;
  
  // Product cards
  productCardsRender?: React.ReactNode;
  
  // Admin
  canManageArc?: boolean;
  onActionSuccess?: () => void;
}

function getUserInitials(displayName: string | null | undefined): string {
  if (!displayName) return 'U';
  const parts = displayName.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return displayName.slice(0, 2).toUpperCase();
}

export function MobileLayout({
  unreadCount,
  searchQuery,
  onSearchChange,
  liveItems,
  upcomingItems,
  activities,
  loading,
  error,
  treemapRender,
  productCardsRender,
  canManageArc,
  onActionSuccess,
}: MobileLayoutProps) {
  const akariUser = useAkariUser();
  const [activeTab, setActiveTab] = useState<'home' | 'live' | 'create' | 'activity' | 'admin'>('home');
  const [showSearch, setShowSearch] = useState(false);
  const [treemapCollapsed, setTreemapCollapsed] = useState(false);

  const userDisplayName = akariUser.user?.displayName || 'User';
  const userAvatarUrl = akariUser.user?.avatarUrl || null;
  const userInitials = getUserInitials(userDisplayName);


  return (
    <div className="flex flex-col min-h-screen w-full bg-black">
      {/* Top Bar */}
      <div className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur-sm">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between">
            <Link href="/portal" className="flex items-center gap-2 transition-all duration-300 ease-out hover:scale-105 flex-shrink-0">
              <div className="transition-all duration-300 hover:drop-shadow-[0_0_8px_rgba(0,246,162,0.6)] flex-shrink-0">
                <Logo size={28} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] tracking-[0.18em] uppercase text-gradient-teal font-medium whitespace-nowrap">
                  Akari Mystic Club
                </span>
                <span className="text-[9px] text-akari-muted/60 hidden sm:block tracking-wider whitespace-nowrap">
                  PREDICT.SHARE.INTELLIGENCE
                </span>
              </div>
            </Link>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSearch(!showSearch)}
                className="p-2 text-white/80 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>

              <Link href="/portal/notifications" className="relative p-2 text-white/80 hover:text-white">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </Link>

              {userAvatarUrl ? (
                <Image
                  src={userAvatarUrl}
                  alt={userDisplayName}
                  width={32}
                  height={32}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-medium text-white">
                  {userInitials}
                </div>
              )}
            </div>
          </div>

          {showSearch && (
            <div className="mt-3">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full px-4 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-white/20"
              />
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-20">
        {activeTab === 'home' && (
          <div className="px-4 py-6 space-y-6">
            {/* Treemap Header (Collapsible) */}
            {treemapRender && (
              <section>
                <div className="rounded-lg border border-white/10 bg-black/40">
                  <button
                    onClick={() => setTreemapCollapsed(!treemapCollapsed)}
                    className="w-full flex items-center justify-between p-4"
                  >
                    <h2 className="text-base font-semibold text-white">Top Projects</h2>
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
                    <div className="p-2 sm:p-4 w-full overflow-hidden">
                      {treemapRender}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Product Cards */}
            {productCardsRender && (
              <section>
                {productCardsRender}
              </section>
            )}

            {/* Live Now (first 3) */}
            <section>
              <h2 className="text-base font-semibold text-white mb-4">Live Now</h2>
              <div className="space-y-3">
                {liveItems.slice(0, 3).map((item) => (
                  <LiveItemCard key={item.id} item={item} canManageArc={canManageArc} onActionSuccess={onActionSuccess} />
                ))}
              </div>
            </section>

            {/* Activity (first 5) */}
            <section>
              <h2 className="text-base font-semibold text-white mb-4">Recent Activity</h2>
              <div className="space-y-2">
                {activities.slice(0, 5).map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} />
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === 'live' && (
          <div className="px-4 py-6 space-y-3">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border border-white/10 bg-black/40 p-4 animate-pulse">
                    <div className="h-5 bg-white/10 rounded mb-3 w-3/4"></div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            ) : (
              [...liveItems, ...upcomingItems].map((item) => (
                <LiveItemCard key={item.id} item={item} canManageArc={canManageArc} onActionSuccess={onActionSuccess} />
              ))
            )}
          </div>
        )}

        {activeTab === 'create' && (
          <div className="px-4 py-6">
            <div className="rounded-lg border border-white/10 bg-black/40 p-8 text-center">
              <p className="text-white/60 text-sm">Create functionality coming soon</p>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="px-4 py-6 space-y-2">
            {activities.length === 0 ? (
              <div className="rounded-lg border border-white/10 bg-black/40 p-12 text-center">
                <p className="text-white/60 text-sm">No recent activity</p>
              </div>
            ) : (
              activities.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))
            )}
          </div>
        )}

        {activeTab === 'admin' && canManageArc && (
          <div className="px-4 py-6 space-y-3">
            <Link
              href="/portal/admin/arc"
              className="block p-4 rounded-lg border border-white/10 bg-black/40 hover:bg-white/5 transition-colors"
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
              className="block p-4 rounded-lg border border-white/10 bg-black/40 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">Leaderboard Requests</span>
                <svg className="w-5 h-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* Bottom Tabs */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-black/40 backdrop-blur-sm">
        <div className="flex items-center justify-around h-16">
          {[
            { id: 'home', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
            { id: 'live', label: 'Live', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
            { id: 'create', label: 'Create', icon: 'M12 4v16m8-8H4' },
            { id: 'activity', label: 'Activity', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
            ...(canManageArc ? [{ id: 'admin', label: 'Admin', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors ${
                activeTab === tab.id
                  ? 'text-akari-primary'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

