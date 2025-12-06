import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '../../../components/portal/PortalLayout';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

type ChangeDirection = 'up' | 'down' | 'flat';

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
  followers_delta?: number | null;
  akari_score: number | null;
}

interface MetricsChange24h {
  sentimentChange24h: number;
  ctHeatChange24h: number;
  akariChange24h: number;
  sentimentDirection24h: ChangeDirection;
  ctHeatDirection24h: ChangeDirection;
}

interface ProjectTweet {
  id: string;
  tweet_id: string;
  tweet_url: string | null;
  author_handle: string;
  author_name: string | null;
  author_profile_image_url: string | null;
  created_at: string;
  text: string | null;
  likes: number;
  replies: number;
  retweets: number;
  sentiment_score: number | null;
  engagement_score: number | null;
  is_kol: boolean;
  is_official: boolean;
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

interface InnerCircleSummary {
  count: number;
  power: number;
}

interface SentimentDetailResponse {
  ok: boolean;
  project?: ProjectDetail;
  metrics?: MetricsDaily[];
  latestMetrics?: MetricsDaily | null;
  previousMetrics?: MetricsDaily | null;
  changes24h?: MetricsChange24h;
  tweets?: ProjectTweet[];
  influencers?: Influencer[];
  innerCircle?: InnerCircleSummary;
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

function getScoreColor(score: number | null): string {
  if (score === null) return 'text-akari-muted';
  if (score >= 70) return 'text-akari-primary';
  if (score >= 40) return 'text-akari-profit';
  return 'text-akari-danger';
}

function getChangeColor(change: number): string {
  if (change > 0) return 'text-akari-primary';
  if (change < 0) return 'text-akari-danger';
  return 'text-akari-muted';
}

function formatChange(change: number, direction: ChangeDirection): string {
  if (direction === 'flat') return '–';
  const arrow = direction === 'up' ? '▲' : '▼';
  const sign = direction === 'up' ? '+' : '';
  return `${arrow} ${sign}${change}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

function ChangeIndicatorCard({ change, direction, label = '24h' }: { 
  change: number; direction: ChangeDirection; label?: string;
}) {
  return (
    <div className={`text-xs ${getChangeColor(change)} mt-1`}>
      <span className="text-akari-muted mr-1">{label}:</span>
      <span className="font-medium">{formatChange(change, direction)}</span>
    </div>
  );
}

function DeltaCell({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) return <span className="text-akari-muted">–</span>;
  const delta = current - previous;
  if (delta === 0) return <span className="text-akari-muted">–</span>;
  const colorClass = delta > 0 ? 'text-akari-primary' : 'text-akari-danger';
  const sign = delta > 0 ? '+' : '';
  const arrow = delta > 0 ? '▲' : '▼';
  return <span className={`${colorClass} text-xs`}>{arrow} {sign}{delta}</span>;
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

  // Generate a consistent color based on the name
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
// TRADING CHART COMPONENT
// =============================================================================

type ChartMetric = 'sentiment' | 'ctHeat' | 'followersDelta';
type ChartType = 'line' | 'bar';

interface TradingChartProps {
  metrics: MetricsDaily[];
  tweets: ProjectTweet[];
  projectHandle: string;
  projectImageUrl: string | null;
}

function TradingChart({ metrics, tweets, projectHandle, projectImageUrl }: TradingChartProps) {
  const [chartType, setChartType] = useState<ChartType>('line');
  const [metric, setMetric] = useState<ChartMetric>('sentiment');
  const [hoveredTweet, setHoveredTweet] = useState<ProjectTweet | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Prepare chart data (reverse for oldest-first)
  const chartData = useMemo(() => {
    return [...metrics].reverse().map(m => ({
      date: m.date,
      value: metric === 'sentiment' ? m.sentiment_score :
             metric === 'ctHeat' ? m.ct_heat_score :
             m.followers_delta ?? 0,
    }));
  }, [metrics, metric]);

  // Map tweets to dates for markers
  const tweetsByDate = useMemo(() => {
    const map = new Map<string, ProjectTweet[]>();
    tweets.forEach(t => {
      const date = t.created_at.split('T')[0];
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(t);
    });
    return map;
  }, [tweets]);

  // Chart dimensions
  const chartWidth = 600;
  const chartHeight = 200;
  const padding = { top: 40, right: 20, bottom: 30, left: 50 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;

  // Calculate scales
  const values = chartData.map(d => d.value ?? 0);
  const minVal = Math.min(...values, 0);
  const maxVal = Math.max(...values, 100);
  const range = maxVal - minVal || 1;

  const getX = (i: number) => padding.left + (i / (chartData.length - 1 || 1)) * innerWidth;
  const getY = (val: number) => padding.top + innerHeight - ((val - minVal) / range) * innerHeight;

  // Build path for line chart
  const linePath = chartData
    .filter(d => d.value !== null)
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(chartData.indexOf(d))} ${getY(d.value ?? 0)}`)
    .join(' ');

