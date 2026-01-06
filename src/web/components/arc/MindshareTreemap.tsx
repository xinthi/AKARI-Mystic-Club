/**
 * Mindshare Treemap Component
 * 
 * Displays top 20 users as a treemap visualization
 */

import React from 'react';
import Image from 'next/image';

interface TreemapNode {
  name: string;
  value: number;
  handle: string;
  avatar: string | null;
}

interface MindshareTreemapProps {
  nodes: TreemapNode[];
  loading?: boolean;
}

export function MindshareTreemap({ nodes, loading }: MindshareTreemapProps) {
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

  if (!nodes || nodes.length === 0) {
    return (
      <div className="w-full h-64 bg-white/5 rounded-lg border border-white/10 p-4 flex items-center justify-center">
        <p className="text-white/40 text-sm">No data available</p>
      </div>
    );
  }

  // Calculate total for percentage calculations
  const total = nodes.reduce((sum, node) => sum + node.value, 0);
  if (total === 0) {
    return (
      <div className="w-full h-64 bg-white/5 rounded-lg border border-white/10 p-4 flex items-center justify-center">
        <p className="text-white/40 text-sm">No mindshare data</p>
      </div>
    );
  }

  // Sort by value descending
  const sortedNodes = [...nodes].sort((a, b) => b.value - a.value);

  return (
    <div className="w-full bg-white/5 rounded-lg border border-white/10 p-4">
      <h3 className="text-sm font-medium text-white/80 mb-4">Top 20 Contributors</h3>
      <div className="grid grid-cols-4 gap-2">
        {sortedNodes.slice(0, 20).map((node, index) => {
          const percentage = (node.value / total) * 100;
          const size = Math.max(8, Math.min(16, percentage * 0.2)); // Scale between 8-16 based on percentage
          
          return (
            <div
              key={node.handle || index}
              className="relative bg-white/10 rounded border border-white/20 p-2 hover:bg-white/15 transition-colors group"
              style={{
                gridColumn: index % 4 === 0 ? 'span 1' : 'span 1',
                gridRow: 'span 1',
              }}
            >
              <div className="flex items-center gap-2">
                {node.avatar ? (
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border border-white/20 flex-shrink-0">
                    <Image
                      src={node.avatar}
                      alt={node.handle || 'Avatar'}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex-shrink-0 flex items-center justify-center">
                    <span className="text-white/60 text-xs">
                      {(node.handle || '?')[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-medium truncate">
                    {node.handle || 'Unknown'}
                  </p>
                  <p className="text-white/60 text-xs">
                    {percentage.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
