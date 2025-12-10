import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '../../../components/portal/PortalLayout';
import { classifyFreshness, formatTimestampForTooltip, getFreshnessPillClasses } from '../../../lib/portal/data-freshness';
import { useAkariUser } from '../../../lib/akari-auth';
import { can } from '../../../lib/permissions';
import { getUserTier } from '../../../lib/userTier';
import { UpgradeModal } from '../../../components/portal/UpgradeModal';

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

interface MetricsDaily {
  date: string;
  sentiment_score: number | null;
  ct_heat_score: number | null;
  tweet_count: number | null;
  followers: number | null;
  followers_delta?: number | null;
  akari_score: number | null;
}

interface ProjectMetricsHistory {
  slug: string;
  name: string;
  metrics: MetricsDaily[];
}

interface AnalyticsData {
  summary: {
    totalEngagements: number;
    avgEngagementRate: number;
    tweetsCount: number;
    followerChange: number;
    tweetVelocity: number;
    avgSentiment: number;
    officialTweetsCount: number;
    mentionsCount: number;
  };
  dailyEngagement: Array<{
    date: string;
    totalEngagement: number;
    engagementRate: number;
  }>;
}

interface ProjectAnalytics {
  slug: string;
  name: string;
  analytics: AnalyticsData | null;
  loading: boolean;
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
    <div className="relative flex-shrink-0 transition-all duration-300 hover:drop-shadow-[0_0_12px_rgba(0,246,162,0.5)]">
      {!showFallback ? (
        <img
          src={url}
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

// =============================================================================
// CHART COMPONENTS
// =============================================================================

interface ComparisonChartProps {
  title: string;
  data: Array<{ date: string; [key: string]: number | string | null }>;
  projects: Array<{ slug: string; name: string; color: string }>;
  metricKey: string;
  formatValue: (val: number) => string;
}

function ComparisonChart({ title, data, projects, metricKey, formatValue }: ComparisonChartProps) {
  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-akari-border/50 bg-akari-card p-6">
        <h3 className="text-sm font-medium text-akari-text mb-4">{title}</h3>
        <p className="text-xs text-akari-muted text-center py-8">No data available</p>
      </div>
    );
  }

  const width = 800;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  // Get all values for this metric across all projects
  const allValues = data.flatMap(d => 
    projects.map(p => {
      const val = d[`${p.slug}_${metricKey}`];
      return typeof val === 'number' ? val : null;
    }).filter(v => v !== null) as number[]
  );

  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues, 1);
  const range = maxVal - minVal || 1;

  const getX = (index: number) => padding.left + (index / Math.max(data.length - 1, 1)) * innerWidth;
  const getY = (value: number | null) => {
    if (value === null) return padding.top + innerHeight;
    return padding.top + innerHeight - ((value - minVal) / range) * innerHeight;
  };

  // Generate path for each project
  const paths = projects.map(project => {
    const points: string[] = [];
    data.forEach((d, i) => {
      const val = d[`${project.slug}_${metricKey}`];
      if (val !== null && typeof val === 'number') {
        points.push(`${getX(i)},${getY(val)}`);
      }
    });
    if (points.length > 0) {
      return {
        project,
        path: `M ${points.join(' L ')}`,
        points,
      };
    }
    return null;
  }).filter(Boolean) as Array<{ project: typeof projects[0]; path: string; points: string[] }>;

  return (
    <div className="rounded-xl border border-akari-border/50 bg-akari-card p-4">
      <h3 className="text-sm font-medium text-akari-text mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
          {/* Y-axis */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + innerHeight}
            stroke="currentColor"
            strokeWidth={1}
            className="text-akari-border"
          />
          
          {/* X-axis */}
          <line
            x1={padding.left}
            y1={padding.top + innerHeight}
            x2={padding.left + innerWidth}
            y2={padding.top + innerHeight}
            stroke="currentColor"
            strokeWidth={1}
            className="text-akari-border"
          />

          {/* Y-axis labels */}
          <text x={padding.left - 5} y={padding.top} textAnchor="end" className="fill-akari-muted text-[10px]">
            {formatValue(maxVal)}
          </text>
          <text x={padding.left - 5} y={padding.top + innerHeight} textAnchor="end" className="fill-akari-muted text-[10px]">
            {formatValue(minVal)}
          </text>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(t => {
            const y = padding.top + innerHeight - t * innerHeight;
            return (
              <line
                key={t}
                x1={padding.left}
                y1={y}
                x2={padding.left + innerWidth}
                y2={y}
                stroke="currentColor"
                strokeWidth={0.5}
                strokeDasharray="2,2"
                className="text-akari-border/30"
              />
            );
          })}

