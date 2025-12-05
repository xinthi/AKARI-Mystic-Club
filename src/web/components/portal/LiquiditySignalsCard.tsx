import * as React from 'react';

export type LiquiditySignalDto = {
  id: string;
  type: string;
  title: string;
  description: string;
  severity: number;
  chain?: string | null;
  stableSymbol?: string | null;
  tokenSymbol?: string | null;
  triggeredAt: string;
};

type Props = {
  signals: LiquiditySignalDto[];
};

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  return `${dd}d ago`;
}

export const LiquiditySignalsCard: React.FC<Props> = ({ signals }) => {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-50">Liquidity Rotation Signals</h2>
          <p className="text-xs text-slate-400">
            Stablecoin flows and whale entries turned into narrative signals for the Mystic Club.
          </p>
        </div>
      </div>

      {signals.length === 0 ? (
        <div className="text-sm text-slate-500 pt-2">
          No active liquidity signals in the last 24 hours.
        </div>
      ) : (
        <div className="space-y-2 mt-1">
          {signals.map((s) => {
            const severityColor =
              s.severity >= 3
                ? 'bg-emerald-500/15 border-emerald-500/60'
                : 'bg-emerald-500/5 border-emerald-500/30';
            return (
              <div
                key={s.id}
                className={`flex items-start justify-between gap-3 rounded-xl px-3 py-2 border ${severityColor}`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    {s.chain && (
                      <span className="text-[10px] uppercase tracking-wide rounded-full bg-slate-900 px-2 py-[2px] text-slate-400">
                        {s.chain}
                      </span>
                    )}
                    {s.stableSymbol && (
                      <span className="text-[10px] uppercase tracking-wide rounded-full bg-slate-900 px-2 py-[2px] text-slate-400">
                        {s.stableSymbol}
                      </span>
                    )}
                    {s.tokenSymbol && (
                      <span className="text-[10px] uppercase tracking-wide rounded-full bg-slate-900 px-2 py-[2px] text-slate-400">
                        {s.tokenSymbol}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-slate-50">{s.title}</div>
                  <div className="text-xs text-slate-400">{s.description}</div>
                </div>
                <div className="text-[11px] text-slate-500 whitespace-nowrap">
                  {timeAgo(s.triggeredAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

