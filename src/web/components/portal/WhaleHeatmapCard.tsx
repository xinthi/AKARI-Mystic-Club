import * as React from 'react';

export type WhaleEntryDto = {
  id: string;
  tokenSymbol: string;
  chain: string;
  wallet: string;
  amountUsd: number;
  occurredAt: string;
};

type Props = {
  entries: WhaleEntryDto[];
};

function formatUsd(value: number) {
  if (!Number.isFinite(value)) return '$0';
  if (value >= 1_000_000) {
    return '$' + (value / 1_000_000).toFixed(1) + 'M';
  }
  if (value >= 1_000) {
    return '$' + (value / 1_000).toFixed(1) + 'k';
  }
  return '$' + value.toFixed(0);
}

function timeAgo(iso: string) {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD} d ago`;
}

export const WhaleHeatmapCard: React.FC<Props> = ({ entries }) => {
  // Aggregate by token to find top tokens by whale volume
  const totalsByToken = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const key = e.tokenSymbol || 'UNKNOWN';
      map.set(key, (map.get(key) ?? 0) + e.amountUsd);
    }
    const list = Array.from(map.entries()).map(([symbol, totalUsd]) => ({
      symbol,
      totalUsd,
    }));
    list.sort((a, b) => b.totalUsd - a.totalUsd);
    return list.slice(0, 4);
  }, [entries]);

  const topEntries = entries.slice(0, 12);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">
            Smart Money Heatmap
          </h2>
          <p className="text-xs text-slate-400">
            Large onchain entries from tracked wallets. Updated by Uniblock cron.
          </p>
        </div>
        {totalsByToken.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-end max-w-[260px]">
            {totalsByToken.map((t) => (
              <div
                key={t.symbol}
                className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-1"
              >
                <span className="font-semibold">{t.symbol}</span>
                <span className="text-[10px] uppercase tracking-wide">
                  {formatUsd(t.totalUsd)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="text-sm text-slate-500 pt-2">
          No large whale entries detected in the last period.
        </div>
      ) : (
        <div className="mt-1 max-h-72 overflow-auto pr-1 space-y-2">
          {topEntries.map((e) => {
            let intensity = 'text-slate-200';
            if (e.amountUsd >= 100_000) {
              intensity = 'text-emerald-300';
            } else if (e.amountUsd >= 25_000) {
              intensity = 'text-emerald-200';
            }

            return (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/50 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-xs font-semibold text-emerald-200">
                    {e.tokenSymbol || '?'}
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${intensity}`}>
                        {formatUsd(e.amountUsd)}
                      </span>
                      <span className="text-[11px] uppercase tracking-wide text-slate-400">
                        {e.tokenSymbol}
                      </span>
                      <span className="text-[10px] uppercase tracking-wide rounded-full bg-slate-800 px-2 py-[2px] text-slate-400">
                        {e.chain}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {timeAgo(e.occurredAt)} •{' '}
                      <span className="font-mono text-[10px]">
                        {e.wallet.slice(0, 6)}...{e.wallet.slice(-4)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