          {/* Draw lines for each project */}
          {paths.map(({ project, path }) => (
            <g key={project.slug}>
              <path
                d={path}
                fill="none"
                stroke={project.color}
                strokeWidth={2}
                className="transition-opacity hover:opacity-100"
              />
            </g>
          ))}

          {/* Data points */}
          {paths.map(({ project, points }) =>
            points.map((point, i) => {
              const [x, y] = point.split(',').map(Number);
              return (
                <circle
                  key={`${project.slug}-${i}`}
                  cx={x}
                  cy={y}
                  r={3}
                  fill={project.color}
                  className="transition-all hover:r-5"
                />
              );
            })
          )}

          {/* X-axis date labels (show first, middle, last) */}
          {data.length > 0 && (
            <>
              {[0, Math.floor(data.length / 2), data.length - 1].map(idx => {
                if (idx >= data.length) return null;
                const date = new Date(data[idx].date);
                return (
                  <text
                    key={idx}
                    x={getX(idx)}
                    y={height - 10}
                    textAnchor="middle"
                    className="fill-akari-muted text-[9px]"
                  >
                    {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </text>
                );
              })}
            </>
          )}
        </svg>
      </div>
      
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-akari-border/30">
        {projects.map(p => (
          <div key={p.slug} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-xs text-akari-muted">{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE COMPONENT
// =============================================================================

export default function ComparePage() {
  const router = useRouter();
  const akariUser = useAkariUser();
  const canViewAnalytics = can(akariUser.user, 'markets.analytics');
  const userTier = getUserTier(akariUser.user);
  const [upgradeModalState, setUpgradeModalState] = useState<{ open: boolean; targetTier?: 'analyst' | 'institutional_plus' }>({
    open: false,
    targetTier: 'analyst',
  });

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<Array<{ id: string; name: string; slug: string; x_handle: string }>>([]);
  const [competitorsData, setCompetitorsData] = useState<CompetitorsResponse | null>(null);
  const [metricsHistory, setMetricsHistory] = useState<ProjectMetricsHistory[]>([]);
  const [analyticsData, setAnalyticsData] = useState<ProjectAnalytics[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Color palette for projects
  const projectColors = ['#00E5A0', '#FBBF24', '#8B5CF6', '#EF4444', '#3B82F6'];

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
      setMetricsHistory([]);
      setAnalyticsData([]);
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

  // Fetch metrics history for each selected project
  useEffect(() => {
    if (selectedProjects.length < 2) return;

    let cancelled = false;

    async function fetchMetricsHistory() {
      try {
        const historyPromises = selectedProjects.map(async (project) => {
          try {
            const res = await fetch(`/api/portal/sentiment/${project.slug}`);
            const data = await res.json();
            if (data.ok && data.metrics) {
              return {
                slug: project.slug,
                name: project.name,
                metrics: data.metrics as MetricsDaily[],
              };
            }
            return null;
          } catch (err) {
            console.error(`Error fetching metrics for ${project.slug}:`, err);
            return null;
          }
        });

        const histories = await Promise.all(historyPromises);
        if (!cancelled) {
          setMetricsHistory(histories.filter(Boolean) as ProjectMetricsHistory[]);
        }
      } catch (err) {
        console.error('Error fetching metrics history:', err);
      }
    }

    fetchMetricsHistory();

    return () => {
      cancelled = true;
    };
  }, [selectedProjects]);

  // Fetch analytics for head-to-head comparison (2 projects only)
  useEffect(() => {
    if (selectedProjects.length !== 2 || !canViewAnalytics) {
      setAnalyticsData([]);
      return;
    }

    let cancelled = false;

    async function fetchAnalytics() {
      const analyticsPromises = selectedProjects.map(async (project) => {
        try {
          const res = await fetch(`/api/portal/sentiment/${project.slug}/analytics?window=7d`);
          const data = await res.json();
          if (data.ok) {
            return {
              slug: project.slug,
              name: project.name,
              analytics: data as AnalyticsData,
              loading: false,
            };
          }
          return {
            slug: project.slug,
            name: project.name,
            analytics: null,
            loading: false,
          };
        } catch (err) {
          console.error(`Error fetching analytics for ${project.slug}:`, err);
          return {
            slug: project.slug,
            name: project.name,
            analytics: null,
            loading: false,
          };
        }
      });

      const analytics = await Promise.all(analyticsPromises);
      if (!cancelled) {
        setAnalyticsData(analytics);
      }
    }

    fetchAnalytics();

    return () => {
      cancelled = true;
    };
  }, [selectedProjects, canViewAnalytics]);

  // Prepare chart data by aligning dates across projects
  const chartData = useMemo(() => {
    if (metricsHistory.length === 0) return [];

    // Get all unique dates
    const allDates = new Set<string>();
    metricsHistory.forEach(h => {
      h.metrics.forEach(m => allDates.add(m.date));
    });
    const sortedDates = Array.from(allDates).sort();

    // Create aligned data structure
    return sortedDates.map(date => {
      const entry: any = { date };
      metricsHistory.forEach(h => {
        const metric = h.metrics.find(m => m.date === date);
        if (metric) {
          entry[`${h.slug}_akari_score`] = metric.akari_score;
          entry[`${h.slug}_sentiment_score`] = metric.sentiment_score;
          entry[`${h.slug}_ct_heat_score`] = metric.ct_heat_score;
          entry[`${h.slug}_followers`] = metric.followers;
        }
      });
      return entry;
    });
  }, [metricsHistory]);

  const handleAddProject = (slug: string) => {
    if (selectedProjects.length >= 5) return;
    
    const project = projects.find(p => p.slug === slug);
    if (!project) return;

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

  // Get projects with colors for charts
  const projectsWithColors = selectedProjects.map((p, i) => ({
    ...p,
    color: projectColors[i % projectColors.length],
  }));

  return (
    <PortalLayout title="Compare Projects">
      {/* Header */}
      <section className="mb-8">
        <Link
          href="/portal/sentiment"
          className="mb-4 inline-flex items-center gap-1 text-xs text-akari-muted hover:text-akari-primary transition"
        >
          ← Back to Overview
        </Link>
        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.25em] text-akari-muted">
            Competitor Analysis Dashboard
          </p>
          <h1 className="mb-3 text-2xl font-semibold md:text-3xl">
            Compare <span className="text-akari-primary">Projects</span>
          </h1>
          <p className="max-w-2xl text-sm text-akari-muted">
            Select up to 5 projects to compare their metrics, topics, and shared inner circle members.
          </p>
        </div>

        {/* Seer Upgrade Hint Banner */}
        {userTier === 'seer' && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-xs text-blue-300/90">
                You are in Seer mode. Analyst tier unlocks deeper competitor analysis and more frequent compares.
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Link
                  href="/portal/pricing"
                  className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/50 transition text-xs font-medium whitespace-nowrap"
                >
                  View Pricing
                </Link>
                <button
                  onClick={() => setUpgradeModalState({ open: true, targetTier: 'analyst' })}
                  className="px-3 py-1.5 rounded-lg bg-blue-500 text-black hover:opacity-90 transition text-xs font-medium whitespace-nowrap"
                >
                  Request Upgrade
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Project Selection */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-akari-text mb-1">
              Selected Projects
            </h2>
            <p className="text-xs text-akari-muted">
              {selectedProjects.length}/5 projects selected
            </p>
          </div>
          {selectedProjects.length > 0 && (
            <button
              onClick={() => setSelectedProjects([])}
              className="px-3 py-1.5 rounded-lg bg-akari-cardSoft hover:bg-akari-danger/10 text-xs text-akari-muted hover:text-akari-danger transition border border-akari-border/50 hover:border-akari-danger/30"
            >
              Clear All
            </button>
          )}
        </div>

        {/* Selected Projects */}
        {selectedProjects.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-6">
            {selectedProjects.map((project, idx) => {
              const projectData = projects.find(p => p.slug === project.slug);
              return (
                <div
                  key={project.slug}
                  className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-br from-akari-cardSoft to-akari-card border border-akari-border/50 hover:border-akari-primary/30 transition-all shadow-sm hover:shadow-md"
                >
                  <div 
                    className="w-3 h-3 rounded-full flex-shrink-0 shadow-sm" 
                    style={{ backgroundColor: projectColors[idx % projectColors.length] }}
                  />
                  <AvatarWithFallback url={projectData?.avatar_url || null} name={project.name} size="sm" />
                  <div className="flex-1 min-w-0 max-w-[200px]">
                    <p className="text-sm font-medium text-akari-text group-hover:text-akari-primary transition truncate" title={project.name}>
                      {project.name}
                    </p>
                    <p className="text-xs text-akari-muted truncate">@{project.x_handle}</p>
                  </div>
                  <button
                    onClick={() => handleRemoveProject(project.slug)}
                    className="flex-shrink-0 text-akari-muted hover:text-akari-danger transition p-1 hover:bg-akari-danger/10 rounded"
                    title="Remove project"
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
        <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-5">
          <label className="block text-xs font-medium text-akari-text mb-3">
            {canAddMore ? 'Add Another Project' : 'Maximum Reached'}
          </label>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                handleAddProject(e.target.value);
                e.target.value = '';
              }
            }}
            disabled={!canAddMore || loading}
            className="w-full rounded-xl bg-akari-cardSoft border border-akari-border/50 px-4 py-3.5 text-akari-text focus:outline-none focus:ring-2 focus:ring-akari-primary/50 focus:border-akari-primary/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <option value="">
              {canAddMore ? 'Choose a project to add...' : 'Maximum 5 projects selected'}
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
            <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs text-blue-400">
                💡 Select at least <strong>2 projects</strong> to see competitor analysis and comparison charts.
              </p>
            </div>
          )}
          {selectedProjects.length === 0 && (
            <div className="mt-3 p-3 rounded-lg bg-akari-cardSoft/50 border border-akari-border/30">
              <p className="text-xs text-akari-muted">
                Start by selecting your first project above to begin comparing.
              </p>
            </div>
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
          {/* Head-to-Head Comparison for 2 projects */}
          {selectedProjects.length === 2 && competitorsData.projects.length === 2 && (
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-6 rounded-full bg-akari-primary" />
                <h2 className="text-sm uppercase tracking-wider text-akari-muted">
                  Head-to-Head Comparison
                </h2>
              </div>
              <div className="rounded-2xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl overflow-hidden shadow-[0_0_30px_rgba(0,246,162,0.1)]">
                {/* Header Row */}
                <div className="grid grid-cols-5 gap-4 p-5 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5 border-b border-akari-neon-teal/20">
                  <div className="col-span-2 flex items-center gap-3">
                    <AvatarWithFallback 
                      url={competitorsData.projects[0].avatar_url} 
                      name={competitorsData.projects[0].name} 
                      size="md" 
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-akari-text truncate">{competitorsData.projects[0].name}</p>
                      <p className="text-xs text-akari-muted truncate">@{competitorsData.projects[0].x_handle}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-center justify-center px-4 py-3 rounded-xl bg-gradient-neon-teal border border-akari-neon-teal/50 shadow-neon-teal">
                    <p className="text-[10px] uppercase tracking-wider text-black/70 mb-1 font-semibold">Similarity</p>
                    <p className="text-2xl font-bold text-black">
                      {(() => {
                        // Calculate similarity based on shared inner circle
                        if (!competitorsData.projects || competitorsData.projects.length < 2) return '0%';
                        const projA = competitorsData.projects[0];
                        const projB = competitorsData.projects[1];
                        const sharedKOLs = (competitorsData.sharedKOLsAll?.length || 0) + 
                                         (competitorsData.sharedKOLsPartial?.filter(k => 
                                           competitorsData.projects?.some(p => p.x_handle === k)
                                         ).length || 0);
                        const total = projA.innerCircleCount + projB.innerCircleCount;
                        if (total === 0) return '0%';
                        const similarity = Math.round((sharedKOLs * 2 / total) * 100);
                        return `${similarity}%`;
                      })()}
                    </p>
                    <p className="text-[10px] text-black/60 mt-0.5 font-medium">
                      {competitorsData.sharedKOLsAll?.length || 0} common
                    </p>
                  </div>
                  <div className="col-span-2 flex items-center gap-3 justify-end">
                    <div className="flex-1 text-right min-w-0">
                      <p className="font-semibold text-akari-text truncate">{competitorsData.projects[1].name}</p>
                      <p className="text-xs text-akari-muted truncate">@{competitorsData.projects[1].x_handle}</p>
                    </div>
                    <AvatarWithFallback 
                      url={competitorsData.projects[1].avatar_url} 
                      name={competitorsData.projects[1].name} 
                      size="md" 
                    />
                  </div>
                </div>

                {/* Metric Rows */}
                <div className="divide-y divide-akari-neon-teal/10">
                  {/* AKARI Score Row */}
                  <div className="grid grid-cols-5 gap-4 p-5 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5">
                    <div className="col-span-2 bg-gradient-to-r from-akari-neon-teal/10 to-transparent rounded-lg p-3 -mx-2">
                      <p className="font-mono font-bold text-gradient-akari text-base">
                        {competitorsData.projects[0].akariScore ?? '-'}
                      </p>
                    </div>
                    <div className="text-center flex items-center justify-center">
                      <p className="text-xs font-semibold text-gradient-teal uppercase tracking-wider">AKARI Score</p>
                    </div>
                    <div className="col-span-2 text-right bg-gradient-to-l from-akari-neon-teal/10 to-transparent rounded-lg p-3 -mx-2">
                      <p className="font-mono font-bold text-gradient-akari text-base">
                        {competitorsData.projects[1].akariScore ?? '-'}
                      </p>
                    </div>
                  </div>

                  {/* Inner Circle Row */}
                  <div className="grid grid-cols-5 gap-4 p-5 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5">
                    <div className="col-span-2 bg-gradient-to-r from-akari-neon-blue/10 to-transparent rounded-lg p-3 -mx-2">
                      <p className="font-mono text-akari-text text-base font-medium">
                        {competitorsData.projects[0].innerCircleCount}
                      </p>
                    </div>
                    <div className="text-center flex items-center justify-center">
                      <p className="text-xs font-semibold text-gradient-blue uppercase tracking-wider">Inner Circle</p>
                    </div>
                    <div className="col-span-2 text-right bg-gradient-to-l from-akari-neon-blue/10 to-transparent rounded-lg p-3 -mx-2">
                      <p className="font-mono text-akari-text text-base font-medium">
                        {competitorsData.projects[1].innerCircleCount}
                      </p>
                    </div>
                  </div>

                  {/* Circle Power Row */}
                  <div className="grid grid-cols-5 gap-4 p-5 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5">
                    <div className="col-span-2 bg-gradient-to-r from-akari-neon-violet/10 to-transparent rounded-lg p-3 -mx-2">
                      <p className="font-mono text-akari-text text-base font-medium">
                        {competitorsData.projects[0].innerCirclePowerTotal.toFixed(2)}
                      </p>
                    </div>
                    <div className="text-center flex items-center justify-center">
                      <p className="text-xs font-semibold text-gradient-pink uppercase tracking-wider">Circle Power</p>
                    </div>
                    <div className="col-span-2 text-right bg-gradient-to-l from-akari-neon-violet/10 to-transparent rounded-lg p-3 -mx-2">
                      <p className="font-mono text-akari-text text-base font-medium">
                        {competitorsData.projects[1].innerCirclePowerTotal.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Followers Row */}
                  <div className="grid grid-cols-5 gap-4 p-5 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5">
                    <div className="col-span-2 bg-gradient-to-r from-akari-neon-pink/10 to-transparent rounded-lg p-3 -mx-2">
                      <p className={`font-mono font-bold text-base ${competitorsData.projects[0].followers ? 'text-gradient-followers' : 'text-akari-text'}`}>
                        {formatNumber(competitorsData.projects[0].followers)}
                      </p>
                    </div>
                    <div className="text-center flex items-center justify-center">
                      <p className="text-xs font-semibold text-gradient-pink uppercase tracking-wider">Followers</p>
                    </div>
                    <div className="col-span-2 text-right bg-gradient-to-l from-akari-neon-pink/10 to-transparent rounded-lg p-3 -mx-2">
                      <p className={`font-mono font-bold text-base ${competitorsData.projects[1].followers ? 'text-gradient-followers' : 'text-akari-text'}`}>
                        {formatNumber(competitorsData.projects[1].followers)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Metrics Comparison Charts */}
          {chartData.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-6 rounded-full bg-akari-primary" />
                <h2 className="text-sm uppercase tracking-wider text-akari-muted">
                  Metrics Over Time (30 Days)
                </h2>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ComparisonChart
                  title="AKARI Score"
                  data={chartData}
                  projects={projectsWithColors}
                  metricKey="akari_score"
                  formatValue={(v) => Math.round(v).toString()}
                />
                <ComparisonChart
                  title="Sentiment Score (30D)"
                  data={chartData}
                  projects={projectsWithColors}
                  metricKey="sentiment_score"
                  formatValue={(v) => Math.round(v).toString()}
                />
                <ComparisonChart
                  title="CT Heat Score (30D)"
                  data={chartData}
                  projects={projectsWithColors}
                  metricKey="ct_heat_score"
                  formatValue={(v) => Math.round(v).toString()}
                />
                <ComparisonChart
                  title="Followers"
                  data={chartData}
                  projects={projectsWithColors}
                  metricKey="followers"
                  formatValue={(v) => formatNumber(Math.round(v))}
                />
              </div>
            </section>
          )}

          {/* Advanced Analytics (7 Days) - Only for 2 projects and if user has permission */}
          {selectedProjects.length === 2 && canViewAnalytics && analyticsData.length === 2 && (
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-1 h-6 rounded-full bg-akari-primary" />
                <svg className="w-4 h-4 text-akari-primary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                <h2 className="text-sm uppercase tracking-wider text-akari-muted">
                  Advanced Analytics (7 Days)
                </h2>
              </div>
              <div className="rounded-2xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl overflow-hidden shadow-[0_0_30px_rgba(0,246,162,0.1)]">
                {/* Header Row */}
                <div className="grid grid-cols-5 gap-4 p-5 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5 border-b border-akari-neon-teal/20">
                  <div className="col-span-2 flex items-center gap-3">
                    <AvatarWithFallback 
                      url={competitorsData.projects[0].avatar_url} 
                      name={competitorsData.projects[0].name} 
                      size="sm" 
                    />
                    <p className="font-semibold text-akari-text truncate">{competitorsData.projects[0].name}</p>
                  </div>
                  <div className="text-center flex items-center justify-center">
                    <p className="text-xs font-semibold text-gradient-teal uppercase tracking-wider">Metric</p>
                  </div>
                  <div className="col-span-2 flex items-center gap-3 justify-end">
                    <p className="font-semibold text-akari-text truncate">{competitorsData.projects[1].name}</p>
                    <AvatarWithFallback 
                      url={competitorsData.projects[1].avatar_url} 
                      name={competitorsData.projects[1].name} 
                      size="sm" 
                    />
                  </div>
                </div>

                {/* Metric Rows with Dividers */}
                {analyticsData[0]?.analytics && analyticsData[1]?.analytics ? (
                  <div className="divide-y divide-akari-neon-teal/10">
                    {/* Total Engagements Row */}
                    <div className="grid grid-cols-5 gap-4 p-5 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5">
                      <div className="col-span-2 bg-gradient-to-r from-akari-neon-teal/10 to-transparent rounded-lg p-3 -mx-2">
                        <p className="font-mono font-bold text-gradient-akari text-base">
                          {formatNumber(analyticsData[0].analytics.summary.totalEngagements)}
                        </p>
                      </div>
                      <div className="text-center flex items-center justify-center">
                        <p className="text-xs font-semibold text-gradient-teal uppercase tracking-wider">Total Engagements</p>
                      </div>
                      <div className="col-span-2 text-right bg-gradient-to-l from-akari-neon-teal/10 to-transparent rounded-lg p-3 -mx-2">
                        <p className="font-mono font-bold text-gradient-akari text-base">
                          {formatNumber(analyticsData[1].analytics.summary.totalEngagements)}
                        </p>
                      </div>
                    </div>

                    {/* Avg Engagement Rate Row */}
                    <div className="grid grid-cols-5 gap-4 p-5 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5">
                      <div className="col-span-2 bg-gradient-to-r from-akari-neon-blue/10 to-transparent rounded-lg p-3 -mx-2">
                        <p className="font-mono text-akari-text text-base font-medium">
                          {analyticsData[0].analytics.summary.avgEngagementRate.toFixed(2)}/tweet
                        </p>
                      </div>
                      <div className="text-center flex items-center justify-center">
                        <p className="text-xs font-semibold text-gradient-blue uppercase tracking-wider">Avg Engagement Rate</p>
                      </div>
                      <div className="col-span-2 text-right bg-gradient-to-l from-akari-neon-blue/10 to-transparent rounded-lg p-3 -mx-2">
                        <p className="font-mono text-akari-text text-base font-medium">
                          {analyticsData[1].analytics.summary.avgEngagementRate.toFixed(2)}/tweet
                        </p>
                      </div>
                    </div>

                    {/* Tweets (7D) Row */}
                    <div className="grid grid-cols-5 gap-4 p-5 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5">
                      <div className="col-span-2 bg-gradient-to-r from-akari-neon-violet/10 to-transparent rounded-lg p-3 -mx-2">
                        <p className="font-mono text-akari-text text-base font-medium">
                          {analyticsData[0].analytics.summary.tweetsCount}
                        </p>
                      </div>
                      <div className="text-center flex items-center justify-center">
                        <p className="text-xs font-semibold text-gradient-pink uppercase tracking-wider">Tweets (7D)</p>
                      </div>
                      <div className="col-span-2 text-right bg-gradient-to-l from-akari-neon-violet/10 to-transparent rounded-lg p-3 -mx-2">
                        <p className="font-mono text-akari-text text-base font-medium">
                          {analyticsData[1].analytics.summary.tweetsCount}
                        </p>
                      </div>
                    </div>

                    {/* Follower Change Row */}
                    <div className="grid grid-cols-5 gap-4 p-5 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5">
                      <div className="col-span-2 bg-gradient-to-r from-akari-neon-pink/10 to-transparent rounded-lg p-3 -mx-2">
                        <p className={`font-mono text-base font-medium ${analyticsData[0].analytics.summary.followerChange >= 0 ? 'text-akari-primary' : 'text-akari-danger'}`}>
                          {analyticsData[0].analytics.summary.followerChange >= 0 ? '+' : ''}
                          {formatNumber(analyticsData[0].analytics.summary.followerChange)}
                        </p>
                      </div>
                      <div className="text-center flex items-center justify-center">
                        <p className="text-xs font-semibold text-gradient-pink uppercase tracking-wider">Follower Change</p>
                      </div>
                      <div className="col-span-2 text-right bg-gradient-to-l from-akari-neon-pink/10 to-transparent rounded-lg p-3 -mx-2">
                        <p className={`font-mono text-base font-medium ${analyticsData[1].analytics.summary.followerChange >= 0 ? 'text-akari-primary' : 'text-akari-danger'}`}>
                          {analyticsData[1].analytics.summary.followerChange >= 0 ? '+' : ''}
                          {formatNumber(analyticsData[1].analytics.summary.followerChange)}
                        </p>
                      </div>
                    </div>

                    {/* Tweet Velocity Row */}
                    <div className="grid grid-cols-5 gap-4 p-5 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5">
                      <div className="col-span-2 bg-gradient-to-r from-akari-neon-cyan/10 to-transparent rounded-lg p-3 -mx-2">
                        <p className="font-mono text-akari-text text-base font-medium">
                          {analyticsData[0].analytics.summary.tweetVelocity.toFixed(2)}/day
                        </p>
                      </div>
                      <div className="text-center flex items-center justify-center">
                        <p className="text-xs font-semibold text-gradient-blue uppercase tracking-wider">Tweet Velocity</p>
                      </div>
                      <div className="col-span-2 text-right bg-gradient-to-l from-akari-neon-cyan/10 to-transparent rounded-lg p-3 -mx-2">
                        <p className="font-mono text-akari-text text-base font-medium">
                          {analyticsData[1].analytics.summary.tweetVelocity.toFixed(2)}/day
                        </p>
                      </div>
                    </div>

                    {/* Avg Sentiment Row */}
                    <div className="grid grid-cols-5 gap-4 p-5 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5">
                      <div className="col-span-2 bg-gradient-to-r from-akari-neon-pink/10 to-transparent rounded-lg p-3 -mx-2">
                        <p className="font-mono font-bold text-gradient-sentiment text-base">
                          {analyticsData[0].analytics.summary.avgSentiment}
                        </p>
                      </div>
                      <div className="text-center flex items-center justify-center">
                        <p className="text-xs font-semibold text-gradient-pink uppercase tracking-wider">Avg Sentiment</p>
                      </div>
                      <div className="col-span-2 text-right bg-gradient-to-l from-akari-neon-pink/10 to-transparent rounded-lg p-3 -mx-2">
                        <p className="font-mono font-bold text-gradient-sentiment text-base">
                          {analyticsData[1].analytics.summary.avgSentiment}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-xs text-akari-muted">No analytics data available for comparison</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Shared Inner Circle */}
          {((competitorsData.sharedKOLsAll?.length ?? 0) > 0 || (competitorsData.sharedKOLsPartial?.length ?? 0) > 0) && (
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-6 rounded-full bg-akari-primary" />
                <h2 className="text-sm uppercase tracking-wider text-akari-muted">
                  Shared Inner Circle
                </h2>
              </div>
              <div className="rounded-2xl border border-akari-border/70 bg-akari-card p-4">
                {(competitorsData.sharedKOLsAll?.length ?? 0) > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-akari-muted mb-2">
                      KOLs in all selected projects: <span className="text-akari-primary font-medium">{competitorsData.sharedKOLsAll!.length}</span>
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {competitorsData.sharedKOLsAll!.slice(0, 10).map(handle => (
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
                      {competitorsData.sharedKOLsAll!.length > 10 && (
                        <span className="px-2 py-1 text-xs text-akari-muted">
                          +{competitorsData.sharedKOLsAll!.length - 10} more
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
                      {competitorsData.sharedKOLsPartial!.slice(0, 15).map(handle => (
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
                      {competitorsData.sharedKOLsPartial!.length > 15 && (
                        <span className="px-2 py-1 text-xs text-akari-muted">
                          +{competitorsData.sharedKOLsPartial!.length - 15} more
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
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-6 rounded-full bg-akari-primary" />
              <h2 className="text-sm uppercase tracking-wider text-akari-muted">
                Competitor Overview
              </h2>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-akari-neon-teal/20 bg-gradient-to-br from-akari-card/80 to-akari-cardSoft/60 backdrop-blur-xl shadow-[0_0_30px_rgba(0,246,162,0.1)]">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-akari-neon-teal/20 bg-gradient-to-r from-akari-neon-teal/5 via-akari-neon-blue/5 to-akari-neon-teal/5 text-left text-xs uppercase tracking-wider">
                    <th className="py-4 px-5 font-semibold text-gradient-teal">Project</th>
                    <th className="py-4 px-5 font-semibold text-gradient-followers">Followers</th>
                    <th className="py-4 px-5 font-semibold text-gradient-akari">AKARI Score</th>
                    <th className="py-4 px-5 font-semibold text-gradient-sentiment">Sentiment (30d)</th>
                    <th className="py-4 px-5 font-semibold text-gradient-heat">CT Heat (30d)</th>
                    <th className="py-4 px-5 font-semibold text-gradient-blue">Inner Circle Power</th>
                    <th className="py-4 px-5 font-semibold text-akari-muted">Freshness</th>
                  </tr>
                </thead>
                <tbody>
                  {competitorsData.projects.map((project) => {
                    const tier = getAkariTier(project.akariScore);
                    const freshness = classifyFreshness(project.lastUpdatedAt);
                    return (
                      <tr key={project.id} className="border-b border-akari-neon-teal/10 last:border-0 transition-all duration-300 hover:bg-gradient-to-r hover:from-akari-neon-teal/5 hover:via-akari-neon-blue/5 hover:to-akari-neon-teal/5 hover:shadow-[0_0_20px_rgba(0,246,162,0.15)] hover:scale-[1.01] hover:-translate-y-0.5">
                        <td className="py-4 px-5">
                          <Link
                            href={`/portal/sentiment/${project.slug}`}
                            className="flex items-center gap-3 group"
                          >
                            <AvatarWithFallback url={project.avatar_url} name={project.name} size="sm" />
                            <div>
                              <p className="font-semibold text-akari-text group-hover:text-gradient-teal transition-all duration-300">
                                {project.name}
                              </p>
                              <p className="text-xs text-akari-muted">@{project.x_handle}</p>
                            </div>
                          </Link>
                        </td>
                        <td className="py-4 px-5 font-mono font-medium text-gradient-followers text-base">
                          {formatNumber(project.followers)}
                        </td>
                        <td className="py-4 px-5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-gradient-akari text-base">{project.akariScore ?? '-'}</span>
                            {project.akariScore !== null && (
                              <span className={`rounded-full bg-akari-cardSoft px-2.5 py-1 text-[10px] uppercase tracking-wider font-medium border border-akari-neon-teal/30 ${tier.color}`}>
                                {tier.name}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-5 font-mono font-bold text-gradient-sentiment text-base">
                          {project.sentiment30d ?? '-'}
                        </td>
                        <td className="py-4 px-5 font-mono font-bold text-gradient-heat text-base">
                          {project.ctHeat30d ?? '-'}
                        </td>
                        <td className="py-4 px-5 font-mono font-medium text-gradient-blue text-base">
                          {project.innerCirclePowerTotal.toFixed(2)}
                        </td>
                        <td className="py-4 px-5">
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
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-6 rounded-full bg-akari-primary" />
              <h2 className="text-sm uppercase tracking-wider text-akari-muted">
                Topics & Narratives (30d)
              </h2>
            </div>
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

      {/* Upgrade Modal */}
      {akariUser.isLoggedIn && (
        <UpgradeModal
          isOpen={upgradeModalState.open}
          onClose={() => setUpgradeModalState({ open: false })}
          user={akariUser.user}
          targetTier={upgradeModalState.targetTier}
        />
      )}
    </PortalLayout>
  );
}
