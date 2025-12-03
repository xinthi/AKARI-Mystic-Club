/**
 * Predictions Page - Polymarket-inspired UI
 *
 * Lists all active predictions with compact cards, category filters,
 * and a market overview chart
 */

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { getWebApp } from '../lib/telegram-webapp';

interface Prediction {
  id: string;
  title: string;
  description?: string;
  options: string[];
  entryFeeStars: number;
  entryFeePoints: number;
  entryFeeMyst?: number;
  pot: number;
  mystPoolYes?: number;
  mystPoolNo?: number;
  resolved: boolean;
  endsAt: string;
  participantCount: number;
  category?: string;
  originalCategory?: string; // Original database category for badge detection
  optionStats?: Array<{
    option: string;
    index: number;
    betCount: number;
    totalStars: number;
    totalPoints: number;
    totalMyst?: number;
  }>;
}

const CATEGORIES = ['All', 'Crypto', 'Politics', 'Markets', 'Community', 'Sports', 'Meme Coins'] as const;
type Category = (typeof CATEGORIES)[number];

export default function PredictionsPage() {
  const router = useRouter();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category>('All');

  // Telegram BackButton - wire it to go back to home
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tg = (window as any).Telegram?.WebApp;
    if (!tg?.BackButton) return;

    let isNavigating = false;

    const handleBack = () => {
      if (isNavigating) return; // Prevent multiple navigations
      isNavigating = true;
      
      router.replace('/').catch((err) => {
        console.error('[Predictions] Navigation error:', err);
        isNavigating = false;
      });
    };

    tg.BackButton.show();
    tg.BackButton.onClick(handleBack);

    return () => {
      try {
        if (tg.BackButton?.offClick) {
          tg.BackButton.offClick(handleBack);
        } else {
          tg.BackButton.onClick(() => {});
        }
        tg.BackButton.hide();
      } catch (_) {
        // ignore
      }
    };
  }, [router]);

  useEffect(() => {
    const WebApp = getWebApp();
    if (WebApp) {
      try {
        WebApp.ready();
        WebApp.expand();
      } catch (e) {
        console.error('Telegram WebApp SDK not available', e);
      }
    }
    loadPredictions();
  }, []);

  const loadPredictions = async () => {
    try {
      let initData = '';
      if (typeof window !== 'undefined') {
        const WebApp = getWebApp();
        if (WebApp) {
          initData = (WebApp as any).initData || '';
        }
      }

      const response = await fetch('/api/predictions?resolved=false', {
        headers: {
          'X-Telegram-Init-Data': initData,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to load predictions');
      }

      const data = await response.json();
      setPredictions(data.predictions || []);
      setLoading(false);
      setError(null);
    } catch (err: any) {
      console.error('Error loading predictions:', err);
      setPredictions([]);
      setError(err.message || 'Failed to load data');
      setLoading(false);
    }
  };

  // Filter predictions by category
  const visiblePredictions = useMemo(
    () =>
      activeCategory === 'All'
        ? predictions
        : predictions.filter((p) => p.category === activeCategory),
    [predictions, activeCategory]
  );

  // Count predictions by category for the overview chart
  const countsByCategory = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of predictions) {
      const cat = p.category || 'Community';
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [predictions]);

  const maxCount = Math.max(1, ...Object.values(countsByCategory));

  // Format time remaining
  const formatTimeRemaining = (endsAt: string): string => {
    const end = new Date(endsAt);
    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff < 0) return 'Ended';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    return '<1h';
  };

  // Compute implied probability for Yes option
  const computeChance = (prediction: Prediction): string => {
    // Priority 1: Use MYST pools if available (most accurate)
    const totalMyst = (prediction.mystPoolYes || 0) + (prediction.mystPoolNo || 0);
    if (totalMyst > 0) {
      const yesPercent = Math.round(((prediction.mystPoolYes || 0) / totalMyst) * 100);
      return `${yesPercent}%`;
    }

    // Priority 2: Use optionStats if available (includes MYST from stats)
    if (prediction.optionStats && prediction.optionStats.length >= 2) {
      const yesStats = prediction.optionStats.find((s) => s.option === 'Yes' || s.index === 0);
      const noStats = prediction.optionStats.find((s) => s.option === 'No' || s.index === 1);

      if (yesStats && noStats) {
        // Include MYST in calculation if available in stats
        const yesTotal = (yesStats.totalMyst || 0) + (yesStats.totalStars || 0) + (yesStats.totalPoints || 0);
        const noTotal = (noStats.totalMyst || 0) + (noStats.totalStars || 0) + (noStats.totalPoints || 0);
        const total = yesTotal + noTotal;

        if (total > 0) {
          return `${Math.round((yesTotal / total) * 100)}%`;
        }
      }
    }

    // Priority 3: Fallback to EP pot if available
    if (prediction.pot > 0) {
      // If we only have pot but no breakdown, default to 50%
      return '50%';
    }

    // Default to 50% if no betting data
    return '50%';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-black to-purple-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          <div className="text-purple-200 text-sm">Loading markets...</div>
        </div>
      </div>
    );
  }

  const showError = error && predictions.length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950 via-black to-purple-950 text-white">
      <div className="px-4 pt-5 pb-6">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-white">Predictions</h1>
          <p className="text-xs text-purple-300 mt-1">
            Browse markets across Crypto, Politics and more. Tap a card to see details and place a bet.
          </p>
        </div>

        {/* Mini Overview Chart */}
        {predictions.length > 0 && (
          <div className="mb-4 bg-black/40 border border-white/5 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-purple-100">Market overview</span>
              <span className="text-[10px] text-purple-300">{predictions.length} active</span>
            </div>
            <div className="space-y-1.5">
              {Object.entries(countsByCategory).map(([category, count]) => (
                <div key={category} className="flex items-center gap-2">
                  <span className="text-[10px] text-purple-200 w-14 shrink-0 truncate">
                    {category}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-purple-900/70 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full transition-all duration-500"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-purple-100 w-4 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category Filter Chips */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat;
            const count = cat === 'All' ? predictions.length : (countsByCategory[cat] || 0);
            
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap border transition-all ${
                  isActive
                    ? 'bg-purple-500 text-white border-purple-400 shadow-lg shadow-purple-500/20'
                    : 'bg-black/40 text-purple-200 border-white/5 hover:border-purple-500/30'
                }`}
              >
                {cat}
                {count > 0 && (
                  <span className={`ml-1.5 ${isActive ? 'text-purple-100' : 'text-purple-400'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Error State */}
        {showError && (
          <div className="bg-red-900/30 rounded-xl p-4 border border-red-500/20 mb-4">
            <div className="text-sm text-red-200 mb-2">{error}</div>
            <button
              onClick={loadPredictions}
              className="text-xs px-3 py-1.5 bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {visiblePredictions.length === 0 && !showError && (
          <div className="bg-black/40 border border-white/5 rounded-2xl p-8 text-center">
            <div className="text-3xl mb-3">🔮</div>
            <div className="text-sm font-medium text-white mb-1">
              {activeCategory === 'All' ? 'No active predictions' : `No ${activeCategory} predictions`}
            </div>
            <div className="text-xs text-purple-300">
              {activeCategory === 'All' ? 'Check back later for new markets' : 'Try selecting a different category'}
            </div>
          </div>
        )}

        {/* Prediction Cards Grid */}
        {visiblePredictions.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {visiblePredictions.map((prediction) => (
              <PredictionCard
                key={prediction.id}
                prediction={prediction}
                chance={computeChance(prediction)}
                timeRemaining={formatTimeRemaining(prediction.endsAt)}
                onClick={() => router.push(`/predictions/${prediction.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Compact Polymarket-inspired prediction card
interface PredictionCardProps {
  prediction: Prediction;
  chance: string;
  timeRemaining: string;
  onClick: () => void;
}

function PredictionCard({ prediction, chance, timeRemaining, onClick }: PredictionCardProps) {
  // Parse chance to get numeric value for Yes/No split
  const chanceNum = parseInt(chance) || 50;
  const yesChance = chanceNum;
  const noChance = 100 - chanceNum;

  return (
    <button
      onClick={onClick}
      className="bg-black/40 border border-white/5 rounded-2xl p-3 flex flex-col text-left hover:border-purple-500/30 hover:bg-black/50 transition-all active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-purple-500/50"
    >
      {/* Top row: Title + Chance */}
      <div className="flex items-start justify-between gap-1.5 mb-2">
        <div className="flex-1 flex items-start gap-1.5">
          <h2 className="text-[11px] font-semibold text-white leading-snug line-clamp-2 flex-1">
            {prediction.title}
          </h2>
          {prediction.originalCategory === 'TRENDING_CRYPTO' && (
            <span className="ml-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-400 border border-amber-500/20 shrink-0">
              🔥 Trending
            </span>
          )}
          {prediction.originalCategory === 'MEME_COIN' && (
            <span className="ml-1 rounded-full bg-pink-500/10 px-1.5 py-0.5 text-[9px] text-pink-400 border border-pink-500/20 shrink-0">
              🔥 Meme Coin
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-bold text-emerald-300">{chance}</div>
          <div className="text-[8px] text-purple-300/70 uppercase tracking-wide">chance</div>
        </div>
      </div>

      {/* Time remaining badge */}
      <div className="mb-2">
        <span className="inline-flex items-center text-[9px] text-purple-300 bg-purple-500/10 px-1.5 py-0.5 rounded">
          ⏱ {timeRemaining}
        </span>
      </div>

      {/* Yes / No split row */}
      <div className="flex text-[10px] font-medium gap-1 mb-2">
        <div className="flex-1 rounded-xl bg-emerald-500/15 border border-emerald-500/20 text-emerald-200 py-1.5 px-2 text-center">
          <div className="font-bold">{yesChance}%</div>
          <div className="text-[8px] text-emerald-300/70">Yes</div>
        </div>
        <div className="flex-1 rounded-xl bg-rose-500/15 border border-rose-500/20 text-rose-200 py-1.5 px-2 text-center">
          <div className="font-bold">{noChance}%</div>
          <div className="text-[8px] text-rose-300/70">No</div>
        </div>
      </div>

      {/* Footer: Pools + Participants */}
      <div className="flex flex-col gap-1 pt-1.5 border-t border-white/5">
        <div className="flex justify-between items-center text-[9px] text-purple-300/70">
          <span className="truncate">
            EP: {prediction.pot.toLocaleString()}
          </span>
          <span className="shrink-0">{prediction.participantCount} 👤</span>
        </div>
        <div className="flex justify-between items-center text-[9px] text-amber-300/70">
          <span className="truncate">
            MYST: {((prediction.mystPoolYes || 0) + (prediction.mystPoolNo || 0)).toFixed(2)}
          </span>
        </div>
      </div>
    </button>
  );
}
