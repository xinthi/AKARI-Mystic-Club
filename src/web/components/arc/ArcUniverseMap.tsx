/**
 * ARC Universe Map Component
 * 
 * Visualizes all ARC projects as bubbles in a universe-style map.
 * Shows project participation, stats, and user's footprint.
 */

import React, { useState, useMemo } from 'react';
import Link from 'next/link';

// =============================================================================
// TYPES
// =============================================================================

export interface ArcUniverseMapProps {
  projects: {
    id: string;
    name: string;
    slug: string;
    twitter_username: string | null;
    meta?: {
      accent_color?: string | null;
      banner_url?: string | null;
      tagline?: string | null;
    } | null;
    stats?: {
      activeCreators: number;
      totalPoints: number;
      trend: 'rising' | 'stable' | 'cooling';
      userIsParticipant: boolean;
      userRank?: number | null;
    };
  }[];
}

interface BubbleData {
  project: ArcUniverseMapProps['projects'][0];
  size: number;
  x: number;
  y: number;
  zIndex: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Normalize a value between min and max to a range
 */
function normalize(value: number, min: number, max: number, targetMin: number, targetMax: number): number {
  if (max === min) return (targetMin + targetMax) / 2;
  const normalized = (value - min) / (max - min);
  return targetMin + normalized * (targetMax - targetMin);
}

/**
 * Get bubble color from project accent color or default
 */
function getBubbleColor(accentColor: string | null | undefined): string {
  if (accentColor) {
    // Validate hex color
    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(accentColor)) {
      return accentColor;
    }
  }
  // Default gradient colors
  const defaults = [
    '#8B5CF6', // purple
    '#3B82F6', // blue
    '#10B981', // green
    '#F59E0B', // amber
    '#EF4444', // red
    '#EC4899', // pink
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

/**
 * Generate deterministic positions for bubbles
 * Creates a clustered layout with slight offsets
 */
function generatePositions(count: number, containerWidth: number, containerHeight: number): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];
  
  if (count === 0) return positions;
  
  // Use a grid-based approach with clustering
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  
  const cellWidth = containerWidth / cols;
  const cellHeight = containerHeight / rows;
  
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    
    // Base position in cell center
    const baseX = col * cellWidth + cellWidth / 2;
    const baseY = row * cellHeight + cellHeight / 2;
    
    // Add random offset within cell (deterministic based on index)
    const seed = i * 137.508; // Golden angle approximation
    const offsetX = (Math.sin(seed) * cellWidth * 0.3);
    const offsetY = (Math.cos(seed) * cellHeight * 0.3);
    
