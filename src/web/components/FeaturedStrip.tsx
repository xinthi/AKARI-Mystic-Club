/**
 * Featured Strip Component
 * 
 * Displays featured predictions and quests in a horizontal scrollable strip
 */

import { useRouter } from 'next/router';

export type FeaturedPrediction = {
  id: string;
  title: string;
  category: string;   // e.g. "MEME_COIN", "TRENDING_CRYPTO", "CRYPTO", "POLITICS"
  endsAt?: string | null;
  poolMyst?: number | null; // optional info about pool
};

export type FeaturedQuest = {
  id: string;
  name: string;
  status: string; // e.g. "ACTIVE"
  endsAt?: string | null;
};

export type FeaturedStripProps = {
  predictions: FeaturedPrediction[];
  quests: FeaturedQuest[];
};

export default function FeaturedStrip({ predictions, quests }: FeaturedStripProps) {
  const router = useRouter();

  // Don't render if no items
  if (predictions.length === 0 && quests.length === 0) {
    return null;
  }

  const getCategoryLabel = (category: string): string => {
    if (category === 'MEME_COIN') return 'Meme Coin';
    if (category.includes('CRYPTO') || category.includes('TRENDING')) return 'Crypto';
    return category;
  };

  const formatPool = (poolMyst: number | null | undefined): string => {
    if (!poolMyst || poolMyst === 0) return '';
    if (poolMyst >= 1000) {
      return `${(poolMyst / 1000).toFixed(1)}k MYST`;
    }
    return `${poolMyst.toFixed(1)} MYST`;
  };

  return (
    <div className="px-6 mb-4">
      <h3 className="text-sm text-akari-muted mb-3">🔥 Featured for you</h3>
      <div className="flex overflow-x-auto gap-3 pb-2 scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Featured Predictions */}
        {predictions.map((pred) => (
          <button
            key={pred.id}
            onClick={() => router.push(`/predictions/${pred.id}`)}
            className="min-w-[240px] rounded-2xl bg-akari-card border border-akari-accent/30 p-4 text-left flex flex-col gap-2 shadow-[0_0_40px_rgba(0,246,162,0.18)] hover:border-akari-accent/50 transition-all active:scale-[0.98]"
          >
            {/* Category Pill */}
            <div className="flex items-start justify-between">
              <span className="bg-akari-primary/15 text-akari-primary text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full">
                {getCategoryLabel(pred.category)}
              </span>
            </div>
            
            {/* Title */}
            <h4 className="text-sm font-semibold text-akari-text line-clamp-2 flex-1">
              {pred.title}
            </h4>
            
            {/* Footer */}
            <div className="text-xs text-akari-muted flex items-center justify-between mt-auto">
              <span>{pred.endsAt ? 'Ends soon' : ''}</span>
              {pred.poolMyst && (
                <span className="text-akari-primary">Pool: {formatPool(pred.poolMyst)}</span>
              )}
            </div>
          </button>
        ))}

        {/* Featured Quests */}
        {quests.map((quest) => (
          <button
            key={quest.id}
            onClick={() => router.push(`/campaigns/${quest.id}`)}
            className="min-w-[240px] rounded-2xl bg-akari-card border border-akari-accent/30 p-4 text-left flex flex-col gap-2 shadow-[0_0_40px_rgba(0,246,162,0.18)] hover:border-akari-accent/50 transition-all active:scale-[0.98]"
          >
            {/* Category Pill */}
            <div className="flex items-start justify-between">
              <span className="bg-akari-primary/15 text-akari-primary text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-full">
                Quest
              </span>
            </div>
            
            {/* Title */}
            <h4 className="text-sm font-semibold text-akari-text line-clamp-2 flex-1">
              {quest.name}
            </h4>
            
            {/* Footer */}
            <div className="text-xs text-akari-muted flex items-center justify-between mt-auto">
              <span>Status: {quest.status}</span>
              {quest.endsAt && <span>Ends soon</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

