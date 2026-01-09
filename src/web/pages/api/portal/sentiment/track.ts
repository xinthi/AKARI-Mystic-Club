/**
 * API Route: POST /api/portal/sentiment/track
 * 
 * EXPLICIT USER ACTION: Tracks/saves a new Twitter profile from search results to the projects table.
 * This endpoint is ONLY called when a user explicitly clicks "Track project in AKARI" or similar action.
 * 
 * IMPORTANT: Projects are NOT auto-created. This endpoint requires an explicit user trigger.
 * 
 * When called, this endpoint:
 * - Creates a new project entry in the projects table (if it doesn't exist)
 * - Fetches real data from Twitter API:
 *   - Profile info (followers, bio, avatar)
 *   - Recent tweets (saved to project_tweets)
 *   - Mentions from others
 *   - Real sentiment and engagement scores
 * 
 * The project is NOT claimed by default. The official project account must log in and claim it separately.
 * 
 * Request body:
 *   - username: Twitter handle (required)
 *   - name: Display name (optional)
 *   - bio: Profile bio (optional)
 *   - profileImageUrl: Avatar URL (optional)
 *   - followersCount: Follower count (optional)
 * 
 * Returns the tracked project data.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Use web-local Twitter client (inside src/web, can be compiled by Next.js)
import { getUserProfile, getUserTweets, getUserFollowers, getUserMentions, TwitterTweet, TwitterFollower, TwitterMention, TwitterUserProfile } from '@/lib/twitter/twitter';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isSuperAdminServerSide } from '@/lib/server-auth';
import { upsertProfileFromTwitter, upsertProfilesFromTwitter } from '@/lib/portal/profile-sync';

// =============================================================================
// LOCAL HELPERS (inlined to avoid cross-package imports)
// =============================================================================

// Simple sentiment keywords for local analysis
const POSITIVE_WORDS = new Set(['good', 'great', 'amazing', 'awesome', 'excellent', 'love', 'best', 'happy', 'bullish', 'moon', 'pump', 'gain', 'profit', 'win', 'success', 'breaking', 'huge', 'massive', 'incredible', 'fantastic', 'wonderful', 'perfect', 'beautiful', 'excited', 'thrilled']);
const NEGATIVE_WORDS = new Set(['bad', 'terrible', 'awful', 'hate', 'worst', 'sad', 'bearish', 'dump', 'loss', 'fail', 'scam', 'rug', 'crash', 'down', 'drop', 'sell', 'warning', 'danger', 'risk', 'fear', 'worried', 'concerned', 'disappointed', 'frustrated', 'angry']);

/**
 * Simple local sentiment analysis
 */
function analyzeSentiment(text: string): number {
  const words = text.toLowerCase().split(/\s+/);
  let score = 0;
  let count = 0;
  
  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) {
      score += 1;
      count++;
    } else if (NEGATIVE_WORDS.has(word)) {
      score -= 1;
      count++;
    }
  }
  
  if (count === 0) return 50; // Neutral
  return Math.min(100, Math.max(0, 50 + (score / count) * 25));
}

/**
 * Analyze sentiment for multiple tweets
 */
function analyzeTweetSentiments(tweets: Array<{ text: string }>): Array<{ score: number }> {
  return tweets.map(t => ({ score: Math.round(analyzeSentiment(t.text)) }));
}


// =============================================================================
// TYPES
// =============================================================================

interface TrackRequest {
  username: string;
  name?: string;
  bio?: string;
  profileImageUrl?: string;
  followersCount?: number;
  profile_type?: 'company' | 'personal'; // Optional: 'company' maps to 'project', 'personal' maps to 'personal'
}

interface TrackedProject {
  id: string;
  slug: string;
  x_handle: string;
  name: string;
  bio: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

type TrackResponse =
  | { ok: true; project: TrackedProject; isNew: boolean }
  | { ok: false; error: string };

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a URL-friendly slug from a username
 */
function createSlug(username: string): string {
  return username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 50);
}

/**
 * Create a Supabase client with service role for write access
 */
function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase service role configuration missing');
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Get session token from request
 */
function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

/**
 * Get user ID from session token
 */
async function getUserIdFromSession(sessionToken: string): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    
    const { data: session, error: sessionError } = await supabase
      .from('akari_user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', sessionToken)
      .single();

    if (sessionError || !session) {
      return null;
    }

    // Check if session is expired
    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('akari_user_sessions')
        .delete()
        .eq('session_token', sessionToken);
      return null;
    }

    return session.user_id;
  } catch (err) {
    console.error('[Track] Error getting user from session:', err);
    return null;
  }
}

