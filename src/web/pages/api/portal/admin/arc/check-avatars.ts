/**
 * Diagnostic API: Check avatar status for leaderboard profiles
 * GET /api/portal/admin/arc/check-avatars?projectId=xxx
 * 
 * Returns a detailed report of avatar status for all profiles in a project's leaderboard
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { normalizeTwitterUsername } from '@/lib/portal/avatar-helper';

interface AvatarStatus {
  username: string;
  normalizedUsername: string;
  hasProfile: boolean;
  hasAvatar: boolean;
  avatarUrl: string | null;
  source: 'profiles' | 'project_tweets' | 'tracked_profiles' | 'none';
  needsRefresh: boolean | null;
  avatarUpdatedAt: string | null;
  isAutoTracked: boolean;
  isJoined: boolean;
}

interface CheckAvatarsResponse {
  ok: boolean;
  projectId?: string;
  totalProfiles?: number;
  profiles?: AvatarStatus[];
  summary?: {
    withAvatars: number;
    withoutAvatars: number;
    missingProfiles: number;
    needsRefresh: number;
  };
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
      console.error('[CheckAvatars] Error checking akari_user_roles:', rolesError);
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
      console.error('[CheckAvatars] Error checking akari_user_identities:', identityError);
    } else if (xIdentity?.username) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('real_roles')
        .eq('username', normalizeTwitterUsername(xIdentity.username))
        .maybeSingle();

      if (profileError) {
        console.error('[CheckAvatars] Error checking profiles.real_roles:', profileError);
      } else if (profile?.real_roles && Array.isArray(profile.real_roles)) {
        if (profile.real_roles.includes('super_admin')) {
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('[CheckAvatars] Error in checkSuperAdmin:', error);
    return false;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CheckAvatarsResponse>
) {
  if (req.method !== 'GET') {
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

    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    // Get all creators from the leaderboard
    // First, get the arena for this project
    const { data: arena, error: arenaLookupError } = await supabase
      .from('arenas')
      .select('id')
      .eq('project_id', projectId)
      .limit(1)
      .maybeSingle();

    if (arenaLookupError) {
      console.error('[CheckAvatars] Error fetching arena:', arenaLookupError);
    }

    let arenaCreators: any[] | null = null;
    if (arena?.id) {
      const { data: ac, error: arenaError } = await supabase
        .from('arena_creators')
        .select('twitter_username, is_auto_tracked, profile_id')
        .eq('arena_id', arena.id);

      if (arenaError) {
        console.error('[CheckAvatars] Error fetching arena creators:', arenaError);
      } else {
        arenaCreators = ac;
      }
    }

    // Also get creators from project_creators (joined creators)
    const { data: projectCreators, error: projectError } = await supabase
      .from('project_creators')
      .select('twitter_username, profile_id')
      .eq('project_id', projectId);

    if (projectError) {
      console.error('[CheckAvatars] Error fetching project creators:', projectError);
    }

    // Collect all unique usernames
    const allUsernames = new Set<string>();
    const usernameMap = new Map<string, { isAutoTracked: boolean; isJoined: boolean; profileId: string | null }>();

    if (arenaCreators) {
      for (const creator of arenaCreators) {
        if (creator.twitter_username) {
          const normalized = normalizeTwitterUsername(creator.twitter_username);
          if (normalized) {
            allUsernames.add(normalized);
            usernameMap.set(normalized, {
              isAutoTracked: creator.is_auto_tracked || false,
              isJoined: false,
              profileId: creator.profile_id || null,
            });
          }
        }
      }
    }

    if (projectCreators) {
      for (const creator of projectCreators) {
        if (creator.twitter_username) {
          const normalized = normalizeTwitterUsername(creator.twitter_username);
          if (normalized) {
            allUsernames.add(normalized);
            const existing = usernameMap.get(normalized);
            if (existing) {
              existing.isJoined = true;
              existing.profileId = creator.profile_id || existing.profileId;
            } else {
              usernameMap.set(normalized, {
                isAutoTracked: false,
                isJoined: true,
                profileId: creator.profile_id || null,
              });
            }
          }
        }
      }
    }

    // Get all usernames as array for querying
    const usernamesArray = Array.from(allUsernames);

    if (usernamesArray.length === 0) {
      return res.status(200).json({
        ok: true,
        projectId,
        totalProfiles: 0,
        profiles: [],
        summary: {
          withAvatars: 0,
          withoutAvatars: 0,
          missingProfiles: 0,
          needsRefresh: 0,
        },
      });
    }

    // Query profiles table for all usernames (try variations)
    const allVariations = new Set<string>();
    for (const username of usernamesArray) {
      allVariations.add(username);
      allVariations.add(username.toLowerCase());
      allVariations.add(`@${username}`);
      allVariations.add(`@${username.toLowerCase()}`);
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('username, profile_image_url, avatar_updated_at, needs_avatar_refresh')
      .in('username', Array.from(allVariations));

    if (profilesError) {
      console.error('[CheckAvatars] Error fetching profiles:', profilesError);
    }

    // Query project_tweets for avatar URLs as fallback
    const { data: tweets, error: tweetsError } = await supabase
      .from('project_tweets')
      .select('author_handle, author_profile_image_url')
      .eq('project_id', projectId)
      .not('author_profile_image_url', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (tweetsError) {
      console.error('[CheckAvatars] Error fetching tweets:', tweetsError);
    }

    // Query tracked_profiles as fallback
    const { data: trackedProfiles, error: trackedError } = await supabase
      .from('tracked_profiles')
      .select('username, profile_image_url')
      .in('username', usernamesArray.map(u => u.toLowerCase()))
      .not('profile_image_url', 'is', null);

    if (trackedError) {
      console.error('[CheckAvatars] Error fetching tracked profiles:', trackedError);
    }

    // Build avatar map
    const avatarMap = new Map<string, { url: string; source: 'profiles' | 'project_tweets' | 'tracked_profiles' }>();

    // From profiles table
    if (profiles) {
      for (const profile of profiles) {
        if (profile.username && profile.profile_image_url) {
          const normalized = normalizeTwitterUsername(profile.username);
          if (normalized && profile.profile_image_url.startsWith('http')) {
            avatarMap.set(normalized, { url: profile.profile_image_url, source: 'profiles' });
          }
        }
      }
    }

    // From project_tweets
    if (tweets) {
      for (const tweet of tweets) {
        if (tweet.author_handle && tweet.author_profile_image_url) {
          const normalized = normalizeTwitterUsername(tweet.author_handle);
          if (normalized && !avatarMap.has(normalized) && tweet.author_profile_image_url.startsWith('http')) {
            avatarMap.set(normalized, { url: tweet.author_profile_image_url, source: 'project_tweets' });
          }
        }
      }
    }

    // From tracked_profiles
    if (trackedProfiles) {
      for (const tracked of trackedProfiles) {
        if (tracked.username && tracked.profile_image_url) {
          const normalized = normalizeTwitterUsername(tracked.username);
          if (normalized && !avatarMap.has(normalized) && tracked.profile_image_url.startsWith('http')) {
            avatarMap.set(normalized, { url: tracked.profile_image_url, source: 'tracked_profiles' });
          }
        }
      }
    }

    // Build profile status report
    const profileStatuses: AvatarStatus[] = [];
    const profileMap = new Map<string, typeof profiles[0]>();

    if (profiles) {
      for (const profile of profiles) {
        const normalized = normalizeTwitterUsername(profile.username);
        if (normalized) {
          profileMap.set(normalized, profile);
        }
      }
    }

    for (const username of usernamesArray) {
      const normalized = normalizeTwitterUsername(username);
      if (!normalized) continue;

      const meta = usernameMap.get(normalized);
      const profile = profileMap.get(normalized);
      const avatar = avatarMap.get(normalized);

      const status: AvatarStatus = {
        username: normalized,
        normalizedUsername: normalized,
        hasProfile: !!profile,
        hasAvatar: !!avatar,
        avatarUrl: avatar?.url || null,
        source: avatar?.source || 'none',
        needsRefresh: profile?.needs_avatar_refresh || null,
        avatarUpdatedAt: profile?.avatar_updated_at || null,
        isAutoTracked: meta?.isAutoTracked || false,
        isJoined: meta?.isJoined || false,
      };

      profileStatuses.push(status);
    }

    // Calculate summary
    const summary = {
      withAvatars: profileStatuses.filter(p => p.hasAvatar).length,
      withoutAvatars: profileStatuses.filter(p => !p.hasAvatar).length,
      missingProfiles: profileStatuses.filter(p => !p.hasProfile).length,
      needsRefresh: profileStatuses.filter(p => p.needsRefresh === true).length,
    };

    return res.status(200).json({
      ok: true,
      projectId,
      totalProfiles: profileStatuses.length,
      profiles: profileStatuses,
      summary,
    });
  } catch (error: any) {
    console.error('[CheckAvatars] Unexpected error:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Internal server error',
    });
  }
}
