/**
 * Smart Followers Tracked Universe Population Script
 * 
 * Populates tracked_profiles table from existing data sources:
 * - Distinct authors from project_tweets (last 30 days)
 * - arena_creators
 * - creator_manager_creators
 * - arc_quest_completions (if exists)
 * - Project official X handles
 * 
 * Usage: pnpm tsx scripts/smart-followers/populate-tracked-universe.ts
 */

import { createServiceClient } from '@/web/lib/portal/supabase';
import { unifiedGetUserInfo } from '@/server/twitterClient';

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('[Populate Tracked Universe] Starting tracked universe population...');
  
  const supabase = createServiceClient();
  const usernameSet = new Set<string>();

  // 1. Get distinct authors from project_tweets (last 30 days)
  console.log('[Populate Tracked Universe] Fetching authors from project_tweets...');
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: tweets } = await supabase
    .from('project_tweets')
    .select('author_handle')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .not('author_handle', 'is', null);

  if (tweets) {
    for (const tweet of tweets) {
      const username = tweet.author_handle?.toLowerCase().replace('@', '').trim();
      if (username) {
        usernameSet.add(username);
      }
    }
  }
  console.log(`[Populate Tracked Universe] Found ${usernameSet.size} unique authors from project_tweets`);

  // 2. Get arena creators
  console.log('[Populate Tracked Universe] Fetching arena creators...');
  const { data: arenaCreators } = await supabase
    .from('arena_creators')
    .select('twitter_username')
    .not('twitter_username', 'is', null);

  if (arenaCreators) {
    for (const creator of arenaCreators) {
      const username = creator.twitter_username?.toLowerCase().replace('@', '').trim();
      if (username) {
        usernameSet.add(username);
      }
    }
  }
  console.log(`[Populate Tracked Universe] Found ${arenaCreators?.length || 0} arena creators`);

  // 3. Get creator manager creators
  console.log('[Populate Tracked Universe] Fetching creator manager creators...');
  const { data: cmCreators } = await supabase
    .from('creator_manager_creators')
    .select('profiles:creator_profile_id(username)');

  if (cmCreators) {
    for (const creator of cmCreators) {
      const profile = Array.isArray(creator.profiles) ? creator.profiles[0] : creator.profiles;
      const username = profile?.username?.toLowerCase().replace('@', '').trim();
      if (username) {
        usernameSet.add(username);
      }
    }
  }
  console.log(`[Populate Tracked Universe] Found ${cmCreators?.length || 0} creator manager creators`);

  // 4. Get project official X handles
  console.log('[Populate Tracked Universe] Fetching project official handles...');
  const { data: projects } = await supabase
    .from('projects')
    .select('x_handle, twitter_username')
    .eq('is_active', true)
    .or('x_handle.not.is.null,twitter_username.not.is.null');

  if (projects) {
    for (const project of projects) {
      const handle = project.x_handle || project.twitter_username;
      if (handle) {
        const username = handle.replace('@', '').toLowerCase().trim();
        if (username) {
          usernameSet.add(username);
        }
      }
    }
  }
  console.log(`[Populate Tracked Universe] Found ${projects?.length || 0} project handles`);

  console.log(`[Populate Tracked Universe] Total unique usernames: ${usernameSet.size}`);

  // 5. Fetch user info and upsert to tracked_profiles
  console.log('[Populate Tracked Universe] Fetching user info and upserting to tracked_profiles...');
  let upserted = 0;
  let skipped = 0;
  let errors = 0;

  const usernames = Array.from(usernameSet);
  const BATCH_SIZE = 10;
  
  for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
    const batch = usernames.slice(i, i + BATCH_SIZE);
    
    await Promise.all(batch.map(async (username) => {
      try {
        // Check if already exists in tracked_profiles or profiles
        const { data: existing } = await supabase
          .from('tracked_profiles')
          .select('x_user_id')
          .eq('username', username)
          .maybeSingle();

        if (existing?.x_user_id) {
          skipped++;
          return; // Already exists
        }

        // Try to get from profiles table first
        const { data: profile } = await supabase
          .from('profiles')
          .select('twitter_id, followers, following, created_at_twitter')
          .eq('username', username)
          .maybeSingle();

        if (profile?.twitter_id) {
          // Upsert to tracked_profiles using profile data
          const { error: upsertError } = await supabase
            .from('tracked_profiles')
            .upsert({
              x_user_id: profile.twitter_id,
              username: username,
              followers_count: profile.followers || 0,
              following_count: profile.following || 0,
              account_created_at: profile.created_at_twitter || null,
              updated_at: new Date().toISOString(),
            }, {
              onConflict: 'x_user_id',
            });

          if (!upsertError) {
            upserted++;
          } else {
            console.error(`[Populate Tracked Universe] Error upserting ${username}:`, upsertError);
            errors++;
          }
          return;
        }

        // If not in profiles, try to fetch from Twitter API
        try {
          const userInfo = await unifiedGetUserInfo(username);
          if (userInfo && userInfo.userId) {
            const { error: upsertError } = await supabase
              .from('tracked_profiles')
              .upsert({
                x_user_id: userInfo.userId,
                username: username,
                followers_count: userInfo.followers || 0,
                following_count: userInfo.following || 0,
                account_created_at: userInfo.createdAt || null,
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'x_user_id',
              });

            if (!upsertError) {
              upserted++;
            } else {
              console.error(`[Populate Tracked Universe] Error upserting ${username}:`, upsertError);
              errors++;
            }
          } else {
            skipped++; // User not found
          }
        } catch (apiError: any) {
          // API error - skip this user
          console.warn(`[Populate Tracked Universe] Could not fetch user info for ${username}:`, apiError.message);
          skipped++;
        }
      } catch (error: any) {
        console.error(`[Populate Tracked Universe] Error processing ${username}:`, error.message);
        errors++;
      }
    }));

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < usernames.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(`[Populate Tracked Universe] Complete!`);
  console.log(`  Upserted: ${upserted}`);
  console.log(`  Skipped (already exists or not found): ${skipped}`);
  console.log(`  Errors: ${errors}`);
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('[Populate Tracked Universe] Fatal error:', error);
    process.exit(1);
  });
}

export { main as populateTrackedUniverse };

