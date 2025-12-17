/**
 * ARC Projects Treemap Component v3
 * 
 * New treemap visualization that receives explicit width/height.
 * Never causes blank pages - always falls back gracefully.
 * No memoization optimizations yet.
 */

import React from 'react';
import { useRouter } from 'next/router';
import { Treemap, ResponsiveContainer } from 'recharts';

// =============================================================================
// TYPES
// =============================================================================

export interface TreemapProjectItem {
  id: string;
  display_name?: string;
  name?: string;
  twitter_username?: string;
  growth_pct: number;
  slug?: string | null;
  arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active?: boolean;
}

interface TreemapDataPoint {
  name: string;
  value: number;
  growth_pct: number;
  projectId: string;
  twitter_username: string;
  slug: string | null;
  arc_access_level: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active: boolean;
  fill: string;
  originalItem: TreemapProjectItem;
}

interface ArcProjectsTreemapV3Props {
  data: TreemapProjectItem[];
  width: number;
  height: number;
  onError?: (error: Error) => void;
  onProjectClick?: (item: TreemapProjectItem) => void;
  onStatsUpdate?: (stats: { minValue: number; maxValue: number; invalidOrZeroCount: number }) => void;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

// Get color based on growth_pct: Green (Up > +0.5), Red (Down < -0.5), Yellow (Stable -0.5 to +0.5)
function getGrowthColor(growthPct: number | null | undefined): string {
  if (growthPct === null || growthPct === undefined || typeof growthPct !== 'number' || isNaN(growthPct)) {
    return 'rgba(234, 179, 8, 0.6)'; // yellow for N/A
  }
  if (growthPct > 0.5) {
    return 'rgba(34, 197, 94, 0.6)'; // green for Up
  } else if (growthPct < -0.5) {
    return 'rgba(239, 68, 68, 0.6)'; // red for Down
  } else {
    return 'rgba(234, 179, 8, 0.6)'; // yellow for Stable
  }
}

function normalizeForTreemap(values: number[]): number[] {
  if (values.length === 0) return [];
  const validValues = values.filter(v => v > 0 && !isNaN(v) && isFinite(v));
  if (validValues.length === 0) return values.map(() => 1);
  
  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  if (max === min) return values.map(() => 1);
  
  // Normalize to range [1, 101] to ensure all values are >= 1
  return values.map(v => {
    if (v <= 0 || isNaN(v) || !isFinite(v)) return 1;
    return ((v - min) / (max - min)) * 100 + 1;
  });
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ArcProjectsTreemapV3({
  data,
  width,
  height,
  onError,
  onProjectClick,
  onStatsUpdate,
}: ArcProjectsTreemapV3Props) {
  const router = useRouter();
  const showDebug = router.query.debug === '1';

  // Prepare nodes: preserve growth_pct for labels
  const nodes = data.map((item) => {
    const name = item.display_name || item.name || item.twitter_username || item.slug || 'Unknown';
    let value = 1;
    if (typeof item.growth_pct === 'number' && !isNaN(item.growth_pct) && isFinite(item.growth_pct)) {
      value = Math.max(1, Math.abs(item.growth_pct));
    }
    return { 
      name, 
      value,
      growth_pct: typeof item.growth_pct === 'number' && !isNaN(item.growth_pct) && isFinite(item.growth_pct) 
        ? item.growth_pct 
        : null 
    };
  });

  // Only early return if no nodes
  if (nodes.length === 0) {
    return null;
  }

  // Format growth percentage: +x.x% or -x.x% or "N/A"
  const formatGrowthPct = (growthPct: number | null | undefined): string => {
    if (growthPct === null || growthPct === undefined || typeof growthPct !== 'number' || isNaN(growthPct)) {
      return 'N/A';
    }
    const sign = growthPct >= 0 ? '+' : '';
    return `${sign}${growthPct.toFixed(1)}%`;
  };

  // Minimal custom content renderer: draws rect with color, stroke, and labels
  const CustomCell = (props: any) => {
    const { x, y, width: cellWidth, height: cellHeight, payload } = props;
    if (!payload) return null;

    const name = payload.name || 'Unknown';
    const growthPct = payload.growth_pct;
    const fill = getGrowthColor(growthPct);
    const growthText = formatGrowthPct(growthPct);
    
    // Truncate name if needed
    const maxNameLength = Math.floor(cellWidth / 6);
    const displayName = name.length > maxNameLength ? name.substring(0, maxNameLength) + '...' : name;
    const showLabels = cellWidth >= 60 && cellHeight >= 40;

    return (
      <g>
        {/* Rectangle with color based on growth_pct */}
        <rect
          x={x}
          y={y}
          width={cellWidth}
          height={cellHeight}
          fill={fill}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={1}
        />
        {/* Labels: name + growth % */}
        {showLabels && (
          <g>
            {/* Background rectangle for readability on dark UI */}
            <rect
              x={x + cellWidth / 2 - (Math.max(displayName.length, growthText.length) * 4)}
              y={y + cellHeight / 2 - 16}
              width={Math.max(displayName.length, growthText.length) * 8}
              height={32}
              fill="rgba(0, 0, 0, 0.7)"
              rx={4}
              style={{ pointerEvents: 'none' }}
            />
            {/* Project name */}
            <text
              x={x + cellWidth / 2}
              y={y + cellHeight / 2 - 4}
              textAnchor="middle"
              fill="white"
              fontSize={11}
              fontWeight="bold"
              style={{ pointerEvents: 'none' }}
            >
              {displayName}
            </text>
            {/* Growth percentage */}
            <text
              x={x + cellWidth / 2}
              y={y + cellHeight / 2 + 10}
              textAnchor="middle"
              fill="white"
              fontSize={10}
              fontWeight="600"
              style={{ pointerEvents: 'none' }}
            >
              {growthText}
            </text>
          </g>
        )}
      </g>
    );
  };

  return (
    <div style={{ width, height: '100%', position: 'relative' }}>
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={nodes}
          dataKey="value"
          nameKey="name"
          isAnimationActive={false}
          content={<CustomCell />}
        />
      </ResponsiveContainer>
      {showDebug && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, padding: '8px', fontSize: '12px', color: 'white', background: 'rgba(0,0,0,0.5)' }}>
          Treemap mounted: {nodes.length}
        </div>
      )}
    </div>
  );
}

