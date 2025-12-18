/**
 * Client-only Treemap Component
 * 
 * Renders treemap with explicit width/height (no ResponsiveContainer)
 * Uses ResizeObserver to measure container width
 */

import React, { useRef, useEffect, useState } from 'react';
import { Treemap, Tooltip } from 'recharts';
import { formatGrowthPct } from './utils';

// Import types from parent component
export interface TreemapDataPoint {
  name: string;
  value: number;
  growth_pct: number;
  projectId: string;
  twitter_username: string;
  logo_url?: string | null;
  heat?: number | null;
  slug?: string | null;
  arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active?: boolean;
  fill: string;
  isClickable: boolean;
  isLocked: boolean;
  originalItem: any;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: TreemapDataPoint;
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload;
  if (!data) return null;

  const name = data.name || data.twitter_username || 'Unknown';
  const growthPct = typeof data.growth_pct === 'number' ? data.growth_pct : 0;
  const twitterUsername = data.twitter_username || '';

  return (
    <div className="bg-black/95 border border-white/20 rounded-lg p-3 shadow-2xl max-w-[240px]">
      <div className="text-sm font-semibold text-white mb-1 truncate">{name}</div>
      {twitterUsername && (
        <div className="text-xs text-white/60 mb-2 truncate">@{twitterUsername}</div>
      )}
      <div className="text-xs text-white/60">
        Growth: <span className={`font-semibold ${
          Math.abs(growthPct) < 0.01 
            ? 'text-yellow-400' 
            : growthPct > 0 
            ? 'text-green-400' 
            : 'text-red-400'
        }`}>
          {formatGrowthPct(growthPct)}
        </span>
      </div>
    </div>
  );
}

interface ArcTopProjectsTreemapClientProps {
  data: TreemapDataPoint[];
}

export function ArcTopProjectsTreemapClient({ data }: ArcTopProjectsTreemapClientProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // Set initial width
    const updateWidth = () => {
      if (containerRef.current) {
        const newWidth = containerRef.current.clientWidth;
        setWidth(newWidth);
      }
    };

    // Initial measurement
    updateWidth();

    // Use ResizeObserver to track size changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Show fallback while measuring
  if (width < 10) {
    return (
      <div 
        ref={containerRef}
        className="w-full h-[400px] flex items-center justify-center text-white/60"
      >
        <div>Measuring...</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full h-[400px]">
      {/* Treemap */}
      <div className="w-full h-full">
        <Treemap
          width={width}
          height={400}
          data={data}
          dataKey="value"
          stroke="rgba(255,255,255,0.12)"
          isAnimationActive={false}
        >
          <Tooltip content={<CustomTooltip />} />
        </Treemap>
      </div>
    </div>
  );
}

