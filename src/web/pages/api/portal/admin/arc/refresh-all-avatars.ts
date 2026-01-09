/**
 * API Route: POST /api/portal/admin/arc/refresh-all-avatars
 * 
 * Comprehensive avatar refresh for ALL projects and ALL places where profiles appear:
 * - ARC leaderboards (all projects)
 * - Sentiment pages (influencers, inner circle)
 * - Creator Manager programs
 * - Any profiles in the database
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

interface RefreshAllAvatarsResponse {
  ok: boolean;
  totalProcessed?: number;
  totalSucceeded?: number;
  totalFailed?: number;
  totalSkipped?: number;
  projects?: Array<{
    projectId: string;
    projectName: string;
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  }>;
  otherSources?: {
    sentimentInfluencers: number;
    creatorManagerCreators: number;
    allProfiles: number;
  };
  errors?: Array<{ username: string; error: string; source: string }>;
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
    const { data: userRoles } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin');

    if (userRoles && userRoles.length > 0) {
      return true;
    }

    // Also check profiles.real_roles via Twitter username
    const { data: xIdentity } = await supabase
      .from('akari_user_identities')
      .select('username')
      .eq('user_id', userId)
      .eq('provider', 'x')
      .maybeSingle();

    if (xIdentity?.username) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', normalizeTwitterUsername(xIdentity.username))
        .maybeSingle();

      if (profile?.real_roles && Array.isArray(profile.real_roles)) {
        if (profile.real_roles.includes('super_admin')) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('[RefreshAllAvatars] Error in checkSuperAdmin:', error);
    return false;
  }
}

/**
 * Get all unique usernames from a source
 */
async function getUsernamesFromSource(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  source: 'arc' | 'sentiment' | 'creator_manager' | 'all_profiles'
): Promise<Set<string>> {
  const usernames = new Set<string>();

  try {
    if (source === 'arc') {
      // Get from all arena_creators
      const { data: arenaCreators } = await supabase
        .from('arena_creators')
        .select('twitter_username')
        .not('twitter_username', 'is', null);

      if (arenaCreators) {
        for (const creator of arenaCreators) {
          const normalized = normalizeTwitterUsername(creator.twitter_username);
          if (normalized) {
            usernames.add(normalized);
          }
        }
      }

      // Get from project_creators
      const { data: projectCreators } = await supabase
        .from('project_creators')
        .select('twitter_username')
        .not('twitter_username', 'is', null);

      if (projectCreators) {
        for (const creator of projectCreators) {
          const normalized = normalizeTwitterUsername(creator.twitter_username);
          if (normalized) {
            usernames.add(normalized);
          }
        }
      }

      // IMPORTANT: Also get auto-tracked creators from project_tweets (mentions)
      // These are creators who appear on leaderboards but haven't joined
      const { data: autoTrackedTweets } = await supabase
        .from('project_tweets')
        .select('author_handle')
        .eq('is_official', false) // Only mentions, not official tweets
        .not('author_handle', 'is', null)
        .limit(10000); // Limit to prevent huge queries

      if (autoTrackedTweets) {
        for (const tweet of autoTrackedTweets) {
          const normalized = normalizeTwitterUsername(tweet.author_handle);
          if (normalized) {
            usernames.add(normalized);
          }
        }
      }
    } else if (source === 'sentiment') {
      // Get from project_influencers
      const { data: influencers } = await supabase
        .from('project_influencers')
        .select('x_handle')
        .not('x_handle', 'is', null);

      if (influencers) {
        for (const inf of influencers) {
          const normalized = normalizeTwitterUsername(inf.x_handle);
          if (normalized) {
            usernames.add(normalized);
          }
        }
      }

      // Get from project_tweets (authors)
      const { data: tweets } = await supabase
        .from('project_tweets')
        .select('author_handle')
        .not('author_handle', 'is', null)
        .eq('is_official', false)
        .limit(10000); // Limit to avoid huge queries

      if (tweets) {
        for (const tweet of tweets) {
          const normalized = normalizeTwitterUsername(tweet.author_handle);
          if (normalized) {
            usernames.add(normalized);
          }
        }
      }
    } else if (source === 'creator_manager') {
      // Get from creator_manager_creators via profiles
      const { data: creators } = await supabase
        .from('creator_manager_creators')
        .select('creator_profile_id');

      if (creators && creators.length > 0) {
        const profileIds = creators
          .map(c => c.creator_profile_id)
          .filter(Boolean);

        if (profileIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('username')
            .in('id', profileIds)
            .not('username', 'is', null);

          if (profiles) {
            for (const profile of profiles) {
              const normalized = normalizeTwitterUsername(profile.username);
              if (normalized) {
                usernames.add(normalized);
              }
            }
          }
        }
      }
    } else if (source === 'all_profiles') {
      // Get all profiles that are missing avatars
      const { data: profiles } = await supabase
        .from('profiles')
        .select('username')
        .not('username', 'is', null)
        .or('profile_image_url.is.null,profile_image_url.eq.');

      if (profiles) {
        for (const profile of profiles) {
          const normalized = normalizeTwitterUsername(profile.username);
          if (normalized) {
            usernames.add(normalized);
          }
        }
      }
    }
  } catch (error) {
    console.error(`[RefreshAllAvatars] Error getting usernames from ${source}:`, error);
  }

  return usernames;
}

/**
 * Find which usernames are missing avatars
 */
