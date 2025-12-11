/**
 * ProfileTopProjects Component
 * 
 * Displays the top 5 projects a user has amplified based on their value scores.
 * Part of the "Top Projects You Amplify" feature (Phase 1).
 * 
 * IMPORTANT: This is separate from the Sentiment Terminal.
 * It shows data from user_project_value_scores (based on user's last 200 tweets),
 * NOT the sentiment data (metrics_daily, inner_circle, etc.).
 */

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// =============================================================================
// TYPES
// =============================================================================

export interface TopProjectEntry {
  projectId: string;
  slug: string;
  name: string;
  avatarUrl: string | null;
  tweetCount: number;
  totalEngagement: number;
  valueScore: number;
  lastTweetedAt: string | null;
}

export interface ProfileTopProjectsProps {
  /**
   * User ID to fetch projects for.
   * Pass "me" for the current user.
   */
  userId: string;
  /**
   * Whether to show the sync button (only for current user's own profile).
   */
  showSyncButton?: boolean;
  /**
   * Callback when sync completes.
   */
  onSyncComplete?: () => void;
}

type FetchState = 
  | { status: 'loading' }
  | { status: 'loaded'; projects: TopProjectEntry[] }
  | { status: 'error'; message: string };

// =============================================================================
// HELPERS
// =============================================================================

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// =============================================================================
// COMPONENT
// =============================================================================

