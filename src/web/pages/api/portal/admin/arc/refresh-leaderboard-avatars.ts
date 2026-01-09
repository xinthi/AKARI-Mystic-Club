/**
 * API Route: POST /api/portal/admin/arc/refresh-leaderboard-avatars?projectId=xxx
 * 
 * Refreshes missing avatars for all creators in a project's leaderboard.
 * Uses the same Twitter API client as sentiment tracking to fetch profile images.
 * 
 * This endpoint:
 * 1. Gets all creators from the project's leaderboard
 * 2. Identifies which ones are missing avatars in the database
 * 3. Fetches their profiles from Twitter API using getUserProfile (same as sentiment track)
 * 4. Saves profiles to database using upsertProfileFromTwitter
 * 
 * SuperAdmin only. Rate-limit safe with batch processing.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { getUserProfile } from '@/lib/twitter/twitter';
import { upsertProfileFromTwitter } from '@/lib/portal/profile-sync';
import { normalizeTwitterUsername } from '@/lib/portal/avatar-helper';

// =============================================================================
// TYPES
// =============================================================================

interface RefreshLeaderboardAvatarsResponse {
  ok: boolean;
  projectId?: string;
  processed?: number;
  succeeded?: number;
  failed?: number;
  skipped?: number;
  errors?: Array<{ username: string; error: string }>;
  duration?: number; // milliseconds
  error?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

async function checkSuperAdmin(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
): Promise<boolean> {
  try {
    // Check akari_user_roles table
    const { data: userRoles, error: rolesError } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin');

    if (rolesError) {
      console.error('[RefreshLeaderboardAvatars] Error checking akari_user_roles:', rolesError);
    } else if (userRoles && userRoles.length > 0) {
      return true;
    }

    // Also check profiles.real_roles via Twitter username
    const { data: xIdentity, error: identityError } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .maybeSingle();

    if (identityError) {
      console.error('[RefreshLeaderboardAvatars] Error checking akari_user_identities:', identityError);
    } else if (xIdentity?.username) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', normalizeTwitterUsername(xIdentity.username))
        .maybeSingle();

      if (profileError) {
        console.error('[RefreshLeaderboardAvatars] Error checking profiles.real_roles:', profileError);
      } else if (profile?.real_roles && Array.isArray(profile.real_roles)) {
        if (profile.real_roles.includes('super_admin')) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('[RefreshLeaderboardAvatars] Error in checkSuperAdmin:', error);
    return false;
  }
}

/**
 * Get all unique creators from a project's leaderboard
 */
async function getLeaderboardCreators(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  projectId: string
): Promise<Array<{ twitter_username: string; is_auto_tracked: boolean; is_joined: boolean }>> {
  const creators = new Map<string, { twitter_username: string; is_auto_tracked: boolean; is_joined: boolean }>();

  // Get current arena for this project
  const { data: currentArena } = await supabase
    .from('arenas')
    .select('id')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Get from arena_creators if arena exists
  if (currentArena?.id) {
    const { data: arenaCreators, error: arenaError } = await supabase
      .from('arena_creators')
      .select('twitter_username, is_auto_tracked')
      .eq('arena_id', currentArena.id)
      .not('twitter_username', 'is', null);

    if (!arenaError && arenaCreators) {
      for (const creator of arenaCreators) {
        const normalized = normalizeTwitterUsername(creator.twitter_username);
        if (normalized && !creators.has(normalized)) {
          creators.set(normalized, {
            twitter_username: normalized,
            is_auto_tracked: creator.is_auto_tracked || false,
            is_joined: false,
          });
        }
      }
    }
  }

  // Get from project_creators
  const { data: projectCreators, error: projectError } = await supabase
    .from('project_creators')
    .select('twitter_username, is_auto_tracked')
    .eq('project_id', projectId)
    .not('twitter_username', 'is', null);

  if (!projectError && projectCreators) {
    for (const creator of projectCreators) {
      const normalized = normalizeTwitterUsername(creator.twitter_username);
      if (normalized && !creators.has(normalized)) {
        creators.set(normalized, {
          twitter_username: normalized,
          is_auto_tracked: creator.is_auto_tracked || false,
          is_joined: true,
        });
      }
    }
  }

  // IMPORTANT: Also get auto-tracked creators from project_tweets (mentions)
  // These are creators who appear on the leaderboard but haven't joined
  const { data: autoTrackedTweets, error: tweetsError } = await supabase
    .from('project_tweets')
    .select('author_handle')
    .eq('project_id', projectId)
    .eq('is_official', false) // Only mentions, not official tweets
    .not('author_handle', 'is', null);

  if (!tweetsError && autoTrackedTweets) {
    // Get unique authors (these are auto-tracked creators)
    const autoTrackedUsernames = new Set<string>();
    for (const tweet of autoTrackedTweets) {
      const normalized = normalizeTwitterUsername(tweet.author_handle);
      if (normalized) {
        autoTrackedUsernames.add(normalized);
      }
    }

    // Add auto-tracked creators (only if not already in creators map)
    for (const username of autoTrackedUsernames) {
      if (!creators.has(username)) {
        creators.set(username, {
          twitter_username: username,
          is_auto_tracked: true,
          is_joined: false,
        });
      }
    }

    console.log(`[RefreshLeaderboardAvatars] Found ${autoTrackedUsernames.size} auto-tracked creators from project_tweets`);
  }

  return Array.from(creators.values());
}