    positions.push({
      x: Math.max(60, Math.min(containerWidth - 60, baseX + offsetX)),
      y: Math.max(60, Math.min(containerHeight - 60, baseY + offsetY)),
    });
  }
  
  return positions;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ArcUniverseMap({ projects }: ArcUniverseMapProps) {
  const [viewMode, setViewMode] = useState<'all' | 'footprint'>('all');
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 600, height: 400 });

  // Container ref for size calculation
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Update container size on mount and resize
  React.useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({
          width: rect.width || 600,
          height: rect.height || 400,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Compute bubble data
  const bubbles = useMemo((): BubbleData[] => {
    if (!projects || projects.length === 0) return [];

    // Calculate sizes based on totalPoints or activeCreators
    const sizes = projects.map(p => {
      const value = p.stats?.totalPoints || p.stats?.activeCreators || 0;
      return value;
    });

    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);

    // Generate positions
    const positions = generatePositions(projects.length, containerSize.width, containerSize.height);

    // Create bubble data with sizes and positions
    const bubbleData: BubbleData[] = projects.map((project, index) => {
      const value = project.stats?.totalPoints || project.stats?.activeCreators || 0;
      const size = normalize(value, minSize, maxSize, 40, 120);
      
      return {
        project,
        size: Math.round(size),
        x: positions[index]?.x || containerSize.width / 2,
        y: positions[index]?.y || containerSize.height / 2,
        zIndex: Math.round(size), // Larger bubbles on top
      };
    });

    // Sort by size (largest first) for z-index ordering
    return bubbleData.sort((a, b) => b.size - a.size);
  }, [projects, containerSize]);

  // Filter bubbles based on view mode
  const visibleBubbles = useMemo(() => {
    if (viewMode === 'all') return bubbles;
    return bubbles.filter(b => b.project.stats?.userIsParticipant === true);
  }, [bubbles, viewMode]);

  if (!projects || projects.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 min-h-[400px]">
        <p className="text-sm text-white/60">
          No projects to display.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Toggle buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setViewMode('all')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            viewMode === 'all'
              ? 'bg-white/10 text-white border border-white/20'
              : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
          }`}
        >
          All campaigns
        </button>
        <button
          onClick={() => setViewMode('footprint')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            viewMode === 'footprint'
              ? 'bg-white/10 text-white border border-white/20'
              : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
          }`}
        >
          My footprint
        </button>
      </div>

      {/* Bubble map container */}
      <div
        ref={containerRef}
        className="relative w-full min-h-[400px] rounded-xl overflow-hidden bg-gradient-to-br from-black/40 to-black/60 border border-white/10"
        style={{ height: '500px' }}
      >
        {bubbles.map((bubble) => {
          const isHovered = hoveredProjectId === bubble.project.id;
          const isParticipant = bubble.project.stats?.userIsParticipant === true;
          const color = getBubbleColor(bubble.project.meta?.accent_color);
          const opacity = viewMode === 'footprint' && !isParticipant ? 0.3 : 1;

          return (
            <Link
              key={bubble.project.id}
              href={`/portal/arc/${bubble.project.slug}`}
              className="absolute transition-all duration-300 group"
              style={{
                left: `${bubble.x}px`,
                top: `${bubble.y}px`,
                width: `${bubble.size}px`,
                height: `${bubble.size}px`,
                transform: `translate(-50%, -50%) ${isHovered ? 'scale(1.15)' : 'scale(1)'}`,
                zIndex: isHovered ? 100 : bubble.zIndex,
                opacity,
              }}
              onMouseEnter={() => setHoveredProjectId(bubble.project.id)}
              onMouseLeave={() => setHoveredProjectId(null)}
            >
              {/* Bubble */}
              <div
                className="w-full h-full rounded-full flex items-center justify-center relative overflow-hidden transition-all duration-300"
                style={{
                  backgroundColor: `${color}40`,
                  border: `2px solid ${color}80`,
                  boxShadow: isParticipant
                    ? `0 0 ${bubble.size / 2}px ${color}60, inset 0 0 ${bubble.size / 3}px ${color}40`
                    : `0 0 ${bubble.size / 4}px ${color}40`,
                }}
              >
                {/* Outer ring glow for participants */}
                {isParticipant && (
                  <div
                    className="absolute inset-0 rounded-full animate-pulse"
                    style={{
                      border: `3px solid ${color}`,
                      boxShadow: `0 0 ${bubble.size / 2}px ${color}, inset 0 0 ${bubble.size / 3}px ${color}40`,
                      opacity: 0.6,
                    }}
                  />
                )}

                {/* Project name (truncated) */}
                <div className="relative z-10 text-center px-2">
                  <div className="text-xs font-semibold text-white drop-shadow-lg truncate max-w-full">
                    {bubble.project.name || 'Unknown'}
                  </div>
                  {bubble.project.stats && (
                    <div className="text-[10px] text-white/80 mt-0.5 drop-shadow-lg">
                      {bubble.project.stats.activeCreators} creators
                    </div>
                  )}
                </div>

                {/* Background gradient overlay */}
                <div
                  className="absolute inset-0 rounded-full opacity-20"
                  style={{
                    background: `radial-gradient(circle at center, ${color}80, transparent)`,
                  }}
                />
              </div>

              {/* Tooltip */}
              {isHovered && (
                <div className="absolute bottom-full mb-3 left-1/2 transform -translate-x-1/2 z-50 px-4 py-3 rounded-lg bg-black/95 border border-white/20 shadow-2xl min-w-[200px] animate-in fade-in duration-200">
                  <div className="text-sm font-semibold text-white mb-1">
                    {bubble.project.name}
                  </div>
                  {bubble.project.meta?.tagline && (
                    <div className="text-xs text-white/60 mb-2">
                      {bubble.project.meta.tagline}
                    </div>
                  )}
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-white/60">Active creators:</span>
                      <span className="text-white font-medium">
                        {bubble.project.stats?.activeCreators || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-white/60">Total ARC points:</span>
                      <span className="text-white font-medium">
                        {bubble.project.stats?.totalPoints.toLocaleString() || 0}
                      </span>
                    </div>
                    {isParticipant && bubble.project.stats?.userRank && (
                      <div className="flex justify-between pt-1 border-t border-white/10">
                        <span className="text-white/60">Your rank:</span>
                        <span className="text-white font-semibold">
                          #{bubble.project.stats.userRank}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

