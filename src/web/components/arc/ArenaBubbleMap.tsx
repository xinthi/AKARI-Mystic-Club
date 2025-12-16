/**
 * Arena Bubble Map Component
 * 
 * Visualizes creators as bubbles sized by points and colored by ring
 * With floating animations and interactive free-flow positioning
 */

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

type Ring = "core" | "momentum" | "discovery" | string;

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
  via?: string; // intermediate node for 2nd degree connections
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ArenaBubbleMap({ creators }: ArenaBubbleMapProps) {
  // ALL HOOKS MUST BE AT THE TOP - BEFORE ANY CONDITIONAL RETURNS
  const containerRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Map<string, BubblePosition>>(new Map());
  const [isHovered, setIsHovered] = useState<string | null>(null);
  const animationFrameRef = useRef<number>();
  const svgRef = useRef<SVGSVGElement>(null);

  // Normalize creators array (handle null/undefined)
  const validCreators = React.useMemo(() => {
    if (!creators || !Array.isArray(creators)) return [];
    return creators.filter(c => c && c.twitter_username);
  }, [creators]);

  // Helper to get Twitter profile image URL
  const getProfileImageUrl = React.useCallback((username: string | null | undefined): string | null => {
    if (!username) return null;
    // Use unavatar.io service for Twitter profile images
    return `https://unavatar.io/twitter/${encodeURIComponent(username)}?fallback=false`;
  }, []);

  // Compute network connections (infer from same ring and similar points for now)
  // In production, this would come from actual connection data
  const computeNetworkConnections = React.useMemo((): NetworkConnection[] => {
    if (!validCreators || validCreators.length === 0) return [];
    const connections: NetworkConnection[] = [];
    
    // First degree: Same ring creators (direct connections)
    validCreators.forEach((creator, i) => {
      if (!creator.ring) return;
      validCreators.forEach((other, j) => {
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

    // Add second degree connections with intermediate nodes
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
                via: mid, // Store intermediate node
              });
            }
          });
        }
      });
    });

    return connections;
  }, [validCreators]);

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
    if (!validCreators || validCreators.length === 0) return [];

    const points = validCreators.map(c => (c.arc_points ?? 0));
    if (points.length === 0) return [];
    
    const minPoints = Math.min(...points);
    const maxPoints = Math.max(...points);
    const range = maxPoints - minPoints;

    // Normalize: min → 40px, max → 100px (slightly larger for better visibility)
    const minSize = 40;
    const maxSize = 100;

    return validCreators.map((creator) => {
      if (!creator || !creator.twitter_username) return null;
      
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
    }).filter((c): c is NonNullable<typeof c> => c !== null);
  }, [validCreators]);

  // Initialize random positions and velocities
  useEffect(() => {
    if (!containerRef.current || computeBubbleSizes.length === 0) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth || 0;
    const containerHeight = container.clientHeight || 0;
    
    if (containerWidth === 0 || containerHeight === 0) return;

    const newPositions = new Map<string, BubblePosition>();
    
    computeBubbleSizes.forEach((creator, index) => {
      if (!creator || !creator.twitter_username) return;
      
      const key = creator.twitter_username.toLowerCase().trim() || `creator-${index}`;
      const size = creator.size || 50;
      
      // Random starting position (avoid edges)
      const padding = Math.max(size, 50);
      const availableWidth = Math.max(0, containerWidth - padding * 2);
      const availableHeight = Math.max(0, containerHeight - padding * 2);
      
      if (availableWidth <= 0 || availableHeight <= 0) return;
      
      const x = padding + Math.random() * availableWidth;
      const y = padding + Math.random() * availableHeight;
      
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

    if (newPositions.size > 0) {
      setPositions(newPositions);
    }
  }, [computeBubbleSizes]);

  // Get connections for hovered creator
  const hoveredConnections = React.useMemo(() => {
    if (!isHovered) return [];
    const hoveredKey = isHovered.toLowerCase();
    return computeNetworkConnections.filter(
      conn => conn.from === hoveredKey || conn.to === hoveredKey
    );
  }, [isHovered, computeNetworkConnections]);

  // Calculate radial positions for connected bubbles around hovered bubble
  const calculateRadialPositions = React.useCallback((
    centerX: number,
    centerY: number,
    connectedKeys: string[],
    minRadius: number = 150
  ): Map<string, { x: number; y: number }> => {
    const radialPositions = new Map<string, { x: number; y: number }>();
    
    if (!connectedKeys || connectedKeys.length === 0) {
      return radialPositions;
    }
    
    const angleStep = (2 * Math.PI) / connectedKeys.length;

    connectedKeys.forEach((key, index) => {
      if (!key) return;
      const angle = index * angleStep;
      const radius = minRadius + (Math.random() * 50); // Add some variation
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      radialPositions.set(key, { x, y });
    });

    return radialPositions;
  }, []);

  // Animation loop
  useEffect(() => {
    if (!containerRef.current || positions.size === 0) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth || 0;
    const containerHeight = container.clientHeight || 0;
    
    if (containerWidth === 0 || containerHeight === 0) return;

    const animate = () => {
      setPositions((prev) => {
        const next = new Map(prev);
        
        // If hovering, calculate radial layout
        if (isHovered && hoveredConnections && hoveredConnections.length > 0) {
          const hoveredKey = isHovered.toLowerCase();
          const hoveredPos = prev.get(hoveredKey);
          
          if (hoveredPos && containerWidth > 0 && containerHeight > 0) {
            // Stop the hovered bubble
            const hoveredCreator = computeBubbleSizes.find(c => c.twitter_username.toLowerCase() === hoveredKey);
            const hoveredSize = hoveredCreator?.size || 50;
            
            next.set(hoveredKey, {
              x: hoveredPos.x,
              y: hoveredPos.y,
              vx: 0,
              vy: 0,
            });

            // Get connected bubbles (first degree only for radial layout)
            const connectedKeys = hoveredConnections
              .filter(conn => conn.degree === 1)
              .map(conn => {
                const otherKey = conn.from === hoveredKey ? conn.to : conn.from;
                return otherKey;
              })
              .filter((key, index, self) => self.indexOf(key) === index); // Remove duplicates

            // Calculate radial positions
            const radialPositions = calculateRadialPositions(
              hoveredPos.x,
              hoveredPos.y,
              connectedKeys,
              120
            );

            // Animate connected bubbles to radial positions
            connectedKeys.forEach(key => {
              const currentPos = prev.get(key);
              const targetPos = radialPositions.get(key);
              
              if (currentPos && targetPos) {
                const dx = targetPos.x - currentPos.x;
                const dy = targetPos.y - currentPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Smooth transition to radial position
                const speed = Math.min(distance * 0.1, 3);
                const newX = distance > 5 ? currentPos.x + (dx / distance) * speed : targetPos.x;
                const newY = distance > 5 ? currentPos.y + (dy / distance) * speed : targetPos.y;
                
                // Ensure within bounds
                const creator = computeBubbleSizes.find(c => c && c.twitter_username && c.twitter_username.toLowerCase() === key);
                const size = creator?.size || 50;
                const padding = size / 2;
                
                const clampedX = Math.max(padding, Math.min(containerWidth - padding, newX));
                const clampedY = Math.max(padding, Math.min(containerHeight - padding, newY));
                
                next.set(key, {
                  x: clampedX,
                  y: clampedY,
                  vx: 0,
                  vy: 0,
                });
              }
            });

            // Other bubbles continue normal movement (but slower)
            prev.forEach((pos, key) => {
              if (!key || key === hoveredKey || connectedKeys.includes(key)) return;
              
              const creator = computeBubbleSizes.find(c => c && c.twitter_username && c.twitter_username.toLowerCase() === key) || computeBubbleSizes[0];
              if (!creator) return;
              const size = creator.size || 50;
              const padding = size / 2;
              
              let newX = pos.x + pos.vx * 0.3; // Slower movement
              let newY = pos.y + pos.vy * 0.3;
              let newVx = pos.vx;
              let newVy = pos.vy;

              // Bounce off walls
              if (newX <= padding || newX >= containerWidth - padding) {
                newVx = -newVx * 0.8;
                newX = Math.max(padding, Math.min(containerWidth - padding, newX));
              }
              if (newY <= padding || newY >= containerHeight - padding) {
                newVy = -newVy * 0.8;
                newY = Math.max(padding, Math.min(containerHeight - padding, newY));
              }

              // Add slight random drift
              newVx += (Math.random() - 0.5) * 0.02;
              newVy += (Math.random() - 0.5) * 0.02;

              // Limit velocity
              const maxVel = 1.0;
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
          }
        } else {
          // Normal free-flow animation when not hovering
          prev.forEach((pos, key) => {
            if (!key) return;
            const creator = computeBubbleSizes.find(c => c && c.twitter_username && (c.twitter_username.toLowerCase() || '') === key) || computeBubbleSizes[0];
            if (!creator) return;
            const size = creator.size || 50;
            const padding = size / 2;
            
            let newX = pos.x + pos.vx;
            let newY = pos.y + pos.vy;
            let newVx = pos.vx;
            let newVy = pos.vy;

            // Bounce off walls
            if (newX <= padding || newX >= containerWidth - padding) {
              newVx = -newVx * 0.8;
              newX = Math.max(padding, Math.min(containerWidth - padding, newX));
            }
            if (newY <= padding || newY >= containerHeight - padding) {
              newVy = -newVy * 0.8;
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
        }

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
  }, [positions.size, computeBubbleSizes, isHovered, hoveredConnections, calculateRadialPositions]);

  // NOW WE CAN DO VALIDATION CHECKS AND EARLY RETURNS
  if (!creators || !Array.isArray(creators)) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-akari-muted">
          Invalid creators data.
        </p>
      </div>
    );
  }

  if (validCreators.length === 0) {
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
        {/* Show connection lines from hovered bubble to its network */}
        {isHovered && hoveredConnections && hoveredConnections.length > 0 && hoveredConnections
          .filter(conn => conn && conn.degree === 1)
          .map((conn, idx) => {
            if (!conn || !isHovered) return null;
            const hoveredKey = isHovered.toLowerCase();
            const fromKey = conn.from?.toLowerCase();
            const toKey = conn.to?.toLowerCase();
            if (!fromKey || !toKey) return null;
            
            const otherKey = fromKey === hoveredKey ? toKey : fromKey;
            
            const hoveredPos = positions.get(hoveredKey);
            const otherPos = positions.get(otherKey);
            
            if (!hoveredPos || !otherPos) return null;

            const hoveredCreator = computeBubbleSizes.find(c => c.twitter_username.toLowerCase() === hoveredKey);
            const otherCreator = computeBubbleSizes.find(c => c.twitter_username.toLowerCase() === otherKey);
            const hoveredSize = hoveredCreator?.size || 50;
            const otherSize = otherCreator?.size || 50;

            // Calculate line endpoints at bubble edges
            const dx = otherPos.x - hoveredPos.x;
            const dy = otherPos.y - hoveredPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance === 0) return null;
            const unitX = dx / distance;
            const unitY = dy / distance;
            
            const startX = hoveredPos.x + unitX * (hoveredSize / 2);
            const startY = hoveredPos.y + unitY * (hoveredSize / 2);
            const endX = otherPos.x - unitX * (otherSize / 2);
            const endY = otherPos.y - unitY * (otherSize / 2);

            return (
              <line
                key={`network-${hoveredKey}-${otherKey}-${idx}`}
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke="rgba(139, 92, 246, 0.8)"
                strokeWidth={3}
                className="transition-all duration-300"
                style={{
                  filter: 'drop-shadow(0 0 4px rgba(139, 92, 246, 1))',
                }}
              />
            );
          })}

        {/* Show second-degree connections (paths through mutual connections) */}
        {isHovered && hoveredConnections
          .filter(conn => conn.degree === 2 && conn.via)
          .map((conn, idx) => {
            const fromKey = conn.from.toLowerCase();
            const toKey = conn.to.toLowerCase();
            const viaKey = conn.via.toLowerCase();
            const fromPos = positions.get(fromKey);
            const toPos = positions.get(toKey);
            const viaPos = positions.get(viaKey);
            
            if (!fromPos || !toPos || !viaPos) return null;

            const fromCreator = computeBubbleSizes.find(c => c.twitter_username.toLowerCase() === fromKey);
            const toCreator = computeBubbleSizes.find(c => c.twitter_username.toLowerCase() === toKey);
            const viaCreator = computeBubbleSizes.find(c => c.twitter_username.toLowerCase() === viaKey);
            const fromSize = fromCreator?.size || 50;
            const toSize = toCreator?.size || 50;
            const viaSize = viaCreator?.size || 50;

            // Calculate line endpoints for A → B (from → via)
            const dx1 = viaPos.x - fromPos.x;
            const dy1 = viaPos.y - fromPos.y;
            const distance1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
            if (distance1 === 0) return null;
            const unitX1 = dx1 / distance1;
            const unitY1 = dy1 / distance1;
            const startX1 = fromPos.x + unitX1 * (fromSize / 2);
            const startY1 = fromPos.y + unitY1 * (fromSize / 2);
            const endX1 = viaPos.x - unitX1 * (viaSize / 2);
            const endY1 = viaPos.y - unitY1 * (viaSize / 2);

            // Calculate line endpoints for B → C (via → to)
            const dx2 = toPos.x - viaPos.x;
            const dy2 = toPos.y - viaPos.y;
            const distance2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
            if (distance2 === 0) return null;
            const unitX2 = dx2 / distance2;
            const unitY2 = dy2 / distance2;
            const startX2 = viaPos.x + unitX2 * (viaSize / 2);
            const startY2 = viaPos.y + unitY2 * (viaSize / 2);
            const endX2 = toPos.x - unitX2 * (toSize / 2);
            const endY2 = toPos.y - unitY2 * (toSize / 2);

            return (
              <g key={`path-${fromKey}-${viaKey}-${toKey}-${idx}`}>
                {/* Line from A to B (source to mutual connection) */}
                <line
                  x1={startX1}
                  y1={startY1}
                  x2={endX1}
                  y2={endY1}
                  stroke="rgba(59, 130, 246, 0.6)"
                  strokeWidth={2}
                  strokeDasharray="5,5"
                  className="transition-opacity duration-300"
                  style={{
                    filter: 'drop-shadow(0 0 3px rgba(59, 130, 246, 0.8))',
                  }}
                />
                {/* Line from B to C (mutual connection to target) */}
                <line
                  x1={startX2}
                  y1={startY2}
                  x2={endX2}
                  y2={endY2}
                  stroke="rgba(59, 130, 246, 0.6)"
                  strokeWidth={2}
                  strokeDasharray="5,5"
                  className="transition-opacity duration-300"
                  style={{
                    filter: 'drop-shadow(0 0 3px rgba(59, 130, 246, 0.8))',
                  }}
                />
                {/* Highlight the mutual connection node (B) */}
                <circle
                  cx={viaPos.x}
                  cy={viaPos.y}
                  r="6"
                  fill="rgba(59, 130, 246, 0.9)"
                  stroke="rgba(255, 255, 255, 0.8)"
                  strokeWidth="1.5"
                  className="transition-opacity duration-300"
                  style={{
                    filter: 'drop-shadow(0 0 6px rgba(59, 130, 246, 1))',
                  }}
                />
              </g>
            );
          })}
      </svg>

      {computeBubbleSizes.map((creator, index) => {
        if (!creator || !creator.twitter_username) return null;
        
        const key = creator.twitter_username.toLowerCase().trim() || `creator-${index}`;
        const pos = positions.get(key);
        if (!pos) return null;
        
        const creatorUrl = `/portal/arc/creator/${encodeURIComponent(creator.twitter_username.toLowerCase().trim())}`;
        const isHoveredBubble = isHovered?.toLowerCase() === key;
        const profileImageUrl = getProfileImageUrl(creator.twitter_username);

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
                    <div className="mb-1">
                      {hoveredConnections.filter(c => c.degree === 1).length} direct · {hoveredConnections.filter(c => c.degree === 2).length} secondary
                    </div>
                    {/* Show connection paths */}
                    {hoveredConnections.filter(c => c && c.degree === 1).slice(0, 3).map((conn, idx) => {
                      if (!conn || !isHovered) return null;
                      const hoveredKey = isHovered.toLowerCase();
                      const otherKey = conn.from?.toLowerCase() === hoveredKey 
                        ? conn.to 
                        : conn.from;
                      if (!otherKey) return null;
                      const otherCreator = validCreators.find(c => c && c.twitter_username && c.twitter_username.toLowerCase() === otherKey);
                      return (
                        <div key={`direct-${idx}`} className="text-[9px] opacity-75">
                          → @{otherCreator?.twitter_username || otherKey}
                        </div>
                      );
                    })}
                    {hoveredConnections.filter(c => c && c.degree === 2).slice(0, 2).map((conn, idx) => {
                      if (!conn || !isHovered) return null;
                      const hoveredKey = isHovered.toLowerCase();
                      const otherKey = conn.from?.toLowerCase() === hoveredKey 
                        ? conn.to 
                        : conn.from;
                      if (!otherKey || !conn.via) return null;
                      const viaCreator = validCreators.find(c => c && c.twitter_username && c.twitter_username.toLowerCase() === conn.via?.toLowerCase());
                      const otherCreator = validCreators.find(c => c && c.twitter_username && c.twitter_username.toLowerCase() === otherKey);
                      return (
                        <div key={`second-${idx}`} className="text-[9px] opacity-60">
                          → @{viaCreator?.twitter_username || conn.via} → @{otherCreator?.twitter_username || otherKey}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
