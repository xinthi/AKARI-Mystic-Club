/**
 * ARC Top Projects Treemap Component
 * 
 * Displays projects in a treemap visualization where rectangle size
 * is proportional to absolute growth percentage.
 */

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Treemap, ResponsiveContainer, Tooltip, Cell } from 'recharts';

// =============================================================================
// TYPES
// =============================================================================

export interface TopProjectItem {
  projectId: string;
  name: string;
  twitter_username: string;
  logo_url?: string | null;
  growth_pct: number;
  heat?: number | null;
  slug?: string | null; // Optional slug for navigation
}

interface ArcTopProjectsTreemapProps {
  items: TopProjectItem[];
  mode: 'gainers' | 'losers';
  timeframe: '24h' | '7d' | '30d' | '90d';
  onModeChange?: (mode: 'gainers' | 'losers') => void;
  onTimeframeChange?: (timeframe: '24h' | '7d' | '30d' | '90d') => void;
}

interface TreemapDataPoint {
  name: string;
  value: number; // Normalized absolute growth for sizing
  growth_pct: number; // Original growth percentage
  projectId: string;
  twitter_username: string;
  logo_url?: string | null;
  heat?: number | null;
  slug?: string | null;
  fill: string; // Color based on growth
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get color based on growth percentage
 */
function getGrowthColor(growthPct: number): string {
  if (growthPct > 0) {
    // Positive growth: green gradient
    // Scale intensity based on growth amount
    const intensity = Math.min(Math.abs(growthPct) / 20, 1); // Cap at 20% for max intensity
    const opacity = 0.3 + intensity * 0.4; // 0.3 to 0.7 opacity
    return `rgba(34, 197, 94, ${opacity})`; // green-500
  } else if (growthPct < 0) {
    // Negative growth: red gradient
    const intensity = Math.min(Math.abs(growthPct) / 20, 1);
    const opacity = 0.3 + intensity * 0.4;
    return `rgba(239, 68, 68, ${opacity})`; // red-500
  } else {
    // Neutral: gray
    return 'rgba(156, 163, 175, 0.3)'; // gray-400
  }
}

/**
 * Format growth percentage for display
 */
function formatGrowthPct(growthPct: number): string {
  const sign = growthPct >= 0 ? '+' : '';
  return `${sign}${growthPct.toFixed(2)}%`;
}

/**
 * Normalize values for treemap sizing
 * Uses square root to prevent very large values from dominating
 */
function normalizeForTreemap(values: number[]): number[] {
  if (values.length === 0) return [];
  
  // Use square root to compress the range
  const sqrtValues = values.map(v => Math.sqrt(Math.abs(v)));
  const min = Math.min(...sqrtValues);
  const max = Math.max(...sqrtValues);
  
  // Normalize to 1-100 range
  if (max === min) {
    return values.map(() => 50); // All equal
  }
  
  return sqrtValues.map(v => 1 + ((v - min) / (max - min)) * 99);
}

// =============================================================================
// CUSTOM TOOLTIP
// =============================================================================

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

  const data = payload[0].payload;

