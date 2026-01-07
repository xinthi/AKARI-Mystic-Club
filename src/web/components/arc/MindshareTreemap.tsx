/**
 * Mindshare Treemap Component
 * 
 * Displays top 10 gainers as a treemap visualization
 */

import React, { useMemo } from 'react';
import Image from 'next/image';

interface Creator {
  twitter_username: string;
  avatar_url?: string | null;
  contribution_pct?: number | null;
  delta7d?: number | null;
  delta1m?: number | null;
  delta3m?: number | null;
}

interface MindshareTreemapProps {
  creators: Creator[];
  timePeriod: '7D' | '1M' | '3M' | 'ALL';
  loading?: boolean;
}

export function MindshareTreemap({ creators, timePeriod, loading }: MindshareTreemapProps) {
  // Calculate top 10 gainers based on selected time period
  const topGainers = useMemo(() => {
    if (!creators || creators.length === 0) {
      return [];
    }

    // Sort by delta for the selected time period
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
      .slice(0, 10)
      .map(creator => ({
        handle: creator.twitter_username || 'Unknown',
        avatar: creator.avatar_url || null,
        contribution_pct: creator.contribution_pct ?? 0,
        delta: timePeriod === '7D' ? creator.delta7d : timePeriod === '1M' ? creator.delta1m : timePeriod === '3M' ? creator.delta3m : creator.contribution_pct,
      }));
  }, [creators, timePeriod]);

  if (loading) {
    return (
      <div className="w-full h-64 bg-white/5 rounded-lg border border-white/10 p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-white/10 rounded w-1/3"></div>
          <div className="h-32 bg-white/5 rounded"></div>
        </div>
      </div>
    );
  }

  if (!topGainers || topGainers.length === 0) {
    return (
      <div className="w-full h-64 bg-white/5 rounded-lg border border-white/10 p-4 flex items-center justify-center">
        <p className="text-white/40 text-sm">No gainers data available</p>
      </div>
    );
  }

  // Calculate total contribution for percentage calculations
  const totalContribution = topGainers.reduce((sum, creator) => sum + creator.contribution_pct, 0);

  return (
    <div className="w-full bg-white/5 rounded-lg border border-white/10 p-4">
      <h3 className="text-sm font-medium text-white/80 mb-4">Top 10 Gainers ({timePeriod})</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
        {topGainers.map((creator, index) => {
          const percentage = totalContribution > 0 
            ? (creator.contribution_pct / totalContribution) * 100 
            : 0;
          
          return (
            <div
              key={creator.handle || index}
              className="relative bg-white/10 rounded border border-white/20 p-2 hover:bg-white/15 transition-colors group"
            >
              <div className="flex flex-col items-center gap-2">
                {creator.avatar ? (
                  <div className="relative w-10 h-10 rounded-full overflow-hidden border border-white/20 flex-shrink-0">
                    <Image
                      src={creator.avatar}
                      alt={creator.handle || 'Avatar'}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex-shrink-0 flex items-center justify-center">
                    <span className="text-white/60 text-xs font-medium">
                      {(creator.handle || '?')[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0 text-center">
                  <p className="text-white text-xs font-medium truncate w-full">
                    {creator.handle || 'Unknown'}
                  </p>
                  <p className="text-white/60 text-xs">
                    {creator.contribution_pct.toFixed(2)}%
                  </p>
                  {creator.delta !== null && creator.delta !== undefined && timePeriod !== 'ALL' && (
                    <p className="text-[#14CC7F] text-xs font-medium">
                      +{Math.round(creator.delta)}bps
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
