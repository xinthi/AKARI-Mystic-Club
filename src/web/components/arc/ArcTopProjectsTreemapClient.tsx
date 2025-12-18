/**
 * Client-only Treemap Component
 * 
 * Renders treemap with explicit width/height (no ResponsiveContainer)
 * Uses ResizeObserver to measure container width
 */

import React, { useRef, useEffect, useState } from 'react';
import { Treemap, Tooltip } from 'recharts';
import { formatGrowthPct } from './utils';

// Single source of truth for treemap height
const TREEMAP_HEIGHT = 540;

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

const renderContent = (p: any) => {
  // Recharts sometimes gives values on p, sometimes on p.payload
  const x = Number(p?.x ?? 0);
  const y = Number(p?.y ?? 0);
  const w = Number(p?.width ?? 0);
  const h = Number(p?.height ?? 0);

  const d = (p?.payload ?? p) as any;

  const nameRaw = String(d?.name ?? d?.twitter_username ?? 'Unknown');
  const growthPct = typeof d?.growth_pct === 'number' ? d.growth_pct : 0;
  const pctText = formatGrowthPct(growthPct);

  const fill = String(d?.fill ?? 'rgba(107,114,128,0.35)');

  // Always render the rectangle, even if tiny
  const rx = Math.max(0, Math.min(8, Math.min(w, h) * 0.12));

  // Text rules
  const isTiny = w < 70 || h < 38;
  const maxChars = isTiny ? 0 : (w < 120 || h < 55) ? 10 : 18;
  const name =
    maxChars === 0 ? '' :
    nameRaw.length > maxChars ? nameRaw.slice(0, maxChars - 1) + '…' : nameRaw;

  const growthColor =
    Math.abs(growthPct) < 0.01 ? '#facc15' : growthPct > 0 ? '#4ade80' : '#f87171';

  // Bold in SVG: numeric font weight
  const nameFontSize = Math.max(9, Math.min(14, w / 10));
  const pctFontSize = Math.max(9, Math.min(14, w / 11));

  return (
    <g>
      <rect
        x={x + 1}
        y={y + 1}
        width={Math.max(0, w - 2)}
        height={Math.max(0, h - 2)}
        rx={rx}
        ry={rx}
        fill={fill}
        stroke="rgba(255,255,255,0.12)"
      />

      {/* Name (bold) */}
      {!isTiny && (
        <text
          x={x + 10}
          y={y + 18}
          fill="rgba(255,255,255,0.95)"
          fontSize={nameFontSize}
          fontWeight={800}
          paintOrder="stroke"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={2}
          style={{ pointerEvents: 'none' }}
        >
          {name}
        </text>
      )}

      {/* % (bold) */}
      <text
        x={x + 10}
        y={isTiny ? y + 20 : y + 38}
        fill="rgba(255,255,255,0.95)"
        fontSize={pctFontSize}
        fontWeight={800}
        paintOrder="stroke"
        stroke="rgba(0,0,0,0.35)"
        strokeWidth={2}
        style={{ pointerEvents: 'none' }}
      >
        {pctText}
      </text>
    </g>
  );
};

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
        className="w-full flex items-center justify-center text-white/60"
        style={{ height: `${TREEMAP_HEIGHT}px` }}
      >
        <div>Measuring...</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: `${TREEMAP_HEIGHT}px` }}>
      {/* Treemap */}
      <div className="w-full h-full">
        <Treemap
          width={width}
          height={TREEMAP_HEIGHT}
          data={data}
          dataKey="value"
          stroke="rgba(255,255,255,0.12)"
          isAnimationActive={false}
          content={renderContent}
        >
          <Tooltip content={<CustomTooltip />} />
        </Treemap>
      </div>
    </div>
  );
}

