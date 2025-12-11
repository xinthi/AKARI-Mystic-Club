/**
 * User CT Activity Service
 * 
 * Handles fetching user tweets and matching them to tracked projects.
 * This is the data pipeline for the "Top Projects You Amplify" feature.
 * 
 * IMPORTANT: This is separate from the Sentiment Terminal.
 * It does NOT use or modify:
 * - metrics_daily
 * - project_tweets
 * - inner_circle logic
 * - Akari Score, Sentiment, CT Heat formulas
 * 
 * It only uses:
 * - User identity (X link)
 * - Projects table (for matching)
 * - twitterapi.io client
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { taioGetUserLastTweets, ITweet } from './twitterapiio';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_SOURCE_WINDOW = 'last_200_tweets';
const DEFAULT_MAX_TWEETS = 200;

// =============================================================================
// TYPES
// =============================================================================

interface TrackedProject {
  id: string;
  slug: string;
  x_handle: string;
  name: string;
}

interface TweetProjectMatch {
  tweet: ITweet;
  projects: TrackedProject[];
}

interface SyncResult {
  ok: boolean;
  processedTweets: number;
  matchedPairs: number;
  error?: string;
}

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

function getSupabaseAdmin(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// =============================================================================
// PROJECT MATCHING
// =============================================================================

/**
 * Build a map of patterns to match against tweets.
 * Patterns include: @handle, $SYMBOL (if name looks like a ticker), handle without @
 */
function buildProjectMatchPatterns(projects: TrackedProject[]): Map<RegExp, TrackedProject[]> {
  const patternMap = new Map<RegExp, TrackedProject[]>();
  
  for (const project of projects) {
    const handle = project.x_handle.toLowerCase();
    const name = project.name.toLowerCase();
    
    // Primary pattern: @handle (mention)
    // This is case-insensitive matching
    const mentionPattern = new RegExp(`@${escapeRegex(handle)}\\b`, 'i');
    addToPatternMap(patternMap, mentionPattern, project);
    
    // Secondary pattern: handle without @ (for cashtags like $btc or plain text mentions)
    // Only if handle is reasonably short (likely a ticker)
    if (handle.length <= 10) {
      const plainPattern = new RegExp(`\\b${escapeRegex(handle)}\\b`, 'i');
      addToPatternMap(patternMap, plainPattern, project);
    }
    
    // If project name is short (likely a token), also match $NAME cashtag
    if (name.length <= 10 && name !== handle) {
      const cashtagPattern = new RegExp(`\\$${escapeRegex(name)}\\b`, 'i');
      addToPatternMap(patternMap, cashtagPattern, project);
    }
  }
  
  return patternMap;
}

