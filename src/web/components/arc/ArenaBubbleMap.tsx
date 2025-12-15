/**
 * Arena Bubble Map Component
 * 
 * Visualizes creators as profile bubbles with trend indicators and connections
 * Interactive network map with flowing animations
 */

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";

type Ring = "core" | "momentum" | "discovery" | string;

interface Creator {
  twitter_username: string;
  arc_points: number;
  ring?: Ring | null;
  previous_points?: number; // Optional: previous points for trend calculation
  avatar_url?: string | null; // Optional: custom avatar URL
  connections?: string[]; // Optional: array of usernames this creator is connected to
}

interface ArenaBubbleMapProps {
  creators: Creator[];
}

interface PositionedCreator extends Creator {
  top: number;
  left: number;
  radius: number;
  velocityX: number;
  velocityY: number;
}

/**
 * Calculate bubble radius based on points
 */
function getRadius(
  points: number,
  minPoints: number,
  maxPoints: number
): number {
  if (maxPoints <= minPoints) {
    return 35; // fallback size
  }
  const minSize = 32;
  const maxSize = 50;
  const ratio = (points - minPoints) / (maxPoints - minPoints);
  return minSize + ratio * (maxSize - minSize);
}

/**
 * Get trend color based on points change
 */
function getTrendColor(creator: Creator): {
  border: string;
  glow: string;
  ring: string;
  overlay: string;
} {
  const hasPrevious = creator.previous_points !== undefined;
  const isIncreasing = hasPrevious && creator.arc_points > creator.previous_points;
  const isDecreasing = hasPrevious && creator.arc_points < creator.previous_points;

  if (isIncreasing) {
    return {
      border: "border-green-400/60",
      glow: "shadow-[0_0_20px_rgba(34,197,94,0.4)]",
      ring: "ring-2 ring-green-400/30",
      overlay: "bg-green-500/40", // More visible green overlay
    };
  } else if (isDecreasing) {
    return {
      border: "border-red-400/60",
      glow: "shadow-[0_0_20px_rgba(239,68,68,0.4)]",
      ring: "ring-2 ring-red-400/30",
      overlay: "bg-red-500/40", // More visible red overlay
    };
  }
  // Neutral/stable
  return {
    border: "border-white/30",
    glow: "shadow-[0_0_15px_rgba(255,255,255,0.15)]",
    ring: "ring-2 ring-white/10",
    overlay: "bg-transparent", // No overlay for neutral
  };
}

/**
 * Get Twitter profile image URL
 */
function getProfileImageUrl(username: string, customUrl?: string | null): string {
  if (customUrl) {
    return customUrl;
  }
  // Use unavatar.io as fallback for Twitter profile images
  return `https://unavatar.io/twitter/${username}?fallback=https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}`;
}

/**
 * Calculate initial positions with collision avoidance
 */
