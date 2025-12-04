import React from 'react';
import { PortalLayout } from '../../components/portal/PortalLayout';

export default function MarketsPage() {
  return (
    <PortalLayout>
      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2 text-akari-text">Markets Overview</h2>
        <p className="text-sm text-akari-muted max-w-2xl">
          High level view of top gainers, volume leaders and narratives.
          Later this will connect directly to Binance, CoinGecko and DexScreener data.
        </p>
      </section>

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
