import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { PortalLayout } from '../../../components/portal/PortalLayout';
import { useAkariUser } from '../../../lib/akari-auth';
import { can } from '../../../lib/permissions';
import { getUserTier } from '../../../lib/userTier';
import { classifyFreshness, formatTimestampForTooltip, getFreshnessPillClasses, type FreshnessInfo } from '../../../lib/portal/data-freshness';
import { UpgradeModal } from '../../../components/portal/UpgradeModal';
import { canSearchNewProfiles, allowedNewProfileTypes, type ProfileType } from '../../../lib/profile-permissions';

/**
 * Type definitions for sentiment data
 */
type ChangeDirection = 'up' | 'down' | 'flat';

interface ProjectWithMetrics {
  id: string;
  slug: string;
  name: string;
  x_handle: string;
  avatar_url: string | null;
  twitter_profile_image_url: string | null;
  sentiment_score: number | null;
  ct_heat_score: number | null;
  akari_score: number | null;
  followers: number | null;
  date: string | null;
  last_updated_at: string | null;
  sentimentChange24h: number;
  ctHeatChange24h: number;
  akariChange24h: number;
  followersChange24h: number;
  followersDirection24h: 'up' | 'down' | 'flat';
  sentimentDirection24h: ChangeDirection;
  ctHeatDirection24h: ChangeDirection;
  // New optional fields for mindshare and smart followers
  mindshare_bps_24h?: number | null;
  mindshare_bps_7d?: number | null;
  mindshare_bps_30d?: number | null;
  delta_bps_1d?: number | null;
  delta_bps_7d?: number | null;
  smart_followers_count?: number | null;
  smart_followers_pct?: number | null;
}

interface TopMover {
  slug: string;
  name: string;
  x_handle: string;
  avatar_url: string | null;
  twitter_profile_image_url: string | null;
  akari_score: number | null;
  akariChange24h: number;
  ctHeatChange24h: number;
  sentimentChange24h: number;
  sentimentDirection24h: ChangeDirection;
  ctHeatDirection24h: ChangeDirection;
}

interface TopEngagement {
  slug: string;
  name: string;
  x_handle: string;
  avatar_url: string | null;
  twitter_profile_image_url: string | null;
  ct_heat_score: number;
  sentiment_score: number | null;
  akari_score: number | null;
}

interface TrendingUp {
  slug: string;
  name: string;
  x_handle: string;
  avatar_url: string | null;
  twitter_profile_image_url: string | null;
  sentiment_score: number;
  sentimentChange24h: number;
  akari_score: number | null;
}

interface SentimentOverviewResponse {
  ok: boolean;
  projects?: ProjectWithMetrics[];
  topMovers?: TopMover[];
  topEngagement?: TopEngagement[];
  trendingUp?: TrendingUp[];
  error?: string;
}

interface SentimentHealthData {
  totalProjects: number;
  totalWithMetrics: number;
  totalNoData: number;
  freshCount: number;
  warmCount: number;
  staleCount: number;
  withInnerCircleCount: number;
  lastGlobalUpdatedAt: string | null;
}

interface SentimentHealthResponse {
  ok: boolean;
  data?: SentimentHealthData;
  error?: string;
}

interface TopicSummary {
  topic: string;
  projectsCount: number;
  totalWeightedScore: number;
  totalTweetCount: number;
  avgScore: number;
}

interface TopicsResponse {
  ok: boolean;
  topics?: TopicSummary[];
  error?: string;
}

interface SearchResultUser {
  id: string;
  username: string;
  name: string;
  profileImageUrl: string | null;
  bio: string | null;
  followersCount: number;
  followingCount: number;
  verified: boolean;
}

interface SearchResponse {
  ok: boolean;
  users?: SearchResultUser[];
  error?: string;
}

/**
 * Map AKARI score (0-1000) to tier name and color
 */
function getAkariTier(score: number | null): { name: string; color: string } {
  if (score === null) return { name: 'Unranked', color: 'text-akari-muted' };
  if (score >= 900) return { name: 'Celestial', color: 'text-purple-400' };
  if (score >= 750) return { name: 'Vanguard', color: 'text-akari-primary' };
  if (score >= 550) return { name: 'Ranger', color: 'text-blue-400' };
  if (score >= 400) return { name: 'Nomad', color: 'text-akari-accent' };
  return { name: 'Shadow', color: 'text-akari-muted' };
}

/**
 * Format number with K/M suffix
 */
function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '-';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

/**
 * Sort indicator icon for table headers
 */
