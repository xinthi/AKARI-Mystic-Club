import React from 'react';
import { GetServerSideProps } from 'next';
import { PortalLayout } from '../../components/portal/PortalLayout';
import { getTrendingCoinsWithPrices, type TrendingCoinWithPrice } from '../../services/coingecko';

interface MarketsPageProps {
  trendingCoins: TrendingCoinWithPrice[];
  error?: string;
}

function formatPrice(price: number): string {
  if (price >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  } else {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 6,
    }).format(price);
  }
}

export default function MarketsPage({ trendingCoins, error }: MarketsPageProps) {
  return (
    <PortalLayout title="Markets overview">
      <section className="mb-6">
        <h1 className="text-2xl font-semibold mb-2 text-akari-text">Markets overview</h1>
        <p className="text-sm text-akari-muted max-w-2xl">
          High level view of top gainers, volume leaders and narratives. We group markets into segments like Layer 1, Layer 2, AI, GameFi, InfoFi and SportFi so it is easier to see what is actually moving.
        </p>
      </section>

      {/* Error State */}
      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 mb-6">
          <p className="text-sm text-red-400">
            Could not load market data right now. Please try again in a moment.
          </p>
        </div>
      )}

      {/* Trending Markets Table */}
      {!error && trendingCoins.length > 0 && (
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-akari-text">Trending Markets</h2>
            <span className="text-xs text-akari-muted">Live from CoinGecko</span>
          </div>
          
          {/* Desktop Table */}
          <div className="hidden md:block rounded-2xl border border-akari-accent/20 bg-akari-card overflow-hidden">
            <table className="w-full">
              <thead className="bg-akari-cardSoft border-b border-akari-border/50">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">Symbol</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">Price</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-akari-muted uppercase tracking-[0.1em]">Status</th>
                </tr>
              </thead>
              <tbody>
                {trendingCoins.map((coin, index) => (
                  <tr
                    key={coin.id}
                    className="border-b border-akari-border/30 last:border-0 hover:bg-akari-cardSoft/50 transition"
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-medium text-akari-text">{coin.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-akari-muted uppercase">{coin.symbol}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-sm font-semibold text-akari-primary">{formatPrice(coin.priceUsd)}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {index < 3 ? (
                        <span className="inline-flex items-center rounded-full bg-akari-primary/15 px-2 py-1 text-[10px] font-medium text-akari-primary uppercase tracking-[0.1em]">
                          Top Attention
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-akari-accent/15 px-2 py-1 text-[10px] font-medium text-akari-accent uppercase tracking-[0.1em]">
                          Trending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Grid */}
          <div className="md:hidden grid gap-3">
            {trendingCoins.map((coin, index) => (
              <div
                key={coin.id}
                className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-akari-text">{coin.name}</h3>
                    <p className="text-xs text-akari-muted uppercase mt-0.5">{coin.symbol}</p>
                  </div>
                  {index < 3 ? (
                    <span className="inline-flex items-center rounded-full bg-akari-primary/15 px-2 py-1 text-[10px] font-medium text-akari-primary uppercase tracking-[0.1em]">
                      Top Attention
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-akari-accent/15 px-2 py-1 text-[10px] font-medium text-akari-accent uppercase tracking-[0.1em]">
                      Trending
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-akari-primary">{formatPrice(coin.priceUsd)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!error && trendingCoins.length === 0 && (
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-6 mb-6">
          <p className="text-sm text-akari-muted text-center">
            No trending markets available at this time.
          </p>
        </div>
      )}

      {/* Narrative Tiles */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-primary mb-1 uppercase tracking-[0.1em]">AI Markets</p>
          <p className="text-sm mb-1 text-akari-text">Artificial Intelligence</p>
          <p className="text-[11px] text-akari-muted">
            Track AI tokens and projects. Monitor price movements and create prediction markets.
          </p>
        </div>
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.1em]">GameFi</p>
          <p className="text-sm mb-1 text-akari-text">Gaming & NFTs</p>
          <p className="text-[11px] text-akari-muted">
            Gaming tokens, NFT projects and metaverse assets. Follow trends and bet on outcomes.
          </p>
        </div>
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-profit mb-1 uppercase tracking-[0.1em]">InfoFi</p>
          <p className="text-sm mb-1 text-akari-text">Information Finance</p>
          <p className="text-[11px] text-akari-muted">
            Oracle networks, data tokens and information markets. Predict data value and usage.
          </p>
        </div>
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-primary mb-1 uppercase tracking-[0.1em]">DeFi & L2s</p>
          <p className="text-sm mb-1 text-akari-text">Decentralized Finance</p>
          <p className="text-[11px] text-akari-muted">
            DeFi protocols, Layer 2 solutions and scaling technologies. Track TVL and adoption.
          </p>
        </div>
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.1em]">SportFi</p>
          <p className="text-sm mb-1 text-akari-text">Sports & Betting</p>
          <p className="text-[11px] text-akari-muted">
            Sports tokens, fan tokens and betting markets. Predict match outcomes and token performance.
          </p>
        </div>
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-muted mb-1">Top Gainers 24h</p>
          <p className="text-sm mb-1 text-akari-text">Volume Leaders</p>
          <p className="text-[11px] text-akari-muted">
            Once wired, we will list coins like SOL, AVAX, LINK with 24h change and directly open prediction markets.
          </p>
        </div>
      </div>
    </PortalLayout>
  );
}

export const getServerSideProps: GetServerSideProps<MarketsPageProps> = async () => {
  try {
    const trendingCoins = await getTrendingCoinsWithPrices();
    
    return {
      props: {
        trendingCoins: JSON.parse(JSON.stringify(trendingCoins)),
      },
    };
  } catch (error) {
    console.error('[Markets Page] Error fetching trending coins:', error);
    return {
      props: {
        trendingCoins: [],
        error: 'Failed to load market data',
      },
    };
  }
};
