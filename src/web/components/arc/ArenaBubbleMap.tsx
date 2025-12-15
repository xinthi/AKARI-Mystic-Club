/**
 * Arena Bubble Map Component
 * 
 * Visualizes creators as bubbles sized by points and colored by ring
 */

import React from 'react';
import Link from 'next/link';

// =============================================================================
// TYPES
// =============================================================================

interface Creator {
  twitter_username: string;
  arc_points: number;
  ring?: string | null;
}

interface ArenaBubbleMapProps {
  creators: Creator[];
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ArenaBubbleMap({ creators }: ArenaBubbleMapProps) {
  // Helper to get ring color
  const getRingColor = (ring: string | null | undefined) => {
    if (!ring) return 'bg-akari-cardSoft/50 border-akari-border/30';
    
    switch (ring.toLowerCase()) {
      case 'core':
        return 'bg-purple-500/30 border-purple-500/50';
      case 'momentum':
        return 'bg-blue-500/30 border-blue-500/50';
      case 'discovery':
        return 'bg-green-500/30 border-green-500/50';
      default:
        return 'bg-akari-cardSoft/50 border-akari-border/30';
    }
  };

  // Helper to get ring text color
  const getRingTextColor = (ring: string | null | undefined) => {
    if (!ring) return 'text-akari-muted';
    
    switch (ring.toLowerCase()) {
      case 'core':
        return 'text-purple-300';
      case 'momentum':
        return 'text-blue-300';
      case 'discovery':
        return 'text-green-300';
      default:
        return 'text-akari-muted';
    }
  };

  // Compute normalized sizes
  const computeBubbleSizes = React.useMemo(() => {
    if (creators.length === 0) return [];

    const points = creators.map(c => c.arc_points ?? 0);
    const minPoints = Math.min(...points);
    const maxPoints = Math.max(...points);
    const range = maxPoints - minPoints;

    // Normalize: min → 32px, max → 80px
    const minSize = 32;
    const maxSize = 80;

    return creators.map((creator) => {
      const points = creator.arc_points ?? 0;
      let size = minSize;
      
      if (range > 0) {
        const normalized = (points - minPoints) / range;
        size = minSize + (normalized * (maxSize - minSize));
      } else if (points > 0) {
        // All same points, use medium size
        size = (minSize + maxSize) / 2;
      }

      return {
        ...creator,
        size: Math.round(size),
      };
    });
  }, [creators]);

  if (creators.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-akari-muted">
          No creators to display on the map.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-4 justify-center items-center p-6 min-h-[400px]">
      {computeBubbleSizes.map((creator, index) => {
        const creatorUrl = `/portal/arc/creator/${encodeURIComponent((creator.twitter_username || '').toLowerCase())}`;
        return (
          <Link
            key={creator.twitter_username || index}
            href={creatorUrl}
            className="group relative flex flex-col items-center justify-center transition-transform hover:scale-110"
            style={{
              width: `${creator.size}px`,
              height: `${creator.size}px`,
            }}
          >
            <div
              className={`w-full h-full rounded-full border-2 flex items-center justify-center ${getRingColor(
                creator.ring
              )} transition-all hover:shadow-lg hover:shadow-akari-primary/20`}
            >
              <div className="text-center px-2">
                <div className={`text-xs font-semibold ${getRingTextColor(creator.ring)} truncate max-w-full`}>
                  @{creator.twitter_username || 'Unknown'}
                </div>
                <div className="text-[10px] text-akari-muted mt-0.5">
                  {creator.arc_points.toLocaleString()} pts
                </div>
              </div>
            </div>
            {/* Tooltip on hover */}
            <div className="absolute bottom-full mb-2 hidden group-hover:block z-10 px-2 py-1 rounded bg-akari-card border border-akari-border/30 shadow-lg">
              <div className="text-xs text-akari-text font-medium">
                @{creator.twitter_username || 'Unknown'}
              </div>
              {creator.ring && (
                <div className="text-[10px] text-akari-muted">
                  {creator.ring.charAt(0).toUpperCase() + creator.ring.slice(1)} · {creator.arc_points.toLocaleString()} pts
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
