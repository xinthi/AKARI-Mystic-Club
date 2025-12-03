import React from 'react';
import { PortalLayout } from '../../components/portal/PortalLayout';

export default function MarketsPage() {
  return (
    <PortalLayout>
      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Markets overview</h2>
        <p className="text-sm text-akari-muted max-w-2xl">
          High-level view of top gainers, volume leaders and narratives.
          Later we will wire this to Binance / CoinGecko / DexScreener feeds
          and connect it directly with Akari prediction markets.
        </p>
      </section>

      {/* Placeholder list */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-muted mb-1">Example</p>
          <p className="text-sm mb-1">Top gainers 24h</p>
          <p className="text-[11px] text-akari-muted">
            Once wired, we&apos;ll list coins like SOL, AVAX, LINK with 24h %
            change and directly open prediction markets from here.
          </p>
        </div>
        <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
          <p className="text-xs text-akari-muted mb-1">Example</p>
          <p className="text-sm mb-1">Narrative dashboards</p>
          <p className="text-[11px] text-akari-muted">
            Meme, AI, L2s, TON ecosystem and more, all feeding into your
            MiniApp markets tab.
          </p>
        </div>
      </div>
    </PortalLayout>
  );
}
