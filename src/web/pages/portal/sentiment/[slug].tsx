import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '../../../components/portal/PortalLayout';

/**
 * Type definitions for detailed sentiment data
 */
type ChangeDirection = 'up' | 'down' | 'flat';

interface ProjectDetail {
  id: string;
  slug: string;
  name: string;
  x_handle: string;
  bio: string | null;
  avatar_url: string | null;
  first_tracked_at: string | null;
  last_refreshed_at: string | null;
}

interface MetricsDaily {
  date: string;
  sentiment_score: number | null;
  ct_heat_score: number | null;
  tweet_count: number | null;
  followers: number | null;
  akari_score: number | null;
}

interface MetricsChange24h {
  sentimentChange24h: number;
  ctHeatChange24h: number;
  akariChange24h: number;
  sentimentDirection24h: ChangeDirection;
  ctHeatDirection24h: ChangeDirection;
}

interface Influencer {
  id: string;
  x_handle: string;
  name: string | null;
  avatar_url: string | null;
  followers: number | null;
  akari_score: number | null;
  credibility_score: number | null;
  avg_sentiment_30d: number | null;
  last_mention_at: string | null;
}

interface SentimentDetailResponse {
  ok: boolean;
  project?: ProjectDetail;
  metrics?: MetricsDaily[];
  latestMetrics?: MetricsDaily | null;
  previousMetrics?: MetricsDaily | null;
  changes24h?: MetricsChange24h;
  influencers?: Influencer[];
  error?: string;
}

/**
 * Map AKARI score (0-1000) to tier name and color
 */
function getAkariTier(score: number | null): { name: string; color: string; bgColor: string } {
  if (score === null) return { name: 'Unranked', color: 'text-akari-muted', bgColor: 'bg-akari-muted/10' };
  if (score >= 900) return { name: 'Celestial', color: 'text-purple-400', bgColor: 'bg-purple-400/10' };
  if (score >= 750) return { name: 'Vanguard', color: 'text-akari-primary', bgColor: 'bg-akari-primary/10' };
  if (score >= 550) return { name: 'Ranger', color: 'text-blue-400', bgColor: 'bg-blue-400/10' };
  if (score >= 400) return { name: 'Nomad', color: 'text-akari-accent', bgColor: 'bg-akari-accent/10' };
  return { name: 'Shadow', color: 'text-akari-muted', bgColor: 'bg-akari-muted/10' };
}

/**
 * Format number with K/M suffix
 */
