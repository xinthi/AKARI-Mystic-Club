/**
 * Arena Bubble Map Component
 * 
 * Visualizes creators as bubbles sized by points and colored by ring
 * With floating animations and interactive free-flow positioning
 */

import React, { useState, useEffect, useRef } from 'react';
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

interface BubblePosition {
  x: number;
  y: number;
  vx: number; // velocity x
  vy: number; // velocity y
}

interface NetworkConnection {
  from: string; // twitter_username
  to: string; // twitter_username
  degree: 1 | 2; // 1 = direct connection, 2 = secondary connection
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ArenaBubbleMap({ creators }: ArenaBubbleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Map<string, BubblePosition>>(new Map());
  const [isHovered, setIsHovered] = useState<string | null>(null);
  const animationFrameRef = useRef<number>();
  const svgRef = useRef<SVGSVGElement>(null);

  // Helper to get Twitter profile image URL
  const getProfileImageUrl = (username: string | null | undefined): string | null => {
    if (!username) return null;
    // Use unavatar.io service for Twitter profile images
    return `https://unavatar.io/twitter/${encodeURIComponent(username)}?fallback=false`;
  };

  // Compute network connections (infer from same ring and similar points for now)
  // In production, this would come from actual connection data
  const computeNetworkConnections = React.useMemo((): NetworkConnection[] => {
    const connections: NetworkConnection[] = [];
    const usernames = creators.map(c => c.twitter_username.toLowerCase());
    
    // First degree: Same ring creators (direct connections)
    creators.forEach((creator, i) => {
      if (!creator.ring) return;
      creators.forEach((other, j) => {
        if (i === j || !other.ring) return;
        if (creator.ring.toLowerCase() === other.ring.toLowerCase()) {
          connections.push({
            from: creator.twitter_username.toLowerCase(),
            to: other.twitter_username.toLowerCase(),
            degree: 1,
          });
        }
      });
    });

    // Second degree: Connections of connections (limit to avoid too many lines)
    const firstDegreeMap = new Map<string, Set<string>>();
    connections.forEach(conn => {
      if (conn.degree === 1) {
        if (!firstDegreeMap.has(conn.from)) {
          firstDegreeMap.set(conn.from, new Set());
        }
        firstDegreeMap.get(conn.from)!.add(conn.to);
      }
    });

    // Add second degree connections
    firstDegreeMap.forEach((connected, from) => {
      connected.forEach(mid => {
        const midConnections = firstDegreeMap.get(mid);
        if (midConnections) {
          midConnections.forEach(to => {
            if (to !== from && !connected.has(to)) {
              connections.push({
                from: from,
                to: to,
                degree: 2,
              });
            }
          });
        }
      });
    });

    return connections;
  }, [creators]);

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

    // Normalize: min → 40px, max → 100px (slightly larger for better visibility)
    const minSize = 40;
    const maxSize = 100;

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

  // Initialize random positions and velocities
  useEffect(() => {
    if (!containerRef.current || computeBubbleSizes.length === 0) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const newPositions = new Map<string, BubblePosition>();
    
    computeBubbleSizes.forEach((creator, index) => {
      const key = creator.twitter_username || `creator-${index}`;
      const size = creator.size;
      
      // Random starting position (avoid edges)
      const padding = Math.max(size, 50);
      const x = padding + Math.random() * (containerWidth - padding * 2);
      const y = padding + Math.random() * (containerHeight - padding * 2);
      
      // Random velocity (slow drift)
      const speed = 0.3 + Math.random() * 0.4; // 0.3 to 0.7 pixels per frame
      const angle = Math.random() * Math.PI * 2;
      
      newPositions.set(key, {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
      });
    });

    setPositions(newPositions);
  }, [computeBubbleSizes]);

  // Animation loop
  useEffect(() => {
    if (!containerRef.current || positions.size === 0) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    const animate = () => {
      setPositions((prev) => {
        const next = new Map(prev);
        
        prev.forEach((pos, key) => {
          const creator = computeBubbleSizes.find(c => (c.twitter_username || '') === key) || computeBubbleSizes[0];
          const size = creator?.size || 50;
          const padding = size / 2;
          
          let newX = pos.x + pos.vx;
          let newY = pos.y + pos.vy;
          let newVx = pos.vx;
          let newVy = pos.vy;

          // Bounce off walls
          if (newX <= padding || newX >= containerWidth - padding) {
            newVx = -newVx * 0.8; // Damping
            newX = Math.max(padding, Math.min(containerWidth - padding, newX));
          }
          if (newY <= padding || newY >= containerHeight - padding) {
            newVy = -newVy * 0.8; // Damping
            newY = Math.max(padding, Math.min(containerHeight - padding, newY));
          }

          // Add slight random drift
          newVx += (Math.random() - 0.5) * 0.05;
          newVy += (Math.random() - 0.5) * 0.05;

          // Limit velocity
          const maxVel = 1.5;
          const vel = Math.sqrt(newVx * newVx + newVy * newVy);
          if (vel > maxVel) {
            newVx = (newVx / vel) * maxVel;
            newVy = (newVy / vel) * maxVel;
          }

          next.set(key, {
            x: newX,
            y: newY,
            vx: newVx,
            vy: newVy,
          });
        });

        return next;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [positions.size, computeBubbleSizes]);

  // Get connections for hovered creator (must be before early return)
  const hoveredConnections = React.useMemo(() => {
    if (!isHovered) return [];
    const hoveredKey = isHovered.toLowerCase();
    return computeNetworkConnections.filter(
      conn => conn.from === hoveredKey || conn.to === hoveredKey
    );
  }, [isHovered, computeNetworkConnections]);

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
    <div 
      ref={containerRef}
      className="relative w-full min-h-[400px] overflow-hidden"
      style={{ height: '500px' }}
    >
      {/* SVG overlay for connection lines */}
      <svg
        ref={svgRef}
        className="absolute inset-0 pointer-events-none z-0"
        style={{ width: '100%', height: '100%' }}
      >
        {isHovered && hoveredConnections.map((conn, idx) => {
          const fromKey = conn.from.toLowerCase();
          const toKey = conn.to.toLowerCase();
          const fromPos = positions.get(fromKey);
          const toPos = positions.get(toKey);
          
          if (!fromPos || !toPos) return null;

          const fromCreator = computeBubbleSizes.find(c => c.twitter_username.toLowerCase() === fromKey);
          const toCreator = computeBubbleSizes.find(c => c.twitter_username.toLowerCase() === toKey);
          const fromSize = fromCreator?.size || 50;
          const toSize = toCreator?.size || 50;

          // Line color based on connection degree
          const lineColor = conn.degree === 1 
            ? 'rgba(139, 92, 246, 0.6)' // Purple for first degree
            : 'rgba(59, 130, 246, 0.4)'; // Blue for second degree
          const lineWidth = conn.degree === 1 ? 2 : 1;

          return (
            <line
              key={`${fromKey}-${toKey}-${idx}`}
              x1={fromPos.x}
              y1={fromPos.y}
              x2={toPos.x}
              y2={toPos.y}
              stroke={lineColor}
              strokeWidth={lineWidth}
              strokeDasharray={conn.degree === 2 ? '4,4' : '0'}
              className="transition-opacity duration-300"
              style={{
                filter: 'drop-shadow(0 0 2px rgba(139, 92, 246, 0.5))',
              }}
            />
          );
        })}
      </svg>

      {computeBubbleSizes.map((creator, index) => {
        const key = creator.twitter_username || `creator-${index}`;
        const pos = positions.get(key);
        const creatorUrl = `/portal/arc/creator/${encodeURIComponent((creator.twitter_username || '').toLowerCase())}`;
        const isHoveredBubble = isHovered === key;
        const profileImageUrl = getProfileImageUrl(creator.twitter_username);

        if (!pos) return null;

        return (
          <Link
            key={key}
            href={creatorUrl}
            className="group absolute flex flex-col items-center justify-center transition-all duration-300 ease-out"
            style={{
              left: `${pos.x}px`,
              top: `${pos.y}px`,
              width: `${creator.size}px`,
              height: `${creator.size}px`,
              transform: `translate(-50%, -50%) ${isHoveredBubble ? 'scale(1.15)' : 'scale(1)'}`,
              zIndex: isHoveredBubble ? 20 : 10,
            }}
            onMouseEnter={() => setIsHovered(key)}
            onMouseLeave={() => setIsHovered(null)}
          >
            <div
              className={`w-full h-full rounded-full border-2 flex items-center justify-center transition-all duration-300 overflow-hidden relative ${getRingColor(
                creator.ring
              )} ${isHoveredBubble ? 'shadow-2xl shadow-akari-primary/40' : 'shadow-lg'}`}
              style={{
                animation: isHoveredBubble ? 'none' : 'float 6s ease-in-out infinite',
                animationDelay: `${index * 0.2}s`,
              }}
            >
              {/* Profile image background with dimming */}
              {profileImageUrl && (
                <div 
                  className="absolute inset-0 opacity-30 group-hover:opacity-40 transition-opacity duration-300"
                  style={{
                    backgroundImage: `url(${profileImageUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'blur(2px) brightness(0.7)',
                  }}
                />
              )}
              
              {/* Dimming overlay */}
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors duration-300" />

              {/* Content overlay */}
              <div className="relative z-10 text-center px-2">
                <div className={`text-xs font-semibold ${getRingTextColor(creator.ring)} truncate max-w-full drop-shadow-lg`}>
                  @{creator.twitter_username || 'Unknown'}
                </div>
                <div className="text-[10px] text-akari-muted mt-0.5 drop-shadow-lg">
                  {creator.arc_points.toLocaleString()} pts
                </div>
              </div>
            </div>
            {/* Tooltip on hover */}
            {isHoveredBubble && (
              <div className="absolute bottom-full mb-3 z-30 px-3 py-2 rounded-lg bg-akari-card border border-akari-border/30 shadow-xl animate-in fade-in duration-200">
                <div className="text-xs text-akari-text font-medium">
                  @{creator.twitter_username || 'Unknown'}
                </div>
                {creator.ring && (
                  <div className="text-[10px] text-akari-muted">
                    {creator.ring.charAt(0).toUpperCase() + creator.ring.slice(1)} · {creator.arc_points.toLocaleString()} pts
                  </div>
                )}
                {hoveredConnections.length > 0 && (
                  <div className="text-[10px] text-akari-muted mt-1 pt-1 border-t border-akari-border/20">
                    {hoveredConnections.filter(c => c.degree === 1).length} direct · {hoveredConnections.filter(c => c.degree === 2).length} secondary
                  </div>
                )}
              </div>
            )}
          </Link>
        );
      })}

      {/* CSS Animation for floating effect */}
      <style jsx>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }
      `}</style>
    </div>
  );
}
