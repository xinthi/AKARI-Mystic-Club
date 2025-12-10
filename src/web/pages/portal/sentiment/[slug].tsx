import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '../../../components/portal/PortalLayout';
import { useAkariUser } from '../../../lib/akari-auth';
import { can, canUseDeepExplorer } from '../../../lib/permissions';
import { classifyFreshness, getFreshnessPillClasses } from '../../../lib/portal/data-freshness';
import { LockedFeatureOverlay } from '../../../components/portal/LockedFeatureOverlay';
import { UpgradeModal } from '../../../components/portal/UpgradeModal';

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
  last_updated_at: string | null;
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
// TWITTER ANALYTICS TYPES (NEW - APPENDED)
// =============================================================================

interface DailyEngagement {
  date: string;
  likes: number;
  retweets: number;
  replies: number;
  totalEngagement: number;
  tweetCount: number;
  engagementRate: number;
}

interface FollowerDataPoint {
  date: string;
  followers: number;
  change: number;
}

interface TweetBreakdown {
  tweetId: string;
  createdAt: string;
  authorHandle: string;
  text: string;
  likes: number;
  retweets: number;
  replies: number;
  engagement: number;
  sentimentScore: number | null;
  isOfficial: boolean;
  tweetUrl: string;
}

interface AnalyticsSummary {
  totalEngagements: number;
  avgEngagementRate: number;
  tweetsCount: number;
  followerChange: number;
  tweetVelocity: number;
  avgSentiment: number;
  topTweetEngagement: number;
  officialTweetsCount: number;
  mentionsCount: number;
}

interface AnalyticsData {
  window: '7d' | '30d';
  dailyEngagement: DailyEngagement[];
  followersOverTime: FollowerDataPoint[];
  tweetBreakdown: TweetBreakdown[];
  summary: AnalyticsSummary;
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

/**
 * Generate nice grid values for non-percentage metrics (like followers delta)
 */
function generateGridValues(min: number, max: number): number[] {
  const range = max - min;
  if (range === 0) return [0];
  
  // Find a nice step size
  const roughStep = range / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(roughStep) || 1)));
  const normalizedStep = roughStep / magnitude;
  
  let niceStep: number;
  if (normalizedStep <= 1) niceStep = magnitude;
  else if (normalizedStep <= 2) niceStep = 2 * magnitude;
  else if (normalizedStep <= 5) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;
  
  const values: number[] = [];
  const start = Math.floor(min / niceStep) * niceStep;
  for (let v = start; v <= max; v += niceStep) {
    values.push(Math.round(v));
  }
  
  // Ensure we have at least the min and max represented
  if (values.length === 0) {
    values.push(0);
  }
  
  return values.slice(0, 5); // Max 5 grid lines
}

