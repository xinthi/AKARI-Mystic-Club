/**
 * ARC Live/Upcoming Unified Helper
 * 
 * Provides a single source of truth for what should appear in the ARC Live/Upcoming sections.
 * Handles all three ARC option types:
 * - Option 1: CRM Campaigns (arc_campaigns)
 * - Option 2: Arena Leaderboards (arenas)
 * - Option 3: Gamified (arc_quests)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { requireArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

export type ArcLiveItemKind = 'arena' | 'campaign' | 'gamified' | 'crm';

export interface ArcLiveItem {
  kind: ArcLiveItemKind;
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string | null;
  projectAccessLevel?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified' | null;
  title: string;
  slug: string | null;
  xHandle: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: 'live' | 'upcoming';
  creatorCount?: number;
  // Backward compatibility fields
  arenaId?: string;
  arenaSlug?: string;
  campaignId?: string;
  campaignSlug?: string;
  programId?: string;
  visibility?: 'private' | 'public' | 'hybrid';
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Get all live and upcoming ARC items across all three option types
 * 
 * @param supabase - Supabase client
 * @param limit - Maximum number of items to return
 * @param bypassAccessCheck - If true, skip access checks (for superadmin)
 */
export async function getArcLiveItems(
  supabase: SupabaseClient,
  limit: number = 20,
  bypassAccessCheck: boolean = false
): Promise<{ live: ArcLiveItem[]; upcoming: ArcLiveItem[] }> {
  const now = new Date();
  const live: ArcLiveItem[] = [];
  const upcoming: ArcLiveItem[] = [];

  // Fetch all items in parallel
  const [arenasResult, campaignsResult, questsResult, programsResult] = await Promise.all([
    fetchArenas(supabase),
    fetchCampaigns(supabase),
    fetchQuests(supabase),
    fetchCreatorManagerPrograms(supabase),
  ]);

  // Process arenas (Option 2)
  // Live leaderboard visibility rules:
  // - arena.kind='ms' (already filtered in fetchArenas)
  // - arena.status='active' (already filtered in fetchArenas)
  // - now() between starts_at and ends_at (already filtered in fetchArenas)
  // - leaderboard_enabled = true (check here)
  // - Request status must NOT block live visibility (no approval check needed)
  console.log(`[getArcLiveItems] Processing ${arenasResult.length} arenas (bypassAccessCheck: ${bypassAccessCheck})`);
  
  // Get leaderboard_enabled status for all projects with arenas
  const projectLeaderboardEnabledMap = new Map<string, boolean>();
  
  if (!bypassAccessCheck && arenasResult.length > 0) {
    const uniqueProjectIds = [...new Set(arenasResult.map(a => a.projectId))];
    
    // Get leaderboard_enabled for all projects (no approval check needed)
    const { data: features } = await supabase
      .from('arc_project_features')
      .select('project_id, leaderboard_enabled')
      .in('project_id', uniqueProjectIds);
    
    if (features) {
      features.forEach(f => {
        projectLeaderboardEnabledMap.set(f.project_id, f.leaderboard_enabled || false);
      });
    }
  }
  
  for (const arena of arenasResult) {
    // Log arena details before access check
    const projectName = arena.project?.name || 'Unknown';
    const hasProjectData = !!arena.project;
    
    console.log(`[getArcLiveItems] Processing arena ${arena.id} for project ${arena.projectId}:`, {
      name: arena.name,
      slug: arena.slug,
      status: arena.status,
      startsAt: arena.startsAt,
      endsAt: arena.endsAt,
      projectName,
      hasProjectData,
      projectId: arena.projectId,
    });

    // Check if leaderboard_enabled = true (unless bypassed for superadmin)
    if (!bypassAccessCheck) {
      const leaderboardEnabled = projectLeaderboardEnabledMap.get(arena.projectId) || false;
      
      if (!leaderboardEnabled) {
        console.log(`[getArcLiveItems] ❌ Arena ${arena.id} (project ${projectName || arena.projectId}) FAILED: leaderboard_enabled = false`);
        continue;
      }
      
      console.log(`[getArcLiveItems] ✅ Arena ${arena.id} (project ${projectName || arena.projectId}) PASSED: leaderboard_enabled = true`);
    } else {
      console.log(`[getArcLiveItems] 🔓 Arena ${arena.id} (project ${projectName || arena.projectId}) ACCESS CHECK BYPASSED (superadmin mode)`);
    }

    const item = createArenaItem(arena);
    const itemStatus = determineStatus(item.startsAt, item.endsAt, now);
    
    console.log(`[getArcLiveItems] Arena ${item.title} (project: ${item.projectName}) status determination:`, {
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      determinedStatus: itemStatus,
      now: now.toISOString(),
      startDateInFuture: item.startsAt ? new Date(item.startsAt) > now : false,
      endDateInPast: item.endsAt ? new Date(item.endsAt) < now : false,
    });
    
    if (itemStatus === 'live') {
      live.push(item);
      console.log(`[getArcLiveItems] ✅✅✅ ADDED TO LIVE: ${item.title} (project: ${item.projectName}, slug: ${item.slug}, id: ${item.id})`);
    } else if (itemStatus === 'upcoming') {
      upcoming.push(item);
      console.log(`[getArcLiveItems] ⏳⏳⏳ ADDED TO UPCOMING: ${item.title} (project: ${item.projectName}, slug: ${item.slug}) - Start date is in the future`);
    } else {
      console.log(`[getArcLiveItems] ❌❌❌ EXCLUDED: Arena ${item.title} (project: ${item.projectName}) status is null - ended or invalid dates`);
    }
  }

  // Process campaigns (Option 1)
  for (const campaign of campaignsResult) {
    // Check if project has Option 1 unlocked (unless bypassed for superadmin)
    if (!bypassAccessCheck) {
      const accessCheck = await requireArcAccess(supabase, campaign.projectId, 1);
      if (!accessCheck.ok) {
        continue;
      }
    }

    const item = createCampaignItem(campaign);
    const itemStatus = determineStatus(item.startsAt, item.endsAt, now);
    
    if (itemStatus === 'live') {
      live.push(item);
    } else if (itemStatus === 'upcoming') {
      upcoming.push(item);
    }
  }

  // Process quests (Option 3)
  for (const quest of questsResult) {
    // Check if project has Option 3 unlocked (unless bypassed for superadmin)
    if (!bypassAccessCheck) {
      const accessCheck = await requireArcAccess(supabase, quest.projectId, 3);
      if (!accessCheck.ok) {
        continue;
      }
    }

    const item = createQuestItem(quest);
    const itemStatus = determineStatus(item.startsAt, item.endsAt, now);
    
    if (itemStatus === 'live') {
      live.push(item);
    } else if (itemStatus === 'upcoming') {
      upcoming.push(item);
    }
  }

  // Process creator manager programs (CRM)
  for (const program of programsResult) {
    // Check if project has Option 1 (CRM) unlocked (unless bypassed for superadmin)
    if (!bypassAccessCheck) {
      const accessCheck = await requireArcAccess(supabase, program.projectId, 1);
      if (!accessCheck.ok) {
        continue;
      }
    }

    const item = createProgramItem(program);
    const itemStatus = determineStatus(item.startsAt, item.endsAt, now);
    
    // Include private programs too (they'll be shown but not clickable for non-admins)
    if (itemStatus === 'live') {
      live.push(item);
    } else if (itemStatus === 'upcoming') {
      upcoming.push(item);
    }
  }

  // Deduplicate: Remove duplicates by arena.id (same arena appearing multiple times)
  // Also deduplicate by projectId + kind (same project with multiple arenas of same kind)
  const seenArenaIds = new Set<string>();
  const seenProjectKind = new Set<string>();
  
  const deduplicatedLive: ArcLiveItem[] = [];
  const deduplicatedUpcoming: ArcLiveItem[] = [];
  
  for (const item of live) {
    // Primary deduplication: by arena ID
    const arenaKey = item.arenaId || item.id;
    if (seenArenaIds.has(arenaKey)) {
      console.log(`[getArcLiveItems] ⚠️ Duplicate arena ID detected in live: ${arenaKey} (${item.title}) - skipping`);
      continue;
    }
    seenArenaIds.add(arenaKey);
    
    // Secondary deduplication: by projectId + kind (prefer first occurrence)
    const projectKindKey = `${item.projectId}-${item.kind}`;
    if (seenProjectKind.has(projectKindKey)) {
      console.log(`[getArcLiveItems] ⚠️ Duplicate project+kind in live: ${item.projectName} (${item.kind}) - skipping duplicate`);
      continue;
    }
    seenProjectKind.add(projectKindKey);
    
    deduplicatedLive.push(item);
  }
  
  // Reset for upcoming
  seenArenaIds.clear();
  seenProjectKind.clear();
  
  for (const item of upcoming) {
    const arenaKey = item.arenaId || item.id;
    if (seenArenaIds.has(arenaKey)) {
      console.log(`[getArcLiveItems] ⚠️ Duplicate arena ID detected in upcoming: ${arenaKey} (${item.title}) - skipping`);
      continue;
    }
    seenArenaIds.add(arenaKey);
    
    const projectKindKey = `${item.projectId}-${item.kind}`;
    if (seenProjectKind.has(projectKindKey)) {
      console.log(`[getArcLiveItems] ⚠️ Duplicate project+kind in upcoming: ${item.projectName} (${item.kind}) - skipping duplicate`);
      continue;
    }
    seenProjectKind.add(projectKindKey);
    
    deduplicatedUpcoming.push(item);
  }

  // Sort by start date (earliest first for live, upcoming first for upcoming)
  deduplicatedLive.sort((a, b) => {
    if (!a.startsAt && !b.startsAt) return 0;
    if (!a.startsAt) return 1;
    if (!b.startsAt) return -1;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });

  deduplicatedUpcoming.sort((a, b) => {
    if (!a.startsAt && !b.startsAt) return 0;
    if (!a.startsAt) return 1;
    if (!b.startsAt) return -1;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });

  console.log(`[getArcLiveItems] After deduplication: ${deduplicatedLive.length} live, ${deduplicatedUpcoming.length} upcoming (was ${live.length} live, ${upcoming.length} upcoming)`);
  
  // Final summary log
  console.log(`[getArcLiveItems] ========== FINAL SUMMARY ==========`);
  console.log(`[getArcLiveItems] Total arenas processed: ${arenasResult.length}`);
  console.log(`[getArcLiveItems] Live items (after dedup): ${deduplicatedLive.length}`);
  console.log(`[getArcLiveItems] Upcoming items (after dedup): ${deduplicatedUpcoming.length}`);
  console.log(`[getArcLiveItems] Live items by project:`, deduplicatedLive.map(item => `${item.projectName} (${item.projectId.substring(0, 8)})`));
  console.log(`[getArcLiveItems] ===================================`);

  // Apply limit
  const finalLive = deduplicatedLive.slice(0, limit);
  const finalUpcoming = deduplicatedUpcoming.slice(0, limit);
  
  console.log(`[getArcLiveItems] Returning (after limit ${limit}): ${finalLive.length} live, ${finalUpcoming.length} upcoming`);
  
  return {
    live: finalLive,
    upcoming: finalUpcoming,
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determine if an item is 'live' or 'upcoming' based on dates
 */
function determineStatus(
  startsAt: string | null,
  endsAt: string | null,
  now: Date
): 'live' | 'upcoming' | null {
  // If no start date, treat as always live
  if (!startsAt) {
    // If has end date and it's past, skip (ended)
    if (endsAt && new Date(endsAt) < now) {
      return null;
    }
    return 'live';
  }

  const startDate = new Date(startsAt);
  
  // If start date is in future, it's upcoming
  if (startDate > now) {
    return 'upcoming';
  }

  // If start date is in past or now, check end date
  if (endsAt) {
    const endDate = new Date(endsAt);
    // If past end date, skip (ended)
    if (endDate < now) {
      return null;
    }
    // Within date range, it's live
    return 'live';
  }

  // Started but no end date, it's live
  return 'live';
}

/**
 * Fetch active/scheduled arenas
 */
async function fetchArenas(supabase: SupabaseClient) {
  const now = new Date();
  const { data: arenas, error } = await supabase
    .from('arenas')
    .select(`
      id,
      name,
      slug,
      project_id,
      starts_at,
      ends_at,
      status,
      kind,
      projects!inner (
        id,
        name,
        slug,
        x_handle,
        arc_access_level,
        is_arc_company
      )
    `)
    .in('status', ['active', 'paused'])
    .in('kind', ['ms', 'legacy_ms'])
    .eq('projects.is_arc_company', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getArcLiveItems] Error fetching arenas:', error);
    return [];
  }

  if (!arenas) {
    console.log('[getArcLiveItems] No arenas found with status active/paused and kind ms/legacy_ms');
    return [];
  }

  // Filter for live timeframe in JavaScript:
  // - starts_at IS NULL OR starts_at <= now (must have started)
  // - ends_at IS NULL OR ends_at > now (must not have ended)
  const liveArenas = arenas.filter((arena: any) => {
    // Check if started: starts_at IS NULL OR starts_at <= now
    const hasStarted = !arena.starts_at || new Date(arena.starts_at) <= now;
    if (!hasStarted) return false;
    
    // Check if live: ends_at IS NULL OR ends_at > now
    if (!arena.ends_at) return true; // ends_at is null, so it's live
    return new Date(arena.ends_at) > now; // ends_at > now, so it's live
  });

  console.log(`[getArcLiveItems] Found ${arenas.length} arenas with status active/paused, ${liveArenas.length} are live (within date range)`);
  
  // Log project names for debugging
  if (liveArenas.length > 0) {
    const projectNames = liveArenas.map((a: any) => a.projects?.name || a.projects?.id || 'Unknown').filter(Boolean);
    console.log(`[getArcLiveItems] Projects with live arenas:`, [...new Set(projectNames)]);
    
    // Log detailed arena info for debugging
    console.log(`[getArcLiveItems] Live arena details:`, liveArenas.map((a: any) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      projectId: a.project_id,
      projectName: a.projects?.name || 'NO PROJECT DATA',
      projectSlug: a.projects?.slug || null,
      status: a.status,
      kind: a.kind,
      startsAt: a.starts_at,
      endsAt: a.ends_at,
    })));
  } else {
    console.log(`[getArcLiveItems] ⚠️ No live arenas found (all arenas are outside date range or ended)`);
  }

  // Use liveArenas instead of all arenas
  const arenasToProcess = liveArenas;
  
  // Get creator counts - count ALL contributing creators (joined + auto-tracked)
  const arenaIds = arenasToProcess.map(a => a.id);
  const projectIds = [...new Set(arenasToProcess.map(a => a.project_id))];
  
  // Get all unique creators who have mentioned the project (from project_tweets)
  // This includes both joined and auto-tracked creators
  const projectCreatorsMap = new Map<string, Set<string>>();
  
  if (projectIds.length > 0) {
    const { data: projectTweets } = await supabase
      .from('project_tweets')
      .select('project_id, author_handle')
      .in('project_id', projectIds)
      .eq('is_official', false); // Only mentions, not official tweets

    if (projectTweets) {
      projectTweets.forEach((tweet: any) => {
        if (!tweet.author_handle) return;
        const normalizedUsername = tweet.author_handle.toLowerCase().replace(/^@/, '').trim();
        if (!normalizedUsername) return;
        
        if (!projectCreatorsMap.has(tweet.project_id)) {
          projectCreatorsMap.set(tweet.project_id, new Set());
        }
        projectCreatorsMap.get(tweet.project_id)!.add(normalizedUsername);
      });
    }
  }

  // Initialize counts map with all unique creators per project
  const countsMap = new Map<string, number>();
  for (const arena of arenasToProcess) {
    const uniqueCreators = projectCreatorsMap.get(arena.project_id);
    countsMap.set(arena.id, uniqueCreators ? uniqueCreators.size : 0);
  }

  // Check if any arenas are missing project data and fetch separately if needed
  const arenasMissingProject = (arenasToProcess || []).filter((a: any) => !a.projects);
  if (arenasMissingProject.length > 0) {
    console.warn(`[getArcLiveItems] ⚠️ ${arenasMissingProject.length} arena(s) missing project data. Fetching separately...`);
    
    const projectIds = [...new Set(arenasMissingProject.map((a: any) => a.project_id))];
    const { data: missingProjects } = await supabase
      .from('projects')
      .select('id, name, slug, x_handle, arc_access_level')
      .in('id', projectIds);
    
    if (missingProjects) {
      const projectMap = new Map(missingProjects.map((p: any) => [p.id, p]));
      // Fill in missing project data
      for (const arena of arenasMissingProject) {
        const project = projectMap.get(arena.project_id);
        if (project) {
          arena.projects = project;
          console.log(`[getArcLiveItems] ✅ Fetched project data for arena ${arena.id}: ${project.name}`);
        } else {
          console.error(`[getArcLiveItems] ❌ Could not find project ${arena.project_id} for arena ${arena.id}`);
        }
      }
    }
  }

  const mappedArenas = arenasToProcess.map((arena: any) => ({
    id: arena.id,
    name: arena.name,
    slug: arena.slug,
    projectId: arena.project_id,
    startsAt: arena.starts_at,
    endsAt: arena.ends_at,
    status: arena.status,
    project: arena.projects,
    creatorCount: countsMap.get(arena.id) || 0,
  }));

  console.log(`[getArcLiveItems] Mapped ${mappedArenas.length} arenas for processing`);
  return mappedArenas;
}

