/**
 * ARC Projects Treemap Component v3
 * 
 * New treemap visualization that receives explicit width/height.
 * Never causes blank pages - always falls back gracefully.
 * No memoization optimizations yet.
 */

import React, { useEffect, useMemo, useRef } from 'react';
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

  // Build nodes with value and growth_pct
  const nodes = useMemo(() => {
    return data.map((item) => {
      const validGrowthPct = typeof item.growth_pct === 'number' && !isNaN(item.growth_pct) ? item.growth_pct : 0;
      return {
        ...item,
        value: Math.max(1, Math.abs(validGrowthPct)),
        growth_pct: validGrowthPct,
      };
    });
  }, [data]);

  // CustomNode component: draws rect, labels, and handles clicks
  const CustomNode = (props: any) => {
    const { x, y, width: cellWidth, height: cellHeight, payload } = props;
    if (!payload) return null;

    const displayName = payload.display_name || payload.name || 'Unknown';
    const growthPct = payload.growth_pct || 0;
    
    // Get fill color based on growth_pct
    let fill: string;
    if (growthPct > 0.5) {
      fill = 'rgba(34, 197, 94, 0.6)'; // green
    } else if (growthPct < -0.5) {
      fill = 'rgba(239, 68, 68, 0.6)'; // red
    } else {
      fill = 'rgba(234, 179, 8, 0.6)'; // yellow
    }

    // Format growth percentage
    const growthText = growthPct >= 0 ? `+${growthPct.toFixed(1)}%` : `${growthPct.toFixed(1)}%`;
    
    const showLabels = cellWidth >= 60 && cellHeight >= 40;
    const maxNameLength = Math.floor(cellWidth / 6);
    const displayNameTruncated = displayName.length > maxNameLength 
      ? displayName.substring(0, maxNameLength) + '...' 
      : displayName;

    const handleClick = () => {
      if (onProjectClick && payload) {
        onProjectClick(payload);
      }
    };

    return (
      <g>
        {/* Rectangle with color based on growth_pct */}
        <rect
          x={x}
          y={y}
          width={cellWidth}
          height={cellHeight}
          fill={fill}
          stroke="#0b0f14"
          strokeWidth={1}
          onClick={handleClick}
          style={{ cursor: 'pointer' }}
        />
        {/* Labels: display_name and growth % */}
        {showLabels && (
          <g>
            {/* Background rectangle for readability */}
            <rect
              x={x + cellWidth / 2 - (Math.max(displayNameTruncated.length, growthText.length) * 4)}
              y={y + cellHeight / 2 - 16}
              width={Math.max(displayNameTruncated.length, growthText.length) * 8}
              height={32}
              fill="rgba(0, 0, 0, 0.7)"
              rx={4}
              style={{ pointerEvents: 'none' }}
            />
            {/* Display name */}
            <text
              x={x + cellWidth / 2}
              y={y + cellHeight / 2 - 4}
              textAnchor="middle"
              fill="white"
              fontSize={11}
              fontWeight="bold"
              style={{ pointerEvents: 'none' }}
            >
              {displayNameTruncated}
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

  // Error tracking ref (no state updates during render)
  const errorRef = useRef<Error | null>(null);
  const errorReportedRef = useRef(false);

  // Error handling via useEffect - check for errors on each render
  useEffect(() => {
    if (errorRef.current && !errorReportedRef.current && onError) {
      onError(errorRef.current);
      errorReportedRef.current = true; // Mark as reported
    }
  });

  // Early return if no nodes
  if (nodes.length === 0) {
    return null;
  }

  // Render treemap with error boundary
  try {
    return (
      <div style={{ width: '100%', height: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={nodes}
            dataKey="value"
            nameKey="display_name"
            stroke="#0b0f14"
            content={<CustomNode />}
          />
        </ResponsiveContainer>
      </div>
    );
  } catch (error: any) {
    // Store error in ref (no state update during render)
    errorRef.current = error instanceof Error ? error : new Error(String(error));
    errorReportedRef.current = false; // Reset report flag
    // Error will be reported via useEffect on next render
    return null;
  }
}

