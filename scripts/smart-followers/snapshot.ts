/**
 * Smart Followers Snapshot Script
 * 
 * Calculates and stores daily Smart Followers snapshots for all projects and creators.
 * Run daily via cron after PageRank calculation.
 * 
 * Usage: pnpm tsx scripts/smart-followers/snapshot.ts
 */

import { createServiceClient } from '@/web/lib/portal/supabase';
import { getSmartFollowers } from '@/server/smart-followers/calculate';

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('[Smart Followers Snapshot] Starting snapshot calculation...');
  
  const supabase = createServiceClient();
  const asOfDate = new Date();
  const dateStr = asOfDate.toISOString().split('T')[0];

  // 1. Get all active projects
  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, x_handle, twitter_username')
    .eq('is_active', true)
    .or('x_handle.not.is.null,twitter_username.not.is.null');

  if (projectsError) {
    console.error('[Smart Followers Snapshot] Error fetching projects:', projectsError);
    throw new Error('Failed to fetch projects');
  }

  console.log(`[Smart Followers Snapshot] Found ${projects?.length || 0} active projects`);

  // 2. Calculate Smart Followers for each project
  const projectSnapshots: Array<{
    entity_type: 'project';
    entity_id: string;
    x_user_id: string;
    smart_followers_count: number;
    smart_followers_pct: number;
    is_estimate: boolean;
  }> = [];

  for (const project of projects || []) {
    const handle = project.x_handle || project.twitter_username;
    if (!handle) continue;

    const cleanHandle = handle.replace('@', '').toLowerCase().trim();
    
    // Get x_user_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('twitter_id')
      .eq('username', cleanHandle)
      .maybeSingle();

    const xUserId = profile?.twitter_id || null;
    if (!xUserId) {
      // Try tracked_profiles
      const { data: tracked } = await supabase
        .from('tracked_profiles')
        .select('x_user_id')
        .eq('username', cleanHandle)
        .maybeSingle();

      if (!tracked?.x_user_id) {
        console.warn(`[Smart Followers Snapshot] Could not find x_user_id for project ${project.id} (@${cleanHandle})`);
        continue;
      }
    }

    try {
      const result = await getSmartFollowers(
        supabase,
        'project',
        project.id,
        xUserId || '',
        asOfDate
      );

      projectSnapshots.push({
        entity_type: 'project',
        entity_id: project.id,
        x_user_id: xUserId || '',
        smart_followers_count: result.smart_followers_count,
        smart_followers_pct: result.smart_followers_pct,
        is_estimate: result.is_estimate,
      });
    } catch (error: any) {
      console.error(`[Smart Followers Snapshot] Error calculating for project ${project.id}:`, error.message);
      // Continue with next project
    }
  }

  console.log(`[Smart Followers Snapshot] Calculated ${projectSnapshots.length} project snapshots`);

  // 3. Get all creators (from arena_creators and creator_manager_creators)
  const creatorUsernames = new Set<string>();

  // From arena_creators
  const { data: arenaCreators } = await supabase
    .from('arena_creators')
    .select('twitter_username')
    .not('twitter_username', 'is', null);

  if (arenaCreators) {
    for (const creator of arenaCreators) {
      const username = creator.twitter_username?.toLowerCase().replace('@', '').trim();
      if (username) {
        creatorUsernames.add(username);
      }
    }
  }

  // From creator_manager_creators
  const { data: cmCreators } = await supabase
    .from('creator_manager_creators')
    .select('profiles:creator_profile_id(username)');

  if (cmCreators) {
    for (const creator of cmCreators) {
      const profile = Array.isArray(creator.profiles) ? creator.profiles[0] : creator.profiles;
      const username = profile?.username?.toLowerCase().replace('@', '').trim();
      if (username) {
        creatorUsernames.add(username);
      }
    }
  }

  console.log(`[Smart Followers Snapshot] Found ${creatorUsernames.size} unique creators`);

  // 4. Calculate Smart Followers for each creator
  const creatorSnapshots: Array<{
    entity_type: 'creator';
    entity_id: string;
    x_user_id: string;
    smart_followers_count: number;
    smart_followers_pct: number;
    is_estimate: boolean;
  }> = [];

  for (const username of creatorUsernames) {
    // Get x_user_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('twitter_id')
      .eq('username', username)
      .maybeSingle();

    const xUserId = profile?.twitter_id || null;
    if (!xUserId) {
      // Try tracked_profiles
      const { data: tracked } = await supabase
        .from('tracked_profiles')
        .select('x_user_id')
        .eq('username', username)
        .maybeSingle();

      if (!tracked?.x_user_id) {
        continue; // Skip if not found
      }
    }

    try {
      const result = await getSmartFollowers(
        supabase,
        'creator',
        xUserId || '', // For creators, entity_id is x_user_id
        xUserId || '',
        asOfDate
      );

      creatorSnapshots.push({
        entity_type: 'creator',
        entity_id: xUserId || '',
        x_user_id: xUserId || '',
        smart_followers_count: result.smart_followers_count,
        smart_followers_pct: result.smart_followers_pct,
        is_estimate: result.is_estimate,
      });
    } catch (error: any) {
      console.error(`[Smart Followers Snapshot] Error calculating for creator @${username}:`, error.message);
      // Continue with next creator
    }
  }

  console.log(`[Smart Followers Snapshot] Calculated ${creatorSnapshots.length} creator snapshots`);

  // 5. Store all snapshots
  const allSnapshots = [
    ...projectSnapshots.map(s => ({
      entity_type: s.entity_type,
      entity_id: s.entity_id,
      x_user_id: s.x_user_id,
      smart_followers_count: s.smart_followers_count,
      smart_followers_pct: s.smart_followers_pct,
      as_of_date: dateStr,
      is_estimate: s.is_estimate,
    })),
    ...creatorSnapshots.map(s => ({
      entity_type: s.entity_type,
      entity_id: s.entity_id,
      x_user_id: s.x_user_id,
      smart_followers_count: s.smart_followers_count,
      smart_followers_pct: s.smart_followers_pct,
      as_of_date: dateStr,
      is_estimate: s.is_estimate,
    })),
  ];

  if (allSnapshots.length > 0) {
    const { error: upsertError } = await supabase
      .from('smart_followers_snapshots')
      .upsert(allSnapshots, {
        onConflict: 'entity_type,entity_id,x_user_id,as_of_date',
      });

    if (upsertError) {
      console.error('[Smart Followers Snapshot] Error storing snapshots:', upsertError);
      throw new Error('Failed to store snapshots');
    }

    console.log(`[Smart Followers Snapshot] Stored ${allSnapshots.length} snapshots`);
  }

  console.log('[Smart Followers Snapshot] Snapshot calculation complete!');
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('[Smart Followers Snapshot] Fatal error:', error);
    process.exit(1);
  });
}

export { main as calculateSnapshots };