function formatNumber(num: number | null): string {
  if (num === null) return '-';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Get color for sentiment/heat values
 */
function getScoreColor(score: number | null): string {
  if (score === null) return 'text-akari-muted';
  if (score >= 70) return 'text-akari-primary';
  if (score >= 40) return 'text-akari-profit';
  return 'text-akari-danger';
}

/**
 * Get color for change values
 */
function getChangeColor(change: number): string {
  if (change > 0) return 'text-akari-primary';
  if (change < 0) return 'text-akari-danger';
  return 'text-akari-muted';
}

/**
 * Format change with sign and arrow
 */
function formatChange(change: number, direction: ChangeDirection): string {
  if (direction === 'flat') return '–';
  const arrow = direction === 'up' ? '▲' : '▼';
  const sign = direction === 'up' ? '+' : '';
  return `${arrow} ${sign}${change}`;
}

/**
 * Change indicator component for 24h deltas (card version)
 */
function ChangeIndicatorCard({ 
  change, 
  direction,
  label = '24h'
}: { 
  change: number; 
  direction: ChangeDirection;
  label?: string;
}) {
  const colorClass = getChangeColor(change);
  const text = formatChange(change, direction);

  return (
    <div className={`text-xs ${colorClass} mt-1`}>
      <span className="text-akari-muted mr-1">{label}:</span>
      <span className="font-medium">{text}</span>
    </div>
  );
}

/**
 * Delta cell for history table
 */
function DeltaCell({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) {
    return <span className="text-akari-muted">–</span>;
  }
  
  const delta = current - previous;
  if (delta === 0) {
    return <span className="text-akari-muted">–</span>;
  }

  const colorClass = delta > 0 ? 'text-akari-primary' : 'text-akari-danger';
  const sign = delta > 0 ? '+' : '';
  const arrow = delta > 0 ? '▲' : '▼';
  
  return (
    <span className={`${colorClass} text-xs`}>
      {arrow} {sign}{delta}
    </span>
  );
}

/**
 * Project Detail Page
 * Shows detailed sentiment metrics, charts, and influencers for a single project
 */
export default function SentimentDetail() {
  const router = useRouter();
  const { slug } = router.query;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [metrics, setMetrics] = useState<MetricsDaily[]>([]);
  const [changes24h, setChanges24h] = useState<MetricsChange24h | null>(null);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;

    async function fetchData() {
      try {
        const res = await fetch(`/api/portal/sentiment/${slug}`);
        const data: SentimentDetailResponse = await res.json();

        if (!data.ok) {
          setError(data.error || 'Project not found');
          return;
        }

        if (data.project) setProject(data.project);
        if (data.metrics) setMetrics(data.metrics);
        if (data.changes24h) setChanges24h(data.changes24h);
        if (data.influencers) setInfluencers(data.influencers);
      } catch (err) {
        setError('Failed to connect to API');
        console.error('[SentimentDetail] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [slug]);

  // Get latest metrics for header stats
  const latestMetrics = metrics.length > 0 ? metrics[0] : null;
  const tier = getAkariTier(latestMetrics?.akari_score ?? null);

  // Prepare chart data (reverse to show oldest first for sparkline)
  const sentimentData = metrics
    .map((m) => m.sentiment_score)
    .filter((v): v is number => v !== null)
    .reverse();
  const heatData = metrics
    .map((m) => m.ct_heat_score)
    .filter((v): v is number => v !== null)
    .reverse();

  return (
    <PortalLayout title={project?.name || 'Loading...'}>
      {/* Back link */}
      <Link
        href="/portal/sentiment"
        className="mb-4 inline-flex items-center gap-1 text-xs text-akari-muted hover:text-akari-primary transition"
      >
        ← Back to Overview
      </Link>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-2xl border border-akari-danger/30 bg-akari-card p-6 text-center">
          <p className="text-sm text-akari-danger mb-4">{error}</p>
          <Link
            href="/portal/sentiment"
            className="text-xs text-akari-muted hover:text-akari-primary"
          >
            Return to Overview
          </Link>
        </div>
      )}

      {/* Main content - only show if we have project data */}
      {!loading && !error && project && (
        <>
          {/* Project Header */}
          <section className="mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Avatar */}
              {project.avatar_url ? (
                <img
                  src={project.avatar_url}
                  alt={project.name}
                  className="h-16 w-16 rounded-2xl object-cover border border-akari-border"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-akari-cardSoft text-akari-primary text-2xl font-semibold">
                  {project.name.charAt(0)}
                </div>
              )}

              {/* Project info */}
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-2xl font-semibold">{project.name}</h1>
                  <span
                    className={`rounded-full ${tier.bgColor} px-3 py-1 text-xs uppercase tracking-wider ${tier.color}`}
                  >
                    {tier.name}
                  </span>
                </div>
                <a
                  href={`https://x.com/${project.x_handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-akari-muted hover:text-akari-primary transition"
                >
                  @{project.x_handle}
                </a>
                {project.bio && (
                  <p className="mt-2 text-sm text-akari-muted max-w-xl">
                    {project.bio}
                  </p>
                )}
              </div>

              {/* AKARI Score with 24h change */}
              {latestMetrics?.akari_score != null && (
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">
                    AKARI Score
                  </p>
                  <p className={`text-4xl font-bold ${tier.color}`}>
                    {latestMetrics.akari_score}
                  </p>
                  {changes24h && (
                    <p className={`text-xs mt-1 ${getChangeColor(changes24h.akariChange24h)}`}>
                      24h: {formatChange(changes24h.akariChange24h, changes24h.akariChange24h > 0 ? 'up' : changes24h.akariChange24h < 0 ? 'down' : 'flat')}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Stats Cards */}
          {latestMetrics && (
            <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">
                  Sentiment
                </p>
                <p
                  className={`text-2xl font-bold ${getScoreColor(
                    latestMetrics.sentiment_score
                  )}`}
                >
                  {latestMetrics.sentiment_score ?? '-'}
                </p>
                {changes24h && (
                  <ChangeIndicatorCard 
                    change={changes24h.sentimentChange24h}
                    direction={changes24h.sentimentDirection24h}
                  />
                )}
              </div>
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">
                  CT Heat
                </p>
                <p
                  className={`text-2xl font-bold ${getScoreColor(
                    latestMetrics.ct_heat_score
                  )}`}
                >
                  {latestMetrics.ct_heat_score ?? '-'}
                </p>
                {changes24h && (
                  <ChangeIndicatorCard 
                    change={changes24h.ctHeatChange24h}
                    direction={changes24h.ctHeatDirection24h}
                  />
                )}
              </div>
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">
                  Followers
                </p>
                <p className="text-2xl font-bold text-akari-text">
                  {formatNumber(latestMetrics.followers)}
                </p>
              </div>
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">
                  Tweets Today
                </p>
                <p className="text-2xl font-bold text-akari-text">
                  {latestMetrics.tweet_count ?? '-'}
                </p>
              </div>
            </section>
          )}

          {/* Charts Section - only show if we have historical data */}
          {metrics.length > 1 && (
            <section className="grid md:grid-cols-2 gap-4 mb-6">
              {/* Sentiment Chart */}
              {sentimentData.length > 0 && (
                <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs uppercase tracking-wider text-akari-muted">
                      Sentiment Trend (30d)
                    </p>
                    <p className="text-sm font-mono text-akari-primary">
                      {sentimentData[sentimentData.length - 1]}
                    </p>
                  </div>
                  <div className="flex items-end gap-[3px] h-16">
                    {sentimentData.slice(-30).map((value, i) => {
                      const max = Math.max(...sentimentData);
                      const min = Math.min(...sentimentData);
                      const range = max - min || 1;
                      const height = ((value - min) / range) * 100;
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t-sm bg-akari-primary/70 hover:bg-akari-primary transition-colors"
                          style={{ height: `${Math.max(height, 8)}%` }}
                          title={`${value}`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CT Heat Chart */}
              {heatData.length > 0 && (
                <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs uppercase tracking-wider text-akari-muted">
                      CT Heat Trend (30d)
                    </p>
                    <p className="text-sm font-mono text-akari-accent">
                      {heatData[heatData.length - 1]}
                    </p>
                  </div>
                  <div className="flex items-end gap-[3px] h-16">
                    {heatData.slice(-30).map((value, i) => {
                      const max = Math.max(...heatData);
                      const min = Math.min(...heatData);
                      const range = max - min || 1;
                      const height = ((value - min) / range) * 100;
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t-sm bg-akari-accent/70 hover:bg-akari-accent transition-colors"
                          style={{ height: `${Math.max(height, 8)}%` }}
                          title={`${value}`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Metrics History Table - only show if we have historical data */}
          {metrics.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">
                Metrics History
              </h2>
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-akari-border bg-akari-cardSoft text-xs uppercase tracking-wider text-akari-muted">
                        <th className="py-3 px-4 text-left">Date</th>
                        <th className="py-3 px-4 text-center">AKARI</th>
                        <th className="py-3 px-4 text-center">Sentiment</th>
                        <th className="py-3 px-2 text-center">Δ</th>
                        <th className="py-3 px-4 text-center">CT Heat</th>
                        <th className="py-3 px-2 text-center">Δ</th>
                        <th className="py-3 px-4 text-center">Tweets</th>
                        <th className="py-3 px-4 text-center">Followers</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.slice(0, 14).map((m, i) => {
                        const prevMetrics = metrics[i + 1] || null;
                        return (
                          <tr
                            key={m.date}
                            className={`border-b border-akari-border/30 ${
                              i === 0 ? 'bg-akari-primary/5' : ''
                            }`}
                          >
                            <td className="py-3 px-4 text-akari-muted">
                              {new Date(m.date).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-center font-mono">
                              {m.akari_score ?? '-'}
                            </td>
                            <td
                              className={`py-3 px-4 text-center font-mono ${getScoreColor(
                                m.sentiment_score
                              )}`}
                            >
                              {m.sentiment_score ?? '-'}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <DeltaCell 
                                current={m.sentiment_score} 
                                previous={prevMetrics?.sentiment_score ?? null} 
                              />
                            </td>
                            <td
                              className={`py-3 px-4 text-center font-mono ${getScoreColor(
                                m.ct_heat_score
                              )}`}
                            >
                              {m.ct_heat_score ?? '-'}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <DeltaCell 
                                current={m.ct_heat_score} 
                                previous={prevMetrics?.ct_heat_score ?? null} 
                              />
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-akari-muted">
                              {m.tweet_count ?? '-'}
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-akari-muted">
                              {formatNumber(m.followers)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* Top Influencers - only show if we have influencer data */}
          {influencers.length > 0 && (
            <section>
              <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">
                Top Influencers
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {influencers.slice(0, 6).map((inf) => {
                  const infTier = getAkariTier(inf.akari_score);
                  return (
                    <a
                      key={inf.id}
                      href={`https://x.com/${inf.x_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-2xl border border-akari-border/70 bg-akari-card p-4 transition hover:border-akari-primary/50"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        {inf.avatar_url ? (
                          <img
                            src={inf.avatar_url}
                            alt={inf.name || inf.x_handle}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-akari-cardSoft text-akari-primary">
                            {(inf.name || inf.x_handle).charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-akari-text truncate">
                            {inf.name || inf.x_handle}
                          </p>
                          <p className="text-xs text-akari-muted">
                            @{inf.x_handle}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                        <div>
                          <p className="text-akari-muted mb-0.5">AKARI</p>
                          <p className={`font-mono font-medium ${infTier.color}`}>
                            {inf.akari_score ?? '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-akari-muted mb-0.5">Credibility</p>
                          <p className="font-mono font-medium">
                            {inf.credibility_score ?? '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-akari-muted mb-0.5">Followers</p>
                          <p className="font-mono font-medium">
                            {formatNumber(inf.followers)}
                          </p>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </PortalLayout>
  );
}
