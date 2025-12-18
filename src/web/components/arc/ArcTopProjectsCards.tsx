/**
 * ARC Top Projects Cards Component
 * 
 * Displays projects in a structured card layout:
 * - First row: 3-6 featured large cards (top movers/ranked)
 * - Below: responsive grid of smaller cards
 */

import React, { useMemo } from 'react';
import { TopProjectItem } from './ArcTopProjectsMosaic';

// =============================================================================
// TYPES
// =============================================================================

interface ArcTopProjectsCardsProps {
  items: TopProjectItem[];
  onClickItem?: (item: TopProjectItem) => void;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format growth percentage for display
 */
function formatGrowthPct(growthPct: number): string {
  const sign = growthPct >= 0 ? '+' : '';
  return `${sign}${growthPct.toFixed(2)}%`;
}

/**
 * Get color classes based on growth percentage
 */
function getGrowthColorClasses(growthPct: number): {
  border: string;
  bg: string;
  text: string;
} {
  if (growthPct > 0.1) {
    return {
      border: 'border-green-500/30',
      bg: 'bg-green-500/5',
      text: 'text-green-400',
    };
  } else if (growthPct < -0.1) {
    return {
      border: 'border-red-500/30',
      bg: 'bg-red-500/5',
      text: 'text-red-400',
    };
  } else {
    return {
      border: 'border-white/10',
      bg: 'bg-white/5',
      text: 'text-white/60',
    };
  }
}

/**
 * Check if project is locked
 */
function isLocked(item: TopProjectItem): boolean {
  return !item.arc_active || item.arc_access_level === 'none' || !item.arc_access_level;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ArcTopProjectsCards({
  items,
  onClickItem,
}: ArcTopProjectsCardsProps) {
  // Sort by absolute growth_pct descending
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const growthA = Math.abs(typeof a.growth_pct === 'number' ? a.growth_pct : 0);
      const growthB = Math.abs(typeof b.growth_pct === 'number' ? b.growth_pct : 0);
      return growthB - growthA;
    });
  }, [items]);

  // Featured items (top 3-6, showing top 6)
  const featuredItems = useMemo(() => {
    return sortedItems.slice(0, 6);
  }, [sortedItems]);

  // Grid items (rest of the items)
  const gridItems = useMemo(() => {
    return sortedItems.slice(6);
  }, [sortedItems]);

  const handleItemClick = (item: TopProjectItem) => {
    if (isLocked(item)) {
      return;
    }
    if (onClickItem) {
      onClickItem(item);
    }
  };

  // Empty state
  if (sortedItems.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
        <p className="text-sm text-white/60">No top projects available</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Featured Cards Row (3-6 large cards) */}
      {featuredItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {featuredItems.map((item) => {
            const name = item.display_name || item.name || 'Unknown';
            const twitterUsername = item.twitter_username || '';
            const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
            const locked = isLocked(item);
            const colors = getGrowthColorClasses(growthPct);

            return (
              <div
                key={item.id || item.projectId}
                className={`
                  rounded-xl
                  border
                  ${colors.border}
                  ${colors.bg}
                  p-5
                  flex
                  flex-col
                  justify-between
                  min-h-[140px]
                  transition-all
                  ${locked
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:bg-white/10 hover:shadow-lg hover:shadow-white/5 cursor-pointer hover:scale-[1.02]'
                  }
                `}
                onClick={() => handleItemClick(item)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold text-white truncate mb-1">
                    {name}
                  </div>
                  {twitterUsername && (
                    <div className="text-sm text-white/60 truncate mb-2">
                      @{twitterUsername}
                    </div>
                  )}
                  {locked && (
                    <div className="text-xs text-yellow-400 mt-2">
                      Locked
                    </div>
                  )}
                </div>
                <div className={`text-xl font-bold ${colors.text}`}>
                  {formatGrowthPct(growthPct)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Grid Cards (responsive grid of smaller cards) */}
      {gridItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {gridItems.map((item) => {
              const name = item.display_name || item.name || 'Unknown';
              const twitterUsername = item.twitter_username || '';
              const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
              const locked = isLocked(item);
              const colors = getGrowthColorClasses(growthPct);

              return (
                <div
                  key={item.id || item.projectId}
                  className={`
                    rounded-lg
                    border
                    ${colors.border}
                    ${colors.bg}
                    p-4
                    flex
                    flex-col
                    justify-between
                    min-h-[100px]
                    transition-all
                    ${locked
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-white/10 hover:shadow-md hover:shadow-white/5 cursor-pointer'
                    }
                  `}
                  onClick={() => handleItemClick(item)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate mb-1">
                      {name}
                    </div>
                    {twitterUsername && (
                      <div className="text-xs text-white/60 truncate">
                        @{twitterUsername}
                      </div>
                    )}
                  </div>
                  <div className={`text-base font-bold mt-2 ${colors.text}`}>
                    {formatGrowthPct(growthPct)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

