/**
 * ARC Facebook-style Desktop Shell
 * 
 * Full-width 3-column layout with sticky top bar
 */

import React from 'react';
import { TopBar } from './TopBar';
import { LeftRail } from './LeftRail';
import { CenterFeed } from './CenterFeed';
import { RightRail } from './RightRail';
import { LiveItem } from '@/lib/arc/useArcLiveItems';
import { ActivityRow as ActivityRowType } from '@/lib/arc/useArcNotifications';

interface DesktopArcShellProps {
  // Top bar
  searchQuery: string;
  onSearchChange: (query: string) => void;
  unreadCount: number;
  
  // Left rail
  canManageArc?: boolean;
  projectSlug?: string | null;
  canManageProject?: boolean;
  isSuperAdmin?: boolean;
  
  // Center feed
  treemapRender: React.ReactNode;
  productCardsRender?: React.ReactNode;
  liveItems: LiveItem[];
  upcomingItems: LiveItem[];
  activities: ActivityRowType[];
  loading: boolean;
  error: string | null;
  kindFilter: 'all' | 'arena' | 'campaign' | 'gamified';
  timeFilter: 'all' | 'live' | 'upcoming';
  onKindFilterChange: (filter: 'all' | 'arena' | 'campaign' | 'gamified') => void;
  onTimeFilterChange: (filter: 'all' | 'live' | 'upcoming') => void;
  onActionSuccess?: () => void;
}

export function DesktopArcShell({
  searchQuery,
  onSearchChange,
  unreadCount,
  canManageArc,
  projectSlug,
  canManageProject,
  isSuperAdmin,
  treemapRender,
  productCardsRender,
  liveItems,
  upcomingItems,
  activities,
  loading,
  error,
  kindFilter,
  timeFilter,
  onKindFilterChange,
  onTimeFilterChange,
  onActionSuccess,
}: DesktopArcShellProps) {
  return (
    <div className="flex flex-col min-h-screen w-full bg-black">
      {/* Top Bar */}
      <TopBar
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        unreadCount={unreadCount}
      />

      {/* Main Content: 3 Columns */}
      <div className="flex flex-1 w-full">
        {/* Left Rail */}
        <LeftRail 
          canManageArc={canManageArc}
          onKindFilterChange={onKindFilterChange}
          onTimeFilterChange={onTimeFilterChange}
          projectSlug={projectSlug}
          canManageProject={canManageProject}
          isSuperAdmin={isSuperAdmin}
        />

        {/* Center Feed */}
        <CenterFeed
          treemapRender={treemapRender}
          productCardsRender={productCardsRender}
          liveItems={liveItems}
          upcomingItems={upcomingItems}
          activities={activities}
          loading={loading}
          error={error}
          kindFilter={kindFilter}
          timeFilter={timeFilter}
          canManageArc={canManageArc}
        />

        {/* Right Rail */}
        <RightRail
          liveItems={liveItems}
          upcomingItems={upcomingItems}
          kindFilter={kindFilter}
          timeFilter={timeFilter}
          onKindFilterChange={onKindFilterChange}
          onTimeFilterChange={onTimeFilterChange}
        />
      </div>
    </div>
  );
}

