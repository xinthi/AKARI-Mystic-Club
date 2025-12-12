import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '../../../components/portal/PortalLayout';
import { useAkariUser } from '../../../lib/akari-auth';
import { canUseDeepExplorer, hasInstitutionalPlus } from '../../../lib/permissions';
import { buildTweetClusters, type ProjectTweet, type TweetCluster } from '../../../lib/portal/tweet-clusters';

// =============================================================================
// TYPE DEFINITIONS (reused from sentiment page)
// =============================================================================

interface ProjectDetail {
  id: string;
  slug: string;
  name: string;
  x_handle: string;
  bio: string | null;
  avatar_url: string | null;
  twitter_profile_image_url: string | null;
  first_tracked_at: string | null;
  last_refreshed_at: string | null;
  inner_circle_count?: number;
  inner_circle_power?: number;
}

interface MetricsDaily {
  date: string;
  sentiment_score: number | null;
  ct_heat_score: number | null;
  tweet_count: number | null;
  followers: number | null;
  akari_score: number | null;
}

interface InnerCircleSummary {
  count: number;
  power: number;
}

interface ProjectInfluencer {
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

interface ProjectTweetData {
  tweetId: string;
  createdAt: string;
  authorHandle: string;
  authorName: string | null;
  authorProfileImageUrl: string | null;
  text: string;
  likes: number;
  replies: number;
  retweets: number;
  sentimentScore: number | null;
  engagementScore: number | null;
  tweetUrl: string;
  isKOL: boolean;
  isOfficial: boolean;
}

interface SentimentDetailResponse {
  ok: boolean;
  project?: ProjectDetail;
  metrics?: MetricsDaily[];
  latestMetrics?: MetricsDaily | null;
  changes24h?: {
    sentimentChange24h: number;
    ctHeatChange24h: number;
    akariChange24h: number;
  };
  innerCircle?: InnerCircleSummary;
  influencers?: ProjectInfluencer[];
  metricsHistoryLong?: MetricsDaily[]; // 90-day history
  tweets?: ProjectTweetData[];
  error?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getAkariTier(score: number | null): { name: string; color: string; bgColor: string } {
  if (score === null) return { name: 'Unranked', color: 'text-akari-muted', bgColor: 'bg-akari-muted/10' };
  if (score >= 900) return { name: 'Celestial', color: 'text-purple-400', bgColor: 'bg-purple-400/10' };
  if (score >= 750) return { name: 'Vanguard', color: 'text-akari-primary', bgColor: 'bg-akari-primary/10' };
  if (score >= 550) return { name: 'Ranger', color: 'text-blue-400', bgColor: 'bg-blue-400/10' };
  if (score >= 400) return { name: 'Nomad', color: 'text-akari-accent', bgColor: 'bg-akari-accent/10' };
  return { name: 'Shadow', color: 'text-akari-muted', bgColor: 'bg-akari-muted/10' };
}

function formatNumber(num: number | null): string {
  if (num === null) return '-';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Compute power metric for an influencer
 */
function computeInfluencerPower(inf: ProjectInfluencer): number {
  const followers = inf.followers ?? 0;
  const akari = inf.akari_score ?? 0;
  const sentiment = inf.avg_sentiment_30d ?? 50;
  
  return akari * 0.5 + Math.log10(followers + 1) * 20 + sentiment * 0.3;
}

/**
 * Calculate engagement breakdown from tweets (last 30 days)
 */
function calculateEngagementBreakdown(tweets: ProjectTweetData[]) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  const recentTweets = tweets.filter(tweet => {
    const tweetDate = new Date(tweet.createdAt);
    return tweetDate >= thirtyDaysAgo;
  });
  
  const breakdown = {
    totalLikes: 0,
    totalReplies: 0,
    totalQuotes: 0, // Not available in current schema, keeping as 0
    totalRetweets: 0,
    tweetCount: recentTweets.length,
  };
  
  for (const tweet of recentTweets) {
    breakdown.totalLikes += tweet.likes || 0;
    breakdown.totalReplies += tweet.replies || 0;
    breakdown.totalRetweets += tweet.retweets || 0;
  }
  
  return breakdown;
}

/**
 * Simple line chart for long-term sentiment
 */
function LongTermSentimentChart({ metrics }: { metrics: MetricsDaily[] }) {
  if (metrics.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-akari-muted">
        Not enough history to draw long term sentiment yet.
      </div>
    );
  }

