import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
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
  sentiment_score: number | null;
  ct_heat_score: number | null;
  akari_score: number | null;
  followers: number | null;
  date: string | null;
  // 24h changes
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
  akari_score: number | null;
  akariChange24h: number;
  ctHeatChange24h: number;
  sentimentChange24h: number;
  sentimentDirection24h: ChangeDirection;
  ctHeatDirection24h: ChangeDirection;
}

interface SentimentOverviewResponse {
  ok: boolean;
  projects?: ProjectWithMetrics[];
  topMovers?: TopMover[];
  error?: string;
}

interface TwitterUserProfile {
  handle: string;
  userId?: string;
  name?: string;
  bio?: string;
  avatarUrl?: string;
  followersCount?: number;
  followingCount?: number;
  tweetCount?: number;
  verified?: boolean;
}

interface SearchResponse {
  ok: boolean;
  users?: TwitterUserProfile[];
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
 * Top Movers Panel Component
 */
function TopMoversPanel({ movers }: { movers: TopMover[] }) {
  if (movers.length === 0) return null;

  return (
    <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
      <h3 className="text-xs uppercase tracking-wider text-akari-muted mb-3 flex items-center gap-2">
        <span className="text-akari-primary">⚡</span>
        Top Movers (24h)
      </h3>
      <div className="space-y-2">
        {movers.map((mover) => {
          const tier = getAkariTier(mover.akari_score);
          return (
            <Link
              key={mover.slug}
              href={`/portal/sentiment/${mover.slug}`}
              className="flex items-center gap-3 p-2 rounded-xl hover:bg-akari-cardSoft transition group"
            >
              {/* Avatar */}
              {mover.avatar_url ? (
                <img
                  src={mover.avatar_url}
                  alt={mover.name}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-akari-cardSoft text-akari-primary text-sm">
                  {mover.name.charAt(0)}
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-akari-text truncate group-hover:text-akari-primary transition">
                  {mover.name}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                  <span className="text-akari-muted">Sentiment:</span>
                  <ChangeIndicator 
                    change={mover.sentimentChange24h} 
                    direction={mover.sentimentDirection24h}
                    compact
                  />
                  <span className="text-akari-muted">CT:</span>
                  <ChangeIndicator 
                    change={mover.ctHeatChange24h} 
                    direction={mover.ctHeatDirection24h}
                    compact
                  />
                </div>
              </div>

              {/* AKARI Score */}
              <div className="text-right">
                <p className={`font-mono text-sm font-medium ${tier.color}`}>
                  {mover.akari_score ?? '-'}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Sentiment Overview Page
 * Displays all tracked projects with their latest sentiment metrics
 */
export default function SentimentOverview() {
  const [projects, setProjects] = useState<ProjectWithMetrics[]>([]);
  const [topMovers, setTopMovers] = useState<TopMover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TwitterUserProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);

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

  // Handle Enter key in search input
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
        <h1 className="mb-2 text-2xl font-semibold md:text-3xl">
          Track <span className="text-akari-primary">Sentiment</span> Across Crypto Twitter
        </h1>
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
            {/* Search input */}
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
                {searching ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                    Searching
                  </span>
                ) : (
                  'Search'
                )}
              </button>
            </div>

            {/* Search error */}
            {searchError && (
              <p className="text-sm text-akari-danger mb-3">{searchError}</p>
            )}

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-akari-muted uppercase tracking-wider mb-2">
                  Found {searchResults.length} profile(s)
                </p>
                {searchResults.map((user) => (
                  <a
                    key={user.handle}
                    href={`https://x.com/${user.handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl bg-akari-cardSoft border border-akari-border/30 hover:border-akari-primary/50 transition"
                  >
                    {/* Avatar */}
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.name || user.handle}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-akari-card text-akari-primary">
                        {(user.name || user.handle).charAt(0).toUpperCase()}
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-akari-text truncate">
                          {user.name || user.handle}
                        </p>
                        {user.verified && (
                          <svg className="w-4 h-4 text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z" />
                          </svg>
                        )}
                      </div>
                      <p className="text-xs text-akari-muted">@{user.handle}</p>
                    </div>

                    {/* Stats */}
                    <div className="text-right text-xs">
                      <p className="text-akari-text font-mono">
                        {formatNumber(user.followersCount)}
                      </p>
                      <p className="text-akari-muted">followers</p>
                    </div>
                  </a>
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

      {/* Empty state - only show if not loading and no error and no projects */}
      {!loading && !error && projects.length === 0 && (
        <div className="rounded-2xl border border-akari-border bg-akari-card p-8 text-center">
          <p className="text-sm text-akari-muted">
            No projects are being tracked yet. Data will appear once the sentiment cron runs.
          </p>
        </div>
      )}

      {/* Tracked Projects Section */}
      {!loading && !error && projects.length > 0 && (
        <>
          {/* Top Movers - positioned at top right on desktop */}
          {topMovers.length > 0 && (
            <div className="mb-6 flex justify-end">
              <div className="w-full md:w-80">
                <TopMoversPanel movers={topMovers} />
              </div>
            </div>
          )}

          {/* Main projects table/list */}
          <div>
            <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">
              Tracked Projects
            </h2>

            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-akari-border text-left text-xs uppercase tracking-wider text-akari-muted">
                    <th className="pb-3 pr-4">Project</th>
                    <th className="pb-3 px-4">AKARI Score</th>
                    <th className="pb-3 px-4">Sentiment</th>
                    <th className="pb-3 px-4">CT Heat</th>
                    <th className="pb-3 px-4">Followers</th>
                    <th className="pb-3 pl-4">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map((project) => {
                    const tier = getAkariTier(project.akari_score);
                    return (
                      <tr
                        key={project.id}
                        className="border-b border-akari-border/50 transition hover:bg-akari-cardSoft"
                      >
                        {/* Project name & handle */}
                        <td className="py-4 pr-4">
                          <Link
                            href={`/portal/sentiment/${project.slug}`}
                            className="flex items-center gap-3 group"
                          >
                            {project.avatar_url ? (
                              <img
                                src={project.avatar_url}
                                alt={project.name}
                                className="h-9 w-9 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-akari-cardSoft text-akari-primary">
                                {project.name.charAt(0)}
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-akari-text group-hover:text-akari-primary transition">
                                {project.name}
                              </p>
                              <p className="text-xs text-akari-muted">
                                @{project.x_handle}
                              </p>
                            </div>
                          </Link>
                        </td>

                        {/* AKARI Score with tier badge */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">
                              {project.akari_score ?? '-'}
                            </span>
                            <span
                              className={`rounded-full bg-akari-cardSoft px-2 py-0.5 text-[10px] uppercase tracking-wider ${tier.color}`}
                            >
                              {tier.name}
                            </span>
                          </div>
                        </td>

                        {/* Sentiment score with 24h change */}
                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`font-mono font-medium ${getSentimentColor(
                                project.sentiment_score
                              )}`}
                            >
                              {project.sentiment_score ?? '-'}
                            </span>
                            <ChangeIndicator 
                              change={project.sentimentChange24h} 
                              direction={project.sentimentDirection24h}
                            />
                          </div>
                        </td>

                        {/* CT Heat with 24h change */}
                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 rounded-full bg-akari-cardSoft overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-akari-primary to-akari-accent"
                                  style={{ width: `${project.ct_heat_score ?? 0}%` }}
                                />
                              </div>
                              <span className="font-mono text-xs text-akari-muted">
                                {project.ct_heat_score ?? '-'}
                              </span>
                            </div>
                            <ChangeIndicator 
                              change={project.ctHeatChange24h} 
                              direction={project.ctHeatDirection24h}
                            />
                          </div>
                        </td>

                        {/* Followers */}
                        <td className="py-4 px-4 font-mono text-akari-muted">
                          {formatNumber(project.followers)}
                        </td>

                        {/* Last updated */}
                        <td className="py-4 pl-4 text-xs text-akari-muted">
                          {project.date
                            ? new Date(project.date).toLocaleDateString()
                            : '-'}
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
                    {/* Project header */}
                    <div className="flex items-center gap-3 mb-3">
                      {project.avatar_url ? (
                        <img
                          src={project.avatar_url}
                          alt={project.name}
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-akari-cardSoft text-akari-primary text-lg">
                          {project.name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-akari-text truncate">
                          {project.name}
                        </p>
                        <p className="text-xs text-akari-muted">
                          @{project.x_handle}
                        </p>
                      </div>
                      {/* Tier badge */}
                      <span
                        className={`rounded-full bg-akari-cardSoft px-2 py-1 text-[10px] uppercase tracking-wider ${tier.color}`}
                      >
                        {tier.name}
                      </span>
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-akari-cardSoft p-2">
                        <p className="text-[10px] uppercase text-akari-muted mb-1">
                          AKARI
                        </p>
                        <p className="font-mono font-medium">
                          {project.akari_score ?? '-'}
                        </p>
                      </div>
                      <div className="rounded-xl bg-akari-cardSoft p-2">
                        <p className="text-[10px] uppercase text-akari-muted mb-0.5">
                          Sentiment
                        </p>
                        <p
                          className={`font-mono font-medium ${getSentimentColor(
                            project.sentiment_score
                          )}`}
                        >
                          {project.sentiment_score ?? '-'}
                        </p>
                        <div className="mt-0.5">
                          <ChangeIndicator 
                            change={project.sentimentChange24h} 
                            direction={project.sentimentDirection24h}
                            compact
                          />
                        </div>
                      </div>
                      <div className="rounded-xl bg-akari-cardSoft p-2">
                        <p className="text-[10px] uppercase text-akari-muted mb-0.5">
                          CT Heat
                        </p>
                        <p className="font-mono font-medium">
                          {project.ct_heat_score ?? '-'}
                        </p>
                        <div className="mt-0.5">
                          <ChangeIndicator 
                            change={project.ctHeatChange24h} 
                            direction={project.ctHeatDirection24h}
                            compact
                          />
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      )}
    </PortalLayout>
  );
}
