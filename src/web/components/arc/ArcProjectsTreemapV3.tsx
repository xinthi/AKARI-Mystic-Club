/**
 * ARC Projects Treemap Component v3
 * 
 * New treemap visualization that receives explicit width/height.
 * Never causes blank pages - always falls back gracefully.
 * No memoization optimizations yet.
 */

import React, { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
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
  // IMPORTANT: Treemap needs positive numbers - use Math.abs to handle negative growth_pct
  const nodes = (data ?? []).map((item) => {
    const gp =
      typeof item.growth_pct === "number" && !Number.isNaN(item.growth_pct)
        ? item.growth_pct
        : 0;

    return {
      ...item,
      // IMPORTANT: Treemap needs a positive number
      value: Math.max(1, Math.abs(gp)),
    };
  });

  // CustomNode renderer: draws rect with color, labels, and handles clicks
  const CustomNode = (props: any) => {
    const { x, y, width, height } = props;
    
    // Guard: ensure valid dimensions
    if (!width || !height || width <= 2 || height <= 2) return null;

    // Safely extract item from payload (handle nested payload structure)
    const item = props?.payload?.payload ?? props?.payload;
    if (!item || typeof item !== 'object') return null;

    // Compute growth percentage: valid growth_pct else 0
    const gp =
      typeof item.growth_pct === 'number' && !isNaN(item.growth_pct)
        ? item.growth_pct
        : 0;

    // 3 colors only: green if gp>0.5, red if gp<-0.5, else yellow
    const fill = gp > 0.5 ? '#16a34a' : gp < -0.5 ? '#dc2626' : '#f59e0b';

    // Get display name
    const name = item.display_name || item.name || '';
    const label = name.length > 18 ? name.slice(0, 18) + '…' : name;
    
    // Format growth percent (1 decimal)
    const pct = `${gp >= 0 ? '+' : ''}${gp.toFixed(1)}%`;

    // Handle click: call onProjectClick(item)
    const handleClick = () => {
      if (props?.onProjectClick && item) {
        props.onProjectClick(item);
      }
    };

    return (
      <g style={{ cursor: 'pointer' }} onClick={handleClick}>
        <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#0b0f14" />
        {/* Render label + growth percent when tile is big enough */}
        {width > 70 && height > 40 && (
          <>
            <text x={x + 8} y={y + 18} fontSize={12} fill="#fff" fontWeight={600}>
              {label}
            </text>
            <text x={x + 8} y={y + 34} fontSize={11} fill="#fff" opacity={0.9}>
              {pct}
            </text>
          </>
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
      <Treemap
        width={width}
        height={height}
        data={nodes}
        dataKey="value"
        nameKey="display_name"
        stroke="#0b0f14"
        content={(nodeProps: any) => (
          <CustomNode {...nodeProps} onProjectClick={onProjectClick} />
        )}
      />
    );
  } catch (error: any) {
    // Store error in ref (no state update during render)
    errorRef.current = error instanceof Error ? error : new Error(String(error));
    errorReportedRef.current = false; // Reset report flag
    // Error will be reported via useEffect on next render
    return null;
  }
}