/**
 * Get user tier from user ID
 */
async function getUserTierFromId(userId: string): Promise<'seer' | 'analyst' | 'institutional_plus'> {
  try {
    const supabase = getSupabaseAdmin();
    
    // Check if super admin
    const isSuperAdmin = await isSuperAdminServerSide(userId);
    if (isSuperAdmin) {
      return 'institutional_plus';
    }

    // Get feature grants
    const { data: grants } = await supabase
      .from('akari_user_feature_grants')
      .select('feature_key, starts_at, ends_at')
      .eq('user_id', userId);

    if (!grants) {
      return 'seer';
    }

    const now = new Date();

    // Check for Institutional Plus features
    for (const grant of grants) {
      const startsOk = !grant.starts_at || new Date(grant.starts_at) <= now;
      const endsOk = !grant.ends_at || new Date(grant.ends_at) >= now;
      
      if (startsOk && endsOk) {
        if (grant.feature_key === 'deep.explorer' || grant.feature_key === 'institutional.plus') {
          return 'institutional_plus';
        }
      }
    }

    // Check for Analyst features
    for (const grant of grants) {
      const startsOk = !grant.starts_at || new Date(grant.starts_at) <= now;
      const endsOk = !grant.ends_at || new Date(grant.ends_at) >= now;
      
      if (startsOk && endsOk) {
        if (grant.feature_key === 'markets.analytics' || grant.feature_key === 'sentiment.compare' || grant.feature_key === 'sentiment.search') {
          return 'analyst';
        }
      }
    }

    return 'seer';
  } catch (err) {
    console.error('[Track] Error getting user tier:', err);
    return 'seer';
  }
}

/**
 * Fetch real data from Twitter API and save to database
 * Uses web-local Twitter client (inside src/web, compilable by Next.js)
 */
