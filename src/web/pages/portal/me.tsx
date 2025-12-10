/**
 * Personal Profile Page - /portal/me
 * 
 * Shows the logged-in user's own X profile sentiment insights.
 * This is a thin wrapper that handles:
 * - Loading/error/not-tracked states
 * - Passing data to profile components
 * 
 * DO NOT modify MiniApp code or sentiment formulas.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { useAkariUser } from '@/lib/akari-auth';
import { can, PersonaType, PersonaTag, Role, canUseDeepExplorer, hasInstitutionalPlus } from '@/lib/permissions';
import type { AccessRequestStatus } from '@/lib/types/access-requests';

// Profile components
import {
  ProfileHeader,
  ProfileStatsRow,
  ProfileSignalChart,
  ProfileSocialConnections,
  ProfileReviews,
  ProfilePersonaSelector,
  ProfileZoneOfExpertise,
  ProfileClubOrbit,
  ProfileInnerCircleList,
  ProfileZoneAdvice,
  ProfileDeepExplorerAccess,
  MetricsChange24h,
  InnerCircleSummary,
  MetricsDaily,
  TopicScore,
  OrbitMember,
  InnerCircleEntry,
} from '@/components/portal/profile';

// =============================================================================
// TYPES
// =============================================================================

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

interface DailyEngagement {
  date: string;
  likes: number;
  retweets: number;
  replies: number;
  totalEngagement: number;
  tweetCount: number;
  engagementRate: number;
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

/**
 * Influencer data from the inner circle
 */
interface InfluencerData {
  id: string;
  x_handle: string;
  name: string | null;
  avatar_url: string | null;
  followers: number | null;
  akari_score: number | null;
  credibility_score: number | null;
  avg_sentiment_30d: number | null;
}

interface MyProfileData {
  project: ProjectDetail;
  akariScore: number | null;
  tier: { name: string; color: string; bgColor: string };
  sentimentScore: number | null;
  ctHeatScore: number | null;
  followers: number | null;
  changes24h: MetricsChange24h | null;
  innerCircle: InnerCircleSummary;
  metricsHistory: MetricsDaily[];
  tweets: ProjectTweet[];
  analytics: {
    summary: AnalyticsSummary;
    dailyEngagement: DailyEngagement[];
    tweetBreakdown: TweetBreakdown[];
  } | null;
  // Zone of Expertise topic scores
  topics30d: TopicScore[];
  // Inner circle members for orbit and list views
  influencers: InfluencerData[];
}

type ProfileStatus = 
  | { status: 'loading' }
  | { status: 'not_logged_in' }
  | { status: 'no_x_linked' }
  | { status: 'not_tracked'; xHandle: string }
  | { status: 'tracking'; xHandle: string }
  | { status: 'loaded'; data: MyProfileData; canCompare: boolean }
  | { status: 'error'; message: string };

// =============================================================================
// HELPERS
// =============================================================================

function getAkariTier(score: number | null): { name: string; color: string; bgColor: string } {
  if (score === null) return { name: 'Unranked', color: 'text-akari-muted', bgColor: 'bg-akari-cardSoft/50' };
  if (score >= 900) return { name: 'Celestial', color: 'text-akari-neon-violet', bgColor: 'bg-akari-neon-violet/15' };
  if (score >= 750) return { name: 'Vanguard', color: 'text-akari-neon-teal', bgColor: 'bg-akari-neon-teal/15' };
  if (score >= 550) return { name: 'Ranger', color: 'text-akari-neon-blue', bgColor: 'bg-akari-neon-blue/15' };
  if (score >= 400) return { name: 'Nomad', color: 'text-akari-neon-pink', bgColor: 'bg-akari-neon-pink/15' };
  return { name: 'Shadow', color: 'text-akari-muted', bgColor: 'bg-akari-cardSoft/50' };
}

/**
 * Shape influencer data into OrbitMember for the bubble cluster.
 * Picks top ~20 members by "power" metric (akari_score * followers engagement).
 */