/**
 * Fetch live/paused campaigns
 */
async function fetchCampaigns(supabase: SupabaseClient) {
  const { data: campaigns, error } = await supabase
    .from('arc_campaigns')
    .select(`
      id,
      name,
      project_id,
      start_at,
      end_at,
      status,
      projects:project_id (
        id,
        name,
        slug,
        x_handle,
        arc_access_level
      )
    `)
    .in('status', ['live', 'paused'])
    .eq('type', 'crm')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getArcLiveItems] Error fetching campaigns:', error);
    return [];
  }

  if (!campaigns) return [];

  // Get participant counts (accepted or tracked)
  const campaignIds = campaigns.map(c => c.id);
  const { data: participants } = await supabase
    .from('arc_campaign_participants')
    .select('campaign_id')
    .in('campaign_id', campaignIds)
    .in('status', ['accepted', 'tracked']);

  const countsMap = new Map<string, number>();
  if (participants) {
    participants.forEach(p => {
      const current = countsMap.get(p.campaign_id) || 0;
      countsMap.set(p.campaign_id, current + 1);
    });
  }

  return campaigns.map((campaign: any) => ({
    id: campaign.id,
    name: campaign.name,
    projectId: campaign.project_id,
    startsAt: campaign.start_at,
    endsAt: campaign.end_at,
    status: campaign.status,
    project: campaign.projects,
    creatorCount: countsMap.get(campaign.id) || 0,
  }));
}

