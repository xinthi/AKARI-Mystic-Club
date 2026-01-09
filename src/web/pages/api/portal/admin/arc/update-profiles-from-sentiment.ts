/**
 * API Route: POST /api/portal/admin/arc/update-profiles-from-sentiment
 * 
 * Updates profiles for all mention authors (auto-tracked creators) from sentiment data.
 * 
 * This endpoint:
 * 1. Finds all unique mention authors from project_tweets
 * 2. Checks which ones are missing profiles or avatars
 * 3. Fetches their profiles from Twitter API
 * 4. Saves/updates profiles in the database
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

interface UpdateProfilesResponse {
  ok: boolean;
  totalMentionAuthors?: number;
  profilesCreated?: number;
  profilesUpdated?: number;
  profilesSkipped?: number;
  profilesFailed?: number;
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
    const { data: userRoles } = await supabase
      .from('akari_user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'super_admin');

    if (userRoles && userRoles.length > 0) {
      return true;
    }

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
    console.error('[UpdateProfilesFromSentiment] Error in checkSuperAdmin:', error);
    return false;
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<UpdateProfilesResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed',
    });
  }

  const startTime = Date.now();

  try {
    // Authentication
    const user = await requirePortalUser(req, res);
    if (!user) {
      return res.status(401).json({
        ok: false,
        error: 'Unauthorized',
      });
    }

    const supabase = getSupabaseAdmin();

    // Check SuperAdmin
    const isSuperAdmin = await checkSuperAdmin(supabase, user.id);
    if (!isSuperAdmin) {
      return res.status(403).json({
        ok: false,
        error: 'SuperAdmin access required',
      });
    }

    console.log('[UpdateProfilesFromSentiment] Starting profile update from sentiment data...');

    // Step 1: Get all unique mention authors from project_tweets
    const { data: mentionTweets, error: tweetsError } = await supabase
      .from('project_tweets')
      .select('author_handle, author_profile_image_url')
      .eq('is_official', false) // Only mentions, not official tweets
      .not('author_handle', 'is', null)
      .limit(10000); // Limit to prevent huge queries

    if (tweetsError) {
      console.error('[UpdateProfilesFromSentiment] Error fetching mentions:', tweetsError);
      return res.status(500).json({
        ok: false,
        error: `Failed to fetch mentions: ${tweetsError.message}`,
      });
    }

    if (!mentionTweets || mentionTweets.length === 0) {
      return res.status(200).json({
        ok: true,
        totalMentionAuthors: 0,
        profilesCreated: 0,
        profilesUpdated: 0,
        profilesSkipped: 0,
        profilesFailed: 0,
        duration: Date.now() - startTime,
      });
    }

    // Step 2: Collect unique mention authors
    const uniqueAuthors = new Map<string, { handle: string; avatarUrl: string | null }>();
    
    for (const tweet of mentionTweets) {
      if (tweet.author_handle) {
        const normalized = normalizeTwitterUsername(tweet.author_handle);
        if (normalized && !uniqueAuthors.has(normalized)) {
          uniqueAuthors.set(normalized, {
            handle: normalized,
            avatarUrl: tweet.author_profile_image_url || null,
          });
        }
      }
    }

    console.log(`[UpdateProfilesFromSentiment] Found ${uniqueAuthors.size} unique mention authors`);

    // Step 3: Check which ones need profiles or avatar updates
    const authorsToProcess: string[] = [];
    const existingProfiles = new Map<string, { hasAvatar: boolean }>();

    if (uniqueAuthors.size > 0) {
      const authorHandles = Array.from(uniqueAuthors.keys());
      const chunkSize = 100;

      for (let i = 0; i < authorHandles.length; i += chunkSize) {
        const chunk = authorHandles.slice(i, i + chunkSize);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('username, profile_image_url')
          .in('username', chunk);

        if (profiles) {
          for (const profile of profiles) {
            const normalized = normalizeTwitterUsername(profile.username);
            if (normalized) {
              existingProfiles.set(normalized, {
                hasAvatar: !!(profile.profile_image_url && profile.profile_image_url.startsWith('http')),
              });
            }
          }
        }
      }

      // Determine which authors need processing
      for (const [normalized, data] of uniqueAuthors) {
        const existing = existingProfiles.get(normalized);
        if (!existing || !existing.hasAvatar) {
          authorsToProcess.push(normalized);
        }
      }
    }

    console.log(`[UpdateProfilesFromSentiment] ${authorsToProcess.length} authors need profiles/avatars`);

    // Step 4: Fetch and save profiles in batches
    const batchSize = 5; // Small batches to avoid rate limits
    let profilesCreated = 0;
    let profilesUpdated = 0;
    let profilesSkipped = 0;
    let profilesFailed = 0;
    const errors: Array<{ username: string; error: string }> = [];

    for (let i = 0; i < authorsToProcess.length; i += batchSize) {
      const batch = authorsToProcess.slice(i, i + batchSize);
      console.log(`[UpdateProfilesFromSentiment] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(authorsToProcess.length / batchSize)} (${batch.length} authors)...`);

      for (const username of batch) {
        try {
          // Fetch profile from Twitter API
          const profile = await getUserProfile(username);
          
          if (profile) {
            // Save to profiles table
            const profileId = await upsertProfileFromTwitter(supabase, profile);
            
            if (profileId) {
              const existing = existingProfiles.has(username);
              if (existing) {
                profilesUpdated++;
                console.log(`[UpdateProfilesFromSentiment] ✓ Updated profile for @${username}`);
              } else {
                profilesCreated++;
                console.log(`[UpdateProfilesFromSentiment] ✓ Created profile for @${username}`);
              }
            } else {
              profilesSkipped++;
              console.log(`[UpdateProfilesFromSentiment] ⚠️ Skipped @${username} (upsert returned null)`);
            }
          } else {
            profilesSkipped++;
            console.log(`[UpdateProfilesFromSentiment] ⚠️ Skipped @${username} (profile not found)`);
          }

          // Small delay between requests to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error: any) {
          profilesFailed++;
          const errorMessage = error?.message || String(error);
          errors.push({ username, error: errorMessage });
          console.error(`[UpdateProfilesFromSentiment] ❌ Error processing @${username}:`, errorMessage);
        }
      }

      // Longer delay between batches
      if (i + batchSize < authorsToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[UpdateProfilesFromSentiment] ========================================`);
    console.log(`[UpdateProfilesFromSentiment] Summary:`);
    console.log(`[UpdateProfilesFromSentiment] Total mention authors: ${uniqueAuthors.size}`);
    console.log(`[UpdateProfilesFromSentiment] Profiles created: ${profilesCreated}`);
    console.log(`[UpdateProfilesFromSentiment] Profiles updated: ${profilesUpdated}`);
    console.log(`[UpdateProfilesFromSentiment] Profiles skipped: ${profilesSkipped}`);
    console.log(`[UpdateProfilesFromSentiment] Profiles failed: ${profilesFailed}`);
    console.log(`[UpdateProfilesFromSentiment] Duration: ${duration}ms`);
    console.log(`[UpdateProfilesFromSentiment] ========================================`);

    return res.status(200).json({
      ok: true,
      totalMentionAuthors: uniqueAuthors.size,
      profilesCreated,
      profilesUpdated,
      profilesSkipped,
      profilesFailed,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined, // Limit errors in response
      duration,
    });
  } catch (error: any) {
    console.error('[UpdateProfilesFromSentiment] Unexpected error:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Internal server error',
      duration: Date.now() - startTime,
    });
  }
}