async function findMissingAvatars(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  usernames: Set<string>
): Promise<string[]> {
  if (usernames.size === 0) {
    return [];
  }

  const usernameArray = Array.from(usernames);
  const missing: string[] = [];

  try {
    // Check profiles table
    const { data: profiles } = await supabase
      .from('profiles')
      .select('username, profile_image_url')
      .in('username', usernameArray);

    const profileMap = new Map<string, boolean>();
    if (profiles) {
      for (const profile of profiles) {
        const normalized = normalizeTwitterUsername(profile.username);
        if (normalized) {
          const hasAvatar = profile.profile_image_url && 
                           typeof profile.profile_image_url === 'string' &&
                           profile.profile_image_url.trim().length > 0 &&
                           profile.profile_image_url.startsWith('http');
          profileMap.set(normalized, hasAvatar);
        }
      }
    }

    // Find missing
    for (const username of usernameArray) {
      const hasAvatar = profileMap.get(username);
      if (!hasAvatar) {
        missing.push(username);
      }
    }
  } catch (error) {
    console.error('[RefreshAllAvatars] Error finding missing avatars:', error);
    // If error, assume all are missing (safer to refresh than skip)
    return usernameArray;
  }

  return missing;
}

/**
 * Refresh avatars for a batch of usernames
 */
async function refreshAvatarsBatch(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  usernames: string[],
  batchSize: number
): Promise<{ succeeded: number; failed: number; errors: Array<{ username: string; error: string }> }> {
  let succeeded = 0;
  let failed = 0;
  const errors: Array<{ username: string; error: string }> = [];

  for (let i = 0; i < usernames.length; i += batchSize) {
    const batch = usernames.slice(i, i + batchSize);

    const batchPromises = batch.map(async (username) => {
      try {
        // Fetch profile from Twitter API
        const profile = await getUserProfile(username);

        if (!profile) {
          throw new Error('Profile not found');
        }

        // Save to database
        const profileId = await upsertProfileFromTwitter(supabase, profile);

        if (profileId) {
          succeeded++;
        } else {
          throw new Error('Failed to save profile to database');
        }
      } catch (error: any) {
        failed++;
        errors.push({
          username,
          error: error.message || 'Unknown error',
        });
      }
    });

    await Promise.all(batchPromises);

    // Rate limit: wait between batches
    if (i + batchSize < usernames.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return { succeeded, failed, errors };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RefreshAllAvatarsResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    // Authentication
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return;
    }

    const supabase = getSupabaseAdmin();

    // Check super admin
    const isSuperAdmin = await checkSuperAdmin(supabase, portalUser.userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
    }

    // Get batch size from query (default: 5 to be rate-limit safe)
    const batchSize = Math.min(parseInt(req.query.batchSize as string, 10) || 5, 20);

    console.log('[RefreshAllAvatars] Starting comprehensive avatar refresh...');

    // 1. Get all usernames from all sources
    console.log('[RefreshAllAvatars] Collecting usernames from all sources...');
    
    const [arcUsernames, sentimentUsernames, creatorManagerUsernames, allProfileUsernames] = await Promise.all([
      getUsernamesFromSource(supabase, 'arc'),
      getUsernamesFromSource(supabase, 'sentiment'),
      getUsernamesFromSource(supabase, 'creator_manager'),
      getUsernamesFromSource(supabase, 'all_profiles'),
    ]);

    // Combine all unique usernames
    const allUsernames = new Set<string>();
    [arcUsernames, sentimentUsernames, creatorManagerUsernames, allProfileUsernames].forEach(set => {
      set.forEach(username => allUsernames.add(username));
    });

    console.log(`[RefreshAllAvatars] Found ${allUsernames.size} unique usernames across all sources`);
    console.log(`  - ARC: ${arcUsernames.size}`);
    console.log(`  - Sentiment: ${sentimentUsernames.size}`);
    console.log(`  - Creator Manager: ${creatorManagerUsernames.size}`);
    console.log(`  - All Profiles (missing avatars): ${allProfileUsernames.size}`);

    // 2. Find which ones are missing avatars
    const missingAvatars = await findMissingAvatars(supabase, allUsernames);
    console.log(`[RefreshAllAvatars] Found ${missingAvatars.length} usernames missing avatars`);

    if (missingAvatars.length === 0) {
      return res.status(200).json({
        ok: true,
        totalProcessed: 0,
        totalSucceeded: 0,
        totalFailed: 0,
        totalSkipped: allUsernames.size,
        otherSources: {
          sentimentInfluencers: sentimentUsernames.size,
          creatorManagerCreators: creatorManagerUsernames.size,
          allProfiles: allProfileUsernames.size,
        },
        duration: Date.now() - startTime,
      });
    }

    // 3. Refresh avatars
    console.log(`[RefreshAllAvatars] Refreshing ${missingAvatars.length} avatars in batches of ${batchSize}...`);
    const { succeeded, failed, errors } = await refreshAvatarsBatch(supabase, missingAvatars, batchSize);

    const duration = Date.now() - startTime;

    console.log(`[RefreshAllAvatars] ✓ Completed: ${succeeded} succeeded, ${failed} failed, ${allUsernames.size - missingAvatars.length} skipped`);

    return res.status(200).json({
      ok: true,
      totalProcessed: missingAvatars.length,
      totalSucceeded: succeeded,
      totalFailed: failed,
      totalSkipped: allUsernames.size - missingAvatars.length,
      otherSources: {
        sentimentInfluencers: sentimentUsernames.size,
        creatorManagerCreators: creatorManagerUsernames.size,
        allProfiles: allProfileUsernames.size,
      },
      errors: errors.length > 0 ? errors.map(e => ({ ...e, source: 'all' })) : undefined,
      duration,
    });
  } catch (error: any) {
    console.error('[RefreshAllAvatars] Unexpected error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message || 'Failed to refresh all avatars',
      duration: Date.now() - startTime,
    });
  }
}