function calculateInitialPositions(
  creators: Creator[],
  getRadiusFn: (points: number) => number
): PositionedCreator[] {
  const count = creators.length;
  const positioned: PositionedCreator[] = [];

  // Sort by points (largest first) to place important creators first
  const sorted = [...creators].sort((a, b) => b.arc_points - a.arc_points);

  // Container dimensions (percentage-based)
  const containerWidth = 100;
  const containerHeight = 100;
  const padding = 5;

  for (let i = 0; i < sorted.length; i++) {
    const creator = sorted[i];
    const radius = getRadiusFn(creator.arc_points);
    const radiusPercent = (radius / 256) * 100;

    let attempts = 0;
    let placed = false;
    let top = 50;
    let left = 50;

    while (!placed && attempts < 50) {
      if (count === 1) {
        top = 50;
        left = 50;
      } else if (count === 2) {
        top = 50;
        left = i === 0 ? 30 : 70;
      } else if (count === 3) {
        const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2;
        const distance = 28;
        top = 50 + distance * Math.sin(angle);
        left = 50 + distance * Math.cos(angle);
      } else if (count === 4) {
        const positions = [
          { top: 28, left: 28 },
          { top: 28, left: 72 },
          { top: 72, left: 28 },
          { top: 72, left: 72 },
        ];
        top = positions[i].top;
        left = positions[i].left;
      } else {
        // 5+ creators: circular with spacing
        const angle = (i * 2 * Math.PI) / count - Math.PI / 2;
        const distance = Math.min(32, 100 / Math.sqrt(count));
        top = 50 + distance * Math.sin(angle);
        left = 50 + distance * Math.cos(angle);
      }

      // Check for collisions
      let collision = false;
      for (const existing of positioned) {
        const dx = left - existing.left;
        const dy = top - existing.top;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = radiusPercent + existing.radius + 1.5;

        if (distance < minDistance) {
          collision = true;
          break;
        }
      }

      // Check bounds
      if (
        !collision &&
        top - radiusPercent >= padding &&
        top + radiusPercent <= containerHeight - padding &&
        left - radiusPercent >= padding &&
        left + radiusPercent <= containerWidth - padding
      ) {
        // Random velocity for floating effect
        const speed = 0.02 + Math.random() * 0.03;
        const angle = Math.random() * 2 * Math.PI;
        positioned.push({
          ...creator,
          top,
          left,
          radius,
          velocityX: Math.cos(angle) * speed,
          velocityY: Math.sin(angle) * speed,
        });
        placed = true;
      } else {
        if (count > 4) {
          top = padding + radiusPercent + Math.random() * (containerHeight - 2 * (padding + radiusPercent));
          left = padding + radiusPercent + Math.random() * (containerWidth - 2 * (padding + radiusPercent));
        }
        attempts++;
      }
    }

    // Fallback placement
    if (!placed) {
      const fallbackTop = padding + radiusPercent + (i * 12) % (containerHeight - 2 * (padding + radiusPercent));
      const fallbackLeft = padding + radiusPercent + (i * 18) % (containerWidth - 2 * (padding + radiusPercent));
      const speed = 0.02 + Math.random() * 0.03;
      const angle = Math.random() * 2 * Math.PI;
      positioned.push({
        ...creator,
        top: fallbackTop,
        left: fallbackLeft,
        radius,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
      });
    }
  }

  return positioned;
}

/**
 * Calculate connections between creators based on actual relationships
 */
function calculateConnections(
  positioned: PositionedCreator[],
  usernameToIndex: Map<string, number>
): Array<{ from: number; to: number }> {
  const connections: Array<{ from: number; to: number }> = [];

  positioned.forEach((creator, fromIndex) => {
    if (creator.connections && creator.connections.length > 0) {
      creator.connections.forEach((connectedUsername) => {
        const toIndex = usernameToIndex.get(connectedUsername.toLowerCase());
        if (toIndex !== undefined && toIndex !== fromIndex) {
          const exists = connections.some(
            (c) => (c.from === fromIndex && c.to === toIndex) || (c.from === toIndex && c.to === fromIndex)
          );
          if (!exists) {
            connections.push({ from: fromIndex, to: toIndex });
          }
        }
      });
    }
  });

  return connections;
}

/**
 * ArenaBubbleMap
 */
