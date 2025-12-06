import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { PortalLayout } from '../../../components/portal/PortalLayout';

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
  sentimentChange24h: number;
  ctHeatChange24h: number;
  akariChange24h: number;
  sentimentDirection24h: ChangeDirection;
  ctHeatDirection24h: ChangeDirection;
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

  const showFallback = !url || imgError;

  return (
    <div className="relative flex-shrink-0">
      {!showFallback ? (
        <img
          src={url}
          alt={name}
          className={`${sizeClasses[size]} rounded-full object-cover bg-akari-cardSoft border border-akari-border/50`}
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

/**
 * Change indicator component for 24h deltas
 */
function ChangeIndicator({ 
  change, 
  direction,
  compact = false 
}: { 
  change: number; 
  direction: ChangeDirection;
  compact?: boolean;
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

  return (
    <span className={`${colorClass} text-xs font-medium`}>
      {arrow} {sign}{change}
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
  gradient = 'from-akari-primary/10 to-transparent'
}: { 
  title: string; 
  icon: string;
  children: React.ReactNode;
  gradient?: string;
}) {
  return (
    <div className={`rounded-2xl border border-akari-border/70 bg-gradient-to-br ${gradient} p-4`}>
      <h3 className="text-xs uppercase tracking-wider text-akari-muted mb-3 flex items-center gap-2">
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
function TopMoversWidget({ movers }: { movers: TopMover[] }) {
  if (movers.length === 0) return null;

  return (
    <WidgetCard title="Top Movers (24h)" icon="⚡" gradient="from-yellow-500/10 to-transparent">
      <div className="space-y-2">
        {movers.map((mover, idx) => {
          const tier = getAkariTier(mover.akari_score);
          return (
            <Link
              key={mover.slug}
              href={`/portal/sentiment/${mover.slug}`}
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-akari-cardSoft/50 transition group"
            >
              <span className="text-akari-muted text-xs w-4">{idx + 1}</span>
              <AvatarWithFallback url={mover.twitter_profile_image_url || mover.avatar_url} name={mover.name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-akari-text truncate group-hover:text-akari-primary transition">
                  {mover.name}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <ChangeIndicator change={mover.sentimentChange24h} direction={mover.sentimentDirection24h} compact />
                  <span className="text-akari-muted">CT:</span>
                  <ChangeIndicator change={mover.ctHeatChange24h} direction={mover.ctHeatDirection24h} compact />
                </div>
              </div>
              <div className={`font-mono text-sm font-medium ${tier.color}`}>
                {mover.akari_score ?? '-'}
              </div>
            </Link>
          );
        })}
      </div>
    </WidgetCard>
  );
}

/**
 * Top Engagement Widget
 */
function TopEngagementWidget({ projects }: { projects: TopEngagement[] }) {
  if (projects.length === 0) return null;

  return (
    <WidgetCard title="Hot Engagement" icon="🔥" gradient="from-orange-500/10 to-transparent">
      <div className="space-y-2">
        {projects.map((project, idx) => (
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
            <div className="text-right">
              <p className="font-mono text-sm font-medium text-orange-400">{project.ct_heat_score}</p>
              <p className="text-[10px] text-akari-muted">CT Heat</p>
            </div>
          </Link>
        ))}
      </div>
    </WidgetCard>
  );
}

/**
 * Trending Up Widget
 */
function TrendingUpWidget({ projects }: { projects: TrendingUp[] }) {
  if (projects.length === 0) return null;

  return (
    <WidgetCard title="Trending Up" icon="📈" gradient="from-green-500/10 to-transparent">
      <div className="space-y-2">
        {projects.map((project, idx) => (
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
            <div className="text-right">
              <p className="font-mono text-sm font-medium text-akari-primary">
                {project.sentiment_score}
              </p>
              <p className="text-[10px] text-akari-primary">▲ +{project.sentimentChange24h}</p>
            </div>
          </Link>
        ))}
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

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [trackingUser, setTrackingUser] = useState<string | null>(null);
  
  const router = useRouter();

  // Track a profile and navigate to its detail page
  const handleTrackAndNavigate = useCallback(async (user: SearchResultUser) => {
    setTrackingUser(user.username);
    
    try {
      // Track the profile first (saves to DB)
      const trackRes = await fetch('/api/portal/sentiment/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          name: user.name,
          bio: user.bio,
          profileImageUrl: user.profileImageUrl,
          followersCount: user.followersCount,
        }),
      });

      const trackData = await trackRes.json();
      
      if (trackData.ok && trackData.project) {
        // Navigate to the tracked project's page
        router.push(`/portal/sentiment/${trackData.project.slug}`);
      } else {
        // Fallback to profile page if tracking fails
        router.push(`/portal/sentiment/profile/${user.username}`);
      }
    } catch (err) {
      console.error('[Sentiment] Track error:', err);
      // Fallback to profile page on error
      router.push(`/portal/sentiment/profile/${user.username}`);
    } finally {
      setTrackingUser(null);
    }
  }, [router]);

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
      } catch (err) {
        setError('Failed to connect to API');
        console.error('[SentimentOverview] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

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
          <h1 className="text-2xl font-semibold md:text-3xl">
            Track <span className="text-akari-primary">Sentiment</span> Across Crypto Twitter
          </h1>
          <Link
            href="/portal/sentiment/compare"
            className="inline-flex items-center gap-2 rounded-xl bg-akari-cardSoft border border-akari-border/50 px-4 py-2 text-sm text-akari-text hover:border-akari-primary/50 hover:text-akari-primary transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Compare Projects
          </Link>
        </div>
        <p className="max-w-2xl text-sm text-akari-muted">
          Monitor real-time sentiment, engagement heat, and AKARI credibility scores for tracked projects. 
          Click any project to see detailed metrics and influencer activity.
        </p>
      </section>

      {/* Search Section */}
      <section className="mb-6">
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="flex items-center gap-2 text-sm text-akari-muted hover:text-akari-primary transition mb-3"
        >
          <svg
            className={`w-4 h-4 transition-transform ${showSearch ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Search Twitter Profiles
        </button>

        {showSearch && (
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
                  Found {searchResults.length} profile(s) – Click to track
                </p>
                {searchResults.map((user) => (
                  <button
                    key={user.username}
                    onClick={() => handleTrackAndNavigate(user)}
                    disabled={trackingUser === user.username}
                    className="w-full text-left flex items-start gap-3 p-4 rounded-xl bg-akari-cardSoft border border-akari-border/30 hover:border-akari-primary/50 hover:bg-akari-card transition cursor-pointer disabled:opacity-70 disabled:cursor-wait"
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
          {/* Signal Widgets Grid */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <TopMoversWidget movers={topMovers} />
            <TopEngagementWidget projects={topEngagement} />
            <TrendingUpWidget projects={trendingUp} />
          </section>

          {/* Tracked Projects Section */}
          <section>
            <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">
              Tracked Projects
            </h2>

            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto rounded-2xl border border-akari-border/70 bg-akari-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-akari-border bg-akari-cardSoft text-left text-xs uppercase tracking-wider text-akari-muted">
                    <th className="py-3 px-4">Project</th>
                    <th className="py-3 px-4">AKARI Score</th>
                    <th className="py-3 px-4">Sentiment</th>
                    <th className="py-3 px-4">CT Heat</th>
                    <th className="py-3 px-4">Followers</th>
                    <th className="py-3 px-4">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => {
                    const tier = getAkariTier(project.akari_score);
                    return (
                      <tr
                        key={project.id}
                        className="border-b border-akari-border/30 transition hover:bg-akari-cardSoft/50"
                      >
                        <td className="py-4 px-4">
                          <Link
                            href={`/portal/sentiment/${project.slug}`}
                            className="flex items-center gap-3 group"
                          >
                            <AvatarWithFallback url={project.twitter_profile_image_url || project.avatar_url} name={project.name} />
                            <div>
                              <p className="font-medium text-akari-text group-hover:text-akari-primary transition">
                                {project.name}
                              </p>
                              <p className="text-xs text-akari-muted">@{project.x_handle}</p>
                            </div>
                          </Link>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{project.akari_score ?? '-'}</span>
                            <span className={`rounded-full bg-akari-cardSoft px-2 py-0.5 text-[10px] uppercase tracking-wider ${tier.color}`}>
                              {tier.name}
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-mono font-medium ${getSentimentColor(project.sentiment_score)}`}>
                              {project.sentiment_score ?? '-'}
                            </span>
                            <ChangeIndicator change={project.sentimentChange24h} direction={project.sentimentDirection24h} />
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 rounded-full bg-akari-cardSoft overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-akari-primary to-akari-accent"
                                  style={{ width: `${project.ct_heat_score ?? 0}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs text-akari-muted">{project.ct_heat_score ?? '-'}</span>
                            </div>
                            <ChangeIndicator change={project.ctHeatChange24h} direction={project.ctHeatDirection24h} />
                          </div>
                        </td>
                        <td className="py-4 px-4 font-mono text-akari-muted">
                          {formatNumber(project.followers)}
                        </td>
                        <td className="py-4 px-4 text-xs text-akari-muted">
                          {project.date ? new Date(project.date).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card view */}
            <div className="md:hidden space-y-3">
              {projects.map((project) => {
                const tier = getAkariTier(project.akari_score);
                return (
                  <Link
                    key={project.id}
                    href={`/portal/sentiment/${project.slug}`}
                    className="block rounded-2xl border border-akari-border/70 bg-akari-card p-4 transition hover:border-akari-primary/50"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <AvatarWithFallback url={project.twitter_profile_image_url || project.avatar_url} name={project.name} size="lg" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-akari-text truncate">{project.name}</p>
                        <p className="text-xs text-akari-muted">@{project.x_handle}</p>
                      </div>
                      <span className={`rounded-full bg-akari-cardSoft px-2 py-1 text-[10px] uppercase tracking-wider ${tier.color}`}>
                        {tier.name}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-akari-cardSoft p-2">
                        <p className="text-[10px] uppercase text-akari-muted mb-1">AKARI</p>
                        <p className="font-mono font-medium">{project.akari_score ?? '-'}</p>
                      </div>
                      <div className="rounded-xl bg-akari-cardSoft p-2">
                        <p className="text-[10px] uppercase text-akari-muted mb-0.5">Sentiment</p>
                        <p className={`font-mono font-medium ${getSentimentColor(project.sentiment_score)}`}>
                          {project.sentiment_score ?? '-'}
                        </p>
                        <ChangeIndicator change={project.sentimentChange24h} direction={project.sentimentDirection24h} compact />
                      </div>
                      <div className="rounded-xl bg-akari-cardSoft p-2">
                        <p className="text-[10px] uppercase text-akari-muted mb-0.5">CT Heat</p>
                        <p className="font-mono font-medium">{project.ct_heat_score ?? '-'}</p>
                        <ChangeIndicator change={project.ctHeatChange24h} direction={project.ctHeatDirection24h} compact />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}
    </PortalLayout>
  );
}