  const metricLabels = {
    sentiment: 'Sentiment',
    ctHeat: 'CT Heat',
    followersDelta: 'Followers Δ',
  };

  const metricColors = {
    sentiment: '#00E5A0',
    ctHeat: '#FBBF24',
    followersDelta: '#60A5FA',
  };

  return (
    <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
      {/* Chart Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          {(['sentiment', 'ctHeat', 'followersDelta'] as ChartMetric[]).map(m => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-3 py-1 text-xs rounded-lg transition ${
                metric === m 
                  ? 'bg-akari-primary/20 text-akari-primary border border-akari-primary/30' 
                  : 'bg-akari-cardSoft text-akari-muted border border-akari-border/30 hover:text-akari-text'
              }`}
            >
              {metricLabels[m]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-akari-cardSoft rounded-lg p-1">
          <button
            onClick={() => setChartType('line')}
            className={`px-2 py-1 text-xs rounded transition ${
              chartType === 'line' ? 'bg-akari-card text-akari-text' : 'text-akari-muted'
            }`}
          >
            Line
          </button>
          <button
            onClick={() => setChartType('bar')}
            className={`px-2 py-1 text-xs rounded transition ${
              chartType === 'bar' ? 'bg-akari-card text-akari-text' : 'text-akari-muted'
            }`}
          >
            Bar
          </button>
        </div>
      </div>

      {/* Chart SVG */}
      <div className="relative overflow-x-auto">
        <svg 
          viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
          className="w-full h-48 md:h-56"
          style={{ minWidth: '400px' }}
        >
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map(v => {
            const y = getY(v);
            if (y < padding.top || y > chartHeight - padding.bottom) return null;
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

          {/* Chart content */}
          {chartType === 'line' ? (
            <>
              {/* Gradient fill */}
              <defs>
                <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={metricColors[metric]} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={metricColors[metric]} stopOpacity={0} />
                </linearGradient>
              </defs>
              
              {/* Area fill */}
              <path
                d={`${linePath} L ${getX(chartData.length - 1)} ${chartHeight - padding.bottom} L ${padding.left} ${chartHeight - padding.bottom} Z`}
                fill={`url(#gradient-${metric})`}
              />
              
              {/* Line */}
              <path
                d={linePath}
                fill="none"
                stroke={metricColors[metric]}
                strokeWidth={2}
              />
              
              {/* Data points */}
              {chartData.map((d, i) => d.value !== null && (
                <circle
                  key={i}
                  cx={getX(i)}
                  cy={getY(d.value)}
                  r={3}
                  fill={metricColors[metric]}
                />
              ))}
            </>
          ) : (
            /* Bar chart */
            chartData.map((d, i) => {
              const barWidth = Math.max(4, innerWidth / chartData.length - 2);
              const val = d.value ?? 0;
              const height = Math.abs(val - minVal) / range * innerHeight;
              return (
                <rect
                  key={i}
                  x={getX(i) - barWidth / 2}
                  y={getY(val)}
                  width={barWidth}
                  height={height}
                  fill={metricColors[metric]}
                  fillOpacity={0.7}
                  rx={2}
                />
              );
            })
          )}

          {/* Tweet markers */}
          {chartData.map((d, i) => {
            const dateTweets = tweetsByDate.get(d.date) || [];
            if (dateTweets.length === 0) return null;
            
            const kolTweet = dateTweets.find(t => t.is_kol);
            const officialTweet = dateTweets.find(t => t.is_official);
            const displayTweet = kolTweet || officialTweet || dateTweets[0];
            const isKol = displayTweet.is_kol;
            const imageUrl = displayTweet.author_profile_image_url || projectImageUrl;
            
            return (
              <g 
                key={`marker-${i}`}
                className="cursor-pointer"
                onMouseEnter={(e) => {
                  setHoveredTweet(displayTweet);
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltipPos({ x: rect.x, y: rect.y });
                }}
                onMouseLeave={() => setHoveredTweet(null)}
                onClick={() => {
                  if (displayTweet.tweet_url) {
                    window.open(displayTweet.tweet_url, '_blank');
                  }
                }}
              >
                <circle
                  cx={getX(i)}
                  cy={padding.top - 15}
                  r={isKol ? 12 : 10}
                  fill="url(#avatarGradient)"
                  stroke={isKol ? '#FBBF24' : '#00E5A0'}
                  strokeWidth={isKol ? 2 : 1}
                />
                {imageUrl && (
                  <>
                    <defs>
                      <clipPath id={`clip-${i}`}>
                        <circle cx={getX(i)} cy={padding.top - 15} r={isKol ? 10 : 8} />
                      </clipPath>
                    </defs>
                    <image
                      href={imageUrl}
                      x={getX(i) - (isKol ? 10 : 8)}
                      y={padding.top - 15 - (isKol ? 10 : 8)}
                      width={isKol ? 20 : 16}
                      height={isKol ? 20 : 16}
                      clipPath={`url(#clip-${i})`}
                    />
                  </>
                )}
              </g>
            );
          })}
        </svg>

      </div>

      {/* Tooltip - positioned ABOVE the chart, not below */}
      {hoveredTweet && (
        <div 
          className="mt-3 rounded-xl bg-akari-cardSoft border border-akari-border p-3 shadow-lg"
        >
          <div className="flex items-center gap-3">
            <AvatarWithFallback 
              url={hoveredTweet.author_profile_image_url} 
              name={hoveredTweet.author_name || hoveredTweet.author_handle}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-medium text-akari-text truncate">
                  {hoveredTweet.author_name || hoveredTweet.author_handle}
                </p>
                <p className="text-xs text-akari-muted">@{hoveredTweet.author_handle}</p>
                {hoveredTweet.is_kol && (
                  <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded flex-shrink-0">KOL</span>
                )}
              </div>
              <p className="text-xs text-akari-text line-clamp-2">
                {hoveredTweet.text || 'No text available'}
              </p>
              <div className="flex items-center gap-4 mt-2 text-[10px] text-akari-muted">
                <span>❤️ {hoveredTweet.likes}</span>
                <span>🔁 {hoveredTweet.retweets}</span>
                <span>💬 {hoveredTweet.replies}</span>
                <a 
                  href={hoveredTweet.tweet_url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-akari-primary hover:underline ml-auto"
                >
                  View on X →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-akari-muted">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full border-2 border-yellow-400 bg-akari-cardSoft" />
          KOL Tweet
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full border border-akari-primary bg-akari-cardSoft" />
          Tweet Marker
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

// Competitor type
interface Competitor {
  id: string;
  slug: string;
  name: string;
  x_handle: string;
  avatar_url: string | null;
  akari_score: number | null;
  inner_circle_count: number;
  similarity_score: number;
  common_inner_circle_count: number;
}

export default function SentimentDetail() {
  const router = useRouter();
  const { slug } = router.query;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [metrics, setMetrics] = useState<MetricsDaily[]>([]);
  const [tweets, setTweets] = useState<ProjectTweet[]>([]);
  const [changes24h, setChanges24h] = useState<MetricsChange24h | null>(null);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [innerCircle, setInnerCircle] = useState<InnerCircleSummary>({ count: 0, power: 0 });
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
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
        if (data.tweets) setTweets(data.tweets);
        if (data.changes24h) setChanges24h(data.changes24h);
        if (data.influencers) setInfluencers(data.influencers);
        if (data.innerCircle) setInnerCircle(data.innerCircle);
      } catch (err) {
        setError('Failed to connect to API');
        console.error('[SentimentDetail] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [slug]);

  // Fetch competitors separately
  useEffect(() => {
    if (!slug) return;

    async function fetchCompetitors() {
      try {
        const res = await fetch(`/api/portal/sentiment/${slug}/competitors`);
        const data = await res.json();
        if (data.ok && data.competitors) {
          setCompetitors(data.competitors);
        }
      } catch (err) {
        console.error('[SentimentDetail] Competitors fetch error:', err);
      }
    }

    fetchCompetitors();
  }, [slug]);

  const latestMetrics = metrics.length > 0 ? metrics[0] : null;
  const tier = getAkariTier(latestMetrics?.akari_score ?? null);
  const projectImageUrl = project?.twitter_profile_image_url || project?.avatar_url || null;

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
          <Link href="/portal/sentiment" className="text-xs text-akari-muted hover:text-akari-primary">
            Return to Overview
          </Link>
        </div>
      )}

      {/* Main content */}
      {!loading && !error && project && (
        <>
          {/* Project Header */}
          <section className="mb-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <AvatarWithFallback url={projectImageUrl} name={project.name} size="xl" />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-2xl font-semibold">{project.name}</h1>
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
                {project.bio && (
                  <p className="mt-2 text-sm text-akari-muted max-w-xl">{project.bio}</p>
                )}
              </div>
              {latestMetrics?.akari_score != null && (
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">AKARI Score</p>
                  <p className={`text-4xl font-bold ${tier.color}`}>{latestMetrics.akari_score}</p>
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
            <section className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">Sentiment</p>
                <p className={`text-2xl font-bold ${getScoreColor(latestMetrics.sentiment_score)}`}>
                  {latestMetrics.sentiment_score ?? '-'}
                </p>
                {changes24h && (
                  <ChangeIndicatorCard change={changes24h.sentimentChange24h} direction={changes24h.sentimentDirection24h} />
                )}
              </div>
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">CT Heat</p>
                <p className={`text-2xl font-bold ${getScoreColor(latestMetrics.ct_heat_score)}`}>
                  {latestMetrics.ct_heat_score ?? '-'}
                </p>
                {changes24h && (
                  <ChangeIndicatorCard change={changes24h.ctHeatChange24h} direction={changes24h.ctHeatDirection24h} />
                )}
              </div>
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">Followers</p>
                <p className="text-2xl font-bold text-akari-text">{formatNumber(latestMetrics.followers)}</p>
              </div>
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">Inner Circle</p>
                <p className="text-2xl font-bold text-akari-text">{innerCircle.count}</p>
                <p className="text-xs text-akari-muted mt-1">Power: {formatNumber(innerCircle.power)}</p>
              </div>
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">Tweets Today</p>
                <p className="text-2xl font-bold text-akari-text">{latestMetrics.tweet_count ?? '-'}</p>
              </div>
            </section>
          )}

          {/* Trading Chart - Always show, even with 1 data point */}
          <section className="mb-6">
            <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">
              Signal Chart (30d)
            </h2>
            {metrics.length > 0 ? (
              <TradingChart 
                metrics={metrics} 
                tweets={tweets} 
                projectHandle={project.x_handle}
                projectImageUrl={projectImageUrl}
              />
            ) : (
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-8 text-center">
                <p className="text-sm text-akari-muted">No metrics data available yet. Check back tomorrow!</p>
              </div>
            )}
          </section>

          {/* Metrics History Table */}
          {metrics.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">Metrics History</h2>
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
                          <tr key={m.date} className={`border-b border-akari-border/30 ${i === 0 ? 'bg-akari-primary/5' : ''}`}>
                            <td className="py-3 px-4 text-akari-muted">{new Date(m.date).toLocaleDateString()}</td>
                            <td className="py-3 px-4 text-center font-mono">{m.akari_score ?? '-'}</td>
                            <td className={`py-3 px-4 text-center font-mono ${getScoreColor(m.sentiment_score)}`}>
                              {m.sentiment_score ?? '-'}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <DeltaCell current={m.sentiment_score} previous={prevMetrics?.sentiment_score ?? null} />
                            </td>
                            <td className={`py-3 px-4 text-center font-mono ${getScoreColor(m.ct_heat_score)}`}>
                              {m.ct_heat_score ?? '-'}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <DeltaCell current={m.ct_heat_score} previous={prevMetrics?.ct_heat_score ?? null} />
                            </td>
                            <td className="py-3 px-4 text-center font-mono text-akari-muted">{m.tweet_count ?? '-'}</td>
                            <td className="py-3 px-4 text-center font-mono text-akari-muted">{formatNumber(m.followers)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* Top Influencers / Inner Circle */}
          {influencers.length > 0 && (
            <section className="mb-6">
              <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">Inner Circle</h2>
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
                        <AvatarWithFallback url={inf.avatar_url} name={inf.name || inf.x_handle} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-akari-text truncate">{inf.name || inf.x_handle}</p>
                          <p className="text-xs text-akari-muted">@{inf.x_handle}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                        <div>
                          <p className="text-akari-muted mb-0.5">AKARI</p>
                          <p className={`font-mono font-medium ${infTier.color}`}>{inf.akari_score ?? '-'}</p>
                        </div>
                        <div>
                          <p className="text-akari-muted mb-0.5">Credibility</p>
                          <p className="font-mono font-medium">{inf.credibility_score ?? '-'}</p>
                        </div>
                        <div>
                          <p className="text-akari-muted mb-0.5">Followers</p>
                          <p className="font-mono font-medium">{formatNumber(inf.followers)}</p>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          {/* Similar Projects / Competitors */}
          {competitors.length > 0 && (
            <section className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm uppercase tracking-wider text-akari-muted">Similar Projects</h2>
                <Link
                  href={`/portal/sentiment/compare?projectA=${slug}`}
                  className="text-xs text-akari-muted hover:text-akari-primary transition"
                >
                  Compare All →
                </Link>
              </div>
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-akari-border bg-akari-cardSoft text-xs uppercase tracking-wider text-akari-muted">
                        <th className="py-3 px-4 text-left">Project</th>
                        <th className="py-3 px-4 text-center">AKARI</th>
                        <th className="py-3 px-4 text-center">Similarity</th>
                        <th className="py-3 px-4 text-center">Common</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {competitors.slice(0, 5).map((comp) => {
                        const compTier = getAkariTier(comp.akari_score);
                        return (
                          <tr key={comp.id} className="border-b border-akari-border/30 hover:bg-akari-cardSoft/50 transition">
                            <td className="py-3 px-4">
                              <Link
                                href={`/portal/sentiment/${comp.slug}`}
                                className="flex items-center gap-3 group"
                              >
                                <AvatarWithFallback url={comp.avatar_url} name={comp.name} size="sm" />
                                <div>
                                  <p className="font-medium text-akari-text group-hover:text-akari-primary transition truncate">
                                    {comp.name}
                                  </p>
                                  <p className="text-xs text-akari-muted">@{comp.x_handle}</p>
                                </div>
                              </Link>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`font-mono font-medium ${compTier.color}`}>
                                {comp.akari_score ?? '-'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="font-mono text-akari-primary">
                                {Math.round(comp.similarity_score * 100)}%
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="font-mono text-akari-muted">
                                {comp.common_inner_circle_count}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Link
                                href={`/portal/sentiment/compare?projectA=${slug}&projectB=${comp.slug}`}
                                className="inline-flex items-center gap-1 text-xs text-akari-muted hover:text-akari-primary transition"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                Compare
                              </Link>
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

          {/* No competitors message */}
          {competitors.length === 0 && !loading && (
            <section className="mb-6">
              <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">Similar Projects</h2>
              <div className="rounded-2xl border border-akari-border/50 bg-akari-card p-6 text-center">
                <p className="text-sm text-akari-muted">
                  No similar projects found yet. Run the circles update to compute project similarities.
                </p>
                <Link
                  href="/portal/sentiment/compare"
                  className="inline-flex items-center gap-1 mt-3 text-xs text-akari-primary hover:underline"
                >
                  Manual Compare →
                </Link>
              </div>
            </section>
          )}
        </>
      )}
    </PortalLayout>
  );
}