/**
 * Fetch active/paused quests (gamified)
 */
async function fetchQuests(supabase: SupabaseClient) {
  const { data: quests, error } = await supabase
    .from('arc_quests')
    .select(`
      id,
      name,
      project_id,
      arena_id,
      starts_at,
      ends_at,
      status,
      projects:project_id (
        id,
        name,
        slug,
        x_handle,
        arc_access_level
      )
    `)
    .in('status', ['active', 'paused'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getArcLiveItems] Error fetching quests:', error);
    return [];
  }

  if (!quests) return [];

  // Get contribution counts as creator count
  // Contributions are linked to arena_id, so we need to get counts via arena
  const arenaIds = quests.map(q => q.arena_id).filter(Boolean);
  const countsMap = new Map<string, number>();
  
  if (arenaIds.length > 0) {
    const { data: contributions } = await supabase
      .from('arc_contributions')
      .select('arena_id, profile_id')
      .in('arena_id', arenaIds);

    if (contributions) {
      // Map quest ID to arena ID
      const questArenaMap = new Map<string, string>();
      quests.forEach(q => {
        if (q.arena_id) {
          questArenaMap.set(q.id, q.arena_id);
        }
      });

      // Count unique creators per arena
      const arenaCreatorsMap = new Map<string, Set<string>>();
      contributions.forEach((c: any) => {
        if (!arenaCreatorsMap.has(c.arena_id)) {
          arenaCreatorsMap.set(c.arena_id, new Set());
        }
        if (c.profile_id) {
          arenaCreatorsMap.get(c.arena_id)!.add(c.profile_id);
        }
      });

      // Map arena counts back to quest IDs
      questArenaMap.forEach((arenaId, questId) => {
        const creatorSet = arenaCreatorsMap.get(arenaId);
        if (creatorSet) {
          countsMap.set(questId, creatorSet.size);
        }
      });
    }
  }

  return quests.map((quest: any) => ({
    id: quest.id,
    name: quest.name,
    projectId: quest.project_id,
    arenaId: quest.arena_id,
    startsAt: quest.starts_at,
    endsAt: quest.ends_at,
    status: quest.status,
    project: quest.projects,
    creatorCount: countsMap.get(quest.id) || 0,
  }));
}

