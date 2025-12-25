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

export type ArcLiveItemKind = 'arena' | 'campaign' | 'gamified';

export interface ArcLiveItem {
  kind: ArcLiveItemKind;
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string | null;
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
}

// =============================================================================
// MAIN FUNCTION
// =============================================================================

/**
 * Get all live and upcoming ARC items across all three option types
 */
export async function getArcLiveItems(
  supabase: SupabaseClient,
  limit: number = 20
): Promise<{ live: ArcLiveItem[]; upcoming: ArcLiveItem[] }> {
  const now = new Date();
  const live: ArcLiveItem[] = [];
  const upcoming: ArcLiveItem[] = [];

  // Fetch all items in parallel
  const [arenasResult, campaignsResult, questsResult] = await Promise.all([
    fetchArenas(supabase),
    fetchCampaigns(supabase),
    fetchQuests(supabase),
  ]);

  // Process arenas (Option 2)
  for (const arena of arenasResult) {
    // Check if project has Option 2 unlocked
    const accessCheck = await requireArcAccess(supabase, arena.projectId, 2);
    if (!accessCheck.ok) {
      console.log(`[getArcLiveItems] Arena ${arena.id} (project ${arena.projectId}) failed access check: ${accessCheck.error} (code: ${accessCheck.code})`);
      continue;
    }

    const item = createArenaItem(arena);
    const itemStatus = determineStatus(item.startsAt, item.endsAt, now);
    
    if (itemStatus === 'live') {
      live.push(item);
      console.log(`[getArcLiveItems] Added live arena: ${item.title} (project: ${item.projectName})`);
    } else if (itemStatus === 'upcoming') {
      upcoming.push(item);
      console.log(`[getArcLiveItems] Added upcoming arena: ${item.title} (project: ${item.projectName})`);
    } else {
      console.log(`[getArcLiveItems] Arena ${item.title} (project: ${item.projectName}) status is null (ended or invalid dates)`);
    }
  }

  // Process campaigns (Option 1)
  for (const campaign of campaignsResult) {
    // Check if project has Option 1 unlocked
    const accessCheck = await requireArcAccess(supabase, campaign.projectId, 1);
    if (!accessCheck.ok) {
      continue;
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
    // Check if project has Option 3 unlocked
    const accessCheck = await requireArcAccess(supabase, quest.projectId, 3);
    if (!accessCheck.ok) {
      continue;
    }

    const item = createQuestItem(quest);
    const itemStatus = determineStatus(item.startsAt, item.endsAt, now);
    
    if (itemStatus === 'live') {
      live.push(item);
    } else if (itemStatus === 'upcoming') {
      upcoming.push(item);
    }
  }

  // Sort by start date (earliest first for live, upcoming first for upcoming)
  live.sort((a, b) => {
    if (!a.startsAt && !b.startsAt) return 0;
    if (!a.startsAt) return 1;
    if (!b.startsAt) return -1;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });

  upcoming.sort((a, b) => {
    if (!a.startsAt && !b.startsAt) return 0;
    if (!a.startsAt) return 1;
    if (!b.startsAt) return -1;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });

  // Apply limit
  return {
    live: live.slice(0, limit),
    upcoming: upcoming.slice(0, limit),
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
      projects:project_id (
        id,
        name,
        slug,
        x_handle
      )
    `)
    .in('status', ['active', 'scheduled'])
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[getArcLiveItems] Error fetching arenas:', error);
    return [];
  }

  if (!arenas) {
    console.log('[getArcLiveItems] No arenas found with status active/scheduled');
    return [];
  }

  console.log(`[getArcLiveItems] Found ${arenas.length} arenas with status active/scheduled`);

  // Get creator counts
  const arenaIds = arenas.map(a => a.id);
  const { data: creatorCounts } = await supabase
    .from('arena_creators')
    .select('arena_id')
    .in('arena_id', arenaIds);

  const countsMap = new Map<string, number>();
  if (creatorCounts) {
    creatorCounts.forEach(cc => {
      const current = countsMap.get(cc.arena_id) || 0;
      countsMap.set(cc.arena_id, current + 1);
    });
  }

  const mappedArenas = arenas.map((arena: any) => ({
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
        x_handle
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
        x_handle
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
  return {
    kind: 'arena',
    id: arena.id,
    projectId: arena.projectId,
    projectName: arena.project?.name || 'Unknown',
    projectSlug: arena.project?.slug || null,
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
    title: quest.name,
    slug: null, // Quests don't have slugs
    xHandle: quest.project?.x_handle || null,
    startsAt: quest.startsAt,
    endsAt: quest.endsAt,
    status: 'live', // Will be updated by caller
    creatorCount: quest.creatorCount || 0,
  };
}