function shapeOrbitMembers(
  influencers: InfluencerData[],
  userAkariScore: number | null,
  userFollowers: number | null
): OrbitMember[] {
  if (!influencers || influencers.length === 0) return [];
  
  // Calculate power for each influencer (composite metric)
  const withPower = influencers.map(inf => {
    const akari = inf.akari_score ?? 0;
    const followers = inf.followers ?? 0;
    const sentiment = inf.avg_sentiment_30d ?? 50;
    // Power = weighted combination of metrics
    const power = akari * 0.5 + Math.log10(followers + 1) * 20 + sentiment * 0.3;
    return { ...inf, power };
  });
  
  // Sort by power and take top 20
  withPower.sort((a, b) => b.power - a.power);
  const top20 = withPower.slice(0, 20);
  
  // Find max power for normalization
  const maxPower = Math.max(...top20.map(m => m.power), 1);
  
  // Determine role: hero if their followers or akari > user's
  const myAkari = userAkariScore ?? 0;
  const myFollowers = userFollowers ?? 0;
  
  return top20.map(inf => ({
    handle: inf.x_handle,
    avatarUrl: inf.avatar_url,
    akariScore: inf.akari_score,
    followers: inf.followers,
    interactionWeight: inf.power / maxPower, // 0-1 normalized
    role: (
      (inf.akari_score ?? 0) > myAkari || 
      (inf.followers ?? 0) > myFollowers
    ) ? 'hero' : 'player',
  }));
}

/**
 * Shape influencer data into InnerCircleEntry for the list view.
 * Uses same underlying data as orbit, expanded with CT Heat.
 */
function shapeInnerCircleEntries(
  influencers: InfluencerData[],
  userAkariScore: number | null,
  userFollowers: number | null
): InnerCircleEntry[] {
  if (!influencers || influencers.length === 0) return [];
  
  const myAkari = userAkariScore ?? 0;
  const myFollowers = userFollowers ?? 0;
  
  return influencers.map(inf => ({
    handle: inf.x_handle,
    avatarUrl: inf.avatar_url,
    akariScore: inf.akari_score,
    ctHeat: inf.avg_sentiment_30d, // Using sentiment as CT Heat proxy
    followers: inf.followers,
    role: (
      (inf.akari_score ?? 0) > myAkari || 
      (inf.followers ?? 0) > myFollowers
    ) ? 'hero' : 'player',
  }));
}

// =============================================================================
// DATA FETCHING
// =============================================================================

