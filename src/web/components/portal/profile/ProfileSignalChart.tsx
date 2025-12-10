/**
 * ProfileSignalChart Component
 * 
 * Displays a 30-day signal chart showing sentiment and CT heat trends.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface MetricsDaily {
  date: string;
  sentiment_score: number | null;
  ct_heat_score: number | null;
  tweet_count: number | null;
  followers: number | null;
  followers_delta?: number | null;
  akari_score: number | null;
}

export interface ProfileSignalChartProps {
  /** 30-day metrics history */
  metricsHistory: MetricsDaily[];
  /** Callback for refresh action */
  onRefresh?: () => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileSignalChart({ metricsHistory, onRefresh }: ProfileSignalChartProps) {
  // Prepare data for chart (last 30 days, reversed for chronological order)
  const data = [...metricsHistory].reverse().slice(-30);
  
  const hasData = data.length > 0;
  const maxSentiment = Math.max(...data.map(d => d.sentiment_score ?? 0), 100);
  const maxCtHeat = Math.max(...data.map(d => d.ct_heat_score ?? 0), 100);
  
  return (
    <section className="neon-card neon-hover p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm uppercase tracking-wider font-semibold text-gradient-teal">Signal Chart (30D)</h2>
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="pill-neon text-xs text-akari-muted hover:text-akari-neon-teal transition-all duration-300 flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 border border-akari-neon-teal/20 hover:border-akari-neon-teal/40 hover:bg-akari-neon-teal/5 font-medium"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        )}
      </div>
      
      {!hasData ? (
        <div className="h-48 flex items-center justify-center text-akari-muted text-sm font-medium">
          No chart data available yet
        </div>
      ) : (
        <div className="h-48 relative">
          <svg viewBox="0 0 400 150" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ctHeatGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            
            {/* Grid lines */}
            <line x1="0" y1="37.5" x2="400" y2="37.5" stroke="#334155" strokeWidth="0.5" strokeDasharray="4" />
            <line x1="0" y1="75" x2="400" y2="75" stroke="#334155" strokeWidth="0.5" strokeDasharray="4" />
            <line x1="0" y1="112.5" x2="400" y2="112.5" stroke="#334155" strokeWidth="0.5" strokeDasharray="4" />
            
            {/* Sentiment line and fill */}
            {data.length > 1 && (
              <>
                <polygon
                  fill="url(#sentimentGradient)"
                  points={`0,150 ${data.map((d, i) => {
                    const x = (i / (data.length - 1)) * 400;
                    const y = 150 - ((d.sentiment_score ?? 50) / maxSentiment) * 140;
                    return `${x},${y}`;
                  }).join(' ')} 400,150`}
                />
                <polyline
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="2"
                  points={data.map((d, i) => {
                    const x = (i / (data.length - 1)) * 400;
                    const y = 150 - ((d.sentiment_score ?? 50) / maxSentiment) * 140;
                    return `${x},${y}`;
                  }).join(' ')}
                />
              </>
            )}
            
            {/* CT Heat line (dashed) */}
            {data.length > 1 && (
              <polyline
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2"
                strokeDasharray="4"
                points={data.map((d, i) => {
                  const x = (i / (data.length - 1)) * 400;
                  const y = 150 - ((d.ct_heat_score ?? 50) / maxCtHeat) * 140;
                  return `${x},${y}`;
                }).join(' ')}
              />
            )}
            
            {/* Data points for latest */}
            {data.length > 0 && (
              <>
                <circle
                  cx={400}
                  cy={150 - ((data[data.length - 1]?.sentiment_score ?? 50) / maxSentiment) * 140}
                  r="4"
                  fill="#10b981"
                />
                <circle
                  cx={400}
                  cy={150 - ((data[data.length - 1]?.ct_heat_score ?? 50) / maxCtHeat) * 140}
                  r="4"
                  fill="#f59e0b"
                />
              </>
            )}
          </svg>
          
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-akari-muted font-medium pointer-events-none">
            <span>100</span>
            <span>50</span>
            <span>0</span>
          </div>
          
          {/* Legend */}
          <div className="absolute bottom-0 right-0 flex gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-akari-neon-teal rounded"></span>
              <span className="text-akari-muted font-medium">Sentiment</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-akari-neon-pink rounded" style={{ borderStyle: 'dashed' }}></span>
              <span className="text-akari-muted font-medium">CT Heat</span>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