function SortIcon({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  if (!active) {
    return (
      <svg className="w-3 h-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    );
  }
  return direction === 'desc' ? (
    <svg className="w-3 h-3 text-akari-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ) : (
    <svg className="w-3 h-3 text-akari-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
    </svg>
  );
}

/**
 * Get color class for sentiment score
 */
function getSentimentColor(score: number | null): string {
  if (score === null) return 'text-akari-muted';
  if (score >= 70) return 'text-akari-primary';
  if (score >= 40) return 'text-akari-profit';
  return 'text-akari-danger';
}

/**
 * Avatar with fallback wrapper
 */
function AvatarWithFallback({ url, name, size = 'md' }: { url: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const [imgError, setImgError] = React.useState(false);
  
  const sizeClasses = {
    sm: 'h-8 w-8 text-sm',
    md: 'h-10 w-10 text-base',
    lg: 'h-12 w-12 text-lg',
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

  const normalizedUrl = url ? url.replace('_normal', '_400x400') : null;
  const showFallback = !normalizedUrl || imgError;

  return (
    <div className="relative flex-shrink-0 transition-all duration-300 hover:drop-shadow-[0_0_12px_rgba(0,246,162,0.5)]">
      {!showFallback ? (
        <img
          src={normalizedUrl || undefined}
          alt={name}
          className={`${sizeClasses[size]} rounded-full object-cover bg-akari-cardSoft border border-akari-neon-teal/30 transition-all duration-300`}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className={`flex ${sizeClasses[size]} items-center justify-center rounded-full bg-gradient-to-br ${colorClass} font-semibold border border-akari-neon-teal/30 transition-all duration-300`}>
          {name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

/**
 * Change indicator component for 24h deltas
 */
function ChangeIndicator({ 
  change, 
  direction,
  compact = false,
  formatLargeNumbers = false
}: { 
  change: number; 
  direction: ChangeDirection;
  compact?: boolean;
  formatLargeNumbers?: boolean;
}) {
  if (direction === 'flat') {
    return (
      <span className="text-akari-muted text-xs">
        {compact ? '–' : '• 0'}
      </span>
    );
  }

  const isUp = direction === 'up';
  const colorClass = isUp ? 'text-akari-primary' : 'text-akari-danger';
  const arrow = isUp ? '▲' : '▼';
  const sign = isUp ? '+' : '';
  
  // Format large numbers (for followers) with K/M suffixes
  const displayValue = formatLargeNumbers 
    ? formatNumber(Math.abs(change))
    : Math.abs(change).toString();

  return (
    <span className={`${colorClass} text-xs font-medium`}>
      {arrow} {sign}{displayValue}
    </span>
  );
}

/**
 * Widget Card Component
 */
function WidgetCard({ 
  title, 
  icon, 
  children,
  gradient = 'from-akari-neon-teal/10 to-transparent'
}: { 
  title: string; 
  icon: string;
  children: React.ReactNode;
  gradient?: string;
}) {
  return (
    <div className={`card-neon bg-gradient-to-br ${gradient} p-4 sm:p-5`}>
      <h3 className="text-xs uppercase tracking-wider text-akari-muted mb-4 flex items-center gap-2 font-semibold">
        <span>{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * Top Movers Widget
 */
/**
 * Get emoji for mover based on overall direction
 */
function getMoverEmoji(sentimentDir: ChangeDirection, ctHeatDir: ChangeDirection): string {
  const sentimentUp = sentimentDir === 'up';
  const ctHeatUp = ctHeatDir === 'up';
  
  if (sentimentUp && ctHeatUp) return '🚀';
  if (sentimentUp || ctHeatUp) return '📊';
  if (sentimentDir === 'down' && ctHeatDir === 'down') return '📉';
  return '⚡';
}

function TopMoversWidget({ movers }: { movers: TopMover[] }) {
  // Always show widget, display placeholder if no movers
  return (
    <WidgetCard title="Top Movers (24h)" icon="⚡" gradient="from-yellow-500/10 to-transparent">
      <div className="space-y-2">
        {movers.length === 0 ? (
          <p className="text-xs text-akari-muted py-4 text-center">No movers data yet</p>
        ) : (
          movers.map((mover, idx) => {
            const tier = getAkariTier(mover.akari_score);
            const emoji = getMoverEmoji(mover.sentimentDirection24h, mover.ctHeatDirection24h);
            // Calculate total change for display
            const totalChange = mover.sentimentChange24h + mover.ctHeatChange24h;
            return (
              <Link
                key={mover.slug}
                href={`/portal/sentiment/${mover.slug}`}
                className="flex items-center gap-3 p-3 rounded-2xl hover:bg-akari-neon-teal/5 hover:shadow-soft-glow transition-smooth group"
              >
                <span className="text-akari-muted text-xs w-4">{idx + 1}</span>
                <AvatarWithFallback url={mover.twitter_profile_image_url || mover.avatar_url} name={mover.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-akari-text truncate group-hover:text-gradient-teal transition-smooth">
                    {mover.name}
                  </p>
                  <p className="text-xs text-akari-muted">@{mover.x_handle}</p>
                </div>
                <div className="text-right flex items-center gap-1">
                  <span>{emoji}</span>
                  <div>
                    <p className={`font-mono text-sm font-medium ${tier.color}`}>
                      {mover.akari_score ?? '-'}
                    </p>
                    {totalChange > 0 ? (
                      <p className="text-[10px] text-akari-primary">▲ +{totalChange}</p>
                    ) : totalChange < 0 ? (
                      <p className="text-[10px] text-akari-danger">▼ {totalChange}</p>
                    ) : (
                      <p className="text-[10px] text-akari-muted">–</p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </WidgetCard>
  );
}

/**
 * Get emoji for CT Heat score
 */
function getHeatEmoji(score: number): string {
  if (score >= 70) return '🔥';
  if (score >= 50) return '🌡️';
  if (score >= 30) return '✨';
  return '💤';
}

/**
 * Get emoji for sentiment score
 */
function getSentimentEmoji(score: number, change: number): string {
  if (change > 0) {
    if (score >= 70) return '🚀';
    if (score >= 50) return '📈';
    return '⬆️';
  }
  if (change < 0) {
    if (score <= 30) return '📉';
    return '⬇️';
  }
  return '➡️';
}

/**
 * Top Engagement Widget
 */
function TopEngagementWidget({ projects }: { projects: TopEngagement[] }) {
  // Always show widget, display placeholder if no projects
  return (
    <WidgetCard title="Hot Engagement" icon="🔥" gradient="from-orange-500/10 to-transparent">
      <div className="space-y-2">
        {projects.length === 0 ? (
          <p className="text-xs text-akari-muted py-4 text-center">No engagement data yet</p>
        ) : (
          projects.map((project, idx) => {
            // Calculate heat level for visual indicator
            const heatLevel = project.ct_heat_score >= 70 ? 'high' : project.ct_heat_score >= 50 ? 'medium' : 'low';
            return (
              <Link
                key={project.slug}
                href={`/portal/sentiment/${project.slug}`}
                className="flex items-center gap-3 p-3 rounded-2xl hover:bg-akari-neon-teal/5 hover:shadow-soft-glow transition-smooth group"
              >
                <span className="text-akari-muted text-xs w-4">{idx + 1}</span>
                <AvatarWithFallback url={project.twitter_profile_image_url || project.avatar_url} name={project.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-akari-text truncate group-hover:text-gradient-teal transition-smooth">
                    {project.name}
                  </p>
                  <p className="text-xs text-akari-muted">@{project.x_handle}</p>
                </div>
                <div className="text-right flex items-center gap-1">
                  <span>{getHeatEmoji(project.ct_heat_score)}</span>
                  <div>
                    <p className="font-mono text-sm font-medium text-orange-400">{project.ct_heat_score}</p>
                    {heatLevel === 'high' ? (
                      <p className="text-[10px] text-orange-400">🔥 Hot</p>
                    ) : heatLevel === 'medium' ? (
                      <p className="text-[10px] text-yellow-400">🌡️ Warm</p>
                    ) : (
                      <p className="text-[10px] text-akari-muted">💤 Cool</p>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </WidgetCard>
  );
}

/**
 * Trending Up Widget
 */
function TrendingUpWidget({ projects }: { projects: TrendingUp[] }) {
  // Always show widget, display placeholder if no projects
  return (
    <WidgetCard title="Trending Up" icon="📈" gradient="from-green-500/10 to-transparent">
      <div className="space-y-2">
        {projects.length === 0 ? (
          <p className="text-xs text-akari-muted py-4 text-center">No trending data yet</p>
        ) : (
          projects.map((project, idx) => (
            <Link
              key={project.slug}
              href={`/portal/sentiment/${project.slug}`}
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-akari-cardSoft/50 transition group"
            >
              <span className="text-akari-muted text-xs w-4">{idx + 1}</span>
              <AvatarWithFallback url={project.twitter_profile_image_url || project.avatar_url} name={project.name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-akari-text truncate group-hover:text-akari-primary transition">
                  {project.name}
                </p>
                <p className="text-xs text-akari-muted">@{project.x_handle}</p>
              </div>
              <div className="text-right flex items-center gap-1">
                <span>{getSentimentEmoji(project.sentiment_score, project.sentimentChange24h)}</span>
                <div>
                  <p className="font-mono text-sm font-medium text-akari-primary">
                    {project.sentiment_score}
                  </p>
                  {project.sentimentChange24h > 0 ? (
                    <p className="text-[10px] text-akari-primary">▲ +{project.sentimentChange24h}</p>
                  ) : project.sentimentChange24h < 0 ? (
                    <p className="text-[10px] text-akari-danger">▼ {project.sentimentChange24h}</p>
                  ) : (
                    <p className="text-[10px] text-akari-muted">–</p>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </WidgetCard>
  );
}

/**
 * Sentiment Overview Page
 * Displays all tracked projects with their latest sentiment metrics
 */
export default function SentimentOverview() {
  const [projects, setProjects] = useState<ProjectWithMetrics[]>([]);
  const [topMovers, setTopMovers] = useState<TopMover[]>([]);
  const [topEngagement, setTopEngagement] = useState<TopEngagement[]>([]);
  const [trendingUp, setTrendingUp] = useState<TrendingUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Watchlist state
  const [activeTab, setActiveTab] = useState<'all' | 'watchlist'>('all');
  const [watchlistProjectIds, setWatchlistProjectIds] = useState<Set<string>>(new Set());
  const [watchlistProjects, setWatchlistProjects] = useState<ProjectWithMetrics[]>([]);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [togglingStar, setTogglingStar] = useState<string | null>(null);

  // Freshness filter state
  const [freshnessFilter, setFreshnessFilter] = useState<'all' | 'fresh' | 'hide-stale'>('all');

  // Coverage/health state
  const [coverage, setCoverage] = useState<SentimentHealthData | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(true);
  const [coverageError, setCoverageError] = useState<string | null>(null);

  // Topics/narrative heatmap state
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [heatmapExpanded, setHeatmapExpanded] = useState(false);

  // Sort state
  type SortColumn = 'name' | 'akari_score' | 'sentiment_score' | 'ct_heat_score' | 'followers' | 'date';
  type SortDirection = 'asc' | 'desc';
  const [sortColumn, setSortColumn] = useState<SortColumn>('akari_score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Sort handler
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc'); // Default to descending for new column
    }
  };

  // Determine which projects to display
  const displayProjects = activeTab === 'watchlist' ? watchlistProjects : projects;

  // Filter by freshness
  const filteredProjects = useMemo(() => {
    if (freshnessFilter === 'all') {
      return displayProjects;
    }
    
    return displayProjects.filter((project) => {
      const freshness = classifyFreshness(project.last_updated_at);
      if (freshnessFilter === 'fresh') {
        return freshness.label === 'Fresh';
      } else if (freshnessFilter === 'hide-stale') {
        return freshness.label !== 'Stale';
      }
      return true;
    });
  }, [displayProjects, freshnessFilter]);

  // Sorted projects
  const sortedProjects = useMemo(() => {
    return [...filteredProjects].sort((a, b) => {
      let aVal: number | string | null = null;
      let bVal: number | string | null = null;

      switch (sortColumn) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'akari_score':
          aVal = a.akari_score;
          bVal = b.akari_score;
          break;
        case 'sentiment_score':
          aVal = a.sentiment_score;
          bVal = b.sentiment_score;
          break;
        case 'ct_heat_score':
          aVal = a.ct_heat_score;
          bVal = b.ct_heat_score;
          break;
        case 'followers':
          aVal = a.followers;
          bVal = b.followers;
          break;
        case 'date':
          aVal = a.date;
          bVal = b.date;
          break;
      }

      // Handle nulls - put them at the end
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;

      // Compare
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredProjects, sortColumn, sortDirection]);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [trackingUser, setTrackingUser] = useState<string | null>(null);
  
  // Profile type modal state
  const [profileTypeModal, setProfileTypeModal] = useState<{
    open: boolean;
    user: SearchResultUser | null;
    selectedType: ProfileType | null;
  }>({
    open: false,
    user: null,
    selectedType: null,
  });

  // Permission checks
  const { user } = useAkariUser();
  // SuperAdmin has all features via roleImpliesFeature, so canSearch will be true for SuperAdmin
  const canSearch = can(user, 'sentiment.search');
  const canCompare = can(user, 'sentiment.compare');
  const isLoggedIn = user?.isLoggedIn ?? false;
  const userTier = getUserTier(user);
  // SuperAdmin can always search/add new profiles (checked in canSearchNewProfiles)
  const canAddNewProfiles = canSearchNewProfiles(user);
  const allowedProfileTypes = allowedNewProfileTypes(user);
  const [upgradeModalState, setUpgradeModalState] = useState<{ open: boolean; targetTier?: 'analyst' | 'institutional_plus' }>({
    open: false,
    targetTier: 'analyst',
  });
  
  const router = useRouter();

  // Check if profile exists and handle tracking
  const handleTrackAndNavigate = useCallback(async (searchUser: SearchResultUser) => {
    // Check if user can add new profiles
    if (!canAddNewProfiles) {
      setSearchError('Upgrade to Institutional Plus to add new company profiles.');
      return;
    }

    setTrackingUser(searchUser.username);
    
    try {
      // First, check if profile exists in projects table
      const checkRes = await fetch(`/api/portal/sentiment/check-profile?username=${encodeURIComponent(searchUser.username)}`);
      const checkData = await checkRes.json();

      if (checkData.ok && checkData.exists && checkData.project) {
        // Profile already exists, navigate directly
        router.push(`/portal/sentiment/${checkData.project.slug}`);
        setTrackingUser(null);
        return;
      }

      // Profile doesn't exist - show modal to select profile type
      const defaultType = allowedProfileTypes.length > 0 ? allowedProfileTypes[0] : null;
      setProfileTypeModal({
        open: true,
        user: searchUser,
        selectedType: defaultType,
      });
      setTrackingUser(null);
    } catch (err) {
      console.error('[Sentiment] Check profile error:', err);
      setSearchError('Failed to check profile. Please try again.');
      setTrackingUser(null);
    }
  }, [router, canAddNewProfiles, allowedProfileTypes]);

  // Handle profile type selection and track
  const handleConfirmProfileType = useCallback(async () => {
    if (!profileTypeModal.user || !profileTypeModal.selectedType) {
      return;
    }

    const searchUser = profileTypeModal.user;
    setProfileTypeModal({ open: false, user: null, selectedType: null });
    setTrackingUser(searchUser.username);

    try {
      // Track the profile with selected type
      const trackRes = await fetch('/api/portal/sentiment/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: searchUser.username,
          name: searchUser.name,
          bio: searchUser.bio,
          profileImageUrl: searchUser.profileImageUrl,
          followersCount: searchUser.followersCount,
          profile_type: profileTypeModal.selectedType,
        }),
      });

      const trackData = await trackRes.json();
      
      if (trackData.ok && trackData.project) {
        // Navigate to the tracked project's page
        router.push(`/portal/sentiment/${trackData.project.slug}`);
      } else {
        setSearchError(trackData.error || 'Failed to track profile');
      }
    } catch (err) {
      console.error('[Sentiment] Track error:', err);
      setSearchError('Failed to track profile. Please try again.');
    } finally {
      setTrackingUser(null);
    }
  }, [profileTypeModal, router]);

  // Fetch coverage/health data
  useEffect(() => {
    async function fetchCoverage() {
      if (!isLoggedIn) {
        setCoverageLoading(false);
        return;
      }

      setCoverageLoading(true);
      setCoverageError(null);

      try {
        const res = await fetch('/api/portal/sentiment/health');
        const data: SentimentHealthResponse = await res.json();

        if (!data.ok || !data.data) {
          setCoverageError(data.error || 'Failed to load coverage data');
          return;
        }

        setCoverage(data.data);
      } catch (err) {
        setCoverageError('Failed to connect to API');
        console.error('[SentimentOverview] Coverage fetch error:', err);
      } finally {
        setCoverageLoading(false);
      }
    }

    fetchCoverage();
  }, [isLoggedIn]);

  // Fetch topics/narrative heatmap data
  useEffect(() => {
    async function fetchTopics() {
      if (!isLoggedIn) {
        setTopicsLoading(false);
        return;
      }

      setTopicsLoading(true);
      setTopicsError(null);

      try {
        const res = await fetch('/api/portal/sentiment/topics');
        const data: TopicsResponse = await res.json();

        if (!data.ok || !data.topics) {
          setTopicsError(data.error || 'Failed to load topics data');
          return;
        }

        setTopics(data.topics);
      } catch (err) {
        setTopicsError('Failed to connect to API');
        console.error('[SentimentOverview] Topics fetch error:', err);
      } finally {
        setTopicsLoading(false);
      }
    }

    fetchTopics();
  }, [isLoggedIn]);

  // Fetch tracked projects
  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/portal/sentiment');
        const data: SentimentOverviewResponse = await res.json();

        if (!data.ok || !data.projects) {
          setError(data.error || 'Failed to load data');
          return;
        }

        setProjects(data.projects);
        setTopMovers(data.topMovers || []);
        setTopEngagement(data.topEngagement || []);
        setTrendingUp(data.trendingUp || []);

        // Extract watchlist project IDs from projects (if we have that info)
        // For now, we'll fetch watchlist separately
      } catch (err) {
        setError('Failed to connect to API');
        console.error('[SentimentOverview] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Fetch watchlist when tab is active and user is logged in
  useEffect(() => {
    if (activeTab === 'watchlist' && isLoggedIn) {
      async function fetchWatchlist() {
        setWatchlistLoading(true);
        try {
          const res = await fetch('/api/portal/sentiment/watchlist');
          const data = await res.json();

          if (data.ok && data.projects) {
            // Convert watchlist projects to ProjectWithMetrics format
            const watchlistAsMetrics: ProjectWithMetrics[] = data.projects.map((p: any) => ({
              id: p.projectId,
              slug: p.slug,
              name: p.name,
              x_handle: p.xHandle || '',
              avatar_url: p.avatarUrl || null,
              twitter_profile_image_url: p.twitterProfileImageUrl || null,
              sentiment_score: p.sentiment,
              ct_heat_score: p.ctHeat,
              akari_score: p.akariScore,
              followers: p.followers ?? null,
              date: p.lastUpdatedAt,
              last_updated_at: p.lastUpdatedAt,
              sentimentChange24h: p.sentimentChange24h,
              ctHeatChange24h: p.ctHeatChange24h,
              akariChange24h: p.akariChange24h,
              followersChange24h: p.followersChange24h ?? 0,
              sentimentDirection24h: p.sentimentChange24h > 0 ? 'up' : p.sentimentChange24h < 0 ? 'down' : 'flat',
              ctHeatDirection24h: p.ctHeatChange24h > 0 ? 'up' : p.ctHeatChange24h < 0 ? 'down' : 'flat',
              followersDirection24h: (p.followersChange24h ?? 0) > 0 ? 'up' : (p.followersChange24h ?? 0) < 0 ? 'down' : 'flat',
            }));
            setWatchlistProjects(watchlistAsMetrics);
            setWatchlistProjectIds(new Set(data.projects.map((p: any) => p.projectId)));
          }
        } catch (err) {
          console.error('[SentimentOverview] Watchlist fetch error:', err);
        } finally {
          setWatchlistLoading(false);
        }
      }

      fetchWatchlist();
    }
  }, [activeTab, isLoggedIn]);

  // Toggle watchlist star
  const handleToggleStar = useCallback(async (projectId: string, isInWatchlist: boolean) => {
    if (!isLoggedIn) return;
    
    setTogglingStar(projectId);
    try {
      const res = await fetch('/api/portal/sentiment/watchlist/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          action: isInWatchlist ? 'remove' : 'add',
        }),
      });

      const data = await res.json();
      if (data.ok) {
        // Optimistically update state
        const newSet = new Set(watchlistProjectIds);
        if (isInWatchlist) {
          newSet.delete(projectId);
        } else {
          newSet.add(projectId);
        }
        setWatchlistProjectIds(newSet);

        // If on watchlist tab, refresh the list
        if (activeTab === 'watchlist') {
          const res2 = await fetch('/api/portal/sentiment/watchlist');
          const data2 = await res2.json();
          if (data2.ok && data2.projects) {
            const watchlistAsMetrics: ProjectWithMetrics[] = data2.projects.map((p: any) => ({
              id: p.projectId,
              slug: p.slug,
              name: p.name,
              x_handle: p.xHandle || '',
              avatar_url: p.avatarUrl || null,
              twitter_profile_image_url: p.twitterProfileImageUrl || null,
              sentiment_score: p.sentiment,
              ct_heat_score: p.ctHeat,
              akari_score: p.akariScore,
              followers: p.followers ?? null,
              date: p.lastUpdatedAt,
              last_updated_at: p.lastUpdatedAt,
              sentimentChange24h: p.sentimentChange24h,
              ctHeatChange24h: p.ctHeatChange24h,
              akariChange24h: p.akariChange24h,
              followersChange24h: p.followersChange24h ?? 0,
              sentimentDirection24h: p.sentimentChange24h > 0 ? 'up' : p.sentimentChange24h < 0 ? 'down' : 'flat',
              ctHeatDirection24h: p.ctHeatChange24h > 0 ? 'up' : p.ctHeatChange24h < 0 ? 'down' : 'flat',
              followersDirection24h: (p.followersChange24h ?? 0) > 0 ? 'up' : (p.followersChange24h ?? 0) < 0 ? 'down' : 'flat',
            }));
            setWatchlistProjects(watchlistAsMetrics);
          }
        }
      } else {
        alert(data.error || 'Failed to update watchlist');
      }
    } catch (err) {
      console.error('[SentimentOverview] Toggle star error:', err);
      alert('Failed to update watchlist');
    } finally {
      setTogglingStar(null);
    }
  }, [isLoggedIn, watchlistProjectIds, activeTab]);

  // Search for Twitter profiles
  const handleSearch = useCallback(async () => {
    if (searchQuery.trim().length < 2) {
      setSearchError('Enter at least 2 characters');
      return;
    }

    setSearching(true);
    setSearchError(null);

    try {
      const res = await fetch(`/api/portal/sentiment/search?q=${encodeURIComponent(searchQuery.trim())}&limit=10`);
      const data: SearchResponse = await res.json();

      if (!data.ok) {
        setSearchError(data.error || 'Search failed');
        setSearchResults([]);
        return;
      }

      setSearchResults(data.users || []);
      if (data.users?.length === 0) {
        setSearchError('No profiles found');
      }
    } catch (err) {
      setSearchError('Failed to search');
      console.error('[Search] Error:', err);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <PortalLayout title="Social Sentiment">
      {/* Header */}
      <section className="mb-6">
        <p className="mb-2 text-xs uppercase tracking-[0.25em] text-akari-muted">
          Social Sentiment Terminal
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
          <h1 className="text-3xl font-bold md:text-4xl">
            Track <span className="text-gradient-neon">Sentiment</span> Across Crypto Twitter
          </h1>
          {canCompare ? (
            <Link
              href="/portal/sentiment/compare"
              className="pill-neon inline-flex items-center gap-2 bg-akari-neon-teal/10 border border-akari-neon-teal/50 px-4 py-2 text-sm text-akari-neon-teal hover:bg-akari-neon-teal/20 hover:shadow-soft-glow"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Compare Projects
            </Link>
          ) : (
            <span
              className="inline-flex items-center gap-2 rounded-xl bg-akari-cardSoft/50 border border-akari-border/30 px-4 py-2 text-sm text-akari-muted cursor-not-allowed opacity-60"
              title="Upgrade to Analyst to access this feature"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Compare Projects
            </span>
          )}
        </div>
        <p className="max-w-2xl text-sm text-akari-muted">
          Monitor real-time sentiment, engagement heat, and AKARI credibility scores for tracked projects. 
          Click any project to see detailed metrics and influencer activity.
        </p>

        {/* Seer Upgrade CTA Banner */}
        {userTier === 'seer' && (
          <div className="card-neon border-akari-neon-blue/40 bg-akari-neon-blue/5 p-5 mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex-1">
                <h3 className="text-base font-bold text-gradient-blue mb-2">
                  You are using Seer mode
                </h3>
                <p className="text-xs text-akari-muted/90">
                  Upgrade to Analyst to unlock full competitor analysis, deep Twitter analytics, and CSV exports.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  href="/portal/pricing"
                  className="pill-neon px-4 py-2 bg-akari-neon-blue/10 text-akari-neon-blue hover:bg-akari-neon-blue/20 border border-akari-neon-blue/50 text-xs font-medium whitespace-nowrap"
                >
                  View Pricing
                </Link>
                  <button
                    onClick={() => setUpgradeModalState({ open: true, targetTier: 'analyst' })}
                    className="pill-neon px-4 py-2 bg-gradient-neon-blue text-white hover:shadow-neon-blue text-xs font-medium whitespace-nowrap font-semibold"
                  >
                    Request Upgrade
                  </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Search Section */}
      <section className="mb-6">
        <button
          onClick={() => canSearch && setShowSearch(!showSearch)}
          className={`flex items-center gap-2 text-sm transition mb-3 ${
            canSearch 
              ? 'text-akari-muted hover:text-akari-primary cursor-pointer' 
              : 'text-akari-muted/50 cursor-not-allowed'
          }`}
          disabled={!canSearch}
          title={!canSearch ? 'Upgrade to Analyst to search profiles' : undefined}
        >
          {canSearch ? (
            <svg
              className={`w-4 h-4 transition-transform ${showSearch ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          )}
          Search Twitter Profiles
          {!canSearch && <span className="text-xs text-akari-muted/50">(Analyst+)</span>}
        </button>

        {showSearch && canSearch && (
          <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search by username or name..."
                className="flex-1 rounded-xl bg-akari-cardSoft border border-akari-border/50 px-4 py-2 text-sm text-akari-text placeholder:text-akari-muted/50 focus:outline-none focus:border-akari-primary/50"
              />
              <button
                onClick={handleSearch}
                disabled={searching}
                className="rounded-xl bg-akari-primary px-4 py-2 text-sm font-medium text-black hover:opacity-90 transition disabled:opacity-50"
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>

            {searchError && (
              <p className="text-sm text-akari-danger mb-3">{searchError}</p>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-akari-muted uppercase tracking-wider mb-2">
                  Found {searchResults.length} profile(s) {canAddNewProfiles ? '– Click to track' : ''}
                </p>
                {!canAddNewProfiles && (
                  <div className="rounded-xl bg-akari-cardSoft border border-akari-border/30 p-3 mb-2">
                    <p className="text-xs text-akari-muted">
                      Upgrade to Institutional Plus to add new company profiles.
                    </p>
                  </div>
                )}
                {searchResults.map((user) => (
                  <button
                    key={user.username}
                    onClick={() => handleTrackAndNavigate(user)}
                    disabled={trackingUser === user.username || !canAddNewProfiles}
                    className="w-full text-left flex items-start gap-3 p-4 rounded-xl bg-akari-cardSoft border border-akari-border/30 hover:border-akari-primary/50 hover:bg-akari-card transition cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {/* Profile Image */}
                    {user.profileImageUrl ? (
                      <img
                        src={user.profileImageUrl}
                        alt={user.name || user.username}
                        className="h-12 w-12 rounded-full object-cover bg-akari-card border border-akari-border/50 flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div 
                      className={`${user.profileImageUrl ? 'hidden' : 'flex'} h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-akari-primary/20 to-akari-accent/20 text-akari-primary font-semibold text-lg flex-shrink-0`}
                    >
                      {(user.name || user.username).charAt(0).toUpperCase()}
                    </div>
                    
                    {/* Profile Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-akari-text truncate">{user.name}</p>
                        {user.verified && (
                          <span className="text-blue-400 text-sm" title="Verified">✓</span>
                        )}
                      </div>
                      <p className="text-xs text-akari-muted mb-2">@{user.username}</p>
                      {user.bio && (
                        <p className="text-xs text-akari-text/70 line-clamp-2 mb-2">{user.bio}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-akari-muted">
                        <span><strong className="text-akari-text">{formatNumber(user.followersCount)}</strong> followers</span>
                        <span><strong className="text-akari-text">{formatNumber(user.followingCount)}</strong> following</span>
                      </div>
                    </div>
                    
                    {/* Loading/Arrow indicator */}
                    <div className="flex items-center text-akari-muted">
                      {trackingUser === user.username ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-2xl border border-akari-danger/30 bg-akari-card p-6 text-center">
          <p className="text-sm text-akari-danger">{error}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && projects.length === 0 && (
        <div className="rounded-2xl border border-akari-border bg-akari-card p-8 text-center">
          <p className="text-sm text-akari-muted">
            No projects are being tracked yet. Data will appear once the sentiment cron runs.
          </p>
        </div>
      )}

      {/* Main Content */}
      {!loading && !error && projects.length > 0 && (
        <>
          {/* Coverage & Data Health Panel */}
          {isLoggedIn && (
            <section className="mb-4 sm:mb-6">
                  <div className="card-neon p-3 sm:p-4">
                {coverageLoading ? (
                  <div className="text-center py-4">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-2" />
                    <p className="text-xs text-slate-400">Loading coverage...</p>
                  </div>
                ) : coverageError ? (
                  <div className="text-center py-4">
                    <p className="text-xs text-red-400 mb-2">{coverageError}</p>
                    <button
                      onClick={() => {
                        setCoverageLoading(true);
                        setCoverageError(null);
                        fetch('/api/portal/sentiment/health')
                          .then((res) => res.json())
                          .then((data: SentimentHealthResponse) => {
                            if (data.ok && data.data) {
                              setCoverage(data.data);
                            } else {
                              setCoverageError(data.error || 'Failed to load coverage data');
                            }
                          })
                          .catch((err) => {
                            setCoverageError('Failed to connect to API');
                            console.error('[SentimentOverview] Coverage retry error:', err);
                          })
                          .finally(() => setCoverageLoading(false));
                      }}
                      className="px-3 py-1 rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-xs font-medium"
                    >
                      Retry
                    </button>
                  </div>
                ) : coverage ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-4">
                      {/* Total Projects */}
                      <div className="rounded-2xl p-2.5 sm:p-3 border border-akari-neon-teal/20 bg-akari-neon-teal/5">
                        <p className="text-[10px] sm:text-xs text-slate-400 mb-0.5 sm:mb-1">Total Projects</p>
                        <p className="text-lg sm:text-xl font-semibold text-white">{coverage.totalProjects}</p>
                      </div>

                      {/* Fresh */}
                      <div className="bg-green-500/10 rounded-lg p-2.5 sm:p-3 border border-green-500/20">
                        <p className="text-[10px] sm:text-xs text-green-400 mb-0.5 sm:mb-1">Fresh</p>
                        <p className="text-lg sm:text-xl font-semibold text-green-400">{coverage.freshCount}</p>
                        <p className="text-[9px] sm:text-[10px] text-green-400/70 mt-0.5 hidden sm:block">Updated in last 24h</p>
                      </div>

                      {/* Warm */}
                      <div className="bg-yellow-500/10 rounded-lg p-2.5 sm:p-3 border border-yellow-500/20">
                        <p className="text-[10px] sm:text-xs text-yellow-400 mb-0.5 sm:mb-1">Warm</p>
                        <p className="text-lg sm:text-xl font-semibold text-yellow-400">{coverage.warmCount}</p>
                        <p className="text-[9px] sm:text-[10px] text-yellow-400/70 mt-0.5 hidden sm:block">24-72h old</p>
                      </div>

                      {/* Stale */}
                      <div className="bg-red-500/10 rounded-lg p-2.5 sm:p-3 border border-red-500/20">
                        <p className="text-[10px] sm:text-xs text-red-400 mb-0.5 sm:mb-1">Stale</p>
                        <p className="text-lg sm:text-xl font-semibold text-red-400">{coverage.staleCount}</p>
                        <p className="text-[9px] sm:text-[10px] text-red-400/70 mt-0.5 hidden sm:block">Older than 72h</p>
                      </div>

                      {/* No Data */}
                      <div className="rounded-2xl p-2.5 sm:p-3 border border-akari-border/30 bg-akari-cardSoft/30">
                        <p className="text-[10px] sm:text-xs text-slate-400 mb-0.5 sm:mb-1">No Data</p>
                        <p className="text-lg sm:text-xl font-semibold text-slate-400">{coverage.totalNoData}</p>
                        <p className="text-[9px] sm:text-[10px] text-slate-400/70 mt-0.5 hidden sm:block">No metrics yet</p>
                      </div>

                      {/* With Inner Circle */}
                      <div className="bg-akari-primary/10 rounded-lg p-2.5 sm:p-3 border border-akari-primary/20">
                        <p className="text-[10px] sm:text-xs text-akari-primary mb-0.5 sm:mb-1">Inner Circle</p>
                        <p className="text-xl sm:text-2xl font-bold text-gradient-teal metric-glow">{coverage.withInnerCircleCount}</p>
                        <p className="text-[9px] sm:text-[10px] text-akari-primary/70 mt-0.5 hidden sm:block">Projects with data</p>
                      </div>
                    </div>

                    {/* Last Global Update */}
                    {coverage.lastGlobalUpdatedAt && (
                      <div className="text-right">
                        <p className="text-xs text-slate-400">
                          Last global sentiment update:{' '}
                          <span className="text-slate-300">
                            {new Date(coverage.lastGlobalUpdatedAt).toLocaleString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </span>
                        </p>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </section>
          )}

          {/* Narrative Heatmap Section */}
          {isLoggedIn && (
            <section className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setHeatmapExpanded(!heatmapExpanded)}
                  className="flex items-center gap-2 group hover:opacity-80 transition-opacity"
                >
                  <h2 className="text-sm uppercase tracking-wider text-akari-muted">
                    Narrative Heatmap (30d)
                  </h2>
                  <svg
                    className={`w-4 h-4 text-akari-muted transition-transform duration-200 ${
                      heatmapExpanded ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                <span className="text-xs text-akari-muted/70">
                  Based on project topic stats
                </span>
              </div>

              {heatmapExpanded && (
                <div className="transition-all duration-200">
                  {topicsLoading && (
                    <div className="text-center py-8">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent mx-auto mb-2" />
                      <p className="text-xs text-akari-muted">Loading narratives…</p>
                    </div>
                  )}

                  {topicsError && (
                    <div className="text-center py-8">
                      <p className="text-xs text-red-400 mb-2">{topicsError}</p>
                      <button
                        onClick={() => {
                          setTopicsLoading(true);
                          setTopicsError(null);
                          fetch('/api/portal/sentiment/topics')
                            .then((res) => res.json())
                            .then((data: TopicsResponse) => {
                              if (data.ok && data.topics) {
                                setTopics(data.topics);
                              } else {
                                setTopicsError(data.error || 'Failed to load topics data');
                              }
                            })
                            .catch((err) => {
                              setTopicsError('Failed to connect to API');
                              console.error('[SentimentOverview] Topics retry error:', err);
                            })
                            .finally(() => setTopicsLoading(false));
                        }}
                        className="px-3 py-1 rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-xs font-medium"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {!topicsLoading && !topicsError && topics.length > 0 && (
                    <div className="overflow-x-auto rounded-2xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl shadow-[0_0_30px_rgba(0,246,162,0.1)]">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5 text-left text-xs uppercase tracking-wider">
                            <th className="py-4 px-5 font-semibold text-gradient-teal">Topic</th>
                            <th className="py-4 px-5 font-semibold text-gradient-blue">Projects</th>
                            <th className="py-4 px-5 font-semibold text-gradient-heat">Weighted Heat</th>
                            <th className="py-4 px-5 font-semibold text-gradient-followers">Tweets (30d)</th>
                            <th className="py-4 px-5 font-semibold text-gradient-sentiment">Avg Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {topics.map((t) => (
                            <tr
                              key={t.topic}
                              className="border-b border-akari-neon-teal/10 last:border-0 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5"
                            >
                              <td className="py-4 px-5 font-semibold text-akari-text capitalize">
                                {t.topic}
                              </td>
                              <td className="py-4 px-5 text-gradient-blue font-medium">
                                {t.projectsCount}
                              </td>
                              <td className="py-4 px-5 font-mono font-bold text-gradient-heat text-base">
                                {t.totalWeightedScore.toFixed(2)}
                              </td>
                              <td className="py-4 px-5 text-gradient-followers font-medium">
                                {t.totalTweetCount.toLocaleString()}
                              </td>
                              <td className="py-4 px-5 font-mono font-bold text-gradient-sentiment text-base">
                                {t.avgScore.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {!topicsLoading && !topicsError && topics.length === 0 && (
                    <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-8 text-center">
                      <p className="text-xs text-akari-muted">
                        No topic data available yet. Try again after the next sentiment update.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Signal Widgets Grid */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
            <TopMoversWidget movers={topMovers} />
            <TopEngagementWidget projects={topEngagement} />
            <TrendingUpWidget projects={trendingUp} />
          </section>

          {/* Tracked Projects Section */}
          <section>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
              <h2 className="text-sm uppercase tracking-wider text-akari-muted">
                {activeTab === 'watchlist' ? 'My Watchlist' : 'Tracked Projects'}
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                {isLoggedIn && (
                  <>
                    <button
                      onClick={() => setActiveTab('all')}
                      className={`pill-neon px-3 py-1.5 text-xs font-medium ${
                        activeTab === 'all'
                          ? 'bg-gradient-neon-teal text-black shadow-neon-teal'
                          : 'bg-akari-cardSoft text-akari-muted hover:text-akari-neon-teal hover:bg-akari-neon-teal/5'
                      }`}
                    >
                      All Projects
                    </button>
                    <button
                      onClick={() => setActiveTab('watchlist')}
                      className={`pill-neon px-3 py-1.5 text-xs font-medium ${
                        activeTab === 'watchlist'
                          ? 'bg-gradient-neon-teal text-black shadow-neon-teal'
                          : 'bg-akari-cardSoft text-akari-muted hover:text-akari-neon-teal hover:bg-akari-neon-teal/5'
                      }`}
                    >
                      My Watchlist
                    </button>
                  </>
                )}
                {activeTab === 'all' && (
                  <div className="flex items-center gap-1 border-l border-akari-border/50 pl-2 ml-2">
                    <span className="text-xs text-akari-muted mr-1">Filter:</span>
                    <button
                      onClick={() => setFreshnessFilter('all')}
                      className={`px-2 py-1 text-xs font-medium rounded transition ${
                        freshnessFilter === 'all'
                          ? 'bg-akari-primary/20 text-akari-primary'
                          : 'text-akari-muted hover:text-akari-text'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setFreshnessFilter('fresh')}
                      className={`px-2 py-1 text-xs font-medium rounded transition ${
                        freshnessFilter === 'fresh'
                          ? 'bg-akari-primary/20 text-akari-primary'
                          : 'text-akari-muted hover:text-akari-text'
                      }`}
                    >
                      Only Fresh
                    </button>
                    <button
                      onClick={() => setFreshnessFilter('hide-stale')}
                      className={`px-2 py-1 text-xs font-medium rounded transition ${
                        freshnessFilter === 'hide-stale'
                          ? 'bg-akari-primary/20 text-akari-primary'
                          : 'text-akari-muted hover:text-akari-text'
                      }`}
                    >
                      Hide Stale
                    </button>
                  </div>
                )}
              </div>
            </div>

            {activeTab === 'watchlist' && !isLoggedIn && (
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-6 text-center">
                <p className="text-sm text-akari-muted">Log in to use the watchlist feature.</p>
              </div>
            )}

            {activeTab === 'watchlist' && isLoggedIn && watchlistLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
              </div>
            )}

            {activeTab === 'watchlist' && isLoggedIn && !watchlistLoading && watchlistProjects.length === 0 && (
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-6 text-center">
                <p className="text-sm text-akari-muted">Your watchlist is empty. Star projects to add them.</p>
              </div>
            )}

            {/* Desktop table view */}
            {((activeTab === 'all') || (activeTab === 'watchlist' && isLoggedIn && !watchlistLoading && watchlistProjects.length > 0)) && (
            <div className="hidden md:block overflow-x-auto rounded-2xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl shadow-[0_0_30px_rgba(0,246,162,0.1)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5 text-left text-xs uppercase tracking-wider">
                    {isLoggedIn && (
                      <th className="py-4 px-5 w-12">
                        <span className="sr-only">Star</span>
                      </th>
                    )}
                    <th 
                      className="py-4 px-5 cursor-pointer hover:text-gradient-teal transition-all duration-300 select-none font-semibold"
                      onClick={() => handleSort('name')}
                    >
                      <span className="flex items-center gap-1.5 text-gradient-teal">
                        Profile
                        <SortIcon active={sortColumn === 'name'} direction={sortDirection} />
                      </span>
                    </th>
                    <th 
                      className="py-4 px-5 cursor-pointer hover:text-gradient-akari transition-all duration-300 select-none font-semibold"
                      onClick={() => handleSort('akari_score')}
                    >
                      <span className="flex items-center gap-1.5 text-gradient-akari">
                        AKARI Score
                        <SortIcon active={sortColumn === 'akari_score'} direction={sortDirection} />
                      </span>
                    </th>
                    <th 
                      className="py-4 px-5 cursor-pointer hover:text-gradient-sentiment transition-all duration-300 select-none font-semibold"
                      onClick={() => handleSort('sentiment_score')}
                    >
                      <span className="flex items-center gap-1.5 text-gradient-sentiment">
                        Sentiment
                        <SortIcon active={sortColumn === 'sentiment_score'} direction={sortDirection} />
                      </span>
                    </th>
                    <th 
                      className="py-4 px-5 cursor-pointer hover:text-gradient-heat transition-all duration-300 select-none font-semibold"
                      onClick={() => handleSort('ct_heat_score')}
                    >
                      <span className="flex items-center gap-1.5 text-gradient-heat">
                        CT Heat
                        <SortIcon active={sortColumn === 'ct_heat_score'} direction={sortDirection} />
                      </span>
                    </th>
                    <th 
                      className="py-4 px-5 cursor-pointer hover:text-gradient-followers transition-all duration-300 select-none font-semibold"
                      onClick={() => handleSort('followers')}
                    >
                      <span className="flex items-center gap-1.5 text-gradient-followers">
                        Followers
                        <SortIcon active={sortColumn === 'followers'} direction={sortDirection} />
                      </span>
                    </th>
                    <th className="py-4 px-5 text-left text-xs uppercase tracking-wider font-semibold text-akari-muted hidden xl:table-cell">
                      Mindshare (7d)
                    </th>
                    <th className="py-4 px-5 text-left text-xs uppercase tracking-wider font-semibold text-akari-muted hidden lg:table-cell">
                      Smart Followers
                    </th>
                    <th className="py-4 px-5 text-left text-xs uppercase tracking-wider font-semibold text-akari-muted">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProjects.map((project) => {
                    const tier = getAkariTier(project.akari_score);
                    const isInWatchlist = watchlistProjectIds.has(project.id);
                    return (
                      <tr
                        key={project.id}
                        className="border-b border-akari-neon-teal/10 last:border-0 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5"
                      >
                        {isLoggedIn && (
                          <td className="py-4 px-5">
                            <button
                              onClick={() => handleToggleStar(project.id, isInWatchlist)}
                              disabled={togglingStar === project.id}
                              className="text-akari-muted hover:text-akari-neon-teal transition-all duration-300 disabled:opacity-50"
                              title={isInWatchlist ? 'Remove from watchlist' : 'Add to watchlist'}
                            >
                              {isInWatchlist ? (
                                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                </svg>
                              ) : (
                                <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                                </svg>
                              )}
                            </button>
                          </td>
                        )}
                        <td className="py-4 px-5">
                          <Link
                            href={`/portal/sentiment/${project.slug}`}
                            className="flex items-center gap-3 group"
                          >
                            <AvatarWithFallback url={project.twitter_profile_image_url || project.avatar_url} name={project.name} />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-akari-text group-hover:text-gradient-teal transition-all duration-300">
                                  {project.name}
                                </p>
                                {isLoggedIn && user?.xUsername && project.x_handle.toLowerCase() === user.xUsername.toLowerCase() && (
                                  <div className={`flex items-center justify-center w-5 h-5 rounded-full ${
                                    user.personaType === 'company'
                                      ? 'bg-gradient-to-br from-purple-500/30 to-amber-500/30 border border-purple-500/50'
                                      : 'bg-gradient-to-br from-akari-neon-teal/30 to-akari-neon-pink/30 border border-akari-neon-teal/50'
                                  }`}>
                                    <svg 
                                      className={`w-3 h-3 ${
                                        user.personaType === 'company'
                                          ? 'text-purple-400'
                                          : 'text-akari-neon-teal'
                                      }`}
                                      fill="currentColor" 
                                      viewBox="0 0 20 20"
                                    >
                                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                              <p className="text-xs text-akari-muted">@{project.x_handle}</p>
                            </div>
                          </Link>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            <span className={`font-mono font-bold text-lg ${project.akari_score !== null ? 'text-gradient-akari' : 'text-akari-muted'}`}>
                              {project.akari_score ?? '-'}
                            </span>
                            <span className={`rounded-full bg-akari-cardSoft px-2.5 py-1 text-[10px] uppercase tracking-wider font-medium border border-akari-neon-teal/30 ${tier.color}`}>
                              {tier.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-mono font-bold text-lg ${project.sentiment_score !== null ? 'text-gradient-sentiment' : 'text-akari-muted'}`}>
                              {project.sentiment_score ?? '-'}
                            </span>
                            <ChangeIndicator change={project.sentimentChange24h} direction={project.sentimentDirection24h} />
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 rounded-full bg-akari-cardSoft overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-akari-neon-blue to-akari-neon-violet"
                                  style={{ width: `${project.ct_heat_score ?? 0}%` }}
                                />
                              </div>
                              <span className={`font-mono text-sm font-medium ${project.ct_heat_score !== null ? 'text-gradient-heat' : 'text-akari-muted'}`}>
                                {project.ct_heat_score ?? '-'}
                              </span>
                            </div>
                            <ChangeIndicator change={project.ctHeatChange24h} direction={project.ctHeatDirection24h} />
                          </div>
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-mono font-medium text-base ${project.followers !== null ? 'text-gradient-followers' : 'text-akari-text'}`}>
                              {formatNumber(project.followers)}
                            </span>
                            <ChangeIndicator change={project.followersChange24h} direction={project.followersDirection24h} formatLargeNumbers />
                          </div>
                        </td>
                        <td className="py-4 px-5 hidden xl:table-cell">
                          {project.mindshare_bps_7d !== null && project.mindshare_bps_7d !== undefined ? (
                            <div className="flex flex-col gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-medium text-sm text-akari-primary">
                                  {(project.mindshare_bps_7d / 100).toFixed(2)}%
                                </span>
                              </div>
                              <span className="text-xs text-akari-muted">{(project.mindshare_bps_7d).toFixed(0)} bps</span>
                              {project.delta_bps_7d !== null && project.delta_bps_7d !== undefined && (
                                <ChangeIndicator 
                                  change={project.delta_bps_7d} 
                                  direction={project.delta_bps_7d > 0 ? 'up' : project.delta_bps_7d < 0 ? 'down' : 'flat'}
                                />
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-akari-muted">-</span>
                          )}
                        </td>
                        <td className="py-4 px-5 hidden lg:table-cell">
                          {project.smart_followers_count !== null && project.smart_followers_count !== undefined ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-mono font-medium text-sm text-akari-text">
                                {formatNumber(project.smart_followers_count)}
                              </span>
                              {project.smart_followers_pct !== null && project.smart_followers_pct !== undefined && (
                                <span className="text-xs text-akari-muted">
                                  {project.smart_followers_pct.toFixed(1)}%
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-akari-muted">-</span>
                          )}
                        </td>
                        <td className="py-4 px-5">
                          {(() => {
                            const freshness = classifyFreshness(project.last_updated_at);
                            return (
                              <div
                                className={`inline-flex items-center ${getFreshnessPillClasses(freshness)}`}
                                title={`Last sentiment update: ${formatTimestampForTooltip(project.last_updated_at)}`}
                              >
                                {freshness.label}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}

            {/* Mobile card view */}
            {((activeTab === 'all') || (activeTab === 'watchlist' && isLoggedIn && !watchlistLoading && watchlistProjects.length > 0)) && (
            <div className="md:hidden space-y-3">
              {sortedProjects.map((project) => {
                const tier = getAkariTier(project.akari_score);
                const isInWatchlist = watchlistProjectIds.has(project.id);
                return (
                  <div
                    key={project.id}
                    className="card-neon p-4 sm:p-5"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {isLoggedIn && (
                        <button
                          onClick={() => handleToggleStar(project.id, isInWatchlist)}
                          disabled={togglingStar === project.id}
                          className="text-akari-muted hover:text-akari-primary transition disabled:opacity-50 flex-shrink-0"
                        >
                          {isInWatchlist ? (
                            <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 fill-none stroke-current" viewBox="0 0 24 24" strokeWidth={2}>
                              <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                            </svg>
                          )}
                        </button>
                      )}
                      <Link
                        href={`/portal/sentiment/${project.slug}`}
                        className="flex items-center gap-3 flex-1"
                      >
                        <AvatarWithFallback url={project.twitter_profile_image_url || project.avatar_url} name={project.name} size="lg" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-akari-text truncate">{project.name}</p>
                            {isLoggedIn && user?.xUsername && project.x_handle.toLowerCase() === user.xUsername.toLowerCase() && (
                              <div className={`flex items-center justify-center w-4 h-4 rounded-full flex-shrink-0 ${
                                user.personaType === 'company'
                                  ? 'bg-gradient-to-br from-purple-500/30 to-amber-500/30 border border-purple-500/50'
                                  : 'bg-gradient-to-br from-akari-neon-teal/30 to-akari-neon-pink/30 border border-akari-neon-teal/50'
                              }`}>
                                <svg 
                                  className={`w-2.5 h-2.5 ${
                                    user.personaType === 'company'
                                      ? 'text-purple-400'
                                      : 'text-akari-neon-teal'
                                  }`}
                                  fill="currentColor" 
                                  viewBox="0 0 20 20"
                                >
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <p className="text-xs text-akari-muted">@{project.x_handle}</p>
                        </div>
                        <span className={`rounded-full bg-akari-cardSoft px-2 py-1 text-[10px] uppercase tracking-wider ${tier.color}`}>
                          {tier.name}
                        </span>
                      </Link>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="metric-card-neon p-3">
                        <p className="text-[10px] uppercase text-akari-muted mb-1">AKARI</p>
                        <p className={`font-mono font-bold text-xl sm:text-2xl ${project.akari_score !== null ? 'text-gradient-akari' : 'text-akari-muted'}`}>
                          {project.akari_score ?? '-'}
                        </p>
                      </div>
                      <div className="metric-card-neon p-3">
                        <p className="text-[10px] uppercase text-akari-muted mb-0.5">Sentiment</p>
                        <p className={`font-mono font-bold text-xl sm:text-2xl ${project.sentiment_score !== null ? 'text-gradient-sentiment' : 'text-akari-muted'}`}>
                          {project.sentiment_score ?? '-'}
                        </p>
                        <ChangeIndicator change={project.sentimentChange24h} direction={project.sentimentDirection24h} compact />
                      </div>
                      <div className="metric-card-neon p-3">
                        <p className="text-[10px] uppercase text-akari-muted mb-0.5">CT Heat</p>
                        <p className={`font-mono font-bold text-xl sm:text-2xl ${project.ct_heat_score !== null ? 'text-gradient-heat' : 'text-akari-muted'}`}>
                          {project.ct_heat_score ?? '-'}
                        </p>
                        <ChangeIndicator change={project.ctHeatChange24h} direction={project.ctHeatDirection24h} compact />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </section>
        </>
      )}

      {/* Upgrade Modal */}
      {isLoggedIn && (
        <UpgradeModal
          isOpen={upgradeModalState.open}
          onClose={() => setUpgradeModalState({ open: false })}
          user={user}
          targetTier={upgradeModalState.targetTier}
        />
      )}

      {/* Profile Type Selection Modal */}
      {profileTypeModal.open && profileTypeModal.user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl border border-akari-border bg-akari-card p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-akari-text mb-2">Add new profile</h2>
            <p className="text-sm text-akari-muted mb-4">Select profile type</p>
            
            {/* Profile preview */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-akari-cardSoft border border-akari-border/30 mb-4">
              {profileTypeModal.user.profileImageUrl ? (
                <img
                  src={profileTypeModal.user.profileImageUrl}
                  alt={profileTypeModal.user.name || profileTypeModal.user.username}
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-akari-primary/20 to-akari-accent/20 flex items-center justify-center text-akari-primary font-semibold">
                  {(profileTypeModal.user.name || profileTypeModal.user.username).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-akari-text truncate">{profileTypeModal.user.name}</p>
                <p className="text-xs text-akari-muted">@{profileTypeModal.user.username}</p>
              </div>
            </div>

            {/* Profile type options */}
            <div className="space-y-2 mb-6">
              {allowedProfileTypes.includes('company') && (
                <button
                  onClick={() => setProfileTypeModal({ ...profileTypeModal, selectedType: 'company' })}
                  className={`w-full text-left p-4 rounded-xl border transition ${
                    profileTypeModal.selectedType === 'company'
                      ? 'border-akari-primary bg-akari-primary/10'
                      : 'border-akari-border/30 bg-akari-cardSoft hover:border-akari-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                      profileTypeModal.selectedType === 'company'
                        ? 'border-akari-primary bg-akari-primary'
                        : 'border-akari-border'
                    }`}>
                      {profileTypeModal.selectedType === 'company' && (
                        <div className="h-2 w-2 rounded-full bg-white" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-akari-text">Company/Project</p>
                      <p className="text-xs text-akari-muted">For companies, projects, and organizations</p>
                    </div>
                  </div>
                </button>
              )}

              {allowedProfileTypes.includes('personal') && (
                <button
                  onClick={() => setProfileTypeModal({ ...profileTypeModal, selectedType: 'personal' })}
                  className={`w-full text-left p-4 rounded-xl border transition ${
                    profileTypeModal.selectedType === 'personal'
                      ? 'border-akari-primary bg-akari-primary/10'
                      : 'border-akari-border/30 bg-akari-cardSoft hover:border-akari-primary/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                      profileTypeModal.selectedType === 'personal'
                        ? 'border-akari-primary bg-akari-primary'
                        : 'border-akari-border'
                    }`}>
                      {profileTypeModal.selectedType === 'personal' && (
                        <div className="h-2 w-2 rounded-full bg-white" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-akari-text">Personal/Individual</p>
                      <p className="text-xs text-akari-muted">For individual creators and influencers</p>
                    </div>
                  </div>
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setProfileTypeModal({ open: false, user: null, selectedType: null })}
                className="flex-1 px-4 py-2 rounded-xl bg-akari-cardSoft border border-akari-border text-akari-text hover:bg-akari-card transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmProfileType}
                disabled={!profileTypeModal.selectedType}
                className="flex-1 px-4 py-2 rounded-xl bg-akari-primary text-black font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add profile
              </button>
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
