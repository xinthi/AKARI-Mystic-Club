/**
 * ARC Projects Treemap Component v3
 * 
 * New treemap visualization that receives explicit width/height.
 * Never causes blank pages - always falls back gracefully.
 * No memoization optimizations yet.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Treemap, Tooltip, Cell } from 'recharts';

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
  const [renderedNodeCount, setRenderedNodeCount] = useState(0);
  const nodeCountRef = useRef(0);
  const hasCheckedNodesRef = useRef(false);

  // Check if nodes were rendered after a delay
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasCheckedNodesRef.current && data.length > 0 && nodeCountRef.current === 0) {
        hasCheckedNodesRef.current = true;
        if (onError) {
          onError(new Error('Treemap rendered but produced no visible nodes'));
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [data.length, onError]);

  // Prepare treemap data with error handling
  let treemapData: TreemapDataPoint[] = [];
  
  try {
    if (!data || data.length === 0) {
      if (onError) {
        onError(new Error('No data provided to treemap'));
      }
      return null;
    }

    // Map items to treemap format with proper value calculation
    const mappedData = data.map((item) => {
      // Name fallback: display_name || name || twitter_username || slug
      const name = item.display_name || item.name || item.twitter_username || item.slug || 'Unknown';
      
      // Value calculation: prefer growth_pct if numeric, otherwise fallback to 1
      let computedValue: number;
      if (typeof item.growth_pct === 'number' && !isNaN(item.growth_pct) && isFinite(item.growth_pct)) {
        // Use absolute value of growth_pct, scaled appropriately
        computedValue = Math.abs(item.growth_pct);
      } else {
        // Fallback to 1 if growth_pct is invalid
        computedValue = 1;
      }
      
      // Enforce value = Math.max(1, computedValue)
      const value = Math.max(1, computedValue);
      
      const growthPct = typeof item.growth_pct === 'number' && !isNaN(item.growth_pct) ? item.growth_pct : 0;
      const twitterUsername = item.twitter_username || '';
      
      return {
        name,
        value,
        growth_pct: growthPct,
        projectId: item.id,
        twitter_username: twitterUsername,
        slug: item.slug || null,
        arc_access_level: item.arc_access_level || 'none',
        arc_active: typeof item.arc_active === 'boolean' ? item.arc_active : false,
        fill: getGrowthColor(growthPct),
        originalItem: item,
      };
    });
    
    // Calculate stats for debug panel
    const values = mappedData.map(d => d.value);
    const validValues = values.filter(v => v > 0 && !isNaN(v) && isFinite(v));
    const minValue = validValues.length > 0 ? Math.min(...validValues) : 0;
    const maxValue = validValues.length > 0 ? Math.max(...validValues) : 0;
    const invalidOrZeroCount = values.filter(v => v <= 0 || isNaN(v) || !isFinite(v)).length;
    
    // Report stats to parent
    if (onStatsUpdate) {
      onStatsUpdate({ minValue, maxValue, invalidOrZeroCount });
    }
    
    // Check if all values are invalid
    if (validValues.length === 0) {
      if (onError) {
        onError(new Error('All treemap values are invalid (0, NaN, or non-finite)'));
      }
      return null;
    }
    
    // Normalize values for better visualization (ensures all values are >= 1)
    const normalizedValues = normalizeForTreemap(values);
    
    // Apply normalized values back to data (guaranteed to be >= 1)
    treemapData = mappedData.map((item, index) => ({
      ...item,
      value: Math.max(1, normalizedValues[index] || 1),
    }));
  } catch (error: any) {
    console.error('[ArcProjectsTreemapV3] Error preparing data:', error);
    if (onError) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
    return null;
  }

  // Custom cell component
  const CustomCell = ({ x, y, width: cellWidth, height: cellHeight, payload }: any) => {
    if (!payload) return null;
    
    // Track that we've rendered a node
    if (nodeCountRef.current === 0) {
      nodeCountRef.current = 1;
      setRenderedNodeCount(1);
    }
    
    const name = payload.name || 'Unknown';
    const growthPct = typeof payload.growth_pct === 'number' ? payload.growth_pct : 0;
    const isSmall = cellWidth < 100 || cellHeight < 50;
    const isClickable = payload.arc_active && payload.arc_access_level !== 'none';

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={cellWidth}
          height={cellHeight}
          fill={payload.fill}
          stroke={isClickable ? 'rgba(255, 255, 255, 0.2)' : 'rgba(107, 114, 128, 0.3)'}
          strokeWidth={1}
          rx={2}
          onClick={() => {
            if (isClickable && onProjectClick && payload.originalItem) {
              onProjectClick(payload.originalItem);
            }
          }}
          style={{ cursor: isClickable ? 'pointer' : 'not-allowed' }}
        />
        {!isSmall && (
          <text
            x={x + cellWidth / 2}
            y={y + cellHeight / 2 - 8}
            textAnchor="middle"
            fill="white"
            fontSize={12}
            fontWeight="bold"
            className="pointer-events-none"
          >
            {name.length > 15 ? name.substring(0, 15) + '...' : name}
          </text>
        )}
        {!isSmall && (
          <text
            x={x + cellWidth / 2}
            y={y + cellHeight / 2 + 8}
            textAnchor="middle"
            fill={growthPct > 0 ? '#22c55e' : growthPct < 0 ? '#ef4444' : '#9ca3af'}
            fontSize={10}
            className="pointer-events-none"
          >
            {growthPct >= 0 ? '+' : ''}{growthPct.toFixed(1)}%
          </text>
        )}
        {!isClickable && !isSmall && (
          <text
            x={x + cellWidth / 2}
            y={y + cellHeight / 2 + 20}
            textAnchor="middle"
            fill="rgba(255, 255, 0, 0.7)"
            fontSize={8}
            className="pointer-events-none"
          >
            🔒 Locked
          </text>
        )}
      </g>
    );
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload[0]) return null;
    
    const data = payload[0].payload;
    const name = data.name || 'Unknown';
    const growthPct = typeof data.growth_pct === 'number' ? data.growth_pct : 0;
    const twitterUsername = data.twitter_username || '';
    const isClickable = data.arc_active && data.arc_access_level !== 'none';
    
    return (
      <div className="bg-black/90 border border-white/20 rounded-lg p-3 shadow-lg">
        <div className="text-white font-semibold text-sm mb-1">{name}</div>
        {twitterUsername && (
          <div className="text-white/60 text-xs mb-1">@{twitterUsername}</div>
        )}
        <div className={`text-sm font-bold ${
          growthPct > 0 ? 'text-green-400' : growthPct < 0 ? 'text-red-400' : 'text-white/60'
        }`}>
          {growthPct >= 0 ? '+' : ''}{growthPct.toFixed(2)}%
        </div>
        {!isClickable && (
          <div className="text-yellow-400 text-xs mt-1">🔒 No ARC access</div>
        )}
      </div>
    );
  };

  // Render treemap with error boundary
  try {
    if (width <= 0 || height <= 0) {
      if (onError) {
        onError(new Error('Invalid dimensions: width or height must be > 0'));
      }
      return null;
    }

    return (
      <div style={{ width, height, position: 'relative' }}>
        <Treemap
          width={width}
          height={height}
          data={treemapData}
          dataKey="value"
          stroke="transparent"
          content={<CustomCell />}
          animationDuration={300}
        >
          {treemapData.map((entry, index) => (
            <Cell key={`cell-${entry.projectId}-${index}`} fill={entry.fill} />
          ))}
          <Tooltip content={<CustomTooltip />} />
        </Treemap>
      </div>
    );
  } catch (error: any) {
    console.error('[ArcProjectsTreemapV3] Rendering error:', error);
    if (onError) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
    return null;
  }
}

