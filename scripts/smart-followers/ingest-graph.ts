/**
 * Smart Followers Graph Ingestion Script
 * 
 * Builds tracked universe and fetches following lists to build graph edges.
 * Run daily via cron.
 * 
 * Usage: pnpm tsx scripts/smart-followers/ingest-graph.ts
 */

import { createServiceClient } from '@/web/lib/portal/supabase';
import { unifiedGetUserInfo } from '@/server/twitterClient';
import { fetchFollowingByUserId } from '@/server/rapidapi/twitter';

// =============================================================================
// CONFIGURATION
// =============================================================================

const BATCH_SIZE = 50; // Process profiles in batches
const DELAY_BETWEEN_BATCHES_MS = 2000; // 2 seconds between batches
const MAX_FOLLOWING_TO_FETCH = 500; // Max following per profile

// =============================================================================
// HELPERS
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build tracked universe from existing data sources
 */
async function buildTrackedUniverse(supabase: ReturnType<typeof createServiceClient>): Promise<Set<string>> {
  const universe = new Set<string>();

  console.log('[Graph Ingestion] Building tracked universe...');

  // 1. Authors from project_tweets (last 30 days)
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
        universe.add(username);
      }
    }
  }
  console.log(`[Graph Ingestion] Found ${universe.size} authors from project_tweets`);

  // 2. Arena creators
  const { data: arenaCreators } = await supabase
    .from('arena_creators')
    .select('twitter_username')
    .not('twitter_username', 'is', null);

  if (arenaCreators) {
    for (const creator of arenaCreators) {
      const username = creator.twitter_username?.toLowerCase().replace('@', '').trim();
      if (username) {
        universe.add(username);
      }
    }
  }
  console.log(`[Graph Ingestion] Found ${arenaCreators?.length || 0} arena creators`);

  // 3. Creator manager creators
  const { data: cmCreators } = await supabase
    .from('creator_manager_creators')
    .select('profiles:creator_profile_id(username)');

  if (cmCreators) {
    for (const creator of cmCreators) {
      const profile = Array.isArray(creator.profiles) ? creator.profiles[0] : creator.profiles;
      const username = profile?.username?.toLowerCase().replace('@', '').trim();
      if (username) {
        universe.add(username);
      }
    }
  }
  console.log(`[Graph Ingestion] Found ${cmCreators?.length || 0} creator manager creators`);

  // 4. Project official X handles
  const { data: projects } = await supabase
    .from('projects')
    .select('x_handle, twitter_username')
    .eq('is_active', true)
    .or('x_handle.not.is.null,twitter_username.not.is.null');

  if (projects) {
    for (const project of projects) {
      const handle = project.x_handle || project.twitter_username;
      if (handle) {
        const username = handle.toLowerCase().replace('@', '').trim();
        if (username) {
          universe.add(username);
        }
      }
    }
  }
  console.log(`[Graph Ingestion] Found ${projects?.length || 0} project handles`);

  console.log(`[Graph Ingestion] Total tracked universe size: ${universe.size}`);
  return universe;
}

/**
 * Upsert profile into tracked_profiles
 */
async function upsertTrackedProfile(
  supabase: ReturnType<typeof createServiceClient>,
  username: string
): Promise<string | null> {
  try {
    // Try to get user info
    const userInfo = await unifiedGetUserInfo(username);
    if (!userInfo) {
      console.warn(`[Graph Ingestion] Could not fetch user info for @${username}`);
      return null;
    }

    // Upsert into tracked_profiles
    const { data, error } = await supabase
      .from('tracked_profiles')
      .upsert({
        x_user_id: userInfo.id,
        username: username.toLowerCase().replace('@', '').trim(),
        followers_count: userInfo.followers,
        following_count: userInfo.following,
        account_created_at: userInfo.createdAt || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'x_user_id',
      })
      .select('x_user_id')
      .single();

    if (error) {
      console.error(`[Graph Ingestion] Error upserting profile @${username}:`, error);
      return null;
    }

    return data?.x_user_id || null;
  } catch (error: any) {
    console.error(`[Graph Ingestion] Exception upserting profile @${username}:`, error.message);
    return null;
  }
}

/**
 * Fetch and store following edges for a profile
 */
async function fetchAndStoreFollowingEdges(
  supabase: ReturnType<typeof createServiceClient>,
  xUserId: string,
  username: string
): Promise<number> {
  try {
    // Check if we have X API available (RapidAPI)
    // For now, skip if not available (will use fallback estimate mode)
    // TODO: Implement when X following API is available
    
    console.log(`[Graph Ingestion] TODO: Fetch following list for @${username} (x_user_id: ${xUserId})`);
    console.log(`[Graph Ingestion] Note: X following API not yet integrated, using fallback estimate mode`);
    
    return 0; // No edges stored yet
  } catch (error: any) {
    console.error(`[Graph Ingestion] Error fetching following for @${username}:`, error.message);
    return 0;
  }
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('[Graph Ingestion] Starting Smart Followers graph ingestion...');
  
  const supabase = createServiceClient();
  
  // 1. Build tracked universe
  const universe = await buildTrackedUniverse(supabase);
  console.log(`[Graph Ingestion] Tracked universe: ${universe.size} profiles`);

  // 2. Upsert all profiles into tracked_profiles
  const universeArray = Array.from(universe);
  let upserted = 0;
  let failed = 0;

  for (let i = 0; i < universeArray.length; i += BATCH_SIZE) {
    const batch = universeArray.slice(i, i + BATCH_SIZE);
    console.log(`[Graph Ingestion] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(universeArray.length / BATCH_SIZE)}`);

    for (const username of batch) {
      const xUserId = await upsertTrackedProfile(supabase, username);
      if (xUserId) {
        upserted++;
      } else {
        failed++;
      }
      await delay(100); // Small delay between profiles
    }

    if (i + BATCH_SIZE < universeArray.length) {
      await delay(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log(`[Graph Ingestion] Upserted ${upserted} profiles, ${failed} failed`);

  // 3. Fetch following lists (if X API available)
  // TODO: Implement when X following API is integrated
  console.log(`[Graph Ingestion] Following list fetch skipped (API not yet integrated)`);

  console.log('[Graph Ingestion] Graph ingestion complete!');
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('[Graph Ingestion] Fatal error:', error);
    process.exit(1);
  });
}

export { main as ingestGraph };