async function checkProjectExists(xHandle: string): Promise<{ exists: boolean; slug?: string }> {
  try {
    const slug = xHandle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const res = await fetch(`/api/portal/sentiment/${slug}`);
    const data = await res.json();
    if (data.ok && data.project) {
      return { exists: true, slug: data.project.slug };
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

async function trackProfile(xHandle: string): Promise<{ success: boolean; slug?: string; error?: string }> {
  try {
    const res = await fetch('/api/portal/sentiment/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: xHandle }),
    });
    const data = await res.json();
    if (data.ok && data.project) {
      return { success: true, slug: data.project.slug };
    }
    return { success: false, error: data.error || 'Failed to track profile' };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error' };
  }
}

async function fetchSentimentData(slug: string): Promise<{
  project: ProjectDetail;
  metrics: MetricsDaily[];
  latestMetrics: MetricsDaily | null;
  changes24h: MetricsChange24h | null;
  tweets: ProjectTweet[];
  innerCircle: InnerCircleSummary;
  topics30d: TopicScore[];
  influencers: InfluencerData[];
} | null> {
  try {
    const res = await fetch(`/api/portal/sentiment/${slug}`);
    const data = await res.json();
    if (!data.ok) return null;
    return {
      project: data.project,
      metrics: data.metrics || [],
      latestMetrics: data.latestMetrics || null,
      changes24h: data.changes24h || null,
      tweets: data.tweets || [],
      innerCircle: data.innerCircle || { count: 0, power: 0 },
      topics30d: data.topics30d || [],
      influencers: data.influencers || [],
    };
  } catch {
    return null;
  }
}

async function fetchAnalyticsData(slug: string, window: '7d' | '30d' = '30d'): Promise<{
  summary: AnalyticsSummary;
  dailyEngagement: DailyEngagement[];
  tweetBreakdown: TweetBreakdown[];
} | null> {
  try {
    const res = await fetch(`/api/portal/sentiment/${slug}/analytics?window=${window}`);
    const data = await res.json();
    if (!data.ok) return null;
    return {
      summary: data.summary,
      dailyEngagement: data.dailyEngagement || [],
      tweetBreakdown: data.tweetBreakdown || [],
    };
  } catch {
    return null;
  }
}

// =============================================================================
// CUSTOM HOOK: useMyProfile
// =============================================================================

function useMyProfile() {
  const { 
    user, 
    isLoading: authLoading, 
    isLoggedIn, 
    xUsername,
    personaType,
    personaTag,
    telegramConnected,
    roles,
  } = useAkariUser();
  const [profileState, setProfileState] = useState<ProfileStatus>({ status: 'loading' });
  const [isTracking, setIsTracking] = useState(false);
  
  // Local persona state (synced with saved values, but can be overridden after save)
  const [localPersonaType, setLocalPersonaType] = useState<PersonaType>(personaType);
  const [localPersonaTag, setLocalPersonaTag] = useState<PersonaTag | null>(personaTag);
  
  // Sync local state when saved values change
  useEffect(() => {
    setLocalPersonaType(personaType);
    setLocalPersonaTag(personaTag);
  }, [personaType, personaTag]);
  
  const canCompare = can(user, 'sentiment.compare');
  
  const loadProfile = useCallback(async () => {
    if (authLoading) {
      setProfileState({ status: 'loading' });
      return;
    }
    
    if (!isLoggedIn || !user) {
      setProfileState({ status: 'not_logged_in' });
      return;
    }
    
    if (!xUsername) {
      setProfileState({ status: 'no_x_linked' });
      return;
    }
    
    setProfileState({ status: 'loading' });
    const { exists, slug } = await checkProjectExists(xUsername);
    
    if (!exists) {
      setProfileState({ status: 'not_tracked', xHandle: xUsername });
      return;
    }
    
    const [sentimentData, analyticsData] = await Promise.all([
      fetchSentimentData(slug!),
      fetchAnalyticsData(slug!, '30d'),
    ]);
    
    if (!sentimentData) {
      setProfileState({ status: 'error', message: 'Failed to load profile data' });
      return;
    }
    
    const latestMetrics = sentimentData.latestMetrics;
    const akariScore = latestMetrics?.akari_score ?? null;
    
    const profileData: MyProfileData = {
      project: sentimentData.project,
      akariScore,
      tier: getAkariTier(akariScore),
      sentimentScore: latestMetrics?.sentiment_score ?? null,
      ctHeatScore: latestMetrics?.ct_heat_score ?? null,
      followers: latestMetrics?.followers ?? null,
      changes24h: sentimentData.changes24h,
      innerCircle: sentimentData.innerCircle,
      metricsHistory: sentimentData.metrics,
      tweets: sentimentData.tweets,
      analytics: analyticsData,
      topics30d: sentimentData.topics30d,
      influencers: sentimentData.influencers,
    };
    
    setProfileState({ status: 'loaded', data: profileData, canCompare });
  }, [authLoading, isLoggedIn, user, xUsername, canCompare]);
  
  useEffect(() => {
    loadProfile();
  }, [loadProfile]);
  
  const trackMyProfile = useCallback(async () => {
    if (!xUsername || isTracking) return;
    
    setIsTracking(true);
    setProfileState({ status: 'tracking', xHandle: xUsername });
    
    const result = await trackProfile(xUsername);
    
    if (result.success) {
      await loadProfile();
    } else {
      setProfileState({ status: 'error', message: result.error || 'Failed to track profile' });
    }
    
    setIsTracking(false);
  }, [xUsername, isTracking, loadProfile]);
  
  // Handle persona save success
  const handlePersonaSaveSuccess = useCallback((newType: PersonaType, newTag: PersonaTag | null) => {
    setLocalPersonaType(newType);
    setLocalPersonaTag(newTag);
  }, []);
  
  return {
    profileState,
    trackMyProfile,
    isTracking,
    refresh: loadProfile,
    // User info
    roles: roles as Role[],
    xUsername,
    // Persona (local state that updates after save)
    personaType: localPersonaType,
    personaTag: localPersonaTag,
    savedPersonaType: personaType,
    savedPersonaTag: personaTag,
    telegramConnected,
    onPersonaSaveSuccess: handlePersonaSaveSuccess,
  };
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function MyProfilePage() {
  const router = useRouter();
  const { 
    profileState, 
    trackMyProfile, 
    isTracking, 
    refresh,
    roles,
    xUsername,
    personaType,
    personaTag,
    savedPersonaType,
    savedPersonaTag,
    telegramConnected,
    onPersonaSaveSuccess,
  } = useMyProfile();
  const akariUser = useAkariUser();
  
  // Deep Explorer access state
  const [deepRequestStatus, setDeepRequestStatus] = useState<AccessRequestStatus | null>(null);
  
  // Compute access status
  const hasDeepAccess = canUseDeepExplorer(akariUser.user);
  const hasInstitutionalPlusAccess = hasInstitutionalPlus(akariUser.user);
  
  // Redirect if not logged in
  useEffect(() => {
    if (profileState.status === 'not_logged_in') {
      router.push('/portal/sentiment');
    }
  }, [profileState.status, router]);
  
  const pageTitle = profileState.status === 'loaded' 
    ? `@${profileState.data.project.x_handle} - My Profile`
    : 'My Profile';
  
  return (
    <PortalLayout title="My Profile">
      <Head>
        <title>{pageTitle} – Akari Mystic Club</title>
      </Head>
      
      <div className="px-4 py-4 md:px-6 lg:px-10 space-y-8">
        {/* Loading State */}
        {(profileState.status === 'loading' || profileState.status === 'tracking') && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="h-12 w-12 animate-spin rounded-full border-2 border-akari-neon-teal border-t-transparent mb-6 shadow-neon-teal" />
            <p className="text-base text-akari-muted font-medium">
              {profileState.status === 'tracking' ? 'Tracking your profile...' : 'Loading your mystic profile...'}
            </p>
          </div>
        )}
        
        {/* No X Account Linked */}
        {profileState.status === 'no_x_linked' && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-24 h-24 rounded-full bg-gradient-neon-teal flex items-center justify-center mb-8 shadow-neon-teal">
              <svg className="w-12 h-12 text-black" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-3 text-gradient-neon">Connect X to see your Mystic profile</h2>
            <p className="text-base text-akari-muted text-center max-w-md mb-8 leading-relaxed">
              Link your X (Twitter) account to view your personal sentiment insights, AKARI score, and inner circle analytics.
            </p>
            <Link
              href="/portal/sentiment"
              className="pill-neon px-6 py-3 min-h-[44px] bg-akari-cardSoft/50 border border-akari-neon-teal/30 text-akari-text hover:border-akari-neon-teal/60 hover:bg-akari-neon-teal/5 hover:shadow-[0_0_12px_rgba(0,246,162,0.2)] transition-all duration-300 font-semibold"
            >
              ← Back to Sentiment
            </Link>
          </div>
        )}
        
        {/* Profile Not Tracked Yet */}
        {profileState.status === 'not_tracked' && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-24 h-24 rounded-full bg-gradient-neon-teal flex items-center justify-center mb-8 shadow-neon-teal">
              <svg className="w-12 h-12 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-3 text-gradient-neon">Start Tracking Your Profile</h2>
            <p className="text-base text-akari-muted text-center max-w-md mb-8 leading-relaxed">
              Your X account <span className="text-gradient-teal font-semibold">{profileState.xHandle}</span> is not tracked yet in AKARI Mystic. 
              Track it to see your sentiment insights, AKARI score, and inner circle.
            </p>
            <button
              onClick={trackMyProfile}
              disabled={isTracking}
              className="pill-neon flex items-center gap-2 px-8 py-3.5 min-h-[48px] bg-gradient-neon-teal text-black font-semibold hover:shadow-akari-glow transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTracking ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  Tracking...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Track my X profile in AKARI Mystic
                </>
              )}
            </button>
            <Link
              href="/portal/sentiment"
              className="mt-6 text-sm text-akari-muted hover:text-gradient-teal transition-all duration-300 min-h-[40px] flex items-center font-medium"
            >
              ← Back to Sentiment
            </Link>
          </div>
        )}
        
        {/* Error State */}
        {profileState.status === 'error' && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-24 h-24 rounded-full bg-red-500/20 border-2 border-red-500/30 flex items-center justify-center mb-8">
              <svg className="w-12 h-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-3 text-gradient-neon">Something went wrong</h2>
            <p className="text-base text-akari-muted text-center max-w-md mb-8 leading-relaxed">{profileState.message}</p>
            <button
              onClick={refresh}
              className="pill-neon px-6 py-3 min-h-[44px] bg-akari-cardSoft/50 border border-akari-neon-teal/30 text-akari-text hover:border-akari-neon-teal/60 hover:bg-akari-neon-teal/5 hover:shadow-[0_0_12px_rgba(0,246,162,0.2)] transition-all duration-300 font-semibold"
            >
              Try Again
            </button>
          </div>
        )}
        
        {/* ============================================================= */}
        {/* PROFILE LOADED - RENDER COMPONENTS                            */}
        {/* ============================================================= */}
        {profileState.status === 'loaded' && (
          <>
            {/* Section 1: Header */}
            <ProfileHeader
              displayName={profileState.data.project.name}
              xUsername={profileState.data.project.x_handle}
              avatarUrl={profileState.data.project.twitter_profile_image_url || profileState.data.project.avatar_url}
              bio={profileState.data.project.bio}
              roles={roles}
              personaType={personaType}
              akariScore={profileState.data.akariScore}
              tier={profileState.data.tier}
              canCompare={profileState.canCompare}
              slug={profileState.data.project.slug}
              onRefresh={refresh}
              sentimentScore={profileState.data.sentimentScore}
              ctHeatScore={profileState.data.ctHeatScore}
              innerCirclePower={profileState.data.innerCircle.power}
            />
            
            {/* Section 2: Stats Row */}
            <ProfileStatsRow
              akariScore={profileState.data.akariScore}
              tier={profileState.data.tier}
              sentimentScore={profileState.data.sentimentScore}
              ctHeatScore={profileState.data.ctHeatScore}
              followers={profileState.data.followers}
              innerCircle={profileState.data.innerCircle}
              changes24h={profileState.data.changes24h}
            />
            
            {/* Section 3: Signal Chart (30D) */}
            <ProfileSignalChart
              metricsHistory={profileState.data.metricsHistory}
              onRefresh={refresh}
            />
            
            {/* Section 4: Zone of Expertise + Club Orbit */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <ProfileZoneOfExpertise topics={profileState.data.topics30d} />
              <ProfileClubOrbit 
                orbit={shapeOrbitMembers(
                  profileState.data.influencers,
                  profileState.data.akariScore,
                  profileState.data.followers
                )} 
              />
            </section>
            
            {/* Section 5: Zone Advice */}
            <section className="mt-6">
              <ProfileZoneAdvice
                topics={profileState.data.topics30d}
                innerCircle={shapeInnerCircleEntries(
                  profileState.data.influencers,
                  profileState.data.akariScore,
                  profileState.data.followers
                )}
              />
            </section>
            
            {/* Section 5.5: Deep Explorer Access */}
            <section className="mt-6">
              <ProfileDeepExplorerAccess
                hasDeepAccess={hasDeepAccess}
                hasInstitutionalPlus={hasInstitutionalPlusAccess}
                pendingRequestStatus={deepRequestStatus}
                onRequestSubmitted={() => setDeepRequestStatus('pending')}
              />
            </section>
            
            {/* Section 6: Inner Circle List */}
            <section className="mt-6">
              <ProfileInnerCircleList 
                entries={shapeInnerCircleEntries(
                  profileState.data.influencers,
                  profileState.data.akariScore,
                  profileState.data.followers
                )} 
              />
            </section>
            
            {/* Section 7: Social Connections + Reviews */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ProfileSocialConnections
                xConnected={!!xUsername}
                telegramConnected={telegramConnected}
              />
              <ProfileReviews
                telegramConnected={telegramConnected}
              />
            </section>
            
            {/* Section 8: Mystic Identity Selector */}
            <ProfilePersonaSelector
              savedPersonaType={savedPersonaType}
              savedPersonaTag={savedPersonaTag}
              onSaveSuccess={onPersonaSaveSuccess}
            />
            
            {/* Debug info (dev only) */}
            {process.env.NODE_ENV === 'development' && (
              <section className="bg-yellow-500/5 border border-yellow-500/30 rounded-2xl p-4 text-xs">
                <p className="font-mono text-yellow-400 mb-2">🛠️ Debug Info (dev only)</p>
                <pre className="text-slate-500 overflow-auto">
{JSON.stringify({
  canCompare: profileState.canCompare,
  userRoles: akariUser.user?.effectiveRoles,
  projectSlug: profileState.data.project.slug,
  metricsCount: profileState.data.metricsHistory.length,
  savedPersonaType,
  savedPersonaTag,
  localPersonaType: personaType,
  localPersonaTag: personaTag,
  telegramConnected,
}, null, 2)}
                </pre>
              </section>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
}
