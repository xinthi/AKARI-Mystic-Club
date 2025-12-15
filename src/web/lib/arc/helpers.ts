/**
 * ARC Helper Functions
 * 
 * Utility functions for ARC campaign discovery and participation
 */

import { createPortalClient } from '@/lib/portal/supabase';

// =============================================================================
// TYPES
// =============================================================================

export interface UserCampaignStatus {
  isFollowing: boolean;
  hasJoined: boolean;
  arenaId?: string;
  creatorId?: string;
  arcPoints?: number;
  ring?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Check if user is following a project on X
 * Note: This is a placeholder - actual implementation would require X API integration
 * For now, we'll assume users can follow projects (this would be verified server-side)
 */
export async function isFollowingProject(
  projectTwitterUsername: string | null,
  userTwitterUsername: string | null
): Promise<boolean> {
  // TODO: Implement actual X API check
  // For now, return false as a placeholder
  // In production, this would call an API endpoint that verifies the follow relationship
  if (!projectTwitterUsername || !userTwitterUsername) {
    return false;
  }
  
  // Placeholder: In real implementation, this would verify via X API
  return false;
}

/**
 * Check if user has joined a campaign (has an arena_creators entry)
 */
export async function hasJoinedCampaign(
  projectId: string,
  userTwitterUsername: string | null
): Promise<{
  hasJoined: boolean;
  arenaId?: string;
  creatorId?: string;
  arcPoints?: number;
  ring?: string;
}> {
  if (!userTwitterUsername) {
    return { hasJoined: false };
  }

  try {
    const supabase = createPortalClient();

    // Find active arena for this project
    const { data: arena } = await supabase
      .from('arenas')
      .select('id')
      .eq('project_id', projectId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!arena) {
      return { hasJoined: false };
    }

    // Check if user is in this arena
    const { data: creator } = await supabase
      .from('arena_creators')
      .select('id, arc_points, ring')
      .eq('arena_id', arena.id)
      .ilike('twitter_username', userTwitterUsername)
      .single();

    if (creator) {
      return {
        hasJoined: true,
        arenaId: arena.id,
        creatorId: creator.id,
        arcPoints: Number(creator.arc_points) || 0,
        ring: creator.ring || undefined,
      };
    }

    return { hasJoined: false };
  } catch (error) {
    console.error('[ARC Helpers] Error checking campaign join status:', error);
    return { hasJoined: false };
  }
}

/**
 * Get user's campaign participation status for multiple projects
 */
export async function getUserCampaignStatuses(
  projectIds: string[],
  userTwitterUsername: string | null
): Promise<Map<string, UserCampaignStatus>> {
  const statuses = new Map<string, UserCampaignStatus>();

  if (!userTwitterUsername || projectIds.length === 0) {
    return statuses;
  }

  try {
    const supabase = createPortalClient();

    // Get all active arenas for these projects
    const { data: arenas } = await supabase
      .from('arenas')
      .select('id, project_id')
      .in('project_id', projectIds)
      .eq('status', 'active');

    if (!arenas || arenas.length === 0) {
      return statuses;
    }

    const arenaIds = arenas.map(a => a.id);
    const arenaByProject = new Map(arenas.map(a => [a.project_id, a.id]));

    // Get all creators for this user in these arenas
    const { data: creators } = await supabase
      .from('arena_creators')
      .select('id, arena_id, arc_points, ring')
      .in('arena_id', arenaIds)
      .ilike('twitter_username', userTwitterUsername);

    if (creators) {
      creators.forEach(creator => {
        const arena = arenas.find(a => a.id === creator.arena_id);
        if (arena) {
          statuses.set(arena.project_id, {
            isFollowing: false, // Would be set separately
            hasJoined: true,
            arenaId: arena.id,
            creatorId: creator.id,
            arcPoints: Number(creator.arc_points) || 0,
            ring: creator.ring || undefined,
          });
        }
      });
    }

    // Set hasJoined: false for projects without participation
    projectIds.forEach(projectId => {
      if (!statuses.has(projectId)) {
        statuses.set(projectId, {
          isFollowing: false,
          hasJoined: false,
        });
      }
    });
  } catch (error) {
    console.error('[ARC Helpers] Error getting campaign statuses:', error);
  }

  return statuses;
}
