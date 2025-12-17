/**
 * ARC Projects Treemap Component v3
 * 
 * New treemap visualization that receives explicit width/height.
 * Never causes blank pages - always falls back gracefully.
 * No memoization optimizations yet.
 */

import React from 'react';
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

function getGrowthColor(growthPct: number): string {
  if (growthPct > 0) {
    const intensity = Math.min(Math.abs(growthPct) / 20, 1);
    const opacity = 0.3 + intensity * 0.4;
    return `rgba(34, 197, 94, ${opacity})`; // green
  } else if (growthPct < 0) {
    const intensity = Math.min(Math.abs(growthPct) / 20, 1);
    const opacity = 0.3 + intensity * 0.4;
    return `rgba(239, 68, 68, ${opacity})`; // red
  } else {
    return 'rgba(156, 163, 175, 0.3)'; // gray
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
  // Prepare nodes: simple flat array with name and value
  const nodes = data.map((item) => {
    const name = item.display_name || item.name || item.twitter_username || item.slug || 'Unknown';
    let value = 1;
    if (typeof item.growth_pct === 'number' && !isNaN(item.growth_pct) && isFinite(item.growth_pct)) {
      value = Math.max(1, Math.abs(item.growth_pct));
    }
    return { name, value };
  });

  // Only early return if no nodes
  if (nodes.length === 0) {
    return null;
  }

  return (
    <div style={{ width, height: '100%', position: 'relative' }}>
      <ResponsiveContainer width="100%" height="100%">
        <Treemap
          data={nodes}
          dataKey="value"
          nameKey="name"
          isAnimationActive={false}
        />
      </ResponsiveContainer>
      <div style={{ position: 'absolute', bottom: 0, left: 0, padding: '8px', fontSize: '12px', color: 'white', background: 'rgba(0,0,0,0.5)' }}>
        Treemap mounted: {nodes.length}
      </div>
    </div>
  );
}

