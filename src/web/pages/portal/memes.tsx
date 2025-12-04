import React from 'react';
import { PortalLayout } from '../../components/portal/PortalLayout';

export default function MemesPage() {
  return (
    <PortalLayout title="Meme Radar">
      <section className="mb-6">
        <h1 className="text-2xl font-semibold mb-2 text-akari-text">Meme Radar</h1>
        <p className="text-sm text-akari-muted max-w-2xl">
          Track onchain meme pairs, liquidity and velocity. Surface the hottest degens and turn them into prediction markets in the MiniApp.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition">
          <p className="text-xs text-akari-primary mb-1 uppercase tracking-[0.1em]">SOL memecoins tracker</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Solana Memes</p>
          <p className="text-[11px] text-akari-muted">
            Track SOL memes from DexScreener. Filter by liquidity threshold, age, holder count, and velocity. Auto-create prediction pools.
          </p>
        </div>

        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition">
          <p className="text-xs text-akari-accent mb-1 uppercase tracking-[0.1em]">AI memes vs pure degen</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Narrative Separation</p>
          <p className="text-[11px] text-akari-muted">
            Separate memes by narrative. AI-powered memes vs pure degen plays. Track which narrative performs better.
          </p>
        </div>

        <div className="rounded-2xl border border-akari-accent/20 bg-akari-card p-4 hover:border-akari-primary/40 transition">
          <p className="text-xs text-akari-profit mb-1 uppercase tracking-[0.1em]">Watchlist / candidates</p>
          <p className="text-sm mb-1 text-akari-text font-medium">Prediction Candidates</p>
          <p className="text-[11px] text-akari-muted">
            Curated list of meme pairs that meet our criteria. These candidates can become new prediction pools with one tap.
          </p>
        </div>
      </div>
    </PortalLayout>
  );
}
