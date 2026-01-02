/**
 * ARC Page Shell Component
 * 
 * Provides the shell layout (TopBar, LeftRail, RightRail) for ARC pages.
 * Pages provide their content which gets rendered in the center feed area.
 */

import React, { useState } from 'react';
import { TopBar } from './TopBar';
import { LeftRail } from './LeftRail';
import { RightRail } from './RightRail';
import { MobileArcPageLayout } from './mobile/MobileArcPageLayout';
import { useArcNotifications } from '@/lib/arc/useArcNotifications';
import { useArcLiveItems } from '@/lib/arc/useArcLiveItems';

interface ArcPageShellProps {
  children: React.ReactNode;
  canManageArc?: boolean;
  /**
   * Optional custom right rail content.
   * If not provided, shows the default filters and widgets.
   */
  rightRailContent?: React.ReactNode;
  projectSlug?: string | null;
  canManageProject?: boolean;
  isSuperAdmin?: boolean;
}

export function ArcPageShell({
  children,
  canManageArc = false,
  rightRailContent,
  projectSlug,
  canManageProject,
  isSuperAdmin,
}: ArcPageShellProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const { activities, unreadCount } = useArcNotifications();
  
  // Use live items for default right rail, but pages can override with rightRailContent
  const { liveItems, upcomingItems, loading: liveItemsLoading, error: liveItemsError } = useArcLiveItems();
  
  // Default filter states (used only if using default right rail)
  const [kindFilter, setKindFilter] = useState<'all' | 'arena' | 'campaign' | 'gamified'>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'live' | 'upcoming'>('all');

  return (
    <>
      {/* Desktop Layout */}
      <div className="hidden md:block w-full">
        <div className="flex flex-col min-h-screen w-full bg-black">
          {/* Top Bar */}
          <TopBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            unreadCount={unreadCount}
          />

          {/* Main Content: 3 Columns */}
          <div className="flex flex-1 w-full">
            {/* Left Rail */}
            <LeftRail 
              canManageArc={canManageArc}
              projectSlug={projectSlug}
              canManageProject={canManageProject}
              isSuperAdmin={isSuperAdmin}
            />

            {/* Center Feed - Page Content */}
            <div className="flex-1 min-w-0 max-w-[1400px] mx-auto px-4 space-y-6 py-6">
              {children}
            </div>

            {/* Right Rail */}
            {rightRailContent ? (
              <div className="w-64 flex-shrink-0 sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto">
                <div className="p-4">
                  {rightRailContent}
                </div>
              </div>
            ) : (
              <RightRail
                liveItems={liveItems}
                upcomingItems={upcomingItems}
                kindFilter={kindFilter}
                timeFilter={timeFilter}
                onKindFilterChange={setKindFilter}
                onTimeFilterChange={setTimeFilter}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden w-full">
        <MobileArcPageLayout
          unreadCount={unreadCount}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          canManageArc={canManageArc}
        >
          {children}
        </MobileArcPageLayout>
      </div>
    </>
  );
}

