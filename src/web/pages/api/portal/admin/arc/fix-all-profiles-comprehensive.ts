/**
 * API Route: POST /api/portal/admin/arc/fix-all-profiles-comprehensive
 * 
 * COMPREHENSIVE FIX: Updates ALL profiles from sentiment data and ensures ARC has all avatars.
 * 
 * This endpoint does EVERYTHING in one go:
 * 1. Finds all mention authors from project_tweets
 * 2. Creates/updates profiles for all of them
 * 3. Fetches avatars from Twitter API for missing ones
 * 4. Updates ARC database
 * 
 * SuperAdmin only. This is a one-time comprehensive fix.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { saveMentionProfiles } from '@/lib/portal/save-mention-profiles';
import { getUserProfile } from '@/lib/twitter/twitter';
import { upsertProfileFromTwitter } from '@/lib/portal/profile-sync';
import { normalizeTwitterUsername } from '@/lib/portal/avatar-helper';

interface ComprehensiveFixResponse {
  ok: boolean;
  step1?: {
    totalMentions: number;
    uniqueAuthors: number;
    profilesCreated: number;
    profilesUpdated: number;
    profilesSkipped: number;
    profilesFailed: number;
  };
  step2?: {
    totalProcessed: number;
    totalSucceeded: number;
    totalFailed: number;
    totalSkipped: number;
  };
  duration?: number;
  error?: string;
}

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

    if (userRoles && userRoles.length > 0) return true;

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
        if (profile.real_roles.includes('super_admin')) return true;
      }
    }

    return false;
  } catch (error) {
    return false;
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ComprehensiveFixResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const startTime = Date.now();

  try {
    const user = await requirePortalUser(req, res);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const supabase = getSupabaseAdmin();
    const isSuperAdmin = await checkSuperAdmin(supabase, user.userId);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin access required' });
    }

    console.log('[ComprehensiveFix] Starting comprehensive profile fix...');

    // STEP 1: Update profiles from sentiment data using helper function
    console.log('[ComprehensiveFix] Step 1: Updating profiles from sentiment data...');
    
    const profileStats = await saveMentionProfiles(supabase);
    
    const step1Result = {
      totalMentions: profileStats.totalMentions,
      uniqueAuthors: profileStats.uniqueAuthors,
      profilesCreated: profileStats.profilesCreated,
      profilesUpdated: profileStats.profilesUpdated,
      profilesSkipped: profileStats.profilesSkipped,
      profilesFailed: profileStats.profilesFailed,
    };
    
      console.log(`[ComprehensiveFix] Step 1 complete:`, step1Result);

    // STEP 2: Refresh all avatars for missing ones
    console.log('[ComprehensiveFix] Step 2: Refreshing all avatars...');

    // Get all usernames that need avatars from all sources
    const allUsernames = new Set<string>();
    
    // From arena_creators
    const { data: arenaCreators } = await supabase
      .from('arena_creators')
      .select('twitter_username')
      .not('twitter_username', 'is', null);
    if (arenaCreators) {
      arenaCreators.forEach(c => {
        const normalized = normalizeTwitterUsername(c.twitter_username);
        if (normalized) allUsernames.add(normalized);
      });
    }

    // From project_creators
    const { data: projectCreators } = await supabase
      .from('project_creators')
      .select('twitter_username')
      .not('twitter_username', 'is', null);
    if (projectCreators) {
      projectCreators.forEach(c => {
        const normalized = normalizeTwitterUsername(c.twitter_username);
        if (normalized) allUsernames.add(normalized);
      });
    }

    // From project_tweets (auto-tracked) - get fresh data
    const { data: allMentionTweets } = await supabase
      .from('project_tweets')
      .select('author_handle')
      .eq('is_official', false)
      .not('author_handle', 'is', null)
      .limit(10000);
    if (allMentionTweets) {
      allMentionTweets.forEach(t => {
        if (t.author_handle) {
          const normalized = normalizeTwitterUsername(t.author_handle);
          if (normalized) allUsernames.add(normalized);
        }
      });
    }

    // Find which ones are missing avatars
    const usernamesArray = Array.from(allUsernames);
    const missingAvatars: string[] = [];

    const chunkSize = 100;
    for (let i = 0; i < usernamesArray.length; i += chunkSize) {
      const chunk = usernamesArray.slice(i, i + chunkSize);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('username, profile_image_url')
        .in('username', chunk);

      const profilesWithAvatars = new Set(
        (profiles || [])
          .filter(p => p.profile_image_url && p.profile_image_url.startsWith('http'))
          .map(p => normalizeTwitterUsername(p.username))
          .filter(Boolean)
      );

      chunk.forEach(u => {
        if (!profilesWithAvatars.has(u)) {
          missingAvatars.push(u);
        }
      });
    }

    console.log(`[ComprehensiveFix] ${missingAvatars.length} profiles need avatars`);

    // Refresh avatars
    let totalSucceeded = 0;
    let totalFailed = 0;
    let totalSkipped = 0;

    const batchSize = 5;
    for (let i = 0; i < missingAvatars.length; i += batchSize) {
      const batch = missingAvatars.slice(i, i + batchSize);
      console.log(`[ComprehensiveFix] Refreshing avatars batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(missingAvatars.length / batchSize)}...`);

      for (const username of batch) {
        try {
          const profile = await getUserProfile(username);
          if (profile && (profile.profileImageUrl || profile.avatarUrl)) {
            await upsertProfileFromTwitter(supabase, profile);
            totalSucceeded++;
          } else {
            totalSkipped++;
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error: any) {
          totalFailed++;
          console.error(`[ComprehensiveFix] Error refreshing @${username}:`, error?.message);
        }
      }

      if (i + batchSize < missingAvatars.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    const step2Result = {
      totalProcessed: missingAvatars.length,
      totalSucceeded,
      totalFailed,
      totalSkipped,
    };

    console.log(`[ComprehensiveFix] Step 2 complete:`, step2Result);
    console.log(`[ComprehensiveFix] Total duration: ${Date.now() - startTime}ms`);

    return res.status(200).json({
      ok: true,
      step1: step1Result,
      step2: step2Result,
      duration: Date.now() - startTime,
    });
  } catch (error: any) {
    console.error('[ComprehensiveFix] Unexpected error:', error);
    return res.status(500).json({
      ok: false,
      error: error?.message || 'Internal server error',
      duration: Date.now() - startTime,
    });
  }
}
