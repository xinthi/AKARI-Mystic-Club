/**
 * ARC Top Projects Mosaic Grid Component
 * 
 * Displays projects in a CSS Grid mosaic layout without charts.
 * Tile sizes are determined by rank position.
 */

import React, { useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export interface TopProjectItem {
  id: string;
  name: string;
  display_name?: string;
  twitter_username?: string;
  growth_pct: number;
  slug?: string | null;
  projectId?: string;
  arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active?: boolean;
}

interface ArcTopProjectsMosaicProps {
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
 * Get grid column span class based on rank (1-indexed)
 */
function getColSpanClass(rank: number): string {
  if (rank === 1) return 'lg:col-span-7';
  if (rank === 2) return 'lg:col-span-5';
  if (rank >= 3 && rank <= 4) return 'lg:col-span-4';
  if (rank >= 5 && rank <= 8) return 'lg:col-span-3';
  return 'lg:col-span-2';
}

/**
 * Get grid row span class based on rank (1-indexed)
 */
function getRowSpanClass(rank: number): string {
  if (rank === 1 || rank === 2) return 'lg:row-span-2';
  return 'lg:row-span-1';
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
    // Positive growth: green tint
    return {
      border: 'border-green-500/30',
      bg: 'bg-green-500/5',
      text: 'text-green-400',
    };
  } else if (growthPct < -0.1) {
    // Negative growth: red tint
    return {
      border: 'border-red-500/30',
      bg: 'bg-red-500/5',
      text: 'text-red-400',
    };
  } else {
    // Neutral (~0): neutral colors
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

export function ArcTopProjectsMosaic({
  items,
  onClickItem,
}: ArcTopProjectsMosaicProps) {
  // Sort by absolute growth_pct descending, limit to 20 items
  const sortedItems = useMemo(() => {
    return [...items]
      .sort((a, b) => {
        const growthA = Math.abs(typeof a.growth_pct === 'number' ? a.growth_pct : 0);
        const growthB = Math.abs(typeof b.growth_pct === 'number' ? b.growth_pct : 0);
        return growthB - growthA;
      })
      .slice(0, 20);
  }, [items]);

  // Empty state
  if (sortedItems.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-8 text-center">
        <p className="text-sm text-white/60">No top projects available</p>
      </div>
    );
  }

  const handleTileClick = (item: TopProjectItem) => {
    if (isLocked(item)) {
      return; // Don't handle clicks for locked items
    }
    if (onClickItem) {
      onClickItem(item);
    }
  };

  return (
    <div className="w-full">
      {/* CSS Grid: 12 columns on desktop, 1 column on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 auto-rows-min">
        {sortedItems.map((item, index) => {
          const rank = index + 1;
          const name = item.display_name || item.name || 'Unknown';
          const twitterUsername = item.twitter_username || '';
          const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
          const locked = isLocked(item);
          const colors = getGrowthColorClasses(growthPct);
          const colSpan = getColSpanClass(rank);
          const rowSpan = getRowSpanClass(rank);

          return (
            <div
              key={item.id || item.projectId || index}
              className={`
                ${colSpan}
                ${rowSpan}
                rounded-xl
                border
                ${colors.border}
                ${colors.bg}
                p-4
                lg:p-6
                flex
                flex-col
                justify-between
                min-h-[120px]
                lg:min-h-[140px]
                transition-all
                ${locked
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-white/10 hover:shadow-lg hover:shadow-white/5 cursor-pointer'
                }
              `}
              onClick={() => handleTileClick(item)}
            >
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="text-base lg:text-lg font-semibold text-white truncate mb-1">
                  {name}
                </div>
                {twitterUsername && (
                  <div className="text-xs lg:text-sm text-white/60 truncate mb-2">
                    @{twitterUsername}
                  </div>
                )}
                {locked && (
                  <div className="text-xs text-yellow-400 mt-2">
                    🔒 Locked
                  </div>
                )}
              </div>

              {/* Growth percentage */}
              <div className={`text-xl lg:text-2xl font-bold ${colors.text}`}>
                {formatGrowthPct(growthPct)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