  // Reverse to get oldest-first for chart
  const chartData = [...metrics].reverse();
  const chartWidth = 600;
  const chartHeight = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Calculate scales
  const sentimentValues = chartData.map(d => d.sentiment_score ?? 50).filter(v => v !== null);
  const ctHeatValues = chartData.map(d => d.ct_heat_score ?? 50).filter(v => v !== null);
  const minVal = 0;
  const maxVal = 100;
  const range = maxVal - minVal;

  const getX = (i: number) => padding.left + (i / (chartData.length - 1 || 1)) * innerWidth;
  const getY = (val: number) => padding.top + innerHeight - ((val - minVal) / range) * innerHeight;

  // Build paths
  const sentimentPath = chartData
    .map((d, i) => {
      const val = d.sentiment_score ?? 50;
      return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(val)}`;
    })
    .join(' ');

  const ctHeatPath = chartData
    .map((d, i) => {
      const val = d.ct_heat_score ?? 50;
      return `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(val)}`;
    })
    .join(' ');

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full h-48"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Grid lines */}
        {[0, 25, 50, 75, 100].map(v => {
          const y = getY(v);
          return (
            <g key={v}>
              <line
                x1={padding.left}
                y1={y}
                x2={chartWidth - padding.right}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.1}
                strokeDasharray="4,4"
              />
              <text
                x={padding.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-akari-muted text-[10px]"
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* Sentiment line */}
        <path
          d={sentimentPath}
          fill="none"
          stroke="#00E5A0"
          strokeWidth={2}
        />

        {/* CT Heat line */}
        <path
          d={ctHeatPath}
          fill="none"
          stroke="#FBBF24"
          strokeWidth={2}
          strokeDasharray="4,4"
        />

        {/* Data points */}
        {chartData.map((d, i) => (
          <g key={i}>
            {d.sentiment_score != null && (
              <circle
                cx={getX(i)}
                cy={getY(d.sentiment_score)}
                r={2}
                fill="#00E5A0"
              />
            )}
            {d.ct_heat_score != null && (
              <circle
                cx={getX(i)}
                cy={getY(d.ct_heat_score)}
                r={2}
                fill="#FBBF24"
              />
            )}
          </g>
        ))}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-akari-muted">
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-[#00E5A0]" />
          Sentiment
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-0.5 bg-[#FBBF24] border-dashed border-t-2" />
          CT Heat
        </span>
      </div>
    </div>
  );
}

function AvatarWithFallback({ url, name, size = 'md' }: { 
  url: string | null; name: string; size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const [imgError, setImgError] = React.useState(false);
  
  const sizeClasses = {
    sm: 'h-8 w-8 text-sm',
    md: 'h-10 w-10 text-base',
    lg: 'h-12 w-12 text-lg',
    xl: 'h-16 w-16 text-2xl',
  };

  const colors = [
    'from-purple-500/30 to-purple-600/30 text-purple-400',
    'from-blue-500/30 to-blue-600/30 text-blue-400',
    'from-green-500/30 to-green-600/30 text-green-400',
    'from-yellow-500/30 to-yellow-600/30 text-yellow-400',
    'from-pink-500/30 to-pink-600/30 text-pink-400',
    'from-cyan-500/30 to-cyan-600/30 text-cyan-400',
  ];
  const colorIndex = name.charCodeAt(0) % colors.length;
  const colorClass = colors[colorIndex];

  const showFallback = !url || imgError;

  return (
    <div className="relative flex-shrink-0">
      {!showFallback ? (
        <img
          src={url}
          alt={name}
          className={`${sizeClasses[size]} rounded-full object-cover bg-akari-cardSoft border border-akari-border`}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={`flex ${sizeClasses[size]} items-center justify-center rounded-full bg-gradient-to-br ${colorClass} font-semibold border border-akari-border/50`}>
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function DeepExplorerPage() {
  const router = useRouter();
  const { slug } = router.query;
  const { user, isLoggedIn, isLoading } = useAkariUser();
  
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [latestMetrics, setLatestMetrics] = useState<MetricsDaily | null>(null);
  const [innerCircle, setInnerCircle] = useState<InnerCircleSummary>({ count: 0, power: 0 });
  const [influencers, setInfluencers] = useState<ProjectInfluencer[]>([]);
  const [metrics90d, setMetrics90d] = useState<MetricsDaily[]>([]);
  const [tweets, setTweets] = useState<ProjectTweetData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Permission checks
  const hasAccess = canUseDeepExplorer(user);
  const hasInstitutionalPlusAccess = hasInstitutionalPlus(user);
  
  // Redirect if not logged in
  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.push('/portal/sentiment');
    }
  }, [isLoading, isLoggedIn, router]);
  
  // Load project data
  useEffect(() => {
    if (!slug || typeof slug !== 'string' || !hasAccess) return;
    
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(`/api/portal/sentiment/${slug}`);
        const data: SentimentDetailResponse = await res.json();
        
        if (!data.ok) {
          setError(data.error || 'Project not found');
          return;
        }
        
        if (data.project) setProject(data.project);
        if (data.latestMetrics) setLatestMetrics(data.latestMetrics);
        if (data.innerCircle) setInnerCircle(data.innerCircle);
        if (data.influencers) setInfluencers(data.influencers);
        if (data.metricsHistoryLong) setMetrics90d(data.metricsHistoryLong);
        if (data.tweets) setTweets(data.tweets);
      } catch (err) {
        setError('Failed to connect to API');
        console.error('[DeepExplorer] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [slug, hasAccess]);
  
  const tier = getAkariTier(latestMetrics?.akari_score ?? null);
  const projectImageUrl = project?.twitter_profile_image_url || project?.avatar_url || null;
  
  return (
    <PortalLayout title={project?.name || 'Deep Explorer'}>
      {/* Back link */}
      <Link
        href={slug ? `/portal/sentiment/${slug}` : '/portal/sentiment'}
        className="mb-4 inline-flex items-center gap-1 text-xs text-akari-muted hover:text-akari-primary transition"
      >
        ← Back to Profile
      </Link>
      
      {/* Not logged in */}
      {!isLoading && !isLoggedIn && (
        <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-6 text-center">
          <p className="text-sm text-akari-muted mb-4">Log in to access Deep Explorer.</p>
          <Link href="/portal/sentiment" className="text-xs text-akari-primary hover:underline">
            Go to Sentiment →
          </Link>
        </div>
      )}
      
      {/* Locked state - no access */}
      {!isLoading && isLoggedIn && !hasAccess && (
        <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-akari-primary/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-akari-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-akari-text mb-2">Deep Explorer is locked</h2>
          <p className="text-sm text-akari-muted mb-6 max-w-md mx-auto">
            {hasInstitutionalPlusAccess
              ? 'Deep Explorer is available on your plan. Ask admin to activate it.'
              : 'Deep Explorer is part of Institutional Plus. Request an upgrade to unlock full analytics.'}
          </p>
          <Link
            href={slug ? `/portal/sentiment/${slug}` : '/portal/sentiment'}
            className="inline-flex items-center gap-2 px-6 py-2.5 min-h-[40px] rounded-xl bg-akari-cardSoft text-akari-text hover:bg-akari-card transition"
          >
            Back to profile
          </Link>
        </div>
      )}
      
      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
        </div>
      )}
      
      {/* Error state */}
      {error && !loading && hasAccess && (
        <div className="rounded-2xl border border-akari-danger/30 bg-akari-card p-6 text-center">
          <p className="text-sm text-akari-danger mb-4">{error}</p>
          <Link href="/portal/sentiment" className="text-xs text-akari-muted hover:text-akari-primary">
            Return to Overview
          </Link>
        </div>
      )}
      
      {/* Main content - unlocked state */}
      {!loading && !error && hasAccess && project && (
        <>
          {/* Page Title */}
          <section className="mb-6">
            <h1 className="text-3xl font-semibold text-akari-text mb-2">Deep Explorer</h1>
            <p className="text-sm text-akari-muted">
              {project.name} <span className="text-akari-muted/70">@{project.x_handle}</span>
            </p>
          </section>
          
          {/* Header Row */}
          <section className="mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-900/60 border border-slate-800 rounded-2xl">
              <div className="flex items-center gap-4">
                <AvatarWithFallback url={projectImageUrl} name={project.name} size="lg" />
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h2 className="text-xl font-semibold">{project.name}</h2>
                    <span className={`rounded-full ${tier.bgColor} px-3 py-1 text-xs uppercase tracking-wider ${tier.color}`}>
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
                  {latestMetrics?.akari_score != null && (
                    <div className="mt-2">
                      <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">AKARI Score</p>
                      <p className={`text-2xl font-bold ${tier.color}`}>{latestMetrics.akari_score}</p>
                    </div>
                  )}
                </div>
              </div>
              <Link
                href={`/portal/sentiment/${slug}`}
                className="px-4 py-2 min-h-[40px] rounded-lg bg-akari-cardSoft text-akari-text hover:bg-akari-card transition text-sm font-medium"
              >
                View Public Profile
              </Link>
            </div>
          </section>
          
          {/* Top Row Cards */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Overview Card */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-akari-text mb-3">Overview</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">AKARI Score</p>
                  <p className={`text-xl font-bold ${tier.color}`}>
                    {latestMetrics?.akari_score ?? '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">Sentiment</p>
                  <p className="text-xl font-bold text-akari-text">
                    {latestMetrics?.sentiment_score ?? '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">CT Heat</p>
                  <p className="text-xl font-bold text-akari-text">
                    {latestMetrics?.ct_heat_score ?? '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">Followers</p>
                  <p className="text-xl font-bold text-akari-text">
                    {formatNumber(latestMetrics?.followers ?? null)}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Inner Circle Summary Card */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-akari-text mb-3">Inner Circle Summary</h3>
              <div className="space-y-2">
                <div>
                  <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">Count</p>
                  <p className="text-xl font-bold text-akari-text">{innerCircle.count || '-'}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">Power</p>
                  <p className="text-xl font-bold text-akari-text">{formatNumber(innerCircle.power)}</p>
                </div>
                <p className="text-xs text-akari-muted mt-3">
                  Detailed inner circle analytics coming soon.
                </p>
              </div>
            </div>
          </section>
          
          {/* Real Data Sections */}
          <section className="space-y-4 mb-6">
            {/* Top Followers */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-akari-text mb-3">Top Followers</h3>
              {influencers.length === 0 ? (
                <p className="text-xs text-akari-muted">No follower data available yet.</p>
              ) : (
                <div className="space-y-2">
                  {[...influencers]
                    .sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0))
                    .slice(0, 10)
                    .map((inf) => {
                      const handle = inf.x_handle.replace(/^@/, '');
                      const infTier = getAkariTier(inf.akari_score);
                      return (
                        <div
                          key={inf.id}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-800/50 transition"
                        >
                          <AvatarWithFallback
                            url={inf.avatar_url}
                            name={inf.name || inf.x_handle}
                            size="sm"
                          />
                          <div className="flex-1 min-w-0">
                            <a
                              href={`https://x.com/${handle}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-akari-text hover:text-akari-primary transition truncate block"
                            >
                              @{handle}
                            </a>
                            <p className="text-xs text-akari-muted">
                              {formatNumber(inf.followers)} followers
                            </p>
                          </div>
                          {inf.akari_score != null && (
                            <span className={`text-xs px-2 py-1 rounded-full ${infTier.bgColor} ${infTier.color}`}>
                              {inf.akari_score}
                            </span>
                          )}
                          {inf.avg_sentiment_30d != null && (
                            <span className="text-xs text-akari-muted">
                              {inf.avg_sentiment_30d}
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
            
            {/* Inner Circle Reach */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-akari-text mb-3">Inner Circle Reach</h3>
              {influencers.length === 0 ? (
                <p className="text-xs text-akari-muted">Inner circle data is not available yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  {/* Desktop table */}
                  <table className="hidden md:table w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-akari-muted">
                        <th className="py-2 px-3 text-left">Profile</th>
                        <th className="py-2 px-3 text-right">Followers</th>
                        <th className="py-2 px-3 text-right">AKARI</th>
                        <th className="py-2 px-3 text-right">Sentiment</th>
                        <th className="py-2 px-3 text-right">Power</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...influencers]
                        .map(inf => ({ ...inf, power: computeInfluencerPower(inf) }))
                        .sort((a, b) => b.power - a.power)
                        .map((inf) => {
                          const handle = inf.x_handle.replace(/^@/, '');
                          const infTier = getAkariTier(inf.akari_score);
                          return (
                            <tr
                              key={inf.id}
                              className="border-b border-slate-800/50 hover:bg-slate-800/30 transition"
                            >
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  <AvatarWithFallback
                                    url={inf.avatar_url}
                                    name={inf.name || inf.x_handle}
                                    size="sm"
                                  />
                                  <a
                                    href={`https://x.com/${handle}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-akari-text hover:text-akari-primary transition"
                                  >
                                    @{handle}
                                  </a>
                                </div>
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-akari-text">
                                {formatNumber(inf.followers)}
                              </td>
                              <td className="py-3 px-3 text-right">
                                {inf.akari_score != null ? (
                                  <span className={`font-mono ${infTier.color}`}>
                                    {inf.akari_score}
                                  </span>
                                ) : (
                                  <span className="text-akari-muted">-</span>
                                )}
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-akari-text">
                                {inf.avg_sentiment_30d != null ? inf.avg_sentiment_30d : '-'}
                              </td>
                              <td className="py-3 px-3 text-right font-mono text-akari-primary">
                                {Math.round(inf.power)}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  
                  {/* Mobile stacked rows */}
                  <div className="md:hidden space-y-3">
                    {[...influencers]
                      .map(inf => ({ ...inf, power: computeInfluencerPower(inf) }))
                      .sort((a, b) => b.power - a.power)
                      .map((inf) => {
                        const handle = inf.x_handle.replace(/^@/, '');
                        const infTier = getAkariTier(inf.akari_score);
                        return (
                          <div
                            key={inf.id}
                            className="p-3 rounded-lg border border-slate-800 space-y-2"
                          >
                            <div className="flex items-center gap-2">
                              <AvatarWithFallback
                                url={inf.avatar_url}
                                name={inf.name || inf.x_handle}
                                size="sm"
                              />
                              <a
                                href={`https://x.com/${handle}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-akari-text hover:text-akari-primary transition"
                              >
                                @{handle}
                              </a>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-akari-muted">Followers: </span>
                                <span className="font-mono text-akari-text">{formatNumber(inf.followers)}</span>
                              </div>
                              <div>
                                <span className="text-akari-muted">AKARI: </span>
                                {inf.akari_score != null ? (
                                  <span className={`font-mono ${infTier.color}`}>{inf.akari_score}</span>
                                ) : (
                                  <span className="text-akari-muted">-</span>
                                )}
                              </div>
                              <div>
                                <span className="text-akari-muted">Sentiment: </span>
                                <span className="font-mono text-akari-text">
                                  {inf.avg_sentiment_30d != null ? inf.avg_sentiment_30d : '-'}
                                </span>
                              </div>
                              <div>
                                <span className="text-akari-muted">Power: </span>
                                <span className="font-mono text-akari-primary">{Math.round(inf.power)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
            
            {/* Engagement Breakdown */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-akari-text mb-3">Engagement Breakdown (30 days)</h3>
              {(() => {
                const breakdown = calculateEngagementBreakdown(tweets);
                if (breakdown.tweetCount === 0) {
                  return (
                    <p className="text-xs text-akari-muted">
                      No engagement analytics available yet.
                    </p>
                  );
                }
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">Likes</p>
                        <p className="text-lg font-bold text-akari-text">{formatNumber(breakdown.totalLikes)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">Replies</p>
                        <p className="text-lg font-bold text-akari-text">{formatNumber(breakdown.totalReplies)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">Quotes</p>
                        <p className="text-lg font-bold text-akari-text">{formatNumber(breakdown.totalQuotes)}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">Retweets</p>
                        <p className="text-lg font-bold text-akari-text">{formatNumber(breakdown.totalRetweets)}</p>
                      </div>
                    </div>
                    <div className="pt-2 border-t border-slate-800">
                      <p className="text-xs text-akari-muted">
                        Based on {breakdown.tweetCount} tweet{breakdown.tweetCount !== 1 ? 's' : ''} from the last 30 days
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
            
            {/* Long Term Sentiment */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-akari-text mb-1">Long Term Sentiment (90 days)</h3>
                <p className="text-xs text-akari-muted">
                  Shows how sentiment has evolved over the last 90 days.
                </p>
              </div>
              <LongTermSentimentChart metrics={metrics90d} />
            </div>
            
            {/* Tweet Clusters */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-akari-text mb-3">Tweet Clusters</h3>
              {(() => {
                // Convert ProjectTweetData to ProjectTweet format for clustering
                const tweetsForClustering: ProjectTweet[] = tweets.map(t => ({
                  tweetId: t.tweetId,
                  createdAt: t.createdAt,
                  authorHandle: t.authorHandle,
                  authorName: t.authorName,
                  text: t.text,
                  likes: t.likes || 0,
                  replies: t.replies || 0,
                  retweets: t.retweets || 0,
                }));
                
                const clusters = buildTweetClusters(tweetsForClustering);
                
                if (clusters.length === 0) {
                  return (
                    <p className="text-xs text-akari-muted">
                      Not enough data to cluster tweets yet.
                    </p>
                  );
                }
                
                return (
                  <div className="space-y-4">
                    {clusters.map((cluster, idx) => (
                      <div key={idx} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-akari-text">
                            {cluster.label}
                          </h4>
                          <span className="text-xs text-akari-muted">
                            {formatNumber(cluster.totalEngagement)} total engagement
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {cluster.tweets.slice(0, 5).map((tweet) => {
                            const engagement = tweet.likes + tweet.replies + tweet.retweets;
                            const truncatedText = tweet.text.length > 100 
                              ? tweet.text.substring(0, 100) + '...' 
                              : tweet.text;
                            return (
                              <div
                                key={tweet.tweetId}
                                className="p-2 rounded-lg bg-slate-800/30 border border-slate-800/50 hover:bg-slate-800/50 transition"
                              >
                                <p className="text-xs text-akari-text mb-1 line-clamp-2">
                                  {truncatedText}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-akari-muted">
                                  <span>{formatNumber(tweet.likes)} likes</span>
                                  <span>·</span>
                                  <span>{formatNumber(tweet.replies)} replies</span>
                                  {tweet.retweets > 0 && (
                                    <>
                                      <span>·</span>
                                      <span>{formatNumber(tweet.retweets)} retweets</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            
            {/* Exports */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-akari-text mb-2">Exports</h3>
              <div className="flex flex-wrap gap-2 mb-2">
                <a
                  href={`/api/portal/deep/${slug}/summary-export`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 min-h-[40px] rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/30 text-sm font-medium transition"
                >
                  Project Summary CSV
                </a>
                <a
                  href={`/api/portal/deep/${slug}/inner-circle-export`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`px-4 py-2 min-h-[40px] rounded-lg text-sm font-medium transition ${
                    influencers.length > 0
                      ? 'bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/30'
                      : 'bg-akari-cardSoft/50 text-akari-muted cursor-not-allowed opacity-50'
                  }`}
                  onClick={(e) => {
                    if (influencers.length === 0) {
                      e.preventDefault();
                    }
                  }}
                >
                  Export inner circle CSV
                </a>
              </div>
              <p className="text-xs text-akari-muted">
                Exports are available for Deep Explorer accounts.
              </p>
            </div>
          </section>
        </>
      )}
    </PortalLayout>
  );
}

