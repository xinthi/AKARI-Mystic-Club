import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '../../../components/portal/PortalLayout';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface Project {
  id: string;
  slug: string;
  name: string;
  x_handle: string;
  avatar_url: string | null;
  akari_score: number | null;
  followers: number | null;
}

interface CommonProfile {
  id: string;
  username: string;
  name: string | null;
  profile_image_url: string | null;
  followers: number;
  akari_profile_score: number | null;
  influence_score: number | null;
}

interface CompetitorProject {
  id: string;
  slug: string;
  name: string;
  x_handle: string;
  avatar_url: string | null;
  akari_score: number | null;
  inner_circle_count: number;
  similarity_score: number;
  common_inner_circle_count: number;
  common_inner_circle_power: number;
}

interface CompareData {
  projectA: {
    id: string;
    slug: string;
    name: string;
    x_handle: string;
    avatar_url: string | null;
    akari_score: number | null;
    inner_circle_count: number;
    inner_circle_power: number;
    followers: number | null;
  };
  projectB: {
    id: string;
    slug: string;
    name: string;
    x_handle: string;
    avatar_url: string | null;
    akari_score: number | null;
    inner_circle_count: number;
    inner_circle_power: number;
    followers: number | null;
  };
  commonProfiles: CommonProfile[];
  similarityScore: number;
}

// NEW: Advanced Analytics types for comparison
interface ProjectAnalytics {
  totalEngagements: number;
  avgEngagementRate: number;
  tweetsCount: number;
  followerChange: number;
  tweetVelocity: number;
  avgSentiment: number;
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

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function ComparePage() {
  const router = useRouter();
  const { projectA: projectASlug, projectB: projectBSlug } = router.query;

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedA, setSelectedA] = useState<string>('');
  const [selectedB, setSelectedB] = useState<string>('');
  const [competitors, setCompetitors] = useState<CompetitorProject[]>([]);
  const [compare, setCompare] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  
  // NEW: Advanced Analytics state
  const [analyticsA, setAnalyticsA] = useState<ProjectAnalytics | null>(null);
  const [analyticsB, setAnalyticsB] = useState<ProjectAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Load projects list
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch('/api/portal/sentiment');
        const data = await res.json();
        if (data.ok && data.projects) {
          setProjects(data.projects.map((p: any) => ({
            id: p.id,
            slug: p.slug,
            name: p.name,
            x_handle: p.x_handle,
            avatar_url: p.avatar_url,
            akari_score: p.akari_score,
            followers: p.followers,
          })));
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, []);

  // Set initial selections from URL
  useEffect(() => {
    if (projectASlug && typeof projectASlug === 'string') {
      setSelectedA(projectASlug);
    }
    if (projectBSlug && typeof projectBSlug === 'string') {
      setSelectedB(projectBSlug);
    }
  }, [projectASlug, projectBSlug]);

  // Fetch competitors when project A is selected
  useEffect(() => {
    if (!selectedA) {
      setCompetitors([]);
      return;
    }

    async function fetchCompetitors() {
      try {
        const res = await fetch(`/api/portal/sentiment/${selectedA}/competitors`);
        const data = await res.json();
        if (data.ok) {
          setCompetitors(data.competitors || []);
        }
      } catch (error) {
        console.error('Error fetching competitors:', error);
      }
    }
    fetchCompetitors();
  }, [selectedA]);

  // Fetch comparison when both are selected
  useEffect(() => {
    if (!selectedA || !selectedB) {
      setCompare(null);
      return;
    }

    async function fetchComparison() {
      setComparing(true);
      try {
        const res = await fetch(`/api/portal/sentiment/${selectedA}/competitors?compareWith=${selectedB}`);
        const data = await res.json();
        if (data.ok && data.compare) {
          setCompare(data.compare);
        }
      } catch (error) {
        console.error('Error fetching comparison:', error);
      } finally {
        setComparing(false);
      }
    }
    fetchComparison();

    // NEW: Fetch analytics for both projects
    async function fetchAnalytics() {
      setAnalyticsLoading(true);
      try {
        const [resA, resB] = await Promise.all([
          fetch(`/api/portal/sentiment/${selectedA}/analytics?window=7d`),
          fetch(`/api/portal/sentiment/${selectedB}/analytics?window=7d`),
        ]);
        
        const dataA = await resA.json();
        const dataB = await resB.json();
        
        if (dataA.ok) {
          setAnalyticsA(dataA.summary);
        }
        if (dataB.ok) {
          setAnalyticsB(dataB.summary);
        }
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setAnalyticsLoading(false);
      }
    }
    fetchAnalytics();

    // Update URL
    router.replace(
      `/portal/sentiment/compare?projectA=${selectedA}&projectB=${selectedB}`,
      undefined,
      { shallow: true }
    );
  }, [selectedA, selectedB]);

