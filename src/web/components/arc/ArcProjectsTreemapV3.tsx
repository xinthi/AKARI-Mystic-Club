/**
 * ARC Projects Treemap Component v3
 * 
 * New treemap visualization that receives explicit width/height.
 * Never causes blank pages - always falls back gracefully.
 * No memoization optimizations yet.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Treemap } from 'recharts';

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
    // Create flat array with name and value for Recharts (extra fields are ignored by Recharts but preserved for click handling)
    treemapData = mappedData.map((item, index) => ({
      name: item.name,
      value: Math.max(1, normalizedValues[index] || 1),
      // Preserve slug and originalItem for click navigation (Recharts ignores these)
      slug: item.slug,
      originalItem: item.originalItem,
    }));
  } catch (error: any) {
    console.error('[ArcProjectsTreemapV3] Error preparing data:', error);
    if (onError) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
    return null;
  }


  // Render treemap with error boundary
  try {
    if (width <= 0 || height <= 0) {
      if (onError) {
        onError(new Error('Invalid dimensions: width or height must be > 0'));
      }
      return null;
    }

    // Track that we're rendering
    if (treemapData.length > 0 && nodeCountRef.current === 0) {
      nodeCountRef.current = 1;
      setRenderedNodeCount(1);
    }

    // Log data for debugging
    console.log('[ArcProjectsTreemapV3] Rendering with data:', {
      count: treemapData.length,
      sample: treemapData.slice(0, 3),
      width,
      height,
    });

    return (
      <div style={{ width, height, position: 'relative', cursor: 'pointer' }}>
        <Treemap
          width={width}
          height={height}
          data={treemapData}
          dataKey="value"
          nameKey="name"
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth={1}
          fill="#8884d8"
          animationDuration={0}
          onClick={(data: any, index: number) => {
            // Handle click: navigate to project page using slug
            // Recharts Treemap onClick receives the data point directly
            if (onProjectClick && data) {
              const originalItem = data.originalItem;
              if (originalItem) {
                onProjectClick(originalItem);
              }
            }
          }}
          label={(props: any) => {
            // Track that we've rendered a node
            if (nodeCountRef.current === 0) {
              nodeCountRef.current = 1;
              setRenderedNodeCount(1);
            }
            // Improved inline text label with better contrast
            const name = props.name || 'Unknown';
            if (props.width < 50 || props.height < 30) return null;
            
            // Truncate name if needed
            const displayName = name.length > 20 ? name.substring(0, 20) + '...' : name;
            
            return (
              <g>
                {/* Background rectangle for better text contrast */}
                <rect
                  x={props.x + props.width / 2 - (displayName.length * 4)}
                  y={props.y + props.height / 2 - 8}
                  width={displayName.length * 8}
                  height={16}
                  fill="rgba(0, 0, 0, 0.6)"
                  rx={2}
                />
                {/* Text label with high contrast */}
                <text
                  x={props.x + props.width / 2}
                  y={props.y + props.height / 2}
                  textAnchor="middle"
                  fill="white"
                  fontSize={12}
                  fontWeight="bold"
                  style={{ pointerEvents: 'none' }}
                >
                  {displayName}
                </text>
              </g>
            );
          }}
        />
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

