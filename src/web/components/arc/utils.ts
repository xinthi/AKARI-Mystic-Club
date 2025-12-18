/**
 * Shared utilities for ARC components
 */

/**
 * Get fill color based on growth percentage
 * Colors are based on growth_pct sign, NOT on mode (gainers/losers)
 * 
 * @param growthPct - Growth percentage value
 * @param opacity - Opacity value (0.55-0.75 recommended for visibility)
 * @returns RGBA color string
 */
export function getGrowthFill(growthPct: number, opacity: number = 0.65): string {
  // Treat values very close to zero as "stable" (yellow)
  if (Math.abs(growthPct) < 0.01) {
    return `rgba(234, 179, 8, ${opacity})`; // yellow-500
  }
  
  if (growthPct > 0) {
    return `rgba(34, 197, 94, ${opacity})`; // green-500
  } else {
    return `rgba(239, 68, 68, ${opacity})`; // red-500
  }
}

/**
 * Get color classes for cards/borders based on growth percentage
 * Colors are based on growth_pct sign, NOT on mode (gainers/losers)
 * 
 * @param growthPct - Growth percentage value
 * @returns Object with border, bg, and text color classes
 */
export function getGrowthColorClasses(growthPct: number): {
  border: string;
  bg: string;
  text: string;
} {
  // Treat values very close to zero as "stable" (yellow)
  if (Math.abs(growthPct) < 0.01) {
    return {
      border: 'border-yellow-500/30',
      bg: 'bg-yellow-500/5',
      text: 'text-yellow-400',
    };
  }
  
  if (growthPct > 0) {
    return {
      border: 'border-green-500/30',
      bg: 'bg-green-500/5',
      text: 'text-green-400',
    };
  } else {
    return {
      border: 'border-red-500/30',
      bg: 'bg-red-500/5',
      text: 'text-red-400',
    };
  }
}

/**
 * Format growth percentage for display with proper sign
 */
export function formatGrowthPct(growthPct: number): string {
  const sign = growthPct >= 0 ? '+' : '';
  return `${sign}${growthPct.toFixed(2)}%`;
}

