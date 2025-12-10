/**
 * ProfileClubOrbit Component
 * 
 * Displays a bubble cluster visualization showing who the user
 * hangs out with (inner circle members), sized by interaction weight.
 */

import { useMemo } from 'react';
import Image from 'next/image';

// =============================================================================
// TYPES
// =============================================================================

export interface OrbitMember {
  handle: string;
  avatarUrl: string | null;
  akariScore: number | null;
  followers: number | null;
  interactionWeight: number; // 0–1 normalized
  role: 'hero' | 'player';
}

export interface ProfileClubOrbitProps {
  orbit: OrbitMember[];
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generate a deterministic position for a bubble in the cluster.
 * Uses golden angle for even distribution.
 */
function generateBubblePositions(
  count: number,
  containerSize: number,
  minBubbleSize: number,
  maxBubbleSize: number
): { x: number; y: number; size: number }[] {
  const positions: { x: number; y: number; size: number }[] = [];
  const centerX = containerSize / 2;
  const centerY = containerSize / 2;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5 degrees
  
  for (let i = 0; i < count; i++) {
    const angle = i * goldenAngle;
    // Spiral outward with some randomness
    const radiusProgress = Math.sqrt(i / count);
    const maxRadius = (containerSize / 2) - maxBubbleSize - 10;
    const radius = radiusProgress * maxRadius * 0.85 + 10;
    
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    
    // Size inversely related to position in array (more important = larger)
    const sizeProgress = 1 - (i / count);
    const size = minBubbleSize + sizeProgress * (maxBubbleSize - minBubbleSize);
    
    positions.push({ x, y, size });
  }
  
  return positions;
}

/**
 * Get initials from handle
 */
function getInitials(handle: string): string {
  return handle.slice(0, 2).toUpperCase();
}

/**
 * Get Akari tier badge info
 */
function getTierBadge(score: number | null): { color: string; bg: string } {
  if (score === null) return { color: '#94a3b8', bg: '#94a3b815' };
  if (score >= 900) return { color: '#a855f7', bg: '#a855f720' }; // Celestial
  if (score >= 750) return { color: '#10b981', bg: '#10b98120' }; // Vanguard
  if (score >= 550) return { color: '#3b82f6', bg: '#3b82f620' }; // Ranger
  if (score >= 400) return { color: '#f59e0b', bg: '#f59e0b20' }; // Nomad
  return { color: '#94a3b8', bg: '#94a3b815' }; // Shadow
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileClubOrbit({ orbit }: ProfileClubOrbitProps) {
  const containerSize = 320;
  const minBubbleSize = 32;
  const maxBubbleSize = 56;
  
  // Sort by interaction weight (highest first) and take top 20
  const sortedOrbit = useMemo(() => {
    return [...orbit]
      .sort((a, b) => b.interactionWeight - a.interactionWeight)
      .slice(0, 20);
  }, [orbit]);
  
  const hasData = sortedOrbit.length > 0;
  
  // Generate positions
  const positions = useMemo(() => {
    return generateBubblePositions(
      sortedOrbit.length,
      containerSize,
      minBubbleSize,
      maxBubbleSize
    );
  }, [sortedOrbit.length]);
  
  // Combine data with positions
  const bubbles = sortedOrbit.map((member, i) => ({
    ...member,
    ...positions[i],
    size: minBubbleSize + member.interactionWeight * (maxBubbleSize - minBubbleSize),
  }));
  
  const heroCount = sortedOrbit.filter(m => m.role === 'hero').length;
  const playerCount = sortedOrbit.filter(m => m.role === 'player').length;
  
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <h2 className="text-sm uppercase tracking-wider text-slate-400 mb-4">
        Who You Hang Out With
      </h2>
      
      {!hasData ? (
        <div className="h-[320px] flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
          <p>No orbit data yet</p>
          <p className="text-xs text-slate-600">Interact more with your circle to unlock this</p>
        </div>
      ) : (
        <>
          {/* Bubble cluster container */}
          <div 
            className="relative mx-auto"
            style={{ width: containerSize, height: containerSize }}
          >
            {/* Decorative rings */}
            <div 
              className="absolute inset-0 rounded-full border border-slate-800/50"
              style={{ transform: 'scale(0.9)' }}
            />
            <div 
              className="absolute inset-0 rounded-full border border-slate-800/30"
              style={{ transform: 'scale(0.6)' }}
            />
            <div 
              className="absolute inset-0 rounded-full border border-slate-800/20"
              style={{ transform: 'scale(0.3)' }}
            />
            
            {/* Bubbles */}
            {bubbles.map((bubble, i) => {
              const tierBadge = getTierBadge(bubble.akariScore);
              const isHero = bubble.role === 'hero';
              
              return (
                <div
                  key={bubble.handle}
                  className={`
                    absolute rounded-full flex items-center justify-center
                    transition-transform duration-200 hover:scale-110 hover:z-10
                    ${isHero ? 'ring-2 ring-amber-400/50' : 'ring-1 ring-slate-700'}
                  `}
                  style={{
                    width: bubble.size,
                    height: bubble.size,
                    left: bubble.x - bubble.size / 2,
                    top: bubble.y - bubble.size / 2,
                    backgroundColor: isHero ? '#1e293b' : '#0f172a',
                    animationDelay: `${i * 50}ms`,
                  }}
                  title={`@${bubble.handle} • ${bubble.akariScore ?? 'Unranked'} AKARI`}
                >
                  {bubble.avatarUrl ? (
                    <Image
                      src={bubble.avatarUrl}
                      alt={bubble.handle}
                      width={bubble.size}
                      height={bubble.size}
                      className="w-full h-full rounded-full object-cover"
                      onError={(e) => {
                        // Fallback to initials on error
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                  ) : null}
                  <span 
                    className={`
                      text-[10px] font-medium text-slate-300
                      ${bubble.avatarUrl ? 'hidden' : ''}
                    `}
                  >
                    {getInitials(bubble.handle)}
                  </span>
                  
                  {/* Hero indicator */}
                  {isHero && bubble.size >= 40 && (
                    <span 
                      className="absolute -top-1 -right-1 text-[8px]"
                      title="Hero"
                    >
                      ⭐
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Legend */}
          <div className="flex justify-center gap-4 mt-4">
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="w-3 h-3 rounded-full bg-amber-400/20 ring-1 ring-amber-400/50" />
              Hero ({heroCount})
            </span>
            <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="w-3 h-3 rounded-full bg-slate-800 ring-1 ring-slate-700" />
              Player ({playerCount})
            </span>
          </div>
        </>
      )}
    </div>
  );
}

