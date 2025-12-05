/**
 * Chain formatting helpers for portal UI
 * 
 * Provides consistent chain labels and icons across the portal.
 */

/**
 * Format chain name to a human-readable label
 */
export function formatChainLabel(chain?: string | null): string {
  if (!chain) return 'Unknown';

  const c = chain.toLowerCase();

  if (c.includes('sol')) return 'Solana';
  if (c.includes('eth') && !c.includes('arb') && !c.includes('op')) return 'Ethereum';
  if (c.includes('base')) return 'Base';
  if (c.includes('bsc') || c.includes('bnb') || c.includes('binance')) return 'BNB Chain';
  if (c.includes('arb')) return 'Arbitrum';
  if (c.includes('op') || c.includes('optimism')) return 'Optimism';
  if (c.includes('poly') || c.includes('matic')) return 'Polygon';
  if (c.includes('avax') || c.includes('avalanche')) return 'Avalanche';
  if (c.includes('fantom') || c.includes('ftm')) return 'Fantom';
  if (c.includes('tron') || c.includes('trx')) return 'Tron';

  // Capitalize first letter if no match
  return chain.charAt(0).toUpperCase() + chain.slice(1);
}

/**
 * Get emoji icon for a chain
 */
export function chainIcon(chain?: string | null): string {
  if (!chain) return '❔';
  const c = chain.toLowerCase();

  if (c.includes('sol')) return '🟣';
  if (c.includes('eth') && !c.includes('arb') && !c.includes('op')) return '⚪';
  if (c.includes('base')) return '🔵';
  if (c.includes('bsc') || c.includes('bnb') || c.includes('binance')) return '🟡';
  if (c.includes('arb')) return '🧊';
  if (c.includes('op') || c.includes('optimism')) return '🔴';
  if (c.includes('poly') || c.includes('matic')) return '💜';
  if (c.includes('avax') || c.includes('avalanche')) return '🔺';
  if (c.includes('fantom') || c.includes('ftm')) return '👻';
  if (c.includes('tron') || c.includes('trx')) return '♦️';

  return '❔';
}

/**
 * Get chain badge color class (Tailwind)
 */
export function chainBadgeColor(chain?: string | null): string {
  if (!chain) return 'bg-gray-500/20 text-gray-400';
  const c = chain.toLowerCase();

  if (c.includes('sol')) return 'bg-purple-500/20 text-purple-400';
  if (c.includes('eth') && !c.includes('arb') && !c.includes('op')) return 'bg-slate-500/20 text-slate-300';
  if (c.includes('base')) return 'bg-blue-500/20 text-blue-400';
  if (c.includes('bsc') || c.includes('bnb') || c.includes('binance')) return 'bg-yellow-500/20 text-yellow-400';
  if (c.includes('arb')) return 'bg-cyan-500/20 text-cyan-400';
  if (c.includes('op') || c.includes('optimism')) return 'bg-red-500/20 text-red-400';
  if (c.includes('poly') || c.includes('matic')) return 'bg-violet-500/20 text-violet-400';
  if (c.includes('avax') || c.includes('avalanche')) return 'bg-rose-500/20 text-rose-400';

  return 'bg-gray-500/20 text-gray-400';
}

/**
 * Format chain as a short code (3 chars)
 */
export function chainShortCode(chain?: string | null): string {
  if (!chain) return '???';
  const c = chain.toLowerCase();

  if (c.includes('sol')) return 'SOL';
  if (c.includes('eth') && !c.includes('arb') && !c.includes('op')) return 'ETH';
  if (c.includes('base')) return 'BASE';
  if (c.includes('bsc') || c.includes('bnb') || c.includes('binance')) return 'BNB';
  if (c.includes('arb')) return 'ARB';
  if (c.includes('op') || c.includes('optimism')) return 'OP';
  if (c.includes('poly') || c.includes('matic')) return 'POLY';
  if (c.includes('avax') || c.includes('avalanche')) return 'AVAX';

  return chain.slice(0, 3).toUpperCase();
}