  const projectAData = useMemo(() => 
    projects.find(p => p.slug === selectedA), [projects, selectedA]
  );
  const projectBData = useMemo(() => 
    projects.find(p => p.slug === selectedB), [projects, selectedB]
  );

  return (
    <PortalLayout title="Compare Projects">
      {/* Header */}
      <section className="mb-6">
        <Link
          href="/portal/sentiment"
          className="mb-4 inline-flex items-center gap-1 text-xs text-akari-muted hover:text-akari-primary transition"
        >
          ← Back to Overview
        </Link>
        <p className="mb-2 text-xs uppercase tracking-[0.25em] text-akari-muted">
          Competitor Analysis
        </p>
        <h1 className="mb-2 text-2xl font-semibold md:text-3xl">
          Compare <span className="text-akari-primary">Projects</span>
        </h1>
        <p className="max-w-2xl text-sm text-akari-muted">
          Select two projects to compare their inner circles and discover common high-profile followers.
        </p>
      </section>

      {/* Project Selection */}
      <section className="grid md:grid-cols-2 gap-4 mb-8">
        {/* Project A Selector */}
        <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
          <label className="text-xs uppercase tracking-wider text-akari-muted mb-2 block">
            Select Project A
          </label>
          <select
            value={selectedA}
            onChange={(e) => {
              setSelectedA(e.target.value);
              setSelectedB(''); // Reset B when A changes
            }}
            className="w-full rounded-xl bg-akari-cardSoft border border-akari-border/50 px-4 py-3 text-akari-text focus:outline-none focus:border-akari-primary/50"
            disabled={loading}
          >
            <option value="">Choose a project...</option>
            {projects.map(p => (
              <option key={p.id} value={p.slug}>{p.name} (@{p.x_handle})</option>
            ))}
          </select>
          
          {projectAData && (
            <div className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-akari-cardSoft">
              <AvatarWithFallback url={projectAData.avatar_url} name={projectAData.name} />
              <div className="flex-1">
                <p className="font-medium">{projectAData.name}</p>
                <p className="text-xs text-akari-muted">@{projectAData.x_handle}</p>
              </div>
              <div className={`font-mono font-bold ${getAkariTier(projectAData.akari_score).color}`}>
                {projectAData.akari_score ?? '-'}
              </div>
            </div>
          )}
        </div>

        {/* Project B Selector */}
        <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
          <label className="text-xs uppercase tracking-wider text-akari-muted mb-2 block">
            Select Project B (Competitor)
          </label>
          <select
            value={selectedB}
            onChange={(e) => setSelectedB(e.target.value)}
            className="w-full rounded-xl bg-akari-cardSoft border border-akari-border/50 px-4 py-3 text-akari-text focus:outline-none focus:border-akari-primary/50"
            disabled={!selectedA || loading}
          >
            <option value="">Choose a competitor...</option>
            {/* Show similar projects first */}
            {competitors.length > 0 && (
              <optgroup label="Similar Projects">
                {competitors.map(c => (
                  <option key={c.id} value={c.slug}>
                    {c.name} (@{c.x_handle}) - {Math.round(c.similarity_score * 100)}% similar
                  </option>
                ))}
              </optgroup>
            )}
            {/* Then all other projects */}
            <optgroup label="All Projects">
              {projects.filter(p => p.slug !== selectedA).map(p => (
                <option key={p.id} value={p.slug}>{p.name} (@{p.x_handle})</option>
              ))}
            </optgroup>
          </select>

          {projectBData && (
            <div className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-akari-cardSoft">
              <AvatarWithFallback url={projectBData.avatar_url} name={projectBData.name} />
              <div className="flex-1">
                <p className="font-medium">{projectBData.name}</p>
                <p className="text-xs text-akari-muted">@{projectBData.x_handle}</p>
              </div>
              <div className={`font-mono font-bold ${getAkariTier(projectBData.akari_score).color}`}>
                {projectBData.akari_score ?? '-'}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Suggested Competitors */}
      {selectedA && competitors.length > 0 && !selectedB && (
        <section className="mb-8">
          <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">
            Suggested Competitors for {projectAData?.name}
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {competitors.slice(0, 6).map(comp => {
              const tier = getAkariTier(comp.akari_score);
              return (
                <button
                  key={comp.id}
                  onClick={() => setSelectedB(comp.slug)}
                  className="rounded-2xl border border-akari-border/70 bg-akari-card p-4 text-left transition hover:border-akari-primary/50 hover:bg-akari-cardSoft/50"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <AvatarWithFallback url={comp.avatar_url} name={comp.name} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{comp.name}</p>
                      <p className="text-xs text-akari-muted">@{comp.x_handle}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div>
                      <p className="text-akari-muted mb-0.5">AKARI</p>
                      <p className={`font-mono font-medium ${tier.color}`}>{comp.akari_score ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-akari-muted mb-0.5">Similarity</p>
                      <p className="font-mono font-medium text-akari-primary">
                        {Math.round(comp.similarity_score * 100)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-akari-muted mb-0.5">Common</p>
                      <p className="font-mono font-medium">{comp.common_inner_circle_count}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Loading state */}
      {comparing && (
        <div className="flex items-center justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
        </div>
      )}

      {/* Comparison Results */}
      {compare && !comparing && (
        <>
          {/* Head-to-Head Stats */}
          <section className="mb-8">
            <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">
              Head-to-Head Comparison
            </h2>
            <div className="rounded-2xl border border-akari-border/70 bg-akari-card overflow-hidden">
              <div className="grid grid-cols-3 divide-x divide-akari-border">
                {/* Project A Column */}
                <div className="p-4 text-center">
                  <div className="flex justify-center mb-2">
                    <AvatarWithFallback url={compare.projectA.avatar_url} name={compare.projectA.name} size="lg" />
                  </div>
                  <p className="font-medium">{compare.projectA.name}</p>
                  <p className="text-xs text-akari-muted mb-3">@{compare.projectA.x_handle}</p>
                </div>

                {/* Center Column */}
                <div className="p-4 flex flex-col items-center justify-center bg-akari-cardSoft">
                  <p className="text-xs text-akari-muted mb-1">SIMILARITY</p>
                  <p className="text-3xl font-bold text-akari-primary">
                    {Math.round(compare.similarityScore * 100)}%
                  </p>
                  <p className="text-xs text-akari-muted mt-1">
                    {compare.commonProfiles.length} common profiles
                  </p>
                </div>

                {/* Project B Column */}
                <div className="p-4 text-center">
                  <div className="flex justify-center mb-2">
                    <AvatarWithFallback url={compare.projectB.avatar_url} name={compare.projectB.name} size="lg" />
                  </div>
                  <p className="font-medium">{compare.projectB.name}</p>
                  <p className="text-xs text-akari-muted mb-3">@{compare.projectB.x_handle}</p>
                </div>
              </div>

              {/* Stats Table */}
              <table className="w-full text-sm">
                <tbody>
                  {[
                    { label: 'AKARI Score', a: compare.projectA.akari_score, b: compare.projectB.akari_score },
                    { label: 'Inner Circle', a: compare.projectA.inner_circle_count, b: compare.projectB.inner_circle_count },
                    { label: 'Circle Power', a: compare.projectA.inner_circle_power, b: compare.projectB.inner_circle_power },
                    { label: 'Followers', a: compare.projectA.followers, b: compare.projectB.followers, format: true },
                  ].map(row => (
                    <tr key={row.label} className="border-t border-akari-border/30">
                      <td className="py-3 px-4 text-center font-mono">
                        <span className={
                          row.a !== null && row.b !== null && row.a > row.b 
                            ? 'text-akari-primary' 
                            : 'text-akari-text'
                        }>
                          {row.format ? formatNumber(row.a) : (row.a ?? '-')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-akari-muted text-xs">
                        {row.label}
                      </td>
                      <td className="py-3 px-4 text-center font-mono">
                        <span className={
                          row.a !== null && row.b !== null && row.b > row.a 
                            ? 'text-akari-primary' 
                            : 'text-akari-text'
                        }>
                          {row.format ? formatNumber(row.b) : (row.b ?? '-')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Common High-Profile Followers */}
          {compare.commonProfiles.length > 0 && (
            <section>
              <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">
                Common Inner Circle ({compare.commonProfiles.length} profiles)
              </h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {compare.commonProfiles.map(profile => {
                  const tier = getAkariTier(profile.akari_profile_score);
                  return (
                    <a
                      key={profile.id}
                      href={`https://x.com/${profile.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-2xl border border-akari-border/70 bg-akari-card p-4 transition hover:border-akari-primary/50"
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <AvatarWithFallback 
                          url={profile.profile_image_url} 
                          name={profile.name || profile.username} 
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{profile.name || profile.username}</p>
                          <p className="text-xs text-akari-muted">@{profile.username}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-center text-[10px]">
                        <div>
                          <p className="text-akari-muted">AKARI</p>
                          <p className={`font-mono font-medium ${tier.color}`}>
                            {profile.akari_profile_score ?? '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-akari-muted">Influence</p>
                          <p className="font-mono font-medium">{profile.influence_score ?? '-'}</p>
                        </div>
                        <div>
                          <p className="text-akari-muted">Followers</p>
                          <p className="font-mono font-medium">{formatNumber(profile.followers)}</p>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>

              {compare.commonProfiles.length === 0 && (
                <div className="rounded-2xl border border-akari-border/50 bg-akari-card p-8 text-center">
                  <p className="text-akari-muted">No common inner circle members found between these projects.</p>
                  <p className="text-xs text-akari-muted mt-2">
                    Run the circles update script to populate inner circle data.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ================================================================= */}
          {/* NEW: ADVANCED ANALYTICS SECTION (APPENDED BELOW EXISTING)        */}
          {/* ================================================================= */}
          {analyticsA && analyticsB && (
            <section className="mt-8 pt-8 border-t border-akari-border/30">
              <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-4 flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Advanced Analytics (7 Days)
              </h2>

              {analyticsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
                </div>
              ) : (
                <div className="rounded-2xl border border-akari-border/50 bg-akari-card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-akari-border/30 bg-akari-cardSoft/30">
                        <th className="py-3 px-4 text-center font-mono font-medium">
                          {compare.projectA.name}
                        </th>
                        <th className="py-3 px-4 text-center text-akari-muted font-normal text-xs">
                          Metric
                        </th>
                        <th className="py-3 px-4 text-center font-mono font-medium">
                          {compare.projectB.name}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Total Engagements', a: analyticsA.totalEngagements, b: analyticsB.totalEngagements, format: true },
                        { label: 'Avg Engagement Rate', a: analyticsA.avgEngagementRate, b: analyticsB.avgEngagementRate, format: false, suffix: '/tweet' },
                        { label: 'Tweets (7D)', a: analyticsA.tweetsCount, b: analyticsB.tweetsCount, format: false },
                        { label: 'Follower Change', a: analyticsA.followerChange, b: analyticsB.followerChange, format: true, showSign: true },
                        { label: 'Tweet Velocity', a: analyticsA.tweetVelocity, b: analyticsB.tweetVelocity, format: false, suffix: '/day' },
                        { label: 'Avg Sentiment', a: analyticsA.avgSentiment, b: analyticsB.avgSentiment, format: false },
                      ].map((row, idx) => (
                        <tr key={idx} className="border-b border-akari-border/20">
                          <td className="py-3 px-4 text-center font-mono">
                            <span className={
                              row.a > row.b ? 'text-akari-primary font-medium' : 'text-akari-text'
                            }>
                              {row.showSign && row.a >= 0 ? '+' : ''}
                              {row.format ? formatNumber(row.a) : row.a}
                              {row.suffix || ''}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center text-akari-muted text-xs">
                            {row.label}
                          </td>
                          <td className="py-3 px-4 text-center font-mono">
                            <span className={
                              row.b > row.a ? 'text-akari-primary font-medium' : 'text-akari-text'
                            }>
                              {row.showSign && row.b >= 0 ? '+' : ''}
                              {row.format ? formatNumber(row.b) : row.b}
                              {row.suffix || ''}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* Empty state - no selection */}
      {!selectedA && !loading && (
        <div className="rounded-2xl border border-akari-border/50 bg-akari-card p-8 text-center">
          <p className="text-akari-muted mb-2">Select a project to start comparing</p>
          <p className="text-xs text-akari-muted">
            You&apos;ll see suggested competitors based on inner circle overlap.
          </p>
        </div>
      )}
    </PortalLayout>
  );
}