export function ArenaBubbleMap({ creators }: ArenaBubbleMapProps) {
  const [hoveredCreator, setHoveredCreator] = useState<string | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);
  const [positions, setPositions] = useState<PositionedCreator[]>([]);
  const animationFrameRef = useRef<number>();
  const containerRef = useRef<HTMLDivElement>(null);
  const count = creators.length;

  const pointsArray = creators.map((c) => c.arc_points);
  const minPoints = Math.min(...pointsArray);
  const maxPoints = Math.max(...pointsArray);
  const getRadiusFn = (points: number) => getRadius(points, minPoints, maxPoints);

  // Initialize positions
  useEffect(() => {
    if (count > 0) {
      const initialPositions = calculateInitialPositions(creators, getRadiusFn);
      setPositions(initialPositions);
    }
  }, [creators, count]);

  // Animation loop
  useEffect(() => {
    if (count === 0 || positions.length === 0) return;

    const animate = () => {
      setPositions((prevPositions) => {
        return prevPositions.map((creator) => {
          // Skip animation if hovered or selected
          if (
            hoveredCreator === creator.twitter_username.toLowerCase() ||
            selectedCreator === creator.twitter_username.toLowerCase()
          ) {
            return creator;
          }

          const radiusPercent = (creator.radius / 256) * 100;
          const padding = 5;

          // Update position
          let newTop = creator.top + creator.velocityY;
          let newLeft = creator.left + creator.velocityX;

          // Bounce off walls
          if (newTop - radiusPercent <= padding || newTop + radiusPercent >= 100 - padding) {
            newTop = creator.top;
            creator.velocityY *= -1;
          }
          if (newLeft - radiusPercent <= padding || newLeft + radiusPercent >= 100 - padding) {
            newLeft = creator.left;
            creator.velocityX *= -1;
          }

          // Check collisions with other bubbles
          let adjusted = false;
          for (const other of prevPositions) {
            if (other.twitter_username === creator.twitter_username) continue;
            if (
              hoveredCreator === other.twitter_username.toLowerCase() ||
              selectedCreator === other.twitter_username.toLowerCase()
            ) {
              continue;
            }

            const dx = newLeft - other.left;
            const dy = newTop - other.top;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const minDistance = radiusPercent + (other.radius / 256) * 100 + 1.5;

            if (distance < minDistance && distance > 0) {
              // Collision detected - bounce away
              const angle = Math.atan2(dy, dx);
              creator.velocityX = Math.cos(angle) * 0.03;
              creator.velocityY = Math.sin(angle) * 0.03;
              adjusted = true;
              break;
            }
          }

          if (!adjusted) {
            // Slight random drift
            creator.velocityX += (Math.random() - 0.5) * 0.001;
            creator.velocityY += (Math.random() - 0.5) * 0.001;
            // Damping
            creator.velocityX *= 0.99;
            creator.velocityY *= 0.99;
          }

          return {
            ...creator,
            top: Math.max(padding + radiusPercent, Math.min(100 - padding - radiusPercent, newTop)),
            left: Math.max(padding + radiusPercent, Math.min(100 - padding - radiusPercent, newLeft)),
            velocityX: creator.velocityX,
            velocityY: creator.velocityY,
          };
        });
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [count, positions.length, hoveredCreator, selectedCreator]);

  // Build username to index map
  const usernameToIndex = new Map<string, number>();
  positions.forEach((creator, index) => {
    usernameToIndex.set(creator.twitter_username.toLowerCase(), index);
  });

  // Calculate connections
  const connections = calculateConnections(positions, usernameToIndex);

  // Get connected indices for hover/selection highlighting
  const getConnectedIndices = (username: string): number[] => {
    const index = positions.findIndex(
      (c) => c.twitter_username.toLowerCase() === username.toLowerCase()
    );
    if (index === -1) return [];
    
    const connected: number[] = [];
    connections.forEach((conn) => {
      if (conn.from === index) connected.push(conn.to);
      if (conn.to === index) connected.push(conn.from);
    });
    return connected;
  };

  const hoveredIndices = hoveredCreator ? [positions.findIndex(c => c.twitter_username.toLowerCase() === hoveredCreator.toLowerCase()), ...getConnectedIndices(hoveredCreator)].filter(i => i !== -1) : [];
  const selectedIndices = selectedCreator ? [positions.findIndex(c => c.twitter_username.toLowerCase() === selectedCreator.toLowerCase()), ...getConnectedIndices(selectedCreator)].filter(i => i !== -1) : [];

  // Empty state
  if (count === 0) {
    return (
      <div className="relative h-64 w-full rounded-xl bg-gradient-to-b from-slate-950 via-slate-900 to-black border border-white/10 flex items-center justify-center">
        <div className="text-center text-sm text-white/60">
          <div className="mb-1 font-semibold text-white/80">
            No creators in this arena yet
          </div>
          <div className="text-xs">Add creators to see the network map.</div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="relative h-64 w-full rounded-xl bg-gradient-to-b from-slate-950 via-slate-900 to-black border border-white/10 overflow-hidden"
    >
      {/* Background glow effects */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,_rgba(59,130,246,0.12),_transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,_rgba(168,85,247,0.12),_transparent_50%)]" />

      {/* SVG for connection lines - only show real connections */}
      {connections.length > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1 }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {connections.map((conn, idx) => {
            const from = positions[conn.from];
            const to = positions[conn.to];
            if (!from || !to) return null;

            const isHighlighted = hoveredIndices.includes(conn.from) && hoveredIndices.includes(conn.to);
            const isSelected = selectedIndices.includes(conn.from) && selectedIndices.includes(conn.to);

            return (
              <line
                key={idx}
                x1={from.left}
                y1={from.top}
                x2={to.left}
                y2={to.top}
                stroke={isHighlighted || isSelected ? "rgba(0,246,162,0.6)" : "rgba(255,255,255,0.15)"}
                strokeWidth={isHighlighted || isSelected ? "0.5" : "0.3"}
                strokeDasharray={isHighlighted || isSelected ? "none" : "1,1"}
                className={isHighlighted || isSelected ? "animate-pulse" : ""}
                style={{
                  transition: "all 0.3s ease",
                }}
              />
            );
          })}
        </svg>
      )}

      {/* Creators */}
      {positions.map((creator, index) => {
        const trendColors = getTrendColor(creator);
        const size = creator.radius * 2;
        const profileImageUrl = getProfileImageUrl(creator.twitter_username, creator.avatar_url);
        const isHovered = hoveredCreator === creator.twitter_username.toLowerCase();
        const isSelected = selectedCreator === creator.twitter_username.toLowerCase();
        const isConnected = hoveredIndices.includes(index) || selectedIndices.includes(index);

        return (
          <Link
            key={creator.twitter_username}
            href={`/portal/arc/creator/${encodeURIComponent(
              creator.twitter_username.toLowerCase()
            )}`}
            className="absolute flex items-center justify-center transition-transform duration-300 hover:z-20 group"
            style={{
              top: `${creator.top}%`,
              left: `${creator.left}%`,
              width: `${size}px`,
              height: `${size}px`,
              marginTop: `-${creator.radius}px`,
              marginLeft: `-${creator.radius}px`,
              transform: isHovered || isSelected ? 'scale(1.15)' : 'scale(1)',
              zIndex: isHovered || isSelected ? 30 : isConnected ? 20 : 10,
            }}
            onMouseEnter={() => setHoveredCreator(creator.twitter_username.toLowerCase())}
            onMouseLeave={() => setHoveredCreator(null)}
            onClick={(e) => {
              e.preventDefault();
              setSelectedCreator(selectedCreator === creator.twitter_username.toLowerCase() ? null : creator.twitter_username.toLowerCase());
            }}
            title={`@${creator.twitter_username} · ${creator.arc_points.toLocaleString()} ARC points`}
          >
            <div
              className={`w-full h-full rounded-full ${trendColors.border} ${trendColors.glow} ${trendColors.ring} transition-all duration-300 group-hover:shadow-[0_0_30px_rgba(0,246,162,0.5)] relative overflow-hidden ${
                isHovered || isSelected ? 'ring-4 ring-akari-neon-teal/60' : ''
              }`}
            >
              {/* Profile image - background layer */}
              <div className="absolute inset-0 rounded-full overflow-hidden">
                <img
                  src={profileImageUrl}
                  alt={`@${creator.twitter_username}`}
                  className="w-full h-full object-cover"
                  style={{
                    background: 'linear-gradient(to bottom right, rgb(71, 85, 105), rgb(30, 41, 59))',
                  }}
                  onError={(e) => {
                    // Hide image on error - initials will show through
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
                {/* Fallback initials - shown if image fails or while loading */}
                <div className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm pointer-events-none bg-gradient-to-br from-slate-600 to-slate-800">
                  {creator.twitter_username.charAt(0).toUpperCase()}
                </div>
              </div>

              {/* Trend-based colored overlay (red/green) - on top of profile image */}
              {trendColors.overlay !== 'bg-transparent' && (
                <div 
                  className={`absolute inset-0 rounded-full ${trendColors.overlay} transition-opacity duration-300`}
                  style={{
                    mixBlendMode: 'overlay',
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* Subtle dark gradient overlay for better text visibility */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20 rounded-full pointer-events-none" />

              {/* Ring indicator (small badge at top-right) */}
              {creator.ring && (
                <div className="absolute top-1 right-1 w-3 h-3 rounded-full border-2 border-white/80 bg-black/60 flex items-center justify-center z-10">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      creator.ring.toLowerCase() === 'core'
                        ? 'bg-purple-400'
                        : creator.ring.toLowerCase() === 'momentum'
                        ? 'bg-blue-400'
                        : 'bg-emerald-400'
                    }`}
                  />
                </div>
              )}

              {/* Trend indicator (small arrow) */}
              {creator.previous_points !== undefined && (
                <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 z-10">
                  {creator.arc_points > creator.previous_points ? (
                    <div className="text-green-400 text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">↑</div>
                  ) : creator.arc_points < creator.previous_points ? (
                    <div className="text-red-400 text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">↓</div>
                  ) : null}
                </div>
              )}

              {/* Selection indicator */}
              {(isHovered || isSelected) && (
                <div className="absolute inset-0 rounded-full border-2 border-akari-neon-teal/80 animate-pulse" />
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
