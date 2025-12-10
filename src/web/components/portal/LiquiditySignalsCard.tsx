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
  lastAnySignal: LiquiditySignalDto | null;
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

export const LiquiditySignalsCard: React.FC<Props> = ({ signals, lastAnySignal }) => {
  return (
    <div className="card-neon p-4 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gradient-neon mb-1">Liquidity Rotation Signals</h2>
          <p className="text-xs text-akari-muted/80">
            Stablecoin flows and whale entries turned into narrative signals for the Mystic Club.
          </p>
        </div>
      </div>

      {signals.length === 0 && !lastAnySignal ? (
        <div className="text-sm text-slate-400 pt-2 space-y-2">
          <p>No active liquidity rotation signals in the last 24 hours.</p>
          <p className="text-xs text-slate-500">
            We&apos;ll surface Base/SOL/ETH rotations here as they happen. Signals are derived from stablecoin flows and whale entries across chains.
          </p>
        </div>
      ) : signals.length === 0 && lastAnySignal ? (
        <div className="text-sm text-slate-400 pt-2 space-y-2">
          <p>No new signals in the last 24 hours — markets are quiet.</p>
          <p className="text-xs text-slate-500">
            Last signal: &quot;{lastAnySignal.title}&quot; — {timeAgo(lastAnySignal.triggeredAt)}
            {lastAnySignal.chain ? ` on ${lastAnySignal.chain}` : ''}.
          </p>
        </div>
      ) : (
        <div className="space-y-2 mt-1">
          {signals.map((s) => {
            const severityColor =
              s.severity >= 3
                ? 'bg-akari-neon-teal/15 border-akari-neon-teal/50 shadow-soft-glow'
                : 'bg-akari-neon-teal/5 border-akari-neon-teal/30';
            return (
              <div
                key={s.id}
                className={`flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3 rounded-2xl px-4 py-3 border transition-smooth hover:scale-[1.01] hover:shadow-soft-glow ${severityColor}`}
              >
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    {s.chain && (
                      <span className="text-[9px] sm:text-[10px] uppercase tracking-wide rounded-full bg-slate-900 px-1.5 sm:px-2 py-[2px] text-slate-400">
                        {s.chain}
                      </span>
                    )}
                    {s.stableSymbol && (
                      <span className="text-[9px] sm:text-[10px] uppercase tracking-wide rounded-full bg-slate-900 px-1.5 sm:px-2 py-[2px] text-slate-400">
                        {s.stableSymbol}
                      </span>
                    )}
                    {s.tokenSymbol && (
                      <span className="text-[9px] sm:text-[10px] uppercase tracking-wide rounded-full bg-slate-900 px-1.5 sm:px-2 py-[2px] text-slate-400">
                        {s.tokenSymbol}
                      </span>
                    )}
                  </div>
                  <div className="text-xs sm:text-sm font-medium text-slate-50">{s.title}</div>
                  <div className="text-[11px] sm:text-xs text-slate-400">{s.description}</div>
                </div>
                <div className="text-[10px] sm:text-[11px] text-slate-500 whitespace-nowrap flex-shrink-0">
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