function TradingChart({ metrics, tweets, projectHandle, projectImageUrl }: TradingChartProps) {
  const [chartType, setChartType] = useState<ChartType>('line');
  const [metric, setMetric] = useState<ChartMetric>('sentiment');
  const [hoveredTweet, setHoveredTweet] = useState<ProjectTweet | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [hoveredDataPoint, setHoveredDataPoint] = useState<{ index: number; value: number; date: string } | null>(null);

  // Prepare chart data (reverse for oldest-first)
  const chartData = useMemo(() => {
    const reversed = [...metrics].reverse();
    
    // Calculate followers delta (change from previous day)
    const followersDeltas: (number | null)[] = reversed.map((m, i) => {
      if (i === 0) return 0; // First day has no delta
      const prev = reversed[i - 1];
      if (m.followers === null || prev.followers === null) return null;
      return m.followers - prev.followers;
    });
    
    return reversed.map((m, i) => ({
      date: m.date,
      value: metric === 'sentiment' ? m.sentiment_score :
             metric === 'ctHeat' ? m.ct_heat_score :
             followersDeltas[i] ?? 0,
    }));
  }, [metrics, metric]);

  // Map tweets to dates for markers
  const tweetsByDate = useMemo(() => {
    const map = new Map<string, ProjectTweet[]>();
    tweets.forEach(t => {
      const date = t.createdAt.split('T')[0];
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(t);
    });
    return map;
  }, [tweets]);

  // Chart dimensions - responsive
  const chartWidth = 600;
  const chartHeight = 200;
  const padding = { top: 40, right: 20, bottom: 30, left: 40 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  
  // Calculate optimal bar width (max 30px, evenly spaced)
  const barGap = 4;
  const maxBarWidth = 30;
  const calculatedBarWidth = Math.min(maxBarWidth, (innerWidth / Math.max(chartData.length, 1)) - barGap);
  const barWidth = Math.max(8, calculatedBarWidth);

  // Calculate scales - dynamic for followers delta
  const values = chartData.map(d => d.value ?? 0);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  
  // For sentiment/ctHeat use 0-100, for followers delta use actual range
  const isPercentMetric = metric === 'sentiment' || metric === 'ctHeat';
  const minVal = isPercentMetric ? 0 : Math.min(dataMin, 0);
  const maxVal = isPercentMetric ? 100 : Math.max(dataMax, 0) * 1.1 || 100; // Add 10% padding
  const range = maxVal - minVal || 1;
  
  // Generate grid values based on metric type
  const gridValues = isPercentMetric 
    ? [0, 25, 50, 75, 100]
    : generateGridValues(minVal, maxVal);

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
      {/* Chart Controls - Mobile Optimized */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {(['sentiment', 'ctHeat', 'followersDelta'] as ChartMetric[]).map(m => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`px-2 sm:px-3 py-1 text-[10px] sm:text-xs rounded-lg transition ${
                metric === m 
                  ? 'bg-akari-primary/20 text-akari-primary border border-akari-primary/30' 
                  : 'bg-akari-cardSoft text-akari-muted border border-akari-border/30 hover:text-akari-text'
              }`}
            >
              {metricLabels[m]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 bg-akari-cardSoft rounded-lg p-0.5 sm:p-1">
          <button
            onClick={() => setChartType('line')}
            className={`px-2 py-1 text-[10px] sm:text-xs rounded transition ${
              chartType === 'line' ? 'bg-akari-card text-akari-text' : 'text-akari-muted'
            }`}
          >
            Line
          </button>
          <button
            onClick={() => setChartType('bar')}
            className={`px-2 py-1 text-[10px] sm:text-xs rounded transition ${
              chartType === 'bar' ? 'bg-akari-card text-akari-text' : 'text-akari-muted'
            }`}
          >
            Bar
          </button>
        </div>
      </div>

      {/* Chart SVG - Responsive */}
      <div className="relative w-full">
        <svg 
          viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
          className="w-full h-40 sm:h-48 md:h-56"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Global defs for marker avatars */}
          <defs>
            <radialGradient id="avatarGradient" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1a1a2e" />
              <stop offset="100%" stopColor="#0f0f1a" />
            </radialGradient>
          </defs>

          {/* Grid lines - dynamic based on metric */}
          {gridValues.map(v => {
            const y = getY(v);
            if (y < padding.top - 5 || y > chartHeight - padding.bottom + 5) return null;
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
                  {metric === 'followersDelta' && Math.abs(v) >= 1000 
                    ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K`
                    : v}
                </text>
              </g>
            );
          })}

          {/* Chart content */}
          {chartType === 'line' ? (
            <>
              {/* Gradient fill for line chart */}
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
              
              {/* Data points with hover */}
              {chartData.map((d, i) => d.value !== null && (
                <g key={i}>
                  {/* Visible point */}
                  <circle
                    cx={getX(i)}
                    cy={getY(d.value)}
                    r={hoveredDataPoint?.index === i ? 5 : 3}
                    fill={metricColors[metric]}
                    className="transition-all duration-150"
                  />
                  {/* Larger invisible hit area for easier hover */}
                  <circle
                    cx={getX(i)}
                    cy={getY(d.value)}
                    r={12}
                    fill="transparent"
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredDataPoint({ index: i, value: d.value!, date: d.date })}
                    onMouseLeave={() => setHoveredDataPoint(null)}
                  />
                </g>
              ))}
            </>
          ) : (
            /* Bar chart - properly spaced bars with hover */
            chartData.map((d, i) => {
              const val = d.value ?? 0;
              const barHeight = Math.max(2, Math.abs(val - minVal) / range * innerHeight);
              const barX = getX(i) - barWidth / 2;
              const barY = getY(val);
              const isHovered = hoveredDataPoint?.index === i;
              
              return (
                <g 
                  key={i}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredDataPoint({ index: i, value: val, date: d.date })}
                  onMouseLeave={() => setHoveredDataPoint(null)}
                >
                  {/* Bar with rounded top */}
                  <rect
                    x={barX}
                    y={barY}
                    width={barWidth}
                    height={barHeight}
                    fill={metricColors[metric]}
                    fillOpacity={isHovered ? 1 : 0.8}
                    rx={3}
                    ry={3}
                    className="transition-all duration-150"
                  />
                  {/* Subtle glow effect */}
                  <rect
                    x={barX}
                    y={barY}
                    width={barWidth}
                    height={barHeight}
                    fill={metricColors[metric]}
                    fillOpacity={isHovered ? 0.5 : 0.3}
                    rx={3}
                    ry={3}
                    filter="blur(2px)"
                    className="transition-all duration-150"
                  />
                </g>
              );
            })
          )}

          {/* Tweet markers - Green for project tweets, Yellow for mentions */}
          {chartData.map((d, i) => {
            const dateTweets = tweetsByDate.get(d.date) || [];
            if (dateTweets.length === 0) return null;
            
            // Separate: Official (project's own) vs Mentions (from others)
            const officialTweets = dateTweets.filter(t => t.isOfficial === true);
            const mentionTweets = dateTweets.filter(t => t.isOfficial !== true); // All non-official = mentions
            
            // Helper to get top engagement tweet from a list
            const getTopEngagement = (list: ProjectTweet[]): ProjectTweet | null => {
              if (list.length === 0) return null;
              return list.reduce((best, t) => {
                const score = (t.engagementScore ?? 0);
                const bestScore = (best.engagementScore ?? 0);
                return score > bestScore ? t : best;
              }, list[0]);
            };
            
            // Get top engagement from each category
            const topOfficial = getTopEngagement(officialTweets);
            const topMention = getTopEngagement(mentionTweets);
            
            // Build array of markers to render
            const markersToRender: Array<{ tweet: ProjectTweet; isMention: boolean; offset: number }> = [];
            
            // Show both official and mention if both exist on same day
            if (topOfficial && topMention) {
              markersToRender.push({ tweet: topOfficial, isMention: false, offset: -10 }); // Green on top
              markersToRender.push({ tweet: topMention, isMention: true, offset: 10 }); // Yellow below
            } else if (topMention) {
              // Only mention exists - show yellow
              markersToRender.push({ tweet: topMention, isMention: true, offset: 0 });
            } else if (topOfficial) {
              // Only official exists - show green
              markersToRender.push({ tweet: topOfficial, isMention: false, offset: 0 });
            }
            
            if (markersToRender.length === 0) return null;
            
            return (
              <g key={`markers-${i}`}>
                {markersToRender.map((marker, mIdx) => {
                  const { tweet: displayTweet, isMention, offset } = marker;
                  
                  // SIMPLE LOGIC:
                  // Green (#00E5A0) = Project's own tweets (is_official = true)
                  // Yellow (#FBBF24) = Mentions from others (is_official = false)
                  const strokeColor = isMention ? '#FBBF24' : '#00E5A0';
                  const strokeWidth = 3; // Thicker stroke for visibility
                  const radius = 12;
                  const innerRadius = 9;
                  const imageUrl = displayTweet.authorProfileImageUrl || (!isMention ? projectImageUrl : null);
                  
                  const isHovered = hoveredTweet?.tweetId === displayTweet.tweetId;
                  const markerY = padding.top - 15 + offset;
                  
                  return (
                    <g 
                      key={`marker-${i}-${mIdx}`}
                      className="cursor-pointer"
                      style={{ pointerEvents: 'all' }}
                      onMouseEnter={(e) => {
                        setHoveredTweet(displayTweet);
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltipPos({ x: rect.x, y: rect.y });
                      }}
                      onMouseLeave={() => setHoveredTweet(null)}
                      onClick={() => {
                        if (displayTweet.tweetUrl) {
                          window.open(displayTweet.tweetUrl, '_blank');
                        }
                      }}
                    >
                      {/* Invisible larger hit area for easier hovering */}
                      <circle
                        cx={getX(i)}
                        cy={markerY}
                        r={16}
                        fill="transparent"
                        style={{ pointerEvents: 'all' }}
                      />
                      {/* Hover glow effect */}
                      {isHovered && (
                        <circle
                          cx={getX(i)}
                          cy={markerY}
                          r={radius + 4}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={2}
                          strokeOpacity={0.5}
                          className="animate-pulse"
                        />
                      )}
                      {/* Main marker circle */}
                      <circle
                        cx={getX(i)}
                        cy={markerY}
                        r={isHovered ? radius + 2 : radius}
                        fill="url(#avatarGradient)"
                        stroke={strokeColor}
                        strokeWidth={isHovered ? strokeWidth + 1 : strokeWidth}
                        className="transition-all duration-150"
                      />
                      {imageUrl && (
                        <>
                          <defs>
                            <clipPath id={`clip-${i}-${mIdx}`}>
                              <circle cx={getX(i)} cy={markerY} r={innerRadius} />
                            </clipPath>
                          </defs>
                          <image
                            href={imageUrl}
                            x={getX(i) - innerRadius}
                            y={markerY - innerRadius}
                            width={innerRadius * 2}
                            height={innerRadius * 2}
                            clipPath={`url(#clip-${i}-${mIdx})`}
                            style={{ pointerEvents: 'none' }}
                          />
                        </>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

      </div>

      {/* Data point tooltip */}
      {hoveredDataPoint && (
        <div className="flex items-center justify-center gap-4 py-2 px-4 mt-2 bg-akari-cardSoft/80 rounded-lg border border-akari-border/50 text-sm">
          <span className="text-akari-muted">
            {new Date(hoveredDataPoint.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <span className="font-medium" style={{ color: metricColors[metric] }}>
            {metricLabels[metric]}: {metric === 'followersDelta' && hoveredDataPoint.value > 0 ? '+' : ''}
            {metric === 'followersDelta' && Math.abs(hoveredDataPoint.value) >= 1000
              ? `${(hoveredDataPoint.value / 1000).toFixed(1)}K`
              : hoveredDataPoint.value}
          </span>
        </div>
      )}

      {/* Tooltip - shows when hovering over tweet marker */}
      {hoveredTweet && (
        <div 
          className="mt-3 rounded-xl bg-akari-card border-2 border-akari-primary/50 p-4 shadow-xl shadow-akari-primary/10 animate-in fade-in duration-150"
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] uppercase tracking-wider text-akari-muted">
              {hoveredTweet.isOfficial ? '🟢 Project Tweet' : '🟡 Mention'}
            </span>
            {hoveredTweet.isKOL && !hoveredTweet.isOfficial && (
              <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full">KOL</span>
            )}
            {hoveredTweet.isOfficial && (
              <span className="text-[10px] bg-akari-primary/20 text-akari-primary px-2 py-0.5 rounded-full">Official</span>
            )}
          </div>
          <div className="flex items-start gap-3">
            <AvatarWithFallback 
              url={hoveredTweet.authorProfileImageUrl} 
              name={hoveredTweet.authorName || hoveredTweet.authorHandle}
              size="md"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-akari-text truncate">
                  {hoveredTweet.authorName || hoveredTweet.authorHandle}
                </p>
                <p className="text-xs text-akari-muted">@{hoveredTweet.authorHandle}</p>
              </div>
              <p className="text-sm text-akari-text line-clamp-3">
                {hoveredTweet.text || 'No text available'}
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-akari-muted">
                <span className="flex items-center gap-1">❤️ <span className="text-akari-text">{hoveredTweet.likes}</span></span>
                <span className="flex items-center gap-1">🔁 <span className="text-akari-text">{hoveredTweet.retweets}</span></span>
                <span className="flex items-center gap-1">💬 <span className="text-akari-text">{hoveredTweet.replies}</span></span>
                <span className="text-akari-muted/70">
                  {new Date(hoveredTweet.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
              <a 
                href={hoveredTweet.tweetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-3 text-sm text-akari-primary hover:underline font-medium"
              >
                View on X →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-akari-muted">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: '#00E5A0' }} />
          Project Tweet
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: '#FBBF24' }} />
          Mention
        </span>
      </div>

      {/* Empty state when no tweets */}
      {tweets.length === 0 && !hoveredTweet && (
        <div className="mt-4 rounded-xl bg-akari-cardSoft/50 border border-akari-border/30 p-4 text-center">
          <p className="text-sm text-akari-muted">No recent tweets found</p>
          <p className="text-xs text-akari-muted/70 mt-1">Run sentiment update to fetch real tweets from X</p>
        </div>
      )}

      {/* Most Recent Tweet - always visible if tweets exist */}
      {tweets.length > 0 && !hoveredTweet && (
        (() => {
          // Get the most recent tweet
          const mostRecent = tweets.reduce((latest, t) => 
            !latest || new Date(t.createdAt) > new Date(latest.createdAt) ? t : latest
          , tweets[0]);
          
          return (
            <div className="mt-4 rounded-xl bg-akari-cardSoft border border-akari-border p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-akari-muted uppercase tracking-wider">Recent Mention</span>
                {mostRecent.isKOL && (
                  <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">KOL</span>
                )}
                {mostRecent.isOfficial && (
                  <span className="text-[10px] bg-akari-primary/20 text-akari-primary px-1.5 py-0.5 rounded">Official</span>
                )}
              </div>
              <div className="flex items-start gap-3">
                <AvatarWithFallback 
                  url={mostRecent.authorProfileImageUrl} 
                  name={mostRecent.authorName || mostRecent.authorHandle}
                  size="md"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-akari-text truncate">
                      {mostRecent.authorName || mostRecent.authorHandle}
                    </p>
                    <p className="text-xs text-akari-muted">@{mostRecent.authorHandle}</p>
                  </div>
                  <p className="text-xs text-akari-text line-clamp-2">
                    {mostRecent.text || 'No text available'}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-akari-muted">
                    <span>❤️ {mostRecent.likes}</span>
                    <span>🔁 {mostRecent.retweets}</span>
                    <span>💬 {mostRecent.replies}</span>
                    <span className="text-akari-muted">
                      {new Date(mostRecent.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <a 
                      href={mostRecent.tweetUrl}
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
          );
        })()
      )}
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

  // Get current user for permission checks
  const akariUser = useAkariUser();
  const { user } = akariUser;
  const isLoggedIn = user?.isLoggedIn ?? false;
  
  // Permission checks - Similar Projects and Twitter Analytics require analyst+
  const canViewCompare = can(user, 'sentiment.compare');
  const canViewAnalytics = can(user, 'markets.analytics');
  const canViewDeepExplorer = canUseDeepExplorer(user);

  // Upgrade modal state
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [metrics, setMetrics] = useState<MetricsDaily[]>([]);
  const [tweets, setTweets] = useState<ProjectTweet[]>([]);
  const [changes24h, setChanges24h] = useState<MetricsChange24h | null>(null);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);
  const [innerCircle, setInnerCircle] = useState<InnerCircleSummary>({ count: 0, power: 0 });
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // NEW: Twitter Analytics state
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsWindow, setAnalyticsWindow] = useState<'7d' | '30d'>('7d');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Watchlist state
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [togglingStar, setTogglingStar] = useState(false);

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

  // NEW: Fetch Twitter Analytics
  useEffect(() => {
    if (!slug) return;

    async function fetchAnalytics() {
      setAnalyticsLoading(true);
      try {
        const res = await fetch(`/api/portal/sentiment/${slug}/analytics?window=${analyticsWindow}`);
        const data = await res.json();
        if (data.ok) {
          setAnalytics(data);
        }
      } catch (err) {
        console.error('[SentimentDetail] Analytics fetch error:', err);
      } finally {
        setAnalyticsLoading(false);
      }
    }

    fetchAnalytics();
  }, [slug, analyticsWindow]);

  // Check if project is in watchlist
  useEffect(() => {
    if (!slug || !isLoggedIn || !project) return;

    const projectId = project.id; // Capture project ID before async function

    async function checkWatchlist() {
      try {
        const res = await fetch('/api/portal/sentiment/watchlist');
        if (!res.ok) return;

        const data = await res.json();
        if (data.ok && Array.isArray(data.projects)) {
          const isWatched = data.projects.some((p: any) => p.projectId === projectId);
          setIsInWatchlist(isWatched);
        }
      } catch (err) {
        console.error('[SentimentDetail] Watchlist check error:', err);
      }
    }

    checkWatchlist();
  }, [slug, isLoggedIn, project]);

  // Toggle watchlist
  const handleToggleStar = useCallback(async () => {
    if (!isLoggedIn || !project || togglingStar) return;

    const projectId = project.id; // Capture project ID before async operation

    setTogglingStar(true);
    try {
      const res = await fetch('/api/portal/sentiment/watchlist/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId,
          action: isInWatchlist ? 'remove' : 'add',
        }),
      });

      const data = await res.json();
      if (data.ok) {
        setIsInWatchlist(!isInWatchlist);
      } else {
        alert(data.error || 'Failed to update watchlist');
      }
    } catch (err) {
      console.error('[SentimentDetail] Toggle star error:', err);
      alert('Failed to update watchlist');
    } finally {
      setTogglingStar(false);
    }
  }, [isLoggedIn, project, isInWatchlist, togglingStar]);

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
                {/* Data Freshness Indicator */}
                <div className="mt-2 flex items-center gap-2">
                  {(() => {
                    const freshness = classifyFreshness(project.last_updated_at);
                    return (
                      <div className="flex items-center gap-2 text-xs text-akari-muted">
                        <span>Last updated:</span>
                        <div className={`inline-flex items-center ${getFreshnessPillClasses(freshness)}`}>
                          {freshness.label}
                        </div>
                        <span className="text-akari-muted/70">({freshness.ageHuman})</span>
                      </div>
                    );
                  })()}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  {/* Watchlist star button */}
                  {isLoggedIn && (
                    <button
                      onClick={handleToggleStar}
                      disabled={togglingStar}
                      className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-lg bg-akari-cardSoft border border-akari-border/50 hover:border-akari-primary/50 transition text-sm font-medium disabled:opacity-50"
                      title={isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                    >
                      {isInWatchlist ? (
                        <svg className="w-4 h-4 fill-current text-akari-primary" viewBox="0 0 24 24">
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth={2}>
                          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                        </svg>
                      )}
                      {togglingStar ? 'Updating...' : isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                    </button>
                  )}
                  {/* Deep Explorer button - only show if user has access */}
                  {canViewDeepExplorer && (
                    <Link
                      href={`/portal/deep/${slug}`}
                      className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 transition text-sm font-medium border border-akari-primary/30"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      Open Deep Explorer
                    </Link>
                  )}
                </div>
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
                <p className="text-2xl font-bold text-akari-text">{innerCircle.count || '-'}</p>
                {innerCircle.power > 0 && (
                  <p className="text-xs text-akari-muted mt-1">Power: {formatNumber(innerCircle.power)}</p>
                )}
              </div>
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                <p className="text-xs uppercase tracking-wider text-akari-muted mb-1">Tweets Today</p>
                <p className="text-2xl font-bold text-akari-text">{latestMetrics.tweet_count || '-'}</p>
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

          {/* Similar Projects / Competitors - Requires Analyst+ */}
          <LockedFeatureOverlay
            featureName="Similar Projects"
            isLocked={!canViewCompare}
            requiredTier="analyst"
            onUpgradeClick={() => setUpgradeModalOpen(true)}
          >
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
          </LockedFeatureOverlay>

          {/* ================================================================= */}
          {/* NEW: TWITTER-STYLE ANALYTICS SECTION (APPENDED BELOW EXISTING)   */}
          {/* Requires Analyst+ to view                                        */}
          {/* ================================================================= */}
          <LockedFeatureOverlay
            featureName="Twitter Analytics"
            isLocked={!canViewAnalytics}
            requiredTier="analyst"
            onUpgradeClick={() => setUpgradeModalOpen(true)}
          >
            <section className="mt-8 pt-8 border-t border-akari-border/30">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
                <h2 className="text-lg font-semibold text-akari-text flex items-center gap-2">
                  <svg className="w-5 h-5 text-akari-primary" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  Twitter Analytics
                </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAnalyticsWindow('7d')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                    analyticsWindow === '7d'
                      ? 'bg-akari-primary text-akari-bg'
                      : 'bg-akari-cardSoft text-akari-muted hover:text-akari-text'
                  }`}
                >
                  7 Days
                </button>
                <button
                  onClick={() => setAnalyticsWindow('30d')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                    analyticsWindow === '30d'
                      ? 'bg-akari-primary text-akari-bg'
                      : 'bg-akari-cardSoft text-akari-muted hover:text-akari-text'
                  }`}
                >
                  30 Days
                </button>
                {canViewAnalytics && (
                  <button
                    onClick={async () => {
                      setExportLoading(true);
                      setExportError(null);
                      try {
                        const res = await fetch(`/api/portal/sentiment/${slug}/analytics-export?window=${analyticsWindow}`);
                        if (!res.ok) {
                          const data = await res.json();
                          throw new Error(data.error || 'Failed to export analytics');
                        }
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `akari-analytics-${slug}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch (err: any) {
                        setExportError(err.message || 'Failed to export analytics');
                        console.error('[Analytics Export] Error:', err);
                      } finally {
                        setExportLoading(false);
                      }
                    }}
                    disabled={exportLoading}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-akari-cardSoft text-akari-text hover:bg-akari-card border border-akari-border/50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {exportLoading ? (
                      <>
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                        Exporting…
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export CSV
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {exportError && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {exportError}
              </div>
            )}

            {analyticsLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
              </div>
            )}

            {!analyticsLoading && analytics && (
              <>
                {/* Summary Stats Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                  <div className="rounded-xl border border-akari-border/50 bg-akari-card p-4">
                    <p className="text-[10px] uppercase tracking-wider text-akari-muted mb-1">Total Engagements</p>
                    <p className="text-xl font-bold text-akari-text">
                      {analytics.summary.totalEngagements.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-akari-border/50 bg-akari-card p-4">
                    <p className="text-[10px] uppercase tracking-wider text-akari-muted mb-1">Avg Engagement</p>
                    <p className="text-xl font-bold text-akari-primary">
                      {analytics.summary.avgEngagementRate}
                    </p>
                  </div>
                  <div className="rounded-xl border border-akari-border/50 bg-akari-card p-4">
                    <p className="text-[10px] uppercase tracking-wider text-akari-muted mb-1">Tweets</p>
                    <p className="text-xl font-bold text-akari-text">
                      {analytics.summary.tweetsCount}
                    </p>
                    <p className="text-[10px] text-akari-muted">
                      {analytics.summary.officialTweetsCount} official · {analytics.summary.mentionsCount} mentions
                    </p>
                  </div>
                  <div className="rounded-xl border border-akari-border/50 bg-akari-card p-4">
                    <p className="text-[10px] uppercase tracking-wider text-akari-muted mb-1">Follower Δ</p>
                    <p className={`text-xl font-bold ${
                      analytics.summary.followerChange >= 0 ? 'text-akari-primary' : 'text-akari-danger'
                    }`}>
                      {analytics.summary.followerChange >= 0 ? '+' : ''}{analytics.summary.followerChange.toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-xl border border-akari-border/50 bg-akari-card p-4">
                    <p className="text-[10px] uppercase tracking-wider text-akari-muted mb-1">Tweet Velocity</p>
                    <p className="text-xl font-bold text-akari-accent">
                      {analytics.summary.tweetVelocity}/day
                    </p>
                  </div>
                </div>

                {/* Engagement Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                  {/* Engagement Volume Chart */}
                  <div className="rounded-xl border border-akari-border/50 bg-akari-card p-4">
                    <h3 className="text-sm font-medium text-akari-text mb-3">Engagement Volume</h3>
                    <div className="h-48">
                      {analytics.dailyEngagement.length > 0 ? (
                        <svg viewBox="0 0 400 150" className="w-full h-full">
                          <defs>
                            <linearGradient id="engagementGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#00E5A0" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#00E5A0" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          {(() => {
                            const data = analytics.dailyEngagement;
                            const maxVal = Math.max(...data.map(d => d.totalEngagement), 1);
                            const width = 400;
                            const height = 130;
                            const padding = { left: 40, right: 10, top: 10, bottom: 20 };
                            const innerWidth = width - padding.left - padding.right;
                            const innerHeight = height - padding.top - padding.bottom;
                            
                            const points = data.map((d, i) => {
                              const x = padding.left + (i / Math.max(data.length - 1, 1)) * innerWidth;
                              const y = padding.top + innerHeight - (d.totalEngagement / maxVal) * innerHeight;
                              return `${x},${y}`;
                            }).join(' ');
                            
                            const areaPoints = `${padding.left},${padding.top + innerHeight} ${points} ${padding.left + innerWidth},${padding.top + innerHeight}`;
                            
                            return (
                              <>
                                {/* Y-axis labels */}
                                <text x={padding.left - 5} y={padding.top + 5} textAnchor="end" className="fill-akari-muted text-[9px]">{maxVal}</text>
                                <text x={padding.left - 5} y={padding.top + innerHeight} textAnchor="end" className="fill-akari-muted text-[9px]">0</text>
                                
                                {/* Area fill */}
                                <polygon points={areaPoints} fill="url(#engagementGradient)" />
                                
                                {/* Line */}
                                <polyline
                                  points={points}
                                  fill="none"
                                  stroke="#00E5A0"
                                  strokeWidth={2}
                                />
                                
                                {/* Data points */}
                                {data.map((d, i) => {
                                  const x = padding.left + (i / Math.max(data.length - 1, 1)) * innerWidth;
                                  const y = padding.top + innerHeight - (d.totalEngagement / maxVal) * innerHeight;
                                  return <circle key={i} cx={x} cy={y} r={3} fill="#00E5A0" />;
                                })}
                              </>
                            );
                          })()}
                        </svg>
                      ) : (
                        <div className="flex items-center justify-center h-full text-sm text-akari-muted">
                          No engagement data available
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Engagement Rate Chart */}
                  <div className="rounded-xl border border-akari-border/50 bg-akari-card p-4">
                    <h3 className="text-sm font-medium text-akari-text mb-3">Engagement Rate</h3>
                    <div className="h-48">
                      {analytics.dailyEngagement.length > 0 ? (
                        <svg viewBox="0 0 400 150" className="w-full h-full">
                          <defs>
                            <linearGradient id="rateGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#FBBF24" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#FBBF24" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          {(() => {
                            const data = analytics.dailyEngagement;
                            const maxVal = Math.max(...data.map(d => d.engagementRate), 1);
                            const width = 400;
                            const height = 130;
                            const padding = { left: 40, right: 10, top: 10, bottom: 20 };
                            const innerWidth = width - padding.left - padding.right;
                            const innerHeight = height - padding.top - padding.bottom;
                            
                            const points = data.map((d, i) => {
                              const x = padding.left + (i / Math.max(data.length - 1, 1)) * innerWidth;
                              const y = padding.top + innerHeight - (d.engagementRate / maxVal) * innerHeight;
                              return `${x},${y}`;
                            }).join(' ');
                            
                            const areaPoints = `${padding.left},${padding.top + innerHeight} ${points} ${padding.left + innerWidth},${padding.top + innerHeight}`;
                            
                            return (
                              <>
                                <text x={padding.left - 5} y={padding.top + 5} textAnchor="end" className="fill-akari-muted text-[9px]">{maxVal.toFixed(1)}</text>
                                <text x={padding.left - 5} y={padding.top + innerHeight} textAnchor="end" className="fill-akari-muted text-[9px]">0</text>
                                <polygon points={areaPoints} fill="url(#rateGradient)" />
                                <polyline points={points} fill="none" stroke="#FBBF24" strokeWidth={2} />
                                {data.map((d, i) => {
                                  const x = padding.left + (i / Math.max(data.length - 1, 1)) * innerWidth;
                                  const y = padding.top + innerHeight - (d.engagementRate / maxVal) * innerHeight;
                                  return <circle key={i} cx={x} cy={y} r={3} fill="#FBBF24" />;
                                })}
                              </>
                            );
                          })()}
                        </svg>
                      ) : (
                        <div className="flex items-center justify-center h-full text-sm text-akari-muted">
                          No rate data available
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Top Tweets Table */}
                <div className="rounded-xl border border-akari-border/50 bg-akari-card overflow-hidden">
                  <div className="p-4 border-b border-akari-border/30">
                    <h3 className="text-sm font-medium text-akari-text">Top Performing Tweets</h3>
                    <p className="text-[10px] text-akari-muted mt-0.5">Sorted by engagement score</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-akari-border/30 bg-akari-cardSoft/50">
                          <th className="py-2 px-3 text-left text-akari-muted font-medium">Author</th>
                          <th className="py-2 px-3 text-left text-akari-muted font-medium">Tweet</th>
                          <th className="py-2 px-3 text-center text-akari-muted font-medium">❤️</th>
                          <th className="py-2 px-3 text-center text-akari-muted font-medium">🔁</th>
                          <th className="py-2 px-3 text-center text-akari-muted font-medium">💬</th>
                          <th className="py-2 px-3 text-center text-akari-muted font-medium">Score</th>
                          <th className="py-2 px-3 text-center text-akari-muted font-medium">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.tweetBreakdown.slice(0, 10).map((tweet, idx) => (
                          <tr 
                            key={tweet.tweetId} 
                            className="border-b border-akari-border/20 hover:bg-akari-cardSoft/30 transition"
                          >
                            <td className="py-2 px-3">
                              <a 
                                href={`https://x.com/${tweet.authorHandle}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-akari-primary hover:underline"
                              >
                                @{tweet.authorHandle}
                              </a>
                            </td>
                            <td className="py-2 px-3 max-w-[200px]">
                              <a 
                                href={tweet.tweetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-akari-text hover:text-akari-primary transition truncate block"
                              >
                                {tweet.text.slice(0, 60)}{tweet.text.length > 60 ? '...' : ''}
                              </a>
                            </td>
                            <td className="py-2 px-3 text-center font-mono text-akari-muted">{tweet.likes}</td>
                            <td className="py-2 px-3 text-center font-mono text-akari-muted">{tweet.retweets}</td>
                            <td className="py-2 px-3 text-center font-mono text-akari-muted">{tweet.replies}</td>
                            <td className="py-2 px-3 text-center">
                              <span className="font-mono font-medium text-akari-primary">{tweet.engagement}</span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                                tweet.isOfficial 
                                  ? 'bg-akari-primary/20 text-akari-primary' 
                                  : 'bg-yellow-500/20 text-yellow-400'
                              }`}>
                                {tweet.isOfficial ? 'Official' : 'Mention'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {analytics.tweetBreakdown.length === 0 && (
                      <div className="py-8 text-center text-sm text-akari-muted">
                        No tweets found in this period
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </section>
        </LockedFeatureOverlay>

        {/* Upgrade Modal */}
        <UpgradeModal
          isOpen={upgradeModalOpen}
          onClose={() => setUpgradeModalOpen(false)}
          user={user}
        />
        </>
      )}
    </PortalLayout>
  );
}
