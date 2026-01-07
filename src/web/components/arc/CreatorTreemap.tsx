/**
 * Creator Treemap Component
 * 
 * Displays top 10 gainers in a treemap visualization where rectangle size
 * is proportional to contribution percentage.
 */

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';

// Client-only treemap component (no SSR)
const CreatorTreemapClient = dynamic(
  () => import('@/components/arc/CreatorTreemapClient').then(mod => ({ default: mod.CreatorTreemapClient })),
  { ssr: false }
);

// Single source of truth for treemap height
const TREEMAP_HEIGHT = 400;

// =============================================================================
// TYPES
// =============================================================================

interface Creator {
  twitter_username: string;
  avatar_url?: string | null;
  contribution_pct?: number | null;
  delta7d?: number | null;
  delta1m?: number | null;
  delta3m?: number | null;
}

interface CreatorTreemapProps {
  creators: Creator[];
  timePeriod: '7D' | '1M' | '3M' | 'ALL';
  loading?: boolean;
  mode?: 'gainers' | 'losers';
  onModeChange?: (mode: 'gainers' | 'losers') => void;
}

interface CreatorTreemapDataPoint {
  name: string;
  value: number; // Normalized contribution for sizing
  contribution_pct: number; // Original contribution percentage
  delta?: number | null; // Delta in bps (for time period)
  twitter_username: string;
  avatar_url?: string | null;
  isLoser?: boolean; // Whether this is a loser (for color)
  originalItem: Creator;
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
// COMPONENT
// =============================================================================

export function CreatorTreemap({ creators, timePeriod, loading, mode = 'gainers', onModeChange }: CreatorTreemapProps) {
  // Calculate top 10 gainers/losers based on selected time period and mode
  const topCreators = useMemo(() => {
    if (!creators || creators.length === 0) {
      return [];
    }

    // Get the relevant metric for sorting
    const getMetric = (creator: Creator): number => {
      if (timePeriod === 'ALL') {
        // For ALL, use contribution percentage
        return creator.contribution_pct ?? 0;
      }
      // For time periods, use delta
      const delta = timePeriod === '7D' ? creator.delta7d : 
                    timePeriod === '1M' ? creator.delta1m : 
                    creator.delta3m;
      return delta ?? 0;
    };

    // Sort by metric
    const sorted = [...creators].sort((a, b) => {
      const metricA = getMetric(a);
      const metricB = getMetric(b);
      
      if (mode === 'gainers') {
        // For gainers: descending order (highest first)
        return metricB - metricA;
      } else {
        // For losers: ascending order (lowest first)
        return metricA - metricB;
      }
    });

    // Filter based on mode
    const filtered = sorted.filter(creator => {
      const metric = getMetric(creator);
      const contributionPct = creator.contribution_pct ?? 0;
      
      if (timePeriod === 'ALL') {
        // For ALL, show creators with contribution > 0
        return contributionPct > 0;
      }
      
      // For time periods with deltas
      // If delta is null/undefined, fall back to contribution_pct
      if (metric === 0 && contributionPct > 0) {
        // If no delta but has contribution, include it (treat as gainer)
        return mode === 'gainers';
      }
      
      if (mode === 'gainers') {
        return metric > 0; // Positive deltas
      } else {
        return metric < 0; // Negative deltas
      }
    });

    // Get top 10
    return filtered.slice(0, 10);
  }, [creators, timePeriod, mode]);

  // Prepare data for treemap - tiles sized by contribution percentage
  const treemapData = useMemo((): CreatorTreemapDataPoint[] => {
    if (topCreators.length === 0) {
      return [];
    }

    // Use contribution percentages for sizing (always use contribution, not delta)
    const contributionValues = topCreators.map(creator => Math.max(0, creator.contribution_pct ?? 0));
    const normalizedValues = normalizeForTreemap(contributionValues);

    return topCreators.map((creator, index) => {
      const delta = timePeriod === '7D' ? creator.delta7d : 
                    timePeriod === '1M' ? creator.delta1m : 
                    timePeriod === '3M' ? creator.delta3m : 
                    null;

      return {
        name: creator.twitter_username || 'Unknown',
        value: normalizedValues[index], // Normalized contribution for tile sizing
        contribution_pct: creator.contribution_pct ?? 0,
        delta: delta,
        twitter_username: creator.twitter_username || '',
        avatar_url: creator.avatar_url || null,
        isLoser: mode === 'losers',
        originalItem: creator,
      };
    });
  }, [topCreators, timePeriod]);

  if (loading) {
    return (
      <div className="w-full bg-white/5 rounded-lg border border-white/10 p-4" style={{ height: `${TREEMAP_HEIGHT}px` }}>
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-white/10 rounded w-1/3"></div>
          <div className="h-full bg-white/5 rounded"></div>
        </div>
      </div>
    );
  }

  if (!treemapData || treemapData.length === 0) {
    return (
      <div className="w-full bg-white/5 rounded-lg border border-white/10 p-4" style={{ minHeight: `${TREEMAP_HEIGHT}px` }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-white/80">Top 10 {mode === 'gainers' ? 'Gainers' : 'Losers'} ({timePeriod})</h3>
          {onModeChange && (
            <div className="flex gap-2">
              <button
                onClick={() => onModeChange('gainers')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  mode === 'gainers'
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                }`}
              >
                Top Gainers
              </button>
              <button
                onClick={() => onModeChange('losers')}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  mode === 'losers'
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                }`}
              >
                Top Losers
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center justify-center" style={{ height: `${TREEMAP_HEIGHT}px` }}>
          <p className="text-white/40 text-sm">No {mode === 'gainers' ? 'gainers' : 'losers'} data available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-white/5 rounded-lg border border-white/10 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white/80">Top 10 {mode === 'gainers' ? 'Gainers' : 'Losers'} ({timePeriod})</h3>
        {onModeChange && (
          <div className="flex gap-2">
            <button
              onClick={() => onModeChange('gainers')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                mode === 'gainers'
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
              }`}
            >
              Top Gainers
            </button>
            <button
              onClick={() => onModeChange('losers')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                mode === 'losers'
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
              }`}
            >
              Top Losers
            </button>
          </div>
        )}
      </div>
      <div className="rounded-lg overflow-hidden" style={{ height: `${TREEMAP_HEIGHT}px` }}>
        <CreatorTreemapClient data={treemapData} />
      </div>
    </div>
  );
}
