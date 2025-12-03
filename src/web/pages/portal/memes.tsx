import React from 'react';
import { PortalLayout } from '../../components/portal/PortalLayout';

export default function MemesPage() {
  return (
    <PortalLayout>
      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Meme Radar</h2>
        <p className="text-sm text-akari-muted max-w-2xl">
          This area will track fresh meme pairs (DexScreener, Solana, TON, etc.),
          filter for real liquidity and speed, and automatically spawn
          prediction markets in the MiniApp.
        </p>
      </section>

      <div className="rounded-2xl border border-akari-border bg-akari-card p-4">
        <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.16em]">
          Coming soon
        </p>
        <p className="text-sm mb-1">Stream of new meme pairs.</p>
        <p className="text-[11px] text-akari-muted">
          We&apos;ll plug in DexScreener APIs later and show pairs with
          liquidity, FDV, and velocity. From here, you can open a prediction
          with one tap.
        </p>
      </div>
    </PortalLayout>
  );
}