/**
 * Create ArcLiveItem from arena data
 */
function createArenaItem(arena: any): ArcLiveItem {
  // Log if project data is missing
  if (!arena.project) {
    console.warn(`[createArenaItem] ⚠️ Arena ${arena.id} (${arena.name}) has no project data! Project ID: ${arena.projectId}`);
  }

  return {
    kind: 'arena',
    id: arena.id,
    projectId: arena.projectId,
    projectName: arena.project?.name || 'Unknown',
    projectSlug: arena.project?.slug || null,
    projectAccessLevel: arena.project?.arc_access_level || null,
    title: arena.name,
    slug: arena.slug,
    xHandle: arena.project?.x_handle || null,
    startsAt: arena.startsAt,
    endsAt: arena.endsAt,
    status: 'live', // Will be updated by caller
    creatorCount: arena.creatorCount || 0,
    arenaId: arena.id,
    arenaSlug: arena.slug,
  };
}

/**
 * Create ArcLiveItem from campaign data
 */
function createCampaignItem(campaign: any): ArcLiveItem {
  return {
    kind: 'campaign',
    id: campaign.id,
    projectId: campaign.projectId,
    projectName: campaign.project?.name || 'Unknown',
    projectSlug: campaign.project?.slug || null,
    projectAccessLevel: campaign.project?.arc_access_level || null,
    title: campaign.name,
    slug: null, // Campaigns don't have slugs in the schema
    xHandle: campaign.project?.x_handle || null,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    status: 'live', // Will be updated by caller
    creatorCount: campaign.creatorCount || 0,
    campaignId: campaign.id,
  };
}

