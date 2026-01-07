/**
 * Client-only Creator Treemap Component
 * 
 * Renders treemap for top 10 creators with explicit width/height
 * Uses ResizeObserver to measure container width
 */

import React, { useRef, useEffect, useState } from 'react';
import { Treemap, Tooltip } from 'recharts';
import Image from 'next/image';

// Single source of truth for treemap height
const TREEMAP_HEIGHT = 400;

export interface CreatorTreemapDataPoint {
  name: string;
  value: number; // Normalized contribution for sizing
  contribution_pct: number; // Original contribution percentage
  delta?: number | null; // Delta in bps (for time period)
  twitter_username: string;
  avatar_url?: string | null;
  originalItem: any;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: CreatorTreemapDataPoint;
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload;
  if (!data) return null;

  const name = data.name || data.twitter_username || 'Unknown';
  const contributionPct = typeof data.contribution_pct === 'number' ? data.contribution_pct : 0;
  const delta = data.delta ?? null;
  const twitterUsername = data.twitter_username || '';

  return (
    <div className="bg-black/95 border border-white/20 rounded-lg p-3 shadow-2xl max-w-[240px]">
      <div className="text-sm font-semibold text-white mb-1 truncate">{name}</div>
      {twitterUsername && (
        <div className="text-xs text-white/60 mb-2 truncate">@{twitterUsername}</div>
      )}
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-white/60 flex-shrink-0">Contribution:</span>
          <span className="text-white font-semibold flex-shrink-0">
            {contributionPct.toFixed(2)}%
          </span>
        </div>
        {delta !== null && delta !== undefined && (
          <div className="flex justify-between gap-4">
            <span className="text-white/60 flex-shrink-0">Delta:</span>
            <span className={`font-semibold flex-shrink-0 ${
              delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-white/60'
            }`}>
              {delta > 0 ? '+' : ''}{delta}bps
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

const renderContent = (p: any) => {
  // Early return if invalid
  if (!p || (!p.payload && !p.name)) return null;
  
  // Recharts sometimes gives values on p, sometimes on p.payload
  const x = Number(p?.x ?? 0);
  const y = Number(p?.y ?? 0);
  const w = Number(p?.width ?? 0);
  const h = Number(p?.height ?? 0);

  const d = (p?.payload ?? p) as any;
  
  // Early return if no valid data
  if (!d || (w <= 0 || h <= 0)) return null;

  const nameRaw = String(d?.name ?? d?.twitter_username ?? 'Unknown');
  const contributionPct = typeof d?.contribution_pct === 'number' ? d.contribution_pct : 0;
  const delta = d?.delta ?? null;

  // Color based on contribution (green gradient)
  const fill = `rgba(34, 197, 94, ${0.4 + (contributionPct / 30) * 0.4})`; // 0.4 to 0.8 opacity

  // Always render the rectangle, even if tiny
  const rx = Math.max(0, Math.min(8, Math.min(w, h) * 0.12));

  // Text rules
  const isTiny = w < 70 || h < 38;
  const maxChars = isTiny ? 0 : (w < 120 || h < 55) ? 10 : 18;
  const name =
    maxChars === 0 ? '' :
    nameRaw.length > maxChars ? nameRaw.slice(0, maxChars - 1) + '…' : nameRaw;

  // Font sizes
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

      {/* Contribution % (bold) */}
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
        {contributionPct.toFixed(2)}%
      </text>

      {/* Delta (if available and not tiny) */}
      {!isTiny && delta !== null && delta !== undefined && (
        <text
          x={x + 10}
          y={y + 58}
          fill={delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : 'rgba(255,255,255,0.7)'}
          fontSize={Math.max(8, Math.min(12, w / 12))}
          fontWeight={700}
          paintOrder="stroke"
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={2}
          style={{ pointerEvents: 'none' }}
        >
          {delta > 0 ? '+' : ''}{delta}bps
        </text>
      )}
    </g>
  );
};

interface CreatorTreemapClientProps {
  data: CreatorTreemapDataPoint[];
}

export function CreatorTreemapClient({ data }: CreatorTreemapClientProps) {
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
          content={((props: any) => {
            // Ensure we completely replace default rendering
            const result = renderContent(props);
            return result;
          }) as any}
        >
          <Tooltip content={<CustomTooltip />} />
        </Treemap>
      </div>
    </div>
  );
}