/**
 * Check which creators are missing avatars in the database
 */
async function findMissingAvatars(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  creators: Array<{ twitter_username: string }>
): Promise<Array<string>> {
  if (creators.length === 0) {
    return [];
  }

  const usernames = creators.map(c => normalizeTwitterUsername(c.twitter_username)).filter(Boolean) as string[];
  if (usernames.length === 0) {
    return [];
  }

  // Check profiles table for avatars
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('username, profile_image_url')
    .in('username', usernames);

  if (error) {
    console.error('[RefreshLeaderboardAvatars] Error checking profiles:', error);
    return usernames; // Return all if we can't check
  }

  // Find usernames without avatars
  const profilesWithAvatars = new Set<string>();
  if (profiles) {
    for (const profile of profiles) {
      const normalized = normalizeTwitterUsername(profile.username);
      if (normalized && profile.profile_image_url && 
          typeof profile.profile_image_url === 'string' && 
          profile.profile_image_url.trim().length > 0 &&
          profile.profile_image_url.startsWith('http')) {
        profilesWithAvatars.add(normalized);
      }
    }
  }

  // Return usernames that don't have avatars
  return usernames.filter(username => !profilesWithAvatars.has(username));
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RefreshLeaderboardAvatarsResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    // Authentication
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return; // requirePortalUser already sent 401 response
    }

    const supabase = getSupabaseAdmin();

    // Check super admin
    const isSuperAdmin = await checkSuperAdmin(supabase, portalUser.userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
    }

    // Get project ID from query
    const { projectId } = req.query;
    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    // Get batch size from query (default: 5 to be rate-limit safe)
    const batchSize = Math.min(parseInt(req.query.batchSize as string, 10) || 5, 20);

    console.log(`[RefreshLeaderboardAvatars] Starting refresh for project ${projectId}...`);

    // 1. Get all creators from leaderboard
    const creators = await getLeaderboardCreators(supabase, projectId);
    console.log(`[RefreshLeaderboardAvatars] Found ${creators.length} creators in leaderboard`);

    if (creators.length === 0) {
      return res.status(200).json({
        ok: true,
        projectId,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        duration: Date.now() - startTime,
      });
    }

    // 2. Find which creators are missing avatars
    const missingAvatars = await findMissingAvatars(supabase, creators);
    console.log(`[RefreshLeaderboardAvatars] Found ${missingAvatars.length} creators missing avatars`);

    if (missingAvatars.length === 0) {
      return res.status(200).json({
        ok: true,
        projectId,
        processed: creators.length,
        succeeded: 0,
        failed: 0,
        skipped: creators.length,
        duration: Date.now() - startTime,
      });
    }

    // 3. Fetch profiles from Twitter API and save to database
    let succeeded = 0;
    let failed = 0;
    const errors: Array<{ username: string; error: string }> = [];

    console.log(`[RefreshLeaderboardAvatars] Fetching ${missingAvatars.length} profiles from Twitter API in batches of ${batchSize}...`);

    for (let i = 0; i < missingAvatars.length; i += batchSize) {
      const batch = missingAvatars.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (username) => {
        try {
          console.log(`[RefreshLeaderboardAvatars] Fetching profile for @${username}...`);
          
          // Fetch profile from Twitter API (same as sentiment track)
          const profile = await getUserProfile(username);
          
          if (!profile) {
            throw new Error('Profile not found');
          }

          // Save to database using upsertProfileFromTwitter (same as sentiment track)
          const profileId = await upsertProfileFromTwitter(supabase, profile);
          
          if (profileId) {
            console.log(`[RefreshLeaderboardAvatars] ✓ Successfully saved avatar for @${username}`);
            succeeded++;
          } else {
            throw new Error('Failed to save profile to database');
          }
        } catch (error: any) {
          console.error(`[RefreshLeaderboardAvatars] ✗ Failed to fetch/save avatar for @${username}:`, error.message);
          failed++;
          errors.push({
            username,
            error: error.message || 'Unknown error',
          });
        }
      });

      await Promise.all(batchPromises);

      // Rate limit: wait between batches (2 seconds to be safe)
      if (i + batchSize < missingAvatars.length) {
        console.log(`[RefreshLeaderboardAvatars] Waiting 2 seconds before next batch...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[RefreshLeaderboardAvatars] ✓ Completed: ${succeeded} succeeded, ${failed} failed, ${creators.length - missingAvatars.length} skipped`);

    return res.status(200).json({
      ok: true,
      projectId,
      processed: missingAvatars.length,
      succeeded,
      failed,
      skipped: creators.length - missingAvatars.length,
      errors: errors.length > 0 ? errors : undefined,
      duration,
    });
  } catch (error: any) {
    console.error('[RefreshLeaderboardAvatars] Unexpected error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to refresh leaderboard avatars',
      duration: Date.now() - startTime,
    });
  }
}