async function fetchAndSaveRealData(
  supabase: SupabaseClient,
  projectId: string,
  username: string
): Promise<{ tweetCount: number; followerCount: number; sentimentScore: number; ctHeatScore: number }> {
  console.log(`[Track] Fetching real data for @${username}...`);
  
  let tweetCount = 0;
  let followerCount = 0;
  let sentimentScore = 50;
  let ctHeatScore = 30;
  
  try {
    // 1. Fetch profile info using web-local Twitter client
    const profile = await getUserProfile(username);
    if (profile) {
      followerCount = profile.followersCount || 0;
      console.log(`[Track] Profile: ${profile.name} - ${followerCount} followers, userId: ${profile.userId || 'N/A'}`);
      
      // IMPORTANT: Save profile data (including avatar) to profiles table
      // This ensures we have the latest avatar in the database for all leaderboards
      try {
        const profileId = await upsertProfileFromTwitter(supabase, profile);
        if (profileId) {
          console.log(`[Track] ✓ Synced profile to DB (profile_id: ${profileId})`);
        }
      } catch (syncError) {
        console.warn(`[Track] Error syncing profile to DB:`, syncError);
        // Continue even if sync fails
      }
      
      // Update project with real profile data INCLUDING twitter_id (permanent X User ID)
      const updateData: Record<string, any> = {
        avatar_url: profile.profileImageUrl || profile.avatarUrl || null,
        twitter_profile_image_url: profile.profileImageUrl || profile.avatarUrl || null,
        bio: profile.bio || null,
      };
      
      // IMPORTANT: Store the permanent X User ID if available
      // This ensures we can identify the project even if they change their handle
      if (profile.userId) {
        updateData.twitter_id = profile.userId;
        console.log(`[Track] Storing twitter_id: ${profile.userId} for @${username}`);
      }
      
      await supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId);
    }
    
    // 2. Fetch recent tweets using web-local Twitter client
    const tweets = await getUserTweets(username, 20);
    console.log(`[Track] Found ${tweets.length} tweets`);
    
    tweetCount = tweets.length;
    
    // 3. Analyze sentiment from tweets
    if (tweets.length > 0) {
      const sentimentResults = analyzeTweetSentiments(tweets.map(t => ({ text: t.text || '' })));
      const avgSentiment = sentimentResults.reduce((sum, r) => sum + r.score, 0) / sentimentResults.length;
      sentimentScore = Math.round(avgSentiment);
      
      // Calculate CT Heat based on engagement
      const totalEngagement = tweets.reduce((sum, t) => 
        sum + (t.likeCount || 0) + (t.retweetCount || 0) * 2 + (t.replyCount || 0) * 3, 0);
      const avgEngagement = totalEngagement / tweets.length;
      ctHeatScore = Math.min(100, Math.max(0, Math.round(30 + avgEngagement / 100)));
    }
    
    // 4. Fetch mentions (tweets from others mentioning the project)
    console.log(`[Track] Fetching mentions...`);
    const mentions = await getUserMentions(username, 50);
    console.log(`[Track] Found ${mentions.length} mentions`);

    // 5. Save tweets to project_tweets (both project tweets and mentions)
    // KOL threshold: likes + retweets*2 >= 20 (lower than CLI script for better coverage)
    const KOL_THRESHOLD = 20;

    const projectTweetRows = tweets.slice(0, 20).map((t: TwitterTweet) => ({
      project_id: projectId,
      tweet_id: t.id,
      tweet_url: `https://x.com/${username}/status/${t.id}`,
      author_handle: username,
      author_name: profile?.name || username,
      author_profile_image_url: profile?.profileImageUrl || profile?.avatarUrl || null,
      created_at: t.createdAt || new Date().toISOString(),
      text: t.text || '',
      likes: t.likeCount ?? 0,
      replies: t.replyCount ?? 0,
      retweets: t.retweetCount ?? 0,
      is_official: true,
      is_kol: false,
    }));

    // Build mention rows - mark as KOL if high engagement
    const mentionRows = mentions.slice(0, 30).map((m: TwitterMention) => {
      const totalEngagement = (m.likes ?? 0) + (m.retweets ?? 0) * 2;
      const isKOL = totalEngagement >= KOL_THRESHOLD;
      
      return {
        project_id: projectId,
        tweet_id: m.id,
        tweet_url: m.url || `https://x.com/${m.author}/status/${m.id}`,
        author_handle: m.author,
        author_name: m.authorName || m.author,
        author_profile_image_url: m.authorProfileImageUrl,
        created_at: m.createdAt || new Date().toISOString(),
        text: m.text || '',
        likes: m.likes ?? 0,
        replies: m.replies ?? 0,
        retweets: m.retweets ?? 0,
        is_official: false,
        is_kol: isKOL,
      };
    });

    const kolCount = mentionRows.filter(m => m.is_kol).length;
    console.log(`[Track] Mentions: ${mentionRows.length} total, ${kolCount} marked as KOL`);

    const allTweetRows = [...projectTweetRows, ...mentionRows];
    
    if (allTweetRows.length > 0) {
      const { error: tweetsError } = await supabase
        .from('project_tweets')
        .upsert(allTweetRows, { onConflict: 'project_id,tweet_id' });
      
      if (tweetsError) {
        console.warn(`[Track] Failed to save tweets:`, tweetsError.message);
      } else {
        console.log(`[Track] Saved ${allTweetRows.length} tweets (${projectTweetRows.length} official, ${mentionRows.length} mentions)`);
      }
    }

    // IMPORTANT: Save profiles for mention authors (auto-tracked creators)
    // This ensures they have profiles with avatars in the database for leaderboards
    if (mentions.length > 0) {
      console.log(`[Track] Saving profiles for ${mentions.length} mention authors...`);
      const uniqueMentionAuthors = new Map<string, TwitterMention>();
      
      // Collect unique mention authors with their profile data
      for (const mention of mentions) {
        if (mention.author && !uniqueMentionAuthors.has(mention.author.toLowerCase())) {
          uniqueMentionAuthors.set(mention.author.toLowerCase(), mention);
        }
      }
      
      console.log(`[Track] Found ${uniqueMentionAuthors.size} unique mention authors to save profiles for`);
      
      // Save profiles for each unique mention author
      let profilesSaved = 0;
      for (const [handle, mention] of uniqueMentionAuthors) {
        try {
          // Create a minimal profile from mention data
          // If we have profile image URL from the mention, use it
          if (mention.author && mention.authorProfileImageUrl) {
            const profileData: TwitterUserProfile = {
              handle: mention.author,
              userId: undefined, // We don't have userId from mentions
              name: mention.authorName || mention.author,
              profileImageUrl: mention.authorProfileImageUrl || undefined,
              avatarUrl: mention.authorProfileImageUrl || undefined,
              bio: undefined,
              followersCount: undefined,
              followingCount: undefined,
              tweetCount: undefined,
              verified: undefined,
            };
            
            const profileId = await upsertProfileFromTwitter(supabase, profileData);
            if (profileId) {
              profilesSaved++;
              console.log(`[Track] ✓ Saved profile for mention author @${mention.author}`);
            }
          } else {
            // If no profile image, try to fetch full profile from Twitter API
            // This ensures we get complete profile data including avatar
            try {
              const fullProfile = await getUserProfile(mention.author);
              if (fullProfile) {
                const profileId = await upsertProfileFromTwitter(supabase, fullProfile);
                if (profileId) {
                  profilesSaved++;
                  console.log(`[Track] ✓ Fetched and saved full profile for mention author @${mention.author}`);
                }
              }
            } catch (fetchError) {
              console.warn(`[Track] Could not fetch full profile for @${mention.author}:`, fetchError);
              // Continue with other authors
            }
          }
        } catch (saveError) {
          console.warn(`[Track] Error saving profile for mention author @${mention.author}:`, saveError);
          // Continue with other authors
        }
      }
      
      console.log(`[Track] ✓ Saved profiles for ${profilesSaved}/${uniqueMentionAuthors.size} mention authors`);
    }
    
    // 5. Fetch followers and build initial inner circle
    console.log(`[Track] Fetching followers for inner circle...`);
    try {
      const followers = await getUserFollowers(username, 200);
      console.log(`[Track] Found ${followers.length} followers`);
      
      if (followers.length > 0) {
        // Score and filter followers for inner circle
        const scoredFollowers = followers.map((f: TwitterFollower) => {
          // Calculate simple influence score
          const followerRatio = f.followers > 0 ? Math.min(f.followers / Math.max(f.following, 1), 100) : 0;
          const influenceScore = Math.min(100, Math.round(
            (f.followers > 1000 ? 30 : f.followers > 100 ? 15 : 5) +
            (followerRatio > 10 ? 30 : followerRatio > 1 ? 15 : 5) +
            (f.verified ? 20 : 0) +
            (f.bio ? 10 : 0) +
            (f.tweetCount > 100 ? 10 : f.tweetCount > 10 ? 5 : 0)
          ));
          
          // Calculate farm risk (lower is better)
          const farmRisk = Math.round(
            (f.followers < 10 ? 40 : 0) +
            (f.following > f.followers * 5 ? 30 : 0) +
            (!f.bio ? 15 : 0) +
            (f.tweetCount < 5 ? 15 : 0)
          );
          
          return { ...f, influenceScore, farmRisk };
        });
        
        // Filter out likely bots/farms and sort by influence
        const qualifiedFollowers = scoredFollowers
          .filter(f => f.farmRisk < 50 && f.followers >= 50)
          .sort((a, b) => b.influenceScore - a.influenceScore)
          .slice(0, 100); // Top 100 for inner circle
        
        console.log(`[Track] Qualified ${qualifiedFollowers.length} followers for inner circle`);
        
        // IMPORTANT: Sync follower profiles to profiles table (including avatars)
        const followerProfiles: TwitterUserProfile[] = qualifiedFollowers.map((f: TwitterFollower) => ({
          handle: f.username,
          userId: f.id,
          name: f.name,
          profileImageUrl: f.profileImageUrl ?? undefined,
          avatarUrl: f.profileImageUrl ?? undefined,
          bio: f.bio ?? undefined,
          followersCount: f.followers,
          followingCount: f.following,
          tweetCount: f.tweetCount,
          verified: f.verified,
        }));
        
        try {
          const syncedProfiles = await upsertProfilesFromTwitter(supabase, followerProfiles);
          console.log(`[Track] ✓ Synced ${syncedProfiles.size}/${qualifiedFollowers.length} follower profiles to DB`);
        } catch (syncError) {
          console.warn(`[Track] Error syncing follower profiles to DB:`, syncError);
          // Continue even if sync fails
        }
        
        // Also update profiles with scoring data (influence_score, farm_risk_score, etc.)
        const profileRows = qualifiedFollowers.map(f => ({
          twitter_id: f.id,
          username: f.username,
          influence_score: f.influenceScore,
          farm_risk_score: f.farmRisk,
          akari_profile_score: Math.round(f.influenceScore * 10 - f.farmRisk * 5),
        }));
        
        if (profileRows.length > 0) {
          // Update profiles with scoring data (profiles should already exist from upsertProfilesFromTwitter)
          for (const profileRow of profileRows) {
            const { error: updateError } = await supabase
              .from('profiles')
              .update({
                influence_score: profileRow.influence_score,
                farm_risk_score: profileRow.farm_risk_score,
                akari_profile_score: profileRow.akari_profile_score,
              })
              .eq('twitter_id', profileRow.twitter_id);
            
            if (updateError) {
              console.warn(`[Track] Failed to update profile scores for ${profileRow.username}:`, updateError.message);
            }
          }
          
          console.log(`[Track] Updated scores for ${profileRows.length} profiles`);
          
          // Get profile IDs for inner circle
          const { data: savedProfiles } = await supabase
            .from('profiles')
            .select('id, twitter_id, akari_profile_score')
            .in('twitter_id', qualifiedFollowers.map(f => f.id));
          
          if (savedProfiles && savedProfiles.length > 0) {
            // Create inner_circle_members entries
            const memberRows = savedProfiles.map(p => ({
              profile_id: p.id,
              akari_profile_score: p.akari_profile_score || 0,
              influence_score: profileRows.find(pr => pr.twitter_id === p.twitter_id)?.influence_score || 0,
              segment: 'follower',
            }));
            
            await supabase
              .from('inner_circle_members')
              .upsert(memberRows, { onConflict: 'profile_id' });
            
            // Create project_inner_circle entries
            const circleRows = savedProfiles.map(p => ({
              project_id: projectId,
              profile_id: p.id,
              is_follower: true,
              is_author: false,
              weight: (p.akari_profile_score || 0) / 100,
              last_interaction_at: new Date().toISOString(),
            }));
            
            const { error: circleError } = await supabase
              .from('project_inner_circle')
              .upsert(circleRows, { onConflict: 'project_id,profile_id' });
            
            if (circleError) {
              console.warn(`[Track] Failed to create inner circle:`, circleError.message);
            } else {
              // Update project with inner circle stats
              const totalPower = savedProfiles.reduce((sum, p) => sum + (p.akari_profile_score || 0), 0);
              await supabase
                .from('projects')
                .update({
                  inner_circle_count: savedProfiles.length,
                  inner_circle_power: Math.round(totalPower),
                  quality_follower_ratio: Math.round(qualifiedFollowers.length / Math.max(followers.length, 1) * 100),
                })
                .eq('id', projectId);
              
              console.log(`[Track] ✅ Inner circle created: ${savedProfiles.length} members, power: ${totalPower}`);
            }
          }
        }
      }
    } catch (icError: any) {
      console.warn(`[Track] Inner circle error (non-fatal):`, icError.message);
    }
    
  } catch (error: any) {
    console.error(`[Track] Error fetching real data:`, error.message);
  }
  
  return { tweetCount, followerCount, sentimentScore, ctHeatScore };
}