function addToPatternMap(
  map: Map<RegExp, TrackedProject[]>,
  pattern: RegExp,
  project: TrackedProject
): void {
  const key = pattern.source;
  for (const [existingPattern, projects] of map.entries()) {
    if (existingPattern.source === key) {
      projects.push(project);
      return;
    }
  }
  map.set(pattern, [project]);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match a tweet against tracked projects.
 * Returns all projects that are mentioned in the tweet.
 */
function matchTweetToProjects(
  tweet: ITweet,
  patternMap: Map<RegExp, TrackedProject[]>
): TrackedProject[] {
  const text = tweet.text.toLowerCase();
  const matchedProjects = new Set<string>(); // track by project ID to dedupe
  const results: TrackedProject[] = [];
  
  for (const [pattern, projects] of patternMap.entries()) {
    if (pattern.test(text)) {
      for (const project of projects) {
        if (!matchedProjects.has(project.id)) {
          matchedProjects.add(project.id);
          results.push(project);
        }
      }
    }
  }
  
  return results;
}

// =============================================================================
// MAIN SYNC FUNCTION
// =============================================================================

/**
 * Sync a user's CT activity from their last N tweets.
 * 
 * This is separate from the Sentiment Terminal and does NOT use time-based windows.
 * It simply fetches the user's last `maxTweets` tweets and matches them to projects.
 * 
 * @param userId - AKARI user ID (UUID)
 * @param maxTweets - Maximum number of tweets to fetch (default: 200)
 */
export async function syncUserCtActivityFromLastTweets(
  userId: string,
  maxTweets: number = DEFAULT_MAX_TWEETS
): Promise<SyncResult> {
  console.log(`[UserCtActivity] Starting sync for user ${userId}, max tweets: ${maxTweets}`);
  
  const supabase = getSupabaseAdmin();
  
  try {
    // 1. Get user's X identity
    const { data: xIdentity, error: identityError } = await supabase
      .from('akari_user_identities')
      .select('provider_user_id, username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .single();
    
    if (identityError || !xIdentity) {
      console.error('[UserCtActivity] No X identity found for user:', userId);
      return {
        ok: false,
        processedTweets: 0,
        matchedPairs: 0,
        error: 'No X account linked',
      };
    }
    
    const xUserId = xIdentity.provider_user_id;
    const xUsername = xIdentity.username;
    
    if (!xUsername) {
      return {
        ok: false,
        processedTweets: 0,
        matchedPairs: 0,
        error: 'X username not found in identity',
      };
    }
    
    console.log(`[UserCtActivity] Found X identity: @${xUsername} (${xUserId})`);
    
    // 2. Get all tracked projects
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, slug, x_handle, name')
      .eq('is_active', true);
    
    if (projectsError || !projects || projects.length === 0) {
      console.error('[UserCtActivity] No tracked projects found');
      return {
        ok: false,
        processedTweets: 0,
        matchedPairs: 0,
        error: 'No tracked projects available',
      };
    }
    
    console.log(`[UserCtActivity] Loaded ${projects.length} tracked projects`);
    
    // 3. Build pattern map for matching
    const patternMap = buildProjectMatchPatterns(projects);
    
    // 4. Fetch user's last N tweets (fixed count, NOT time-based)
    const allTweets: ITweet[] = [];
    let cursor: string | null = null;
    let pagesProcessed = 0;
    const maxPages = Math.ceil(maxTweets / 20) + 1; // Estimate pages needed
    
    while (allTweets.length < maxTweets && pagesProcessed < maxPages) {
      const result = await taioGetUserLastTweets(xUsername, cursor ?? undefined);
      
      if (result.tweets.length === 0) {
        break;
      }
      
      // Add tweets (skip retweets - we only want original content)
      for (const tweet of result.tweets) {
        if (allTweets.length >= maxTweets) break;
        
        // Skip retweets (we only want original content)
        if (!tweet.isRetweet) {
          allTweets.push(tweet);
        }
      }
      
      pagesProcessed++;
      cursor = result.nextCursor;
      
      if (!cursor) {
        break;
      }
    }
    
    console.log(`[UserCtActivity] Fetched ${allTweets.length} tweets (${pagesProcessed} pages)`);
    
    if (allTweets.length === 0) {
      return {
        ok: true,
        processedTweets: 0,
        matchedPairs: 0,
      };
    }
    
    // 5. Match tweets to projects
    const matches: TweetProjectMatch[] = [];
    
    for (const tweet of allTweets) {
      const matchedProjects = matchTweetToProjects(tweet, patternMap);
      if (matchedProjects.length > 0) {
        matches.push({ tweet, projects: matchedProjects });
      }
    }
    
    console.log(`[UserCtActivity] Found ${matches.length} tweets with project matches`);
    
    // 6. Prepare records for upsert
    const records: Array<{
      user_id: string;
      x_user_id: string;
      tweet_id: string;
      tweet_url: string;
      tweeted_at: string;
      project_id: string;
      project_slug: string;
      likes: number;
      replies: number;
      retweets: number;
      quote_count: number;
      sentiment_score: null;
    }> = [];
    
    for (const match of matches) {
      const { tweet, projects: matchedProjects } = match;
      const tweetUrl = `https://x.com/${xUsername}/status/${tweet.id}`;
      
      for (const project of matchedProjects) {
        records.push({
          user_id: userId,
          x_user_id: xUserId,
          tweet_id: tweet.id,
          tweet_url: tweetUrl,
          tweeted_at: tweet.createdAt,
          project_id: project.id,
          project_slug: project.slug,
          likes: tweet.likeCount,
          replies: tweet.replyCount,
          retweets: tweet.retweetCount,
          quote_count: tweet.quoteCount,
          sentiment_score: null, // Not using sentiment for this feature
        });
      }
    }
    
    console.log(`[UserCtActivity] Prepared ${records.length} records for upsert`);
    
    if (records.length === 0) {
      return {
        ok: true,
        processedTweets: allTweets.length,
        matchedPairs: 0,
      };
    }
    
    // 7. Upsert records
    const { error: upsertError } = await supabase
      .from('user_ct_activity')
      .upsert(records, {
        onConflict: 'user_id,tweet_id,project_id',
        ignoreDuplicates: false, // Update existing records with new metrics
      });
    
    if (upsertError) {
      console.error('[UserCtActivity] Upsert error:', upsertError);
      return {
        ok: false,
        processedTweets: allTweets.length,
        matchedPairs: matches.length,
        error: `Database error: ${upsertError.message}`,
      };
    }
    
    console.log(`[UserCtActivity] Successfully upserted ${records.length} records`);
    
    return {
      ok: true,
      processedTweets: allTweets.length,
      matchedPairs: records.length,
    };
    
  } catch (error: any) {
    console.error('[UserCtActivity] Sync error:', error);
    return {
      ok: false,
      processedTweets: 0,
      matchedPairs: 0,
      error: error.message || 'Unknown error',
    };
  }
}

// =============================================================================
// VALUE SCORE COMPUTATION
// =============================================================================

/**
 * Value score formula (separate from Sentiment Terminal formulas):
 * value_score = (tweet_count * 10) + (total_likes * 1) + (total_replies * 3) + (total_retweets * 2)
 */
export function computeValueScore(
  tweetCount: number,
  totalLikes: number,
  totalReplies: number,
  totalRetweets: number
): number {
  return (tweetCount * 10) + (totalLikes * 1) + (totalReplies * 3) + (totalRetweets * 2);
}

/**
 * Compute and store value scores for all users with CT activity.
 * Called by the cron job.
 * 
 * This is a separate scoring system from the Sentiment Terminal.
 * It only uses data from user_ct_activity table.
 * 
 * @param sourceWindow - Source window identifier (default: 'last_200_tweets')
 * @param limit - Max users to process per run (for rate limiting)
 */
export async function computeValueScoresForAllUsers(
  sourceWindow: string = DEFAULT_SOURCE_WINDOW,
  limit: number = 100
): Promise<{ ok: boolean; usersProcessed: number; scoresComputed: number; error?: string }> {
  console.log(`[UserCtActivity] Computing value scores (source: ${sourceWindow}, limit: ${limit})`);
  
  const supabase = getSupabaseAdmin();
  
  try {
    // 1. Get distinct user IDs from user_ct_activity
    const { data: userRows, error: usersError } = await supabase
      .from('user_ct_activity')
      .select('user_id')
      .limit(limit * 10); // Get more rows to find distinct users
    
    if (usersError) {
      console.error('[UserCtActivity] Error fetching user IDs:', usersError);
      return { ok: false, usersProcessed: 0, scoresComputed: 0, error: usersError.message };
    }
    
    if (!userRows || userRows.length === 0) {
      console.log('[UserCtActivity] No users with CT activity found');
      return { ok: true, usersProcessed: 0, scoresComputed: 0 };
    }
    
    // Get distinct user IDs
    const userIds = [...new Set(userRows.map(r => r.user_id))].slice(0, limit);
    console.log(`[UserCtActivity] Processing ${userIds.length} users`);
    
    let totalScoresComputed = 0;
    
    // 2. For each user, aggregate by project
    for (const userId of userIds) {
      // Get all activity for this user
      const { data: activities, error: actError } = await supabase
        .from('user_ct_activity')
        .select('project_id, project_slug, likes, replies, retweets, quote_count, tweeted_at')
        .eq('user_id', userId);
      
      if (actError || !activities || activities.length === 0) {
        continue;
      }
      
      // Group by project
      const projectMap = new Map<string, {
        project_slug: string;
        tweets: Array<{ likes: number; replies: number; retweets: number; quote_count: number; tweeted_at: string }>;
      }>();
      
      for (const act of activities) {
        const existing = projectMap.get(act.project_id);
        if (existing) {
          existing.tweets.push({
            likes: act.likes,
            replies: act.replies,
            retweets: act.retweets,
            quote_count: act.quote_count,
            tweeted_at: act.tweeted_at,
          });
        } else {
          projectMap.set(act.project_id, {
            project_slug: act.project_slug,
            tweets: [{
              likes: act.likes,
              replies: act.replies,
              retweets: act.retweets,
              quote_count: act.quote_count,
              tweeted_at: act.tweeted_at,
            }],
          });
        }
      }
      
      // 3. Compute scores for each project
      const valueScores: Array<{
        user_id: string;
        project_id: string;
        project_slug: string;
        source_window: string;
        tweet_count: number;
        total_likes: number;
        total_replies: number;
        total_retweets: number;
        total_engagement: number;
        value_score: number;
        last_tweeted_at: string | null;
        computed_at: string;
      }> = [];
      
      for (const [projectId, data] of projectMap.entries()) {
        const tweetCount = data.tweets.length;
        const totalLikes = data.tweets.reduce((sum, t) => sum + t.likes, 0);
        const totalReplies = data.tweets.reduce((sum, t) => sum + t.replies, 0);
        const totalRetweets = data.tweets.reduce((sum, t) => sum + t.retweets, 0);
        const totalQuotes = data.tweets.reduce((sum, t) => sum + t.quote_count, 0);
        const totalEngagement = totalLikes + totalReplies + totalRetweets + totalQuotes;
        
        // Find most recent tweet
        const sortedTweets = [...data.tweets].sort(
          (a, b) => new Date(b.tweeted_at).getTime() - new Date(a.tweeted_at).getTime()
        );
        const lastTweetedAt = sortedTweets[0]?.tweeted_at ?? null;
        
        const valueScore = computeValueScore(tweetCount, totalLikes, totalReplies, totalRetweets);
        
        valueScores.push({
          user_id: userId,
          project_id: projectId,
          project_slug: data.project_slug,
          source_window: sourceWindow,
          tweet_count: tweetCount,
          total_likes: totalLikes,
          total_replies: totalReplies,
          total_retweets: totalRetweets,
          total_engagement: totalEngagement,
          value_score: valueScore,
          last_tweeted_at: lastTweetedAt,
          computed_at: new Date().toISOString(),
        });
      }
      
      // 4. Upsert value scores
      if (valueScores.length > 0) {
        const { error: upsertError } = await supabase
          .from('user_project_value_scores')
          .upsert(valueScores, {
            onConflict: 'user_id,project_id,source_window',
            ignoreDuplicates: false,
          });
        
        if (upsertError) {
          console.error(`[UserCtActivity] Error upserting scores for user ${userId}:`, upsertError);
        } else {
          totalScoresComputed += valueScores.length;
        }
      }
    }
    
    console.log(`[UserCtActivity] Computed ${totalScoresComputed} value scores for ${userIds.length} users`);
    
    return {
      ok: true,
      usersProcessed: userIds.length,
      scoresComputed: totalScoresComputed,
    };
    
  } catch (error: any) {
    console.error('[UserCtActivity] Value score computation error:', error);
    return {
      ok: false,
      usersProcessed: 0,
      scoresComputed: 0,
      error: error.message || 'Unknown error',
    };
  }
}

// =============================================================================
// TOP PROJECTS QUERY
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

/**
 * Get top N projects for a user by value score.
 * 
 * This queries the user_project_value_scores table (separate from Sentiment Terminal data).
 */
export async function getTopProjectsForUser(
  userId: string,
  sourceWindow: string = DEFAULT_SOURCE_WINDOW,
  limit: number = 5
): Promise<{ ok: boolean; projects: TopProjectEntry[]; error?: string }> {
  const supabase = getSupabaseAdmin();
  
  try {
    // Get value scores ordered by value_score desc
    const { data: scores, error: scoresError } = await supabase
      .from('user_project_value_scores')
      .select('*')
      .eq('user_id', userId)
      .eq('source_window', sourceWindow)
      .order('value_score', { ascending: false })
      .limit(limit);
    
    if (scoresError) {
      console.error('[UserCtActivity] Error fetching scores:', scoresError);
      return { ok: false, projects: [], error: scoresError.message };
    }
    
    if (!scores || scores.length === 0) {
      return { ok: true, projects: [] };
    }
    
    // Get project details
    const projectIds = scores.map(s => s.project_id);
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, slug, name, avatar_url, twitter_profile_image_url')
      .in('id', projectIds);
    
    if (projectsError) {
      console.error('[UserCtActivity] Error fetching projects:', projectsError);
      return { ok: false, projects: [], error: projectsError.message };
    }
    
    // Build project map
    const projectMap = new Map<string, { name: string; avatarUrl: string | null }>();
    for (const p of projects || []) {
      projectMap.set(p.id, {
        name: p.name,
        avatarUrl: p.twitter_profile_image_url || p.avatar_url,
      });
    }
    
    // Combine data
    const result: TopProjectEntry[] = scores.map(s => {
      const project = projectMap.get(s.project_id);
      return {
        projectId: s.project_id,
        slug: s.project_slug,
        name: project?.name ?? s.project_slug,
        avatarUrl: project?.avatarUrl ?? null,
        tweetCount: s.tweet_count,
        totalEngagement: s.total_engagement,
        valueScore: s.value_score,
        lastTweetedAt: s.last_tweeted_at,
      };
    });
    
    return { ok: true, projects: result };
    
  } catch (error: any) {
    console.error('[UserCtActivity] getTopProjectsForUser error:', error);
    return { ok: false, projects: [], error: error.message || 'Unknown error' };
  }
}