/**
 * Create ArcLiveItem from quest data
 */
function createQuestItem(quest: any): ArcLiveItem {
  return {
    kind: 'gamified',
    id: quest.id,
    projectId: quest.projectId,
    projectName: quest.project?.name || 'Unknown',
    projectSlug: quest.project?.slug || null,
    projectAccessLevel: quest.project?.arc_access_level || null,
    title: quest.name,
    slug: null, // Quests don't have slugs
    xHandle: quest.project?.x_handle || null,
    startsAt: quest.startsAt,
    endsAt: quest.endsAt,
    status: 'live', // Will be updated by caller
    creatorCount: quest.creatorCount || 0,
  };
}

/**
 * Fetch active/scheduled creator manager programs
 */
async function fetchCreatorManagerPrograms(supabase: SupabaseClient) {
  const now = new Date();
  const { data: programs, error } = await supabase
    .from('creator_manager_programs')
    .select(`
      id,
      title,
      project_id,
      start_at,
      end_at,
      status,
      visibility,
      projects:project_id (
        id,
        name,
        slug,
        x_handle,
        arc_access_level
      )
    `)
    .in('status', ['active', 'paused'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getArcLiveItems] Error fetching creator manager programs:', error);
    return [];
  }

  if (!programs) return [];

  // Get creator counts (invited or approved creators)
  const programIds = programs.map(p => p.id);
  const countsMap = new Map<string, number>();

  if (programIds.length > 0) {
    const { data: creators } = await supabase
      .from('creator_manager_creators')
      .select('program_id')
      .in('program_id', programIds)
      .in('status', ['approved', 'pending']);

    if (creators) {
      creators.forEach((c: any) => {
        countsMap.set(c.program_id, (countsMap.get(c.program_id) || 0) + 1);
      });
    }
  }

  return programs.map((program: any) => ({
    id: program.id,
    title: program.title,
    projectId: program.project_id,
    startsAt: program.start_at,
    endsAt: program.end_at,
    status: program.status,
    visibility: program.visibility,
    project: program.projects,
    creatorCount: countsMap.get(program.id) || 0,
  }));
}

/**
 * Create ArcLiveItem from creator manager program data
 */
function createProgramItem(program: any): ArcLiveItem {
  return {
    kind: 'crm',
    id: program.id,
    projectId: program.projectId,
    projectName: program.project?.name || 'Unknown',
    projectSlug: program.project?.slug || null,
    projectAccessLevel: 'creator_manager',
    title: program.title,
    slug: null, // Programs don't have slugs
    xHandle: program.project?.x_handle || null,
    startsAt: program.startsAt,
    endsAt: program.endsAt,
    status: 'live', // Will be updated by caller
    creatorCount: program.creatorCount || 0,
    programId: program.id,
    visibility: program.visibility,
  };
}
