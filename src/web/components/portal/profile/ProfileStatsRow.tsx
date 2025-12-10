/**
 * ProfileStatsRow Component
 * 
 * Displays a responsive grid of stat cards showing AKARI score,
 * sentiment, CT heat, followers, and inner circle stats.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface MetricsChange24h {
  sentimentChange24h: number;
  ctHeatChange24h: number;
  akariChange24h: number;
  sentimentDirection24h: 'up' | 'down' | 'flat';
  ctHeatDirection24h: 'up' | 'down' | 'flat';
}

export interface InnerCircleSummary {
  count: number;
  power: number;
}

export interface ProfileStatsRowProps {
  akariScore: number | null;
  tier: { name: string; color: string; bgColor: string };
  sentimentScore: number | null;
  ctHeatScore: number | null;
  followers: number | null;
  innerCircle: InnerCircleSummary;
  changes24h: MetricsChange24h | null;
}

// =============================================================================
// HELPERS
// =============================================================================

function formatNumber(num: number | null): string {
  if (num === null) return '-';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

interface StatCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  valueColor?: string;
  delta?: number;
  deltaDirection?: 'up' | 'down' | 'flat';
}

function StatCard({
  label,
  value,
  subValue,
  valueColor = 'text-akari-text',
  delta,
  deltaDirection,
}: StatCardProps) {
  return (
    <div className="neon-card neon-hover p-5 min-h-[110px] border border-akari-neon-teal/20">
      <p className="text-xs uppercase tracking-wider text-gradient-teal font-semibold mb-2">{label}</p>
      <p className={`text-2xl font-bold ${valueColor} mb-1`}>{value}</p>
      {delta !== undefined && deltaDirection && (
        <div className="mt-1">
          {deltaDirection === 'flat' && delta === 0 ? (
            <p className="text-xs text-akari-muted">No movement in the last 24h</p>
          ) : (
            <p className={`text-sm font-semibold ${
              deltaDirection === 'up' ? 'text-green-400' :
              deltaDirection === 'down' ? 'text-red-400' : 'text-akari-muted'
            }`}>
              {deltaDirection === 'up' ? '▲' : deltaDirection === 'down' ? '▼' : '–'}
              {delta !== 0 && ` ${delta > 0 ? '+' : ''}${delta}`}
              <span className="text-xs text-akari-muted ml-1.5">Last 24h</span>
            </p>
          )}
        </div>
      )}
      {subValue && <p className="text-xs text-akari-muted mt-2 font-medium">{subValue}</p>}
    </div>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileStatsRow({
  akariScore,
  tier,
  sentimentScore,
  ctHeatScore,
  followers,
  innerCircle,
  changes24h,
}: ProfileStatsRowProps) {
  return (
    <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <StatCard
        label="AKARI Score"
        value={akariScore ?? '-'}
        valueColor={tier.color}
        subValue={tier.name}
        delta={changes24h?.akariChange24h}
        deltaDirection={
          changes24h?.akariChange24h && changes24h.akariChange24h > 0 ? 'up' :
          changes24h?.akariChange24h && changes24h.akariChange24h < 0 ? 'down' : 'flat'
        }
      />
      <StatCard
        label="Sentiment"
        value={sentimentScore ?? '-'}
        valueColor={
          (sentimentScore ?? 0) >= 60 ? 'text-emerald-400' :
          (sentimentScore ?? 0) >= 40 ? 'text-amber-400' : 'text-red-400'
        }
        delta={changes24h?.sentimentChange24h}
        deltaDirection={changes24h?.sentimentDirection24h}
      />
      <StatCard
        label="CT Heat"
        value={ctHeatScore ?? '-'}
        valueColor={(ctHeatScore ?? 0) >= 60 ? 'text-amber-400' : 'text-slate-400'}
        delta={changes24h?.ctHeatChange24h}
        deltaDirection={changes24h?.ctHeatDirection24h}
      />
      <StatCard
        label="Followers"
        value={formatNumber(followers)}
        valueColor="text-white"
      />
      <StatCard
        label="Inner Circle"
        value={innerCircle.count || '-'}
        valueColor="text-white"
        subValue={innerCircle.power > 0 ? `Power: ${formatNumber(innerCircle.power)}` : undefined}
      />
    </section>
  );
}

