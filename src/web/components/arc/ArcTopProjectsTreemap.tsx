/**
 * ARC Top Projects Treemap Component
 * 
 * Displays projects in a treemap visualization where rectangle size
 * is proportional to absolute growth percentage.
 */

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Treemap, ResponsiveContainer, Tooltip, Cell } from 'recharts';

// =============================================================================
// TYPES
// =============================================================================

export interface TopProjectItem {
  projectId: string;
  name: string;
  twitter_username: string;
  logo_url?: string | null;
  growth_pct: number;
  heat?: number | null;
  slug?: string | null; // Optional slug for navigation
  arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active?: boolean;
}

interface ArcTopProjectsTreemapProps {
  items: TopProjectItem[];
  mode: 'gainers' | 'losers';
  timeframe: '24h' | '7d' | '30d' | '90d';
  onModeChange?: (mode: 'gainers' | 'losers') => void;
  onTimeframeChange?: (timeframe: '24h' | '7d' | '30d' | '90d') => void;
  lastUpdated?: Date | string | number; // Timestamp for "Last updated" display
  onProjectClick?: (project: TopProjectItem) => void; // Called when unlocked project is clicked
}

interface TreemapDataPoint {
  name: string;
  value: number; // Normalized absolute growth for sizing
  growth_pct: number; // Original growth percentage
  projectId: string;
  twitter_username: string;
  logo_url?: string | null;
  heat?: number | null;
  slug?: string | null;
  arc_access_level?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arc_active?: boolean;
  fill: string; // Color based on growth
  isClickable: boolean; // Whether the tile is clickable
  isLocked: boolean; // Whether the tile is locked (should show lock overlay)
  originalItem: TopProjectItem; // Original item for callback
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get color based on growth percentage
 */
function getGrowthColor(growthPct: number): string {
  if (growthPct > 0) {
    // Positive growth: green gradient
    // Scale intensity based on growth amount
    const intensity = Math.min(Math.abs(growthPct) / 20, 1); // Cap at 20% for max intensity
    const opacity = 0.3 + intensity * 0.4; // 0.3 to 0.7 opacity
    return `rgba(34, 197, 94, ${opacity})`; // green-500
  } else if (growthPct < 0) {
    // Negative growth: red gradient
    const intensity = Math.min(Math.abs(growthPct) / 20, 1);
    const opacity = 0.3 + intensity * 0.4;
    return `rgba(239, 68, 68, ${opacity})`; // red-500
  } else {
    // Neutral: gray
    return 'rgba(156, 163, 175, 0.3)'; // gray-400
  }
}

/**
 * Format growth percentage for display
 */
function formatGrowthPct(growthPct: number): string {
  const sign = growthPct >= 0 ? '+' : '';
  return `${sign}${growthPct.toFixed(2)}%`;
}

/**
 * Get tier label from arc_access_level
 */
function getTierLabel(arcAccessLevel: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | undefined | null): string {
  switch (arcAccessLevel) {
    case 'gamified':
      return 'Gamified';
    case 'leaderboard':
      return 'Leaderboard';
    case 'creator_manager':
      return 'Creator Manager';
    case 'none':
    default:
      return 'None';
  }
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
// CUSTOM TOOLTIP
// =============================================================================

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: TreemapDataPoint;
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const data = payload[0]?.payload;
  if (!data) return null;

  // Safe field access with fallbacks
  const name = data.name || data.twitter_username || 'Unknown';
  const growthPct = typeof data.growth_pct === 'number' ? data.growth_pct : 0;
  const isClickable = data.isClickable === true;
  const isLocked = data.isLocked === true;
  const twitterUsername = data.twitter_username || '';
  const heat = (typeof data.heat === 'number' && Number.isFinite(data.heat)) ? data.heat : null;
  const arcAccessLevel = data.arc_access_level || 'none';
  const arcActive = typeof data.arc_active === 'boolean' ? data.arc_active : false;
  const tierLabel = getTierLabel(arcAccessLevel);

  return (
    <div className="bg-black/95 border border-white/20 rounded-lg p-3 shadow-2xl max-w-[240px]">
      <div className="text-sm font-semibold text-white mb-1 truncate">{name}</div>
      {twitterUsername && (
        <div className="text-xs text-white/60 mb-2 truncate">@{twitterUsername}</div>
      )}
      {isLocked && (
        <div className="text-xs text-yellow-400 mb-2">🔒 This project has not enabled ARC yet.</div>
      )}
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-white/60 flex-shrink-0">Growth:</span>
          <span className={`font-semibold flex-shrink-0 ${
            growthPct > 0 ? 'text-green-400' : growthPct < 0 ? 'text-red-400' : 'text-white/60'
          }`}>
            {formatGrowthPct(growthPct)}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-white/60 flex-shrink-0">Tier:</span>
          <span className="text-white font-medium flex-shrink-0">{tierLabel}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-white/60 flex-shrink-0">Status:</span>
          <span className={`font-medium flex-shrink-0 ${
            arcActive ? 'text-green-400' : 'text-gray-400'
          }`}>
            {arcActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        {heat !== null && (
          <div className="flex justify-between gap-4">
            <span className="text-white/60 flex-shrink-0">Heat:</span>
            <span className="text-white font-medium flex-shrink-0">{heat}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ArcTopProjectsTreemap({
  items,
  mode,
  timeframe,
  onModeChange,
  onTimeframeChange,
  lastUpdated,
  onProjectClick,
}: ArcTopProjectsTreemapProps) {
  const router = useRouter();
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [focusedProjectId, setFocusedProjectId] = useState<string | null>(null);

  // Format last updated timestamp (safe handling of undefined)
  const lastUpdatedText = useMemo(() => {
    if (lastUpdated === undefined || lastUpdated === null) return null;
    try {
      const date = typeof lastUpdated === 'number' 
        ? new Date(lastUpdated) 
        : typeof lastUpdated === 'string' 
        ? new Date(lastUpdated) 
        : lastUpdated;
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        return null;
      }
      
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } catch (err) {
      console.error('[ArcTopProjectsTreemap] Error formatting lastUpdated:', err);
      return null;
    }
  }, [lastUpdated]);

  // Include all items, even those with growth_pct = 0 (will use minimum size)
  const validItems = useMemo(() => {
    if (!items || items.length === 0) return [];
    
    return items.filter((item) => {
      // Get safe growth_pct with fallback
      const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
      const size = Math.abs(growthPct);
      
      // Keep all items with finite values (including 0)
      return Number.isFinite(size);
    });
  }, [items]);

  // Prepare data for treemap (only use valid items)
  const treemapData = useMemo((): TreemapDataPoint[] => {
    if (validItems.length === 0) return [];

    // Convert growth_pct into tile value with minimum size
    // value = Math.max(1, Math.round(Math.abs(growth_pct) * 100))
    const tileValues = validItems.map(item => {
      const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
      return Math.max(1, Math.round(Math.abs(growthPct) * 100));
    });
    const normalizedValues = normalizeForTreemap(tileValues);

    return validItems.map((item, index) => {
      // Safe field access with fallbacks
      const name = item.name || item.twitter_username || 'Unknown';
      const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
      const projectId = item.projectId || '';
      
      // arc_active ONLY controls clickability (visual/UX)
      // arc_access_level controls routing (and also locks if 'none')
      // isClickable = arc_active=true AND arc_access_level != 'none'
      const isLocked = !item.arc_active || item.arc_access_level === 'none' || item.arc_access_level === undefined;
      const isClickable = !isLocked;
      
      return {
        name,
        value: normalizedValues[index],
        growth_pct: growthPct,
        projectId,
        twitter_username: item.twitter_username || '',
        logo_url: item.logo_url || null,
        heat: (typeof item.heat === 'number' && Number.isFinite(item.heat)) ? item.heat : null,
        slug: item.slug || null,
        arc_access_level: item.arc_access_level || 'none',
        arc_active: typeof item.arc_active === 'boolean' ? item.arc_active : false,
        fill: isClickable ? getGrowthColor(growthPct) : 'rgba(107, 114, 128, 0.3)', // Gray for locked
        isClickable,
        isLocked,
        originalItem: item, // Store original item for onProjectClick callback
      };
    });
  }, [validItems]);

  // Helper function to get navigation path based on arc_access_level (matches backend logic)
  // Routing rules:
  // - 'creator_manager' → Creator Manager
  // - 'leaderboard' or 'gamified' → Project ARC page
  // - 'none' → locked (returns null)
  const getProjectNavigationPath = (
    arcAccessLevel: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | undefined | null,
    slug: string | null,
    projectId: string
  ): string | null => {
    if (!arcAccessLevel || arcAccessLevel === 'none') {
      return null; // Locked
    }

    const projectIdentifier = slug || projectId;

    if (arcAccessLevel === 'creator_manager') {
      return `/portal/arc/creator-manager?projectId=${projectIdentifier}`;
    } else if (arcAccessLevel === 'leaderboard' || arcAccessLevel === 'gamified') {
      return `/portal/arc/project/${projectIdentifier}`;
    }

    return null; // Locked
  };

  // Handle click on treemap cell
  // arc_active controls clickability (checked via isClickable)
  // arc_access_level controls routing
  const handleCellClick = (data: TreemapDataPoint, originalItem: TopProjectItem) => {
    // If locked: do nothing (tooltip shows "No ARC tier enabled")
    if (!data.isClickable || data.isLocked) {
      return; // Do nothing for locked projects
    }

    // If unlocked: call onProjectClick callback if provided
    if (onProjectClick) {
      onProjectClick(originalItem);
      return;
    }

    // Fallback: Route based on arc_access_level (if no callback provided)
    // This matches the routing logic in the frontend index.tsx
    const navPath = getProjectNavigationPath(
      data.arc_access_level,
      data.slug || null,
      data.projectId
    );

    if (navPath) {
      router.push(navPath);
    }
  };

  // Custom cell component with hover effects and keyboard accessibility
  const CustomCell = ({ x, y, width, height, payload }: any) => {
    if (!payload) return null;
    
    // Safe field access with fallbacks
    const projectId = payload.projectId || '';
    const name = payload.name || payload.twitter_username || 'Unknown';
    const growthPct = typeof payload.growth_pct === 'number' ? payload.growth_pct : 0;
    const twitterUsername = payload.twitter_username || '';
    const isClickable = payload.isClickable === true;
    const isLocked = payload.isLocked === true;
    const isHovered = hoveredProjectId === projectId;
    const isFocused = focusedProjectId === projectId;
    const isPositive = growthPct > 0;
    const borderColor = isClickable
      ? (isPositive 
          ? 'rgba(34, 197, 94, 0.6)' 
          : payload.growth_pct < 0 
          ? 'rgba(239, 68, 68, 0.6)' 
          : 'rgba(156, 163, 175, 0.4)')
      : 'rgba(107, 114, 128, 0.4)'; // Gray border for locked
    
    // Determine box size category for text display
    const isSmall = width < 100 || height < 50;
    const isMedium = !isSmall && (width < 150 || height < 70);
    const isLarge = !isSmall && !isMedium;

    // Calculate rounded corners (subtle, max 4px)
    const cornerRadius = Math.min(4, Math.min(width, height) * 0.1);

    const handleKeyDown = (e: any) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleCellClick(payload, payload.originalItem);
      }
    };

    return (
      <g
        tabIndex={isClickable ? 0 : -1}
        role={isClickable ? "button" : "img"}
        aria-label={isClickable 
          ? `${name}, growth: ${formatGrowthPct(growthPct)}` 
          : `${name}, locked: No ARC tier enabled`}
        onMouseEnter={() => setHoveredProjectId(projectId)}
        onMouseLeave={() => setHoveredProjectId(null)}
        onClick={() => handleCellClick(payload, payload.originalItem)}
        onFocus={() => isClickable && setFocusedProjectId(projectId)}
        onBlur={() => setFocusedProjectId(null)}
        onKeyDown={isClickable ? handleKeyDown : undefined}
        style={{ cursor: isClickable ? 'pointer' : 'not-allowed', outline: 'none' }}
      >
        {/* Rounded rectangle with proper spacing */}
        <rect
          x={x + 1}
          y={y + 1}
          width={width - 2}
          height={height - 2}
          rx={cornerRadius}
          ry={cornerRadius}
          fill={payload.fill}
          stroke={isHovered || isFocused ? borderColor : 'rgba(255, 255, 255, 0.1)'}
          strokeWidth={isHovered || isFocused ? 2 : 1}
          style={{ transition: 'all 0.2s' }}
        />
        
        {/* Lock overlay when project is locked */}
        {isLocked && (
          <>
            {/* Semi-transparent overlay */}
            <rect
              x={x + 1}
              y={y + 1}
              width={width - 2}
              height={height - 2}
              rx={cornerRadius}
              ry={cornerRadius}
              fill="rgba(0, 0, 0, 0.5)"
              style={{ transition: 'all 0.2s' }}
            />
            {/* Lock icon and text (only show on larger boxes) */}
            {!isSmall && (
              <>
                <text
                  x={x + width / 2}
                  y={y + height / 2 - 8}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(255, 255, 255, 0.9)"
                  fontSize={Math.min(width / 8, 20)}
                  fontWeight="bold"
                  className="pointer-events-none"
                >
                  🔒
                </text>
                <text
                  x={x + width / 2}
                  y={y + height / 2 + 12}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(255, 255, 255, 0.7)"
                  fontSize={Math.min(width / 12, 10)}
                  className="pointer-events-none"
                >
                  Locked
                </text>
              </>
            )}
          </>
        )}
        
        {/* Text labels based on box size */}
        {isSmall && (
          // Small boxes: only show growth_pct
          <text
            x={x + width / 2}
            y={y + height / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={growthPct > 0 ? '#4ade80' : growthPct < 0 ? '#f87171' : 'rgba(255, 255, 255, 0.8)'}
            fontSize={Math.min(width / 8, 12)}
            fontWeight="bold"
            className="pointer-events-none"
          >
            {formatGrowthPct(growthPct)}
          </text>
        )}
        
        {isMedium && (
          // Medium boxes: name + growth_pct
          <>
            <text
              x={x + width / 2}
              y={y + height / 2 - 6}
              textAnchor="middle"
              fill="white"
              fontSize={Math.min(width / 12, 12)}
              fontWeight="semibold"
              className="pointer-events-none"
            >
              {name.length > 15 ? name.substring(0, 15) + '...' : name}
            </text>
            <text
              x={x + width / 2}
              y={y + height / 2 + 8}
              textAnchor="middle"
              fill={growthPct > 0 ? '#4ade80' : growthPct < 0 ? '#f87171' : 'rgba(255, 255, 255, 0.6)'}
              fontSize={Math.min(width / 14, 10)}
              fontWeight="bold"
              className="pointer-events-none"
            >
              {formatGrowthPct(growthPct)}
            </text>
          </>
        )}
        
        {isLarge && (
          // Large boxes: name + @handle + growth_pct
          <>
            <text
              x={x + width / 2}
              y={y + height / 2 - 12}
              textAnchor="middle"
              fill="white"
              fontSize={Math.min(width / 10, 14)}
              fontWeight="semibold"
              className="pointer-events-none"
            >
              {name.length > 20 ? name.substring(0, 20) + '...' : name}
            </text>
            {twitterUsername && (
              <text
                x={x + width / 2}
                y={y + height / 2 + 2}
                textAnchor="middle"
                fill="rgba(255, 255, 255, 0.7)"
                fontSize={Math.min(width / 14, 11)}
                className="pointer-events-none"
              >
                @{twitterUsername.length > 15 ? twitterUsername.substring(0, 15) + '...' : twitterUsername}
              </text>
            )}
            <text
              x={x + width / 2}
              y={y + height / 2 + 16}
              textAnchor="middle"
              fill={growthPct > 0 ? '#4ade80' : growthPct < 0 ? '#f87171' : 'rgba(255, 255, 255, 0.6)'}
              fontSize={Math.min(width / 16, 10)}
              fontWeight="bold"
              className="pointer-events-none"
            >
              {formatGrowthPct(growthPct)}
            </text>
          </>
        )}
      </g>
    );
  };

  // Render fallback list if not enough items for treemap (< 2)
  if (validItems.length < 2) {
    return (
      <div className="w-full">
        {/* Header with Last updated and Controls */}
        <div className="flex items-center justify-between mb-4">
          {/* Last updated timestamp */}
          {lastUpdatedText && (
            <div className="text-xs text-white/50">
              Last updated: {lastUpdatedText}
            </div>
          )}
          {!lastUpdatedText && <div />}
          
          {/* Controls (optional - if callbacks provided) */}
          <div className="flex items-center gap-3">
            {onModeChange && (
              <div className="flex gap-2">
                <button
                  onClick={() => onModeChange('gainers')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    mode === 'gainers'
                      ? 'bg-akari-primary text-white'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  Top Gainers
                </button>
                <button
                  onClick={() => onModeChange('losers')}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    mode === 'losers'
                      ? 'bg-akari-primary text-white'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  Top Losers
                </button>
              </div>
            )}
            {onTimeframeChange && (
              <div className="flex gap-2">
                {(['24h', '7d', '30d', '90d'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => onTimeframeChange(tf)}
                    className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                      timeframe === tf
                        ? 'bg-white/10 text-white border border-white/20'
                        : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fallback list view */}
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 min-h-[400px]">
          {validItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <p className="text-sm text-white/60 mb-2">No projects to display</p>
              <p className="text-xs text-white/40 text-center max-w-md mb-2">
                Only projects with <span className="text-purple-400 font-semibold">profile_type = 'project'</span> appear in ARC heatmap.
              </p>
              <p className="text-xs text-white/40 text-center max-w-md">
                SuperAdmin must classify projects as 'project' in Projects Admin for them to appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {validItems.map((item) => {
                const name = item.name || item.twitter_username || 'Unknown';
                const growthPct = typeof item.growth_pct === 'number' ? item.growth_pct : 0;
                const twitterUsername = item.twitter_username || '';
                const isClickable = (item.arc_active === true) && (item.arc_access_level !== 'none' && item.arc_access_level !== undefined);
                
                return (
                  <div
                    key={item.projectId || Math.random()}
                    className={`flex items-center justify-between p-4 rounded-lg border ${
                      isClickable
                        ? 'border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer'
                        : 'border-white/5 bg-white/5 opacity-50 cursor-not-allowed'
                    }`}
                    onClick={() => {
                      if (isClickable) {
                        const navPath = getProjectNavigationPath(
                          item.arc_access_level,
                          item.slug || null,
                          item.projectId
                        );
                        if (navPath) {
                          router.push(navPath);
                        }
                      }
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{name}</div>
                      {twitterUsername && (
                        <div className="text-xs text-white/60 truncate">@{twitterUsername}</div>
                      )}
                  {!isClickable && (
                    <div className="text-xs text-yellow-400 mt-1">🔒 This project has no active ARC program</div>
                  )}
                    </div>
                    <div className={`text-sm font-bold ml-4 ${
                      growthPct > 0 ? 'text-green-400' : growthPct < 0 ? 'text-red-400' : 'text-white/60'
                    }`}>
                      {formatGrowthPct(growthPct)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header with Last updated and Controls */}
      <div className="flex items-center justify-between mb-4">
        {/* Last updated timestamp */}
        {lastUpdatedText && (
          <div className="text-xs text-white/50">
            Last updated: {lastUpdatedText}
          </div>
        )}
        {!lastUpdatedText && <div />}
        
        {/* Controls (optional - if callbacks provided) */}
        <div className="flex items-center gap-3">
          {onModeChange && (
            <div className="flex gap-2">
              <button
                onClick={() => onModeChange('gainers')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === 'gainers'
                    ? 'bg-akari-primary text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                Top Gainers
              </button>
              <button
                onClick={() => onModeChange('losers')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  mode === 'losers'
                    ? 'bg-akari-primary text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                Top Losers
              </button>
            </div>
          )}
          {onTimeframeChange && (
            <div className="flex gap-2">
              {(['24h', '7d', '30d', '90d'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => onTimeframeChange(tf)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors ${
                    timeframe === tf
                      ? 'bg-white/10 text-white border border-white/20'
                      : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Treemap with improved spacing and rounded corners */}
      {/* Only render treemap if we have data */}
      {treemapData.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center">
          <p className="text-sm text-white/60 mb-2">No projects to display</p>
          <p className="text-xs text-white/40 text-center max-w-md mb-2">
            Only projects with <span className="text-purple-400 font-semibold">profile_type = 'project'</span> appear in ARC heatmap.
          </p>
          <p className="text-xs text-white/40 text-center max-w-md">
            SuperAdmin must classify projects as 'project' in Projects Admin for them to appear here.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={440}>
          <Treemap
            data={treemapData}
            dataKey="value"
            stroke="transparent"
            content={<CustomCell />}
          >
            {treemapData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      )}
    </div>
  );
}

