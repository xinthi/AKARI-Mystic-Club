import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { PortalLayout } from '../../../components/portal/PortalLayout';
import { useAkariUser } from '../../../lib/akari-auth';
import { canUseDeepExplorer, hasInstitutionalPlus } from '../../../lib/permissions';

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
          
          {/* Placeholder Sections */}
          <section className="space-y-4 mb-6">
            {/* Top Followers */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-akari-text mb-2">Top Followers</h3>
              <p className="text-xs text-akari-muted">
                This section will list the most impactful followers with reach and engagement metrics.
              </p>
            </div>
            
            {/* Engagement Breakdown */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-akari-text mb-2">Engagement Breakdown</h3>
              <p className="text-xs text-akari-muted">
                This section will show how engagement splits across tweets, mentions, and time windows.
              </p>
            </div>
            
            {/* Long Term Sentiment */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-akari-text mb-2">Long Term Sentiment</h3>
              <p className="text-xs text-akari-muted">
                This section will show 90 day sentiment trends with volatility and regime shifts.
              </p>
            </div>
            
            {/* Tweet Clusters */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-akari-text mb-2">Tweet Clusters</h3>
              <p className="text-xs text-akari-muted">
                This section will group tweets into themes so you can see what moves the crowd.
              </p>
            </div>
            
            {/* Exports */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h3 className="text-sm font-semibold text-akari-text mb-2">Exports</h3>
              <div className="flex flex-wrap gap-2 mb-2">
                <button
                  disabled
                  className="px-4 py-2 min-h-[40px] rounded-lg bg-akari-cardSoft/50 text-akari-muted cursor-not-allowed text-sm font-medium opacity-50"
                >
                  Export CSV
                </button>
                <button
                  disabled
                  className="px-4 py-2 min-h-[40px] rounded-lg bg-akari-cardSoft/50 text-akari-muted cursor-not-allowed text-sm font-medium opacity-50"
                >
                  Export inner circle sample
                </button>
              </div>
              <p className="text-xs text-akari-muted">
                Exports will be available for Institutional Plus accounts.
              </p>
            </div>
          </section>
        </>
      )}
    </PortalLayout>
  );
}

