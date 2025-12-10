import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '../../../components/portal/PortalLayout';
import { classifyFreshness, formatTimestampForTooltip, getFreshnessPillClasses } from '../../../lib/portal/data-freshness';

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

interface CompetitorProjectData {
  id: string;
  name: string;
  slug: string;
  x_handle: string;
  avatar_url: string | null;
  followers: number;
  akariScore: number | null;
  sentiment30d: number | null;
  ctHeat30d: number | null;
  lastUpdatedAt: string | null;
  topTopics: Array<{ topic: string; weightedScore: number }>;
  innerCircleCount: number;
  innerCirclePowerTotal: number;
}

interface CompetitorsResponse {
  ok: boolean;
  projects?: CompetitorProjectData[];
  sharedKOLsAll?: string[];
  sharedKOLsPartial?: string[];
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

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<Array<{ id: string; name: string; slug: string; x_handle: string }>>([]);
  const [competitorsData, setCompetitorsData] = useState<CompetitorsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load projects list
  useEffect(() => {
    let cancelled = false;

    async function fetchProjects() {
      try {
        const res = await fetch('/api/portal/sentiment');
        if (cancelled) return;
        
        const data = await res.json();
        if (!cancelled && data.ok && data.projects) {
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
      } catch (err) {
        if (!cancelled) {
          console.error('Error fetching projects:', err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    
    fetchProjects();
    
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch competitor data when 2+ projects selected
  useEffect(() => {
    if (selectedProjects.length < 2) {
      setCompetitorsData(null);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchCompetitors() {
      setFetching(true);
      setError(null);
      
      try {
        const projectSlugs = selectedProjects.map(p => p.slug);
        const res = await fetch('/api/portal/sentiment/competitors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectIds: projectSlugs }),
        });

        if (cancelled) return;

        const data: CompetitorsResponse = await res.json();
        
        if (!cancelled) {
          if (data.ok && data.projects) {
            setCompetitorsData(data);
          } else {
            setError(data.error || 'Failed to fetch competitor data');
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to fetch competitor data');
          console.error('Error fetching competitors:', err);
        }
      } finally {
        if (!cancelled) {
          setFetching(false);
        }
      }
    }

    fetchCompetitors();

    return () => {
      cancelled = true;
    };
  }, [selectedProjects]);

  const handleAddProject = (slug: string) => {
    if (selectedProjects.length >= 5) return;
    
    const project = projects.find(p => p.slug === slug);
    if (!project) return;

    // Don't add if already selected
    if (selectedProjects.some(p => p.slug === slug)) return;

    setSelectedProjects([...selectedProjects, {
      id: project.id,
      name: project.name,
      slug: project.slug,
      x_handle: project.x_handle,
    }]);
  };

  const handleRemoveProject = (slug: string) => {
    setSelectedProjects(selectedProjects.filter(p => p.slug !== slug));
  };

  const canAddMore = selectedProjects.length < 5;

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
          Competitor Analysis Dashboard
        </p>
        <h1 className="mb-2 text-2xl font-semibold md:text-3xl">
          Compare <span className="text-akari-primary">Projects</span>
        </h1>
        <p className="max-w-2xl text-sm text-akari-muted">
          Select up to 5 projects to compare their metrics, topics, and shared inner circle members.
        </p>
      </section>

      {/* Project Selection */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <label className="text-xs uppercase tracking-wider text-akari-muted">
            Select Projects ({selectedProjects.length}/5)
          </label>
          {selectedProjects.length > 0 && (
            <button
              onClick={() => setSelectedProjects([])}
              className="text-xs text-akari-muted hover:text-akari-danger transition"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Selected Projects */}
        {selectedProjects.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {selectedProjects.map(project => {
              const projectData = projects.find(p => p.slug === project.slug);
              return (
                <div
                  key={project.slug}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-akari-cardSoft border border-akari-border/50"
                >
                  <AvatarWithFallback url={projectData?.avatar_url || null} name={project.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{project.name}</p>
                    <p className="text-xs text-akari-muted">@{project.x_handle}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveProject(project.slug)}
                    className="text-akari-muted hover:text-akari-danger transition ml-2"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Project Selector */}
        <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                handleAddProject(e.target.value);
                e.target.value = '';
              }
            }}
            disabled={!canAddMore || loading}
            className="w-full rounded-xl bg-akari-cardSoft border border-akari-border/50 px-4 py-3 text-akari-text focus:outline-none focus:border-akari-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">
              {canAddMore ? 'Add a project...' : 'Maximum 5 projects selected'}
            </option>
            {projects
              .filter(p => !selectedProjects.some(sp => sp.slug === p.slug))
              .map(p => (
                <option key={p.id} value={p.slug}>
                  {p.name} (@{p.x_handle})
                </option>
              ))}
          </select>
          {selectedProjects.length < 2 && selectedProjects.length > 0 && (
            <p className="mt-2 text-xs text-akari-muted">
              Select at least 2 projects to see competitor analysis.
            </p>
          )}
        </div>
      </section>

      {/* Loading state */}
      {fetching && (
        <div className="flex items-center justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-akari-primary border-t-transparent" />
        </div>
      )}

      {/* Error state */}
      {error && !fetching && (
        <div className="rounded-2xl border border-akari-danger/30 bg-akari-card p-6 text-center">
          <p className="text-sm text-akari-danger mb-3">{error}</p>
          <button
            onClick={() => {
              setError(null);
              // Trigger refetch by updating selectedProjects
              setSelectedProjects([...selectedProjects]);
            }}
            className="px-4 py-2 rounded-lg bg-akari-primary/20 text-akari-primary hover:bg-akari-primary/30 border border-akari-primary/50 transition text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* Competitor Data */}
      {competitorsData?.ok && competitorsData.projects && !fetching && (
        <>
          {/* Shared KOL Summary */}
          {((competitorsData.sharedKOLsAll?.length ?? 0) > 0 || (competitorsData.sharedKOLsPartial?.length ?? 0) > 0) && (
            <section className="mb-8">
              <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">
                Shared Inner Circle
              </h2>
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                {(competitorsData.sharedKOLsAll?.length ?? 0) > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-akari-muted mb-2">
                      KOLs in all selected projects: <span className="text-akari-primary font-medium">{competitorsData.sharedKOLsAll!.length}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {competitorsData.sharedKOLsAll!.slice(0, 5).map(handle => (
                        <a
                          key={handle}
                          href={`https://x.com/${handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded-lg bg-akari-primary/20 text-akari-primary border border-akari-primary/30 hover:bg-akari-primary/30 transition text-xs font-medium"
                        >
                          @{handle}
                        </a>
                      ))}
                      {competitorsData.sharedKOLsAll!.length > 5 && (
                        <span className="px-2 py-1 text-xs text-akari-muted">
                          +{competitorsData.sharedKOLsAll!.length - 5} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {(competitorsData.sharedKOLsPartial?.length ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-akari-muted mb-2">
                      KOLs shared by at least 2 projects: <span className="text-akari-primary font-medium">{competitorsData.sharedKOLsPartial!.length}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {competitorsData.sharedKOLsPartial!.slice(0, 8).map(handle => (
                        <a
                          key={handle}
                          href={`https://x.com/${handle}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded-lg bg-akari-cardSoft text-akari-text border border-akari-border/50 hover:border-akari-primary/50 transition text-xs"
                        >
                          @{handle}
                        </a>
                      ))}
                      {competitorsData.sharedKOLsPartial!.length > 8 && (
                        <span className="px-2 py-1 text-xs text-akari-muted">
                          +{competitorsData.sharedKOLsPartial!.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Competitor Overview Table */}
          <section className="mb-8">
            <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">
              Competitor Overview
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-akari-border/70 bg-akari-card">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-akari-border bg-akari-cardSoft text-left text-xs uppercase tracking-wider text-akari-muted">
                    <th className="py-3 px-4">Project</th>
                    <th className="py-3 px-4">Followers</th>
                    <th className="py-3 px-4">AKARI Score</th>
                    <th className="py-3 px-4">Sentiment (30d)</th>
                    <th className="py-3 px-4">CT Heat (30d)</th>
                    <th className="py-3 px-4">Inner Circle Power</th>
                    <th className="py-3 px-4">Freshness</th>
                  </tr>
                </thead>
                <tbody>
                  {competitorsData.projects.map((project) => {
                    const tier = getAkariTier(project.akariScore);
                    const freshness = classifyFreshness(project.lastUpdatedAt);
                    return (
                      <tr key={project.id} className="border-b border-akari-border/60 last:border-0 hover:bg-akari-cardSoft/50 transition-colors">
                        <td className="py-3 px-4">
                          <Link
                            href={`/portal/sentiment/${project.slug}`}
                            className="flex items-center gap-3 group"
                          >
                            <AvatarWithFallback url={project.avatar_url} name={project.name} size="sm" />
                            <div>
                              <p className="font-medium text-akari-text group-hover:text-akari-primary transition">
                                {project.name}
                              </p>
                              <p className="text-xs text-akari-muted">@{project.x_handle}</p>
                            </div>
                          </Link>
                        </td>
                        <td className="py-3 px-4 font-mono text-akari-text">
                          {formatNumber(project.followers)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{project.akariScore ?? '-'}</span>
                            {project.akariScore !== null && (
                              <span className={`rounded-full bg-akari-cardSoft px-2 py-0.5 text-[10px] uppercase tracking-wider ${tier.color}`}>
                                {tier.name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-akari-text">
                          {project.sentiment30d ?? '-'}
                        </td>
                        <td className="py-3 px-4 font-mono text-akari-text">
                          {project.ctHeat30d ?? '-'}
                        </td>
                        <td className="py-3 px-4 font-mono text-akari-text">
                          {project.innerCirclePowerTotal.toFixed(2)}
                        </td>
                        <td className="py-3 px-4">
                          <div
                            className={`inline-flex items-center ${getFreshnessPillClasses(freshness)}`}
                            title={`Last sentiment update: ${formatTimestampForTooltip(project.lastUpdatedAt)}`}
                          >
                            {freshness.label}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Topics Section */}
          <section>
            <h2 className="text-sm uppercase tracking-wider text-akari-muted mb-3">
              Topics & Narratives (30d)
            </h2>
            <div className="space-y-3">
              {competitorsData.projects.map((project) => (
                <div
                  key={project.id}
                  className="rounded-2xl border border-akari-border/70 bg-akari-card p-4"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <AvatarWithFallback url={project.avatar_url} name={project.name} size="sm" />
                    <div>
                      <p className="font-medium text-akari-text">{project.name}</p>
                      <p className="text-xs text-akari-muted">@{project.x_handle}</p>
                    </div>
                  </div>
                  {project.topTopics.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {project.topTopics.map((topic) => (
                        <span
                          key={topic.topic}
                          className="px-3 py-1 rounded-full bg-akari-cardSoft border border-akari-border/50 text-xs font-medium text-akari-text"
                        >
                          {topic.topic} <span className="text-akari-muted">({topic.weightedScore.toFixed(1)})</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-akari-muted">No topic data available</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Empty state */}
      {selectedProjects.length === 0 && !loading && (
        <div className="rounded-2xl border border-akari-border/50 bg-akari-card p-8 text-center">
          <p className="text-akari-muted mb-2">Select projects to start comparing</p>
          <p className="text-xs text-akari-muted">
            Choose 2-5 projects to see their metrics, topics, and shared inner circle members.
          </p>
        </div>
      )}
    </PortalLayout>
  );
}