export function ProfileTopProjects({ 
  userId, 
  showSyncButton = false,
  onSyncComplete,
}: ProfileTopProjectsProps) {
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Fetch top projects
  const fetchTopProjects = useCallback(async () => {
    setState({ status: 'loading' });
    
    try {
      const res = await fetch(`/api/portal/profile/${userId}/top-projects`);
      const data = await res.json();
      
      if (!data.ok) {
        setState({ status: 'error', message: data.error || 'Failed to fetch top projects' });
        return;
      }
      
      setState({ status: 'loaded', projects: data.projects || [] });
    } catch (error: any) {
      setState({ status: 'error', message: error.message || 'Network error' });
    }
  }, [userId]);

  useEffect(() => {
    fetchTopProjects();
  }, [fetchTopProjects]);

  // Sync handler
  const handleSync = async () => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    setSyncMessage(null);
    
    try {
      const res = await fetch('/api/portal/profile/ct-activity/sync', {
        method: 'POST',
      });
      const data = await res.json();
      
      if (!data.ok) {
        setSyncMessage(`Sync failed: ${data.error}`);
        return;
      }
      
      setSyncMessage(`Synced! ${data.processedTweets} tweets processed, ${data.matchedPairs} project matches.`);
      
      // Refetch top projects after sync
      await fetchTopProjects();
      onSyncComplete?.();
      
      // Clear message after 5 seconds
      setTimeout(() => setSyncMessage(null), 5000);
    } catch (error: any) {
      setSyncMessage(`Sync error: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Value score color based on tier
  const getScoreColor = (score: number): string => {
    if (score >= 500) return 'text-akari-neon-violet';
    if (score >= 200) return 'text-akari-neon-teal';
    if (score >= 100) return 'text-akari-neon-blue';
    return 'text-akari-muted';
  };

  const getScoreBgColor = (score: number): string => {
    if (score >= 500) return 'bg-akari-neon-violet/10 border-akari-neon-violet/30';
    if (score >= 200) return 'bg-akari-neon-teal/10 border-akari-neon-teal/30';
    if (score >= 100) return 'bg-akari-neon-blue/10 border-akari-neon-blue/30';
    return 'bg-akari-cardSoft/30 border-akari-muted/20';
  };

  return (
    <div className="neon-card neon-hover p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm uppercase tracking-wider font-semibold text-gradient-teal">
          Top Projects You Amplify
        </h2>
        {showSyncButton && (
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="text-xs px-3 py-1.5 rounded-full bg-akari-cardSoft/50 border border-akari-neon-teal/20 text-akari-muted hover:text-akari-text hover:border-akari-neon-teal/40 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isSyncing ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border border-akari-neon-teal border-t-transparent" />
                Syncing...
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Sync recent X activity
              </>
            )}
          </button>
        )}
      </div>
      <p className="text-xs text-akari-muted mb-4">Based on your last 200 tweets</p>

      {/* Sync message */}
      {syncMessage && (
        <div className={`text-xs mb-4 px-3 py-2 rounded-lg ${
          syncMessage.includes('failed') || syncMessage.includes('error')
            ? 'bg-red-500/10 border border-red-500/30 text-red-400'
            : 'bg-akari-neon-teal/10 border border-akari-neon-teal/30 text-akari-neon-teal'
        }`}>
          {syncMessage}
        </div>
      )}

      {/* Loading state */}
      {state.status === 'loading' && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="animate-pulse flex items-center gap-3 p-3 rounded-lg bg-akari-cardSoft/30">
              <div className="w-10 h-10 rounded-full bg-akari-muted/20" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 bg-akari-muted/20 rounded" />
                <div className="h-3 w-32 bg-akari-muted/10 rounded" />
              </div>
              <div className="h-6 w-16 bg-akari-muted/20 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {state.status === 'error' && (
        <div className="py-8 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-500/10 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-sm text-red-400">{state.message}</p>
        </div>
      )}

      {/* Empty state */}
      {state.status === 'loaded' && state.projects.length === 0 && (
        <div className="py-8 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-neon-teal/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-akari-neon-teal/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <p className="text-sm font-medium text-akari-muted mb-2">
            No recent CT activity yet
          </p>
          <p className="text-xs text-akari-muted/70 max-w-xs mx-auto mb-4">
            We do not have enough recent CT activity yet. Once you tweet about tracked projects with your linked X account, this section will unlock.
          </p>
          {showSyncButton && (
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="text-xs px-4 py-2 rounded-full bg-gradient-neon-teal text-black font-medium hover:shadow-neon-teal transition-all duration-300 disabled:opacity-50"
            >
              {isSyncing ? 'Syncing...' : 'Sync My X Activity'}
            </button>
          )}
        </div>
      )}

      {/* Projects list */}
      {state.status === 'loaded' && state.projects.length > 0 && (
        <div className="space-y-2">
          {state.projects.map((project, index) => (
            <Link
              key={project.projectId}
              href={`/portal/sentiment/${project.slug}`}
              className="flex items-center gap-3 p-3 rounded-lg bg-akari-cardSoft/20 border border-transparent hover:border-akari-neon-teal/20 hover:bg-akari-cardSoft/40 transition-all duration-300 group"
            >
              {/* Rank */}
              <div className="w-6 h-6 flex items-center justify-center text-xs font-bold text-akari-muted/50">
                #{index + 1}
              </div>

              {/* Avatar */}
              <div className="w-10 h-10 rounded-full overflow-hidden bg-akari-cardSoft/50 flex-shrink-0">
                {project.avatarUrl ? (
                  <img
                    src={project.avatarUrl}
                    alt={project.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/placeholder-avatar.png';
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-lg font-bold text-akari-muted">
                    {project.name.charAt(0)}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-akari-text truncate group-hover:text-akari-neon-teal transition-colors">
                    {project.name}
                  </span>
                  <span className="text-xs text-akari-muted">@{project.slug}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-akari-muted/70 mt-0.5">
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                    {project.tweetCount} tweets
                  </span>
                  <span className="flex items-center gap-1">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
                    </svg>
                    {formatNumber(project.totalEngagement)}
                  </span>
                  {project.lastTweetedAt && (
                    <span>
                      Last: {formatDate(project.lastTweetedAt)}
                    </span>
                  )}
                </div>
              </div>

              {/* Value Score Badge */}
              <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${getScoreBgColor(project.valueScore)}`}>
                <span className={getScoreColor(project.valueScore)}>
                  {formatNumber(project.valueScore)}
                </span>
                <span className="text-akari-muted ml-1">pts</span>
              </div>

              {/* Arrow */}
              <svg 
                className="w-4 h-4 text-akari-muted/30 group-hover:text-akari-neon-teal group-hover:translate-x-0.5 transition-all" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}

      {/* Info note */}
      {state.status === 'loaded' && state.projects.length > 0 && (
        <p className="text-[10px] text-akari-muted/50 mt-4 text-center">
          Value = (tweets × 10) + likes + (replies × 3) + (retweets × 2)
        </p>
      )}
    </div>
  );
}
