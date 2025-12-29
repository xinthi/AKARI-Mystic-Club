/**
 * ARC Top Projects Mosaic Grid Component
 * 
 * Displays projects in a CSS Grid mosaic layout without charts.
 * Tile sizes are determined by rank position.
 */

import React, { useMemo } from 'react';
import { formatGrowthPct, getGrowthColorClasses } from './utils';

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
 * Get grid column span class based on index (0-indexed)
 * Mobile: all same size (col-span-1)
 * Medium: index 0-1: col-span-1 (side by side), index 2-4: col-span-1, rest: col-span-1
 * Desktop (lg): index 0-1: col-span-3 (large), index 2-4: col-span-2 (medium), rest: col-span-1 (small)
 */
function getColSpanClass(index: number): string {
  if (index === 0 || index === 1) {
    // Large cards: 1 column on medium (side by side), 3 columns on desktop (half the 6-column grid)
    return 'col-span-1 md:col-span-1 lg:col-span-3';
  } else if (index >= 2 && index <= 4) {
    // Medium cards: 1 column on medium, 2 columns on desktop (1/3 of the 6-column grid)
    return 'col-span-1 md:col-span-1 lg:col-span-2';
  }
  // Small cards: take 1 column
  return 'col-span-1';
}

/**
 * Get grid row span class based on index (0-indexed)
 * Mobile: no row-span (all same size)
 * Desktop: index 0-1: row-span-2, rest: row-span-1
 */
function getRowSpanClass(index: number): string {
  if (index === 0 || index === 1) {
    return 'lg:row-span-2';
  }
  return 'lg:row-span-1';
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
  // Sort by absolute growth_pct descending, limit to 17 items (2 large + 3 medium + 12 small)
  const sortedItems = useMemo(() => {
    return [...items]
      .sort((a, b) => {
        const growthA = Math.abs(typeof a.growth_pct === 'number' ? a.growth_pct : 0);
        const growthB = Math.abs(typeof b.growth_pct === 'number' ? b.growth_pct : 0);
        return growthB - growthA;
      })
      .slice(0, 17);
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
      {/* CSS Grid: 1 col mobile, 2 cols md, 6 cols lg */}
      <div 
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3"
        style={{ gridAutoRows: '110px' }}
      >
        {sortedItems.map((item, index) => {
          const name = item.display_name || item.name || 'Unknown';
          const twitterUsername = item.twitter_username || '';
          const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
          const locked = isLocked(item);
          const colors = getGrowthColorClasses(growthPct);
          const colSpan = getColSpanClass(index);
          const rowSpan = getRowSpanClass(index);

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
                p-3
                lg:p-4
                flex
                flex-col
                justify-between
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
                <div className="text-sm lg:text-base font-semibold text-white truncate mb-1">
                  {name}
                </div>
                {twitterUsername && (
                  <div className="text-xs text-white/60 truncate mb-1">
                    @{twitterUsername}
                  </div>
                )}
                {locked && (
                  <div className="text-xs text-yellow-400 mt-1">
                    🔒 Locked
                  </div>
                )}
              </div>

              {/* Growth percentage */}
              <div className={`text-base lg:text-lg font-bold ${colors.text}`}>
                {formatGrowthPct(growthPct)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

