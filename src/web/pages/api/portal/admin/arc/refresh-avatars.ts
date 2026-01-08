/**
 * API Route: POST /api/portal/admin/arc/refresh-avatars
 * 
 * Batch refresh avatars for profiles that need updating.
 * SuperAdmin only.
 * 
 * Finds profiles where:
 * - avatar_url is null OR
 * - avatar_updated_at < now() - 30 days OR
 * - needs_avatar_refresh = true
 * 
 * Resolves avatars in batches using Twitter API, updates DB, rate-limit safe.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { taioGetUserInfo } from '@/server/twitterapiio';

// =============================================================================
// TYPES
// =============================================================================

type RefreshAvatarsResponse =
  | {
      ok: true;
      processed: number;
      succeeded: number;
      failed: number;
      skipped: number;
      duration: number; // milliseconds
    }
  | {
      ok: false;
      error: string;
    };

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Normalize twitter username: strip @, lowercase, trim
 */
function normalizeTwitterUsername(username: string | null | undefined): string {
  if (!username) return '';
  return username.toLowerCase().replace(/^@+/, '').trim();
}

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
      console.error('[RefreshAvatars] Error checking akari_user_roles:', rolesError);
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
      console.error('[RefreshAvatars] Error checking akari_user_identities:', identityError);
    } else if (xIdentity?.username) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', normalizeTwitterUsername(xIdentity.username))
        .maybeSingle();

      if (profileError) {
        console.error('[RefreshAvatars] Error checking profiles.real_roles:', profileError);
      } else if (profile?.real_roles && Array.isArray(profile.real_roles)) {
        if (profile.real_roles.includes('super_admin')) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('[RefreshAvatars] Error in checkSuperAdmin:', error);
    return false;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RefreshAvatarsResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

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

    // Check Twitter API key
    const twitterApiKey = process.env.TWITTERAPIIO_API_KEY;
    if (!twitterApiKey) {
      return res.status(500).json({
        ok: false,
        error: 'TWITTERAPIIO_API_KEY is not configured',
      });
    }

    // Get query parameters
    const { limit = '100', batchSize = '10' } = req.query;
    const maxLimit = Math.min(parseInt(limit as string, 10) || 100, 500); // Cap at 500
    const batchSizeNum = Math.min(parseInt(batchSize as string, 10) || 10, 50); // Cap at 50

    // Find profiles that need avatar refresh
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: profilesNeedingRefresh, error: fetchError } = await supabase
      .from('profiles')
      .select('id, username, profile_image_url, avatar_updated_at, needs_avatar_refresh')
      .or(
        `profile_image_url.is.null,avatar_updated_at.is.null,avatar_updated_at.lt.${thirtyDaysAgo.toISOString()},needs_avatar_refresh.eq.true`
      )
      .limit(maxLimit)
      .order('needs_avatar_refresh', { ascending: false }) // Prioritize explicit refresh flag
      .order('avatar_updated_at', { ascending: true, nullsFirst: true }); // Then oldest first

    if (fetchError) {
      console.error('[RefreshAvatars] Error fetching profiles:', fetchError);
      return res.status(500).json({ ok: false, error: 'Failed to fetch profiles' });
    }

    if (!profilesNeedingRefresh || profilesNeedingRefresh.length === 0) {
      return res.status(200).json({
        ok: true,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        duration: 0,
      });
    }

    console.log(
      `[RefreshAvatars] Found ${profilesNeedingRefresh.length} profiles needing avatar refresh`
    );

    // Process in batches
    const startTime = Date.now();
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (let i = 0; i < profilesNeedingRefresh.length; i += batchSizeNum) {
      const batch = profilesNeedingRefresh.slice(i, i + batchSizeNum);
      console.log(
        `[RefreshAvatars] Processing batch ${Math.floor(i / batchSizeNum) + 1}/${Math.ceil(profilesNeedingRefresh.length / batchSizeNum)} (${batch.length} profiles)`
      );

      // Process batch sequentially to avoid rate limits
      for (const profile of batch) {
        const normalizedUsername = normalizeTwitterUsername(profile.username);
        if (!normalizedUsername) {
          skipped++;
          console.warn(`[RefreshAvatars] Skipping profile ${profile.id}: invalid username`);
          continue;
        }

        try {
          // Fetch from Twitter API
          const cleanUsername = normalizedUsername.replace(/^@+/, '').trim();
          const userInfo = await taioGetUserInfo(cleanUsername);

          if (userInfo && userInfo.profileImageUrl) {
            const avatarUrl = userInfo.profileImageUrl.trim();
            if (avatarUrl && avatarUrl.startsWith('http')) {
              // Update profile
              const { error: updateError } = await supabase
                .from('profiles')
                .update({
                  profile_image_url: avatarUrl,
                  avatar_updated_at: new Date().toISOString(),
                  needs_avatar_refresh: false,
                  twitter_id: userInfo.id || profile.id, // Update twitter_id if available
                  name: userInfo.name || profile.username,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', profile.id);

              if (updateError) {
                console.error(
                  `[RefreshAvatars] Failed to update profile ${profile.id}:`,
                  updateError
                );
                failed++;
              } else {
                succeeded++;
                console.log(
                  `[RefreshAvatars] ✓ Updated avatar for ${normalizedUsername} (${succeeded}/${profilesNeedingRefresh.length})`
                );
              }
            } else {
              console.warn(
                `[RefreshAvatars] Invalid avatar URL for ${normalizedUsername}: ${avatarUrl}`
              );
              failed++;
            }
          } else {
            console.warn(`[RefreshAvatars] No avatar found for ${normalizedUsername}`);
            // Mark as failed but don't set needs_avatar_refresh to false (might be temporary)
            failed++;
          }

          // Rate limit: 200ms delay between requests
          if (i + batch.length < profilesNeedingRefresh.length) {
            await new Promise((resolve) => setTimeout(resolve, 200));
          }
        } catch (error: any) {
          console.error(
            `[RefreshAvatars] Error processing ${normalizedUsername}:`,
            error?.message || error
          );
          failed++;
        }
      }

      // Longer delay between batches
      if (i + batchSizeNum < profilesNeedingRefresh.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const duration = Date.now() - startTime;

    console.log(`[RefreshAvatars] ========================================`);
    console.log(`[RefreshAvatars] Completed in ${Math.round(duration / 1000)}s`);
    console.log(`[RefreshAvatars] Processed: ${profilesNeedingRefresh.length}`);
    console.log(`[RefreshAvatars] Succeeded: ${succeeded}`);
    console.log(`[RefreshAvatars] Failed: ${failed}`);
    console.log(`[RefreshAvatars] Skipped: ${skipped}`);
    console.log(`[RefreshAvatars] ========================================`);

    return res.status(200).json({
      ok: true,
      processed: profilesNeedingRefresh.length,
      succeeded,
      failed,
      skipped,
      duration,
    });
  } catch (error: any) {
    console.error('[RefreshAvatars] Unexpected error:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Internal server error',
    });
  }
}