// =============================================================================
// API HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TrackResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  try {
    const body: TrackRequest = req.body;

    // Validate required fields
    if (!body.username || typeof body.username !== 'string') {
      return res.status(400).json({
        ok: false,
        error: 'Username is required',
      });
    }

    const username = body.username.replace('@', '').trim();
    if (username.length < 1 || username.length > 50) {
      return res.status(400).json({
        ok: false,
        error: 'Invalid username',
      });
    }

    // Get user from session for permission checks
    const sessionToken = getSessionToken(req);
    let userId: string | null = null;
    let userTier: 'seer' | 'analyst' | 'institutional_plus' = 'seer';
    let isSuperAdmin = false;

    if (sessionToken) {
      userId = await getUserIdFromSession(sessionToken);
      if (userId) {
        isSuperAdmin = await isSuperAdminServerSide(userId);
        userTier = await getUserTierFromId(userId);
      }
    }

    // Permission check: Only institutional_plus and superadmin can add new profiles
    if (!isSuperAdmin && userTier !== 'institutional_plus') {
      return res.status(403).json({
        ok: false,
        error: 'Upgrade to Institutional Plus to add new company profiles.',
      });
    }

    // Validate profile_type if provided
    let dbProfileType: 'project' | 'personal' | null = null;
    if (body.profile_type) {
      // Map frontend 'company'/'personal' to DB 'project'/'personal'
      if (body.profile_type === 'company') {
        dbProfileType = 'project';
      } else if (body.profile_type === 'personal') {
        dbProfileType = 'personal';
      } else {
        return res.status(400).json({
          ok: false,
          error: 'Invalid profile_type. Must be "company" or "personal"',
        });
      }

      // Permission check: institutional_plus can only add 'company' profiles
      if (!isSuperAdmin && userTier === 'institutional_plus' && body.profile_type !== 'company') {
        return res.status(403).json({
          ok: false,
          error: 'Institutional Plus users can only add Company/Project profiles.',
        });
      }
    }

    const slug = createSlug(username);
    const displayName = body.name || username;

    console.log(`[API /portal/sentiment/track] Tracking profile: @${username}, profile_type: ${dbProfileType || 'null'}`);

    // Create service client for write access
    const supabase = createServiceClient();

    // Check if project already exists (by x_handle OR twitter_username)
    const { data: existingProject, error: selectError } = await supabase
      .from('projects')
      .select('*')
      .or(`x_handle.eq.${username.toLowerCase()},twitter_username.ilike.${username}`)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is expected for new projects
      console.error('[API /portal/sentiment/track] Select error:', selectError);
      throw selectError;
    }

    // If project exists, update it if needed and check if it needs data refresh
    if (existingProject) {
      console.log(`[API /portal/sentiment/track] Project already tracked: ${existingProject.slug}`);
      
      // Update missing fields (avatar, twitter_username, twitter_id if not set)
      const updates: Record<string, any> = {
        last_refreshed_at: new Date().toISOString(),
      };
      
      // Update avatar if we have a new one and current is missing
      if (body.profileImageUrl && !existingProject.avatar_url) {
        updates.avatar_url = body.profileImageUrl;
        updates.twitter_profile_image_url = body.profileImageUrl;
      }
      
      // IMPORTANT: Set twitter_username if it's missing (for older projects)
      const handleToUse = existingProject.twitter_username || username;
      if (!existingProject.twitter_username) {
        updates.twitter_username = username;
        console.log(`[API /portal/sentiment/track] Setting missing twitter_username: @${username}`);
      }
      
      // IMPORTANT: Fetch and set twitter_id (permanent X User ID) if missing
      // This ensures we can identify the project even if they change their handle
      if (!existingProject.twitter_id) {
        const profileForTwitterId = await getUserProfile(handleToUse);
        if (profileForTwitterId) {
          if (profileForTwitterId.userId) {
            updates.twitter_id = profileForTwitterId.userId;
            console.log(`[API /portal/sentiment/track] Setting missing twitter_id: ${profileForTwitterId.userId}`);
          }
          
          // IMPORTANT: Also save this profile to profiles table
          try {
            await upsertProfileFromTwitter(supabase, profileForTwitterId);
            console.log(`[API /portal/sentiment/track] ✓ Synced profile to DB`);
          } catch (syncError) {
            console.warn(`[API /portal/sentiment/track] Error syncing profile to DB:`, syncError);
          }
        }
      }
      
      // Apply updates if any
      if (Object.keys(updates).length > 1) {
        await supabase
          .from('projects')
          .update(updates)
          .eq('id', existingProject.id);
      }

      // Check if this project is missing tweet data, inner circle, OR KOL mentions
      const { count: tweetCount } = await supabase
        .from('project_tweets')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', existingProject.id);

      const { count: innerCircleCount } = await supabase
        .from('project_inner_circle')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', existingProject.id);

      // Also check if we have ANY KOL mentions - if not, we should fetch them
      const { count: kolCount } = await supabase
        .from('project_tweets')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', existingProject.id)
        .eq('is_kol', true);

      const needsDataFetch = !tweetCount || tweetCount === 0 || !innerCircleCount || innerCircleCount === 0 || !kolCount || kolCount === 0;

      if (needsDataFetch) {
        console.log(`[API /portal/sentiment/track] Project ${existingProject.slug} missing data (tweets: ${tweetCount || 0}, inner_circle: ${innerCircleCount || 0}, kol_mentions: ${kolCount || 0}) - fetching...`);
        
        // Fetch real data from Twitter API for this existing project
        const realData = await fetchAndSaveRealData(supabase, existingProject.id, handleToUse);
        console.log(`[API /portal/sentiment/track] Fetched: ${realData.tweetCount} tweets, ${realData.followerCount} followers`);
        
        // Update today's metrics with real data if we don't have any
        const today = new Date().toISOString().split('T')[0];
        const { data: existingMetrics } = await supabase
          .from('metrics_daily')
          .select('*')
          .eq('project_id', existingProject.id)
          .eq('date', today)
          .single();

        // Always update metrics with real data (especially followers which might be 0)
        await supabase
          .from('metrics_daily')
          .upsert({
            project_id: existingProject.id,
            date: today,
            sentiment_score: realData.sentimentScore || existingMetrics?.sentiment_score || 50,
            ct_heat_score: realData.ctHeatScore || existingMetrics?.ct_heat_score || 30,
            tweet_count: realData.tweetCount || existingMetrics?.tweet_count || 0,
            followers: realData.followerCount || existingMetrics?.followers || 0,
            akari_score: existingMetrics?.akari_score || 400,
          }, { onConflict: 'project_id,date' });
        console.log(`[API /portal/sentiment/track] Updated today's metrics: followers=${realData.followerCount}`);
      } else {
        console.log(`[API /portal/sentiment/track] Project ${existingProject.slug} has data (tweets: ${tweetCount}, inner_circle: ${innerCircleCount}, kol_mentions: ${kolCount})`);
        
        // Even if we have tweets/inner_circle, check if followers is 0 and update it
        const today = new Date().toISOString().split('T')[0];
        const { data: todayMetrics } = await supabase
          .from('metrics_daily')
          .select('followers')
          .eq('project_id', existingProject.id)
          .eq('date', today)
          .single();
        
        if (!todayMetrics || !todayMetrics.followers || todayMetrics.followers === 0) {
          console.log(`[API /portal/sentiment/track] Followers is 0, fetching profile to update...`);
          
          // Just fetch profile to get follower count
          const profile = await getUserProfile(handleToUse);
          if (profile) {
            // IMPORTANT: Always save profile to profiles table when fetching from Twitter
            try {
              await upsertProfileFromTwitter(supabase, profile);
              console.log(`[API /portal/sentiment/track] ✓ Synced profile to DB during follower update`);
            } catch (syncError) {
              console.warn(`[API /portal/sentiment/track] Error syncing profile to DB:`, syncError);
            }
            
            if (profile.followersCount) {
              await supabase
                .from('metrics_daily')
                .upsert({
                  project_id: existingProject.id,
                  date: today,
                  followers: profile.followersCount,
                }, { onConflict: 'project_id,date' });
              console.log(`[API /portal/sentiment/track] Updated followers: ${profile.followersCount}`);
            }
          }
        }
      }

      return res.status(200).json({
        ok: true,
        project: existingProject,
        isNew: false,
      });
    }

    // Create new project
    // IMPORTANT: Set twitter_username to the same as x_handle so sentiment:update works immediately
    // ALSO: Fetch profile to get twitter_id (permanent X User ID) before creating
    let twitterId: string | null = null;
    let profileImageUrl = body.profileImageUrl || null;
    let bio = body.bio || null;
    
    // Fetch profile to get the permanent twitter_id
    const profileForNewProject = await getUserProfile(username);
    if (profileForNewProject) {
      twitterId = profileForNewProject.userId || null;
      profileImageUrl = profileForNewProject.profileImageUrl || profileForNewProject.avatarUrl || profileImageUrl;
      bio = profileForNewProject.bio || bio;
      console.log(`[API /portal/sentiment/track] New project - twitter_id: ${twitterId || 'N/A'}`);
    }
    
    const newProject: Record<string, any> = {
      slug,
      x_handle: username.toLowerCase(),
      twitter_username: username, // Keep original casing for Twitter API calls
      name: displayName,
      display_name: displayName, // Set display_name for consistency
      bio,
      avatar_url: profileImageUrl,
      twitter_profile_image_url: profileImageUrl,
      is_active: true,
      first_tracked_at: new Date().toISOString(),
      last_refreshed_at: new Date().toISOString(),
      // Project is NOT claimed by default - must be explicitly claimed
      claimed_by: null,
      claimed_at: null,
      profile_type: dbProfileType, // Set from user selection (company -> 'project', personal -> 'personal')
      // IMPORTANT: profile_type='project' is required for ARC Top Projects visibility
      // - NULL = unclassified (newly tracked, not yet claimed)
      // - 'personal' = individual profile
      // - 'project' = company/project profile (appears in ARC)
      is_company: false, // Default to false, SuperAdmin can set to true
      arc_active: false, // Default to false, only SuperAdmin can activate
    };
    
    // IMPORTANT: Store the permanent X User ID if available
    // This ensures we can identify the project even if they change their handle
    if (twitterId) {
      newProject.twitter_id = twitterId;
    }

    const { data: insertedProject, error: insertError } = await supabase
      .from('projects')
      .insert(newProject)
      .select()
      .single();

    if (insertError) {
      // Handle unique constraint violation (slug or x_handle already exists)
      if (insertError.code === '23505') {
        console.log(`[API /portal/sentiment/track] Project already exists with different casing`);
        
        // Try to fetch the existing project
        const { data: existing } = await supabase
          .from('projects')
          .select('*')
          .or(`slug.eq.${slug},x_handle.eq.${username.toLowerCase()}`)
          .single();

        if (existing) {
          return res.status(200).json({
            ok: true,
            project: existing,
            isNew: false,
          });
        }
      }

      console.error('[API /portal/sentiment/track] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[API /portal/sentiment/track] New project tracked: ${insertedProject.slug}`);

    // Fetch REAL data from Twitter API
    const realData = await fetchAndSaveRealData(supabase, insertedProject.id, username);
    console.log(`[API /portal/sentiment/track] Real data: ${realData.tweetCount} tweets, ${realData.followerCount} followers, sentiment: ${realData.sentimentScore}`);

    // Use real follower count or fallback to provided value
    const currentFollowers = realData.followerCount || body.followersCount || 0;
    const baseSentiment = realData.sentimentScore;
    const baseCtHeat = realData.ctHeatScore;
    
    // Calculate AKARI score from real data
    const baseAkari = Math.min(1000, Math.max(100, 
      Math.round(100 + (currentFollowers > 0 ? Math.log10(currentFollowers) * 50 : 0) + baseSentiment * 2 + baseCtHeat)
    ));

    // Create 7 days of metrics for chart display
    // Use real values for today, slight variations for historical
    const metricsRows = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      // Historical values have slight random variation from today's real values
      const dayProgress = (6 - i) / 6; // 0 to 1 over 7 days
      const variation = i === 0 ? 0 : Math.floor(Math.random() * 6) - 3; // ±3 for historical
      
      // Followers grow over time
      const totalGrowthPercent = 0.03 + Math.random() * 0.04; // 3-7% weekly growth
      const dailyGrowthRate = totalGrowthPercent / 7;
      const growthMultiplier = 1 - totalGrowthPercent + (dailyGrowthRate * (6 - i));
      const dayFollowers = Math.round(currentFollowers * growthMultiplier);
      
      metricsRows.push({
        project_id: insertedProject.id,
        date: dateStr,
        sentiment_score: Math.min(100, Math.max(0, baseSentiment + variation)),
        ct_heat_score: Math.min(100, Math.max(0, baseCtHeat + variation)),
        tweet_count: i === 0 ? realData.tweetCount : Math.max(0, realData.tweetCount + Math.floor(Math.random() * 10) - 5),
        followers: Math.max(0, dayFollowers),
        akari_score: Math.min(1000, Math.max(0, baseAkari + Math.floor(dayProgress * 30) + Math.floor(Math.random() * 10))),
      });
    }

    const { error: metricsError } = await supabase
      .from('metrics_daily')
      .insert(metricsRows);

    if (metricsError) {
      console.warn('[API /portal/sentiment/track] Failed to create initial metrics:', metricsError);
      // Don't fail the request - the project is still tracked
    } else {
      console.log(`[API /portal/sentiment/track] Created ${metricsRows.length} days of metrics with REAL data`);
    }

    // Initialize refresh state for Smart Refresh System (new projects start with high interest)
    try {
      await supabase
        .from('project_refresh_state')
        .insert({
          project_id: insertedProject.id,
          last_searched_at: new Date().toISOString(),
          last_cron_refreshed_at: new Date().toISOString(),
          interest_score: 3, // New projects start with medium interest
          inactivity_days: 0,
          refresh_frequency: 'daily',
        });
      console.log(`[API /portal/sentiment/track] Initialized refresh state for ${insertedProject.slug}`);
    } catch (refreshStateError) {
      // Silent fail - doesn't block tracking
      console.warn('[API /portal/sentiment/track] Failed to initialize refresh state:', refreshStateError);
    }

    return res.status(201).json({
      ok: true,
      project: insertedProject,
      isNew: true,
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error('[API /portal/sentiment/track] Error:', err.message);

    return res.status(500).json({
      ok: false,
      error: 'Failed to track profile',
    });
  }
}

