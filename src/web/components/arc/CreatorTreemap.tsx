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
}

interface CreatorTreemapDataPoint {
  name: string;
  value: number; // Normalized contribution for sizing
  contribution_pct: number; // Original contribution percentage
  delta?: number | null; // Delta in bps (for time period)
  twitter_username: string;
  avatar_url?: string | null;
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

export function CreatorTreemap({ creators, timePeriod, loading }: CreatorTreemapProps) {
  // Calculate top 10 gainers based on selected time period
  const topGainers = useMemo(() => {
    if (!creators || creators.length === 0) {
      return [];
    }

    // Sort by delta for the selected time period (or contribution for ALL)
    const sorted = [...creators].sort((a, b) => {
      let deltaA = 0;
      let deltaB = 0;

      switch (timePeriod) {
        case '7D':
          deltaA = a.delta7d ?? 0;
          deltaB = b.delta7d ?? 0;
          break;
        case '1M':
          deltaA = a.delta1m ?? 0;
          deltaB = b.delta1m ?? 0;
          break;
        case '3M':
          deltaA = a.delta3m ?? 0;
          deltaB = b.delta3m ?? 0;
          break;
        case 'ALL':
          // For ALL, use contribution percentage
          deltaA = a.contribution_pct ?? 0;
          deltaB = b.contribution_pct ?? 0;
          break;
      }

      return deltaB - deltaA; // Descending order
    });

    // Get top 10 gainers (positive deltas or highest contribution for ALL)
    return sorted
      .filter(creator => {
        if (timePeriod === 'ALL') {
          return (creator.contribution_pct ?? 0) > 0;
        }
        const delta = timePeriod === '7D' ? creator.delta7d : timePeriod === '1M' ? creator.delta1m : creator.delta3m;
        return (delta ?? 0) > 0;
      })
      .slice(0, 10);
  }, [creators, timePeriod]);

  // Prepare data for treemap
  const treemapData = useMemo((): CreatorTreemapDataPoint[] => {
    if (topGainers.length === 0) {
      return [];
    }

    // Get contribution percentages for sizing
    const contributionValues = topGainers.map(creator => creator.contribution_pct ?? 0);
    const normalizedValues = normalizeForTreemap(contributionValues);

    return topGainers.map((creator, index) => {
      const delta = timePeriod === '7D' ? creator.delta7d : 
                    timePeriod === '1M' ? creator.delta1m : 
                    timePeriod === '3M' ? creator.delta3m : 
                    null;

      return {
        name: creator.twitter_username || 'Unknown',
        value: normalizedValues[index],
        contribution_pct: creator.contribution_pct ?? 0,
        delta: delta,
        twitter_username: creator.twitter_username || '',
        avatar_url: creator.avatar_url || null,
        originalItem: creator,
      };
    });
  }, [topGainers, timePeriod]);

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
      <div className="w-full bg-white/5 rounded-lg border border-white/10 p-4 flex items-center justify-center" style={{ height: `${TREEMAP_HEIGHT}px` }}>
        <p className="text-white/40 text-sm">No gainers data available</p>
      </div>
    );
  }

  return (
    <div className="w-full bg-white/5 rounded-lg border border-white/10 p-4">
      <h3 className="text-sm font-medium text-white/80 mb-4">Top 10 Gainers ({timePeriod})</h3>
      <div className="rounded-lg overflow-hidden" style={{ height: `${TREEMAP_HEIGHT}px` }}>
        <CreatorTreemapClient data={treemapData} />
      </div>
    </div>
  );
}