  return (
    <div className="bg-black/95 border border-white/20 rounded-lg p-3 shadow-2xl min-w-[200px]">
      <div className="text-sm font-semibold text-white mb-1">{data.name}</div>
      {data.twitter_username && (
        <div className="text-xs text-white/60 mb-2">@{data.twitter_username}</div>
      )}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-white/60">Growth:</span>
          <span className={`font-semibold ${
            data.growth_pct > 0 ? 'text-green-400' : data.growth_pct < 0 ? 'text-red-400' : 'text-white/60'
          }`}>
            {formatGrowthPct(data.growth_pct)}
          </span>
        </div>
        {data.heat !== null && data.heat !== undefined && (
          <div className="flex justify-between">
            <span className="text-white/60">Heat:</span>
            <span className="text-white font-medium">{data.heat}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ArcTopProjectsTreemap({
  items,
  mode,
  timeframe,
  onModeChange,
  onTimeframeChange,
}: ArcTopProjectsTreemapProps) {
  const router = useRouter();
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);

  // Prepare data for treemap
  const treemapData = useMemo((): TreemapDataPoint[] => {
    if (items.length === 0) return [];

    // Get absolute growth values for normalization
    const absGrowthValues = items.map(item => Math.abs(item.growth_pct));
    const normalizedValues = normalizeForTreemap(absGrowthValues);

    return items.map((item, index) => ({
      name: item.name,
      value: normalizedValues[index],
      growth_pct: item.growth_pct,
      projectId: item.projectId,
      twitter_username: item.twitter_username,
      logo_url: item.logo_url,
      heat: item.heat,
      slug: item.slug,
      fill: getGrowthColor(item.growth_pct),
    }));
  }, [items]);

  // Handle click on treemap cell
  const handleCellClick = (data: TreemapDataPoint) => {
    if (data.slug) {
      // Navigate to ARC page if slug is available
      router.push(`/portal/arc/${data.slug}`);
    } else {
      // Fallback to sentiment page using twitter username
      if (data.twitter_username) {
        router.push(`/portal/sentiment/profile/${data.twitter_username}`);
      }
    }
  };

  // Custom cell component with hover effects
  const CustomCell = ({ x, y, width, height, payload }: any) => {
    const isHovered = hoveredProjectId === payload.projectId;
    const isPositive = payload.growth_pct > 0;
    const borderColor = isPositive 
      ? 'rgba(34, 197, 94, 0.6)' 
      : payload.growth_pct < 0 
      ? 'rgba(239, 68, 68, 0.6)' 
      : 'rgba(156, 163, 175, 0.4)';

    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={payload.fill}
          stroke={isHovered ? borderColor : 'rgba(255, 255, 255, 0.1)'}
          strokeWidth={isHovered ? 2 : 1}
          style={{ cursor: 'pointer', transition: 'all 0.2s' }}
          onMouseEnter={() => setHoveredProjectId(payload.projectId)}
          onMouseLeave={() => setHoveredProjectId(null)}
          onClick={() => handleCellClick(payload)}
        />
        {/* Label inside rectangle */}
        {width > 80 && height > 40 && (
          <text
            x={x + width / 2}
            y={y + height / 2 - 8}
            textAnchor="middle"
            fill="white"
            fontSize={Math.min(width / 10, 14)}
            fontWeight="semibold"
            className="pointer-events-none"
          >
            {payload.name}
          </text>
        )}
        {width > 80 && height > 50 && payload.twitter_username && (
          <text
            x={x + width / 2}
            y={y + height / 2 + 4}
            textAnchor="middle"
            fill="rgba(255, 255, 255, 0.7)"
            fontSize={Math.min(width / 12, 11)}
            className="pointer-events-none"
          >
            @{payload.twitter_username}
          </text>
        )}
        {width > 80 && height > 60 && (
          <text
            x={x + width / 2}
            y={y + height / 2 + 16}
            textAnchor="middle"
            fill={payload.growth_pct > 0 ? '#4ade80' : payload.growth_pct < 0 ? '#f87171' : 'rgba(255, 255, 255, 0.6)'}
            fontSize={Math.min(width / 14, 10)}
            fontWeight="bold"
            className="pointer-events-none"
          >
            {formatGrowthPct(payload.growth_pct)}
          </text>
        )}
      </g>
    );
  };

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 min-h-[400px] rounded-xl border border-white/10 bg-black/40">
        <p className="text-sm text-white/60">No projects to display</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Controls (optional - if callbacks provided) */}
      {(onModeChange || onTimeframeChange) && (
        <div className="flex items-center justify-between mb-4">
          {onModeChange && (
            <div className="flex gap-2">
              <button
                onClick={() => onModeChange('gainers')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === 'gainers'
                    ? 'bg-akari-primary text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                Top Gainers
              </button>
              <button
                onClick={() => onModeChange('losers')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === 'losers'
                    ? 'bg-akari-primary text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                Top Losers
              </button>
            </div>
          )}
          {onTimeframeChange && (
            <div className="flex gap-2">
              {(['24h', '7d', '30d', '90d'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => onTimeframeChange(tf)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    timeframe === tf
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Treemap */}
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <ResponsiveContainer width="100%" height={600}>
          <Treemap
            data={treemapData}
            dataKey="value"
            stroke="rgba(255, 255, 255, 0.1)"
            content={<CustomCell />}
          >
            {treemapData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

