/**
 * Notifications Helper
 * 
 * Server-side helper for creating notifications in Creator Manager flows
 */

import { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

export type NotificationType =
  | 'creator_invited'
  | 'creator_approved'
  | 'creator_rejected'
  | 'mission_submitted'
  | 'mission_approved'
  | 'mission_rejected'
  | 'leaderboard_request_approved'
  | 'leaderboard_request_rejected';

export interface NotificationContext {
  programId?: string;
  projectId?: string;
  missionId?: string;
  creatorProfileId?: string;
  [key: string]: any; // Allow additional context fields
}

// =============================================================================
// CREATE NOTIFICATION
// =============================================================================

/**
 * Create a notification for a user
 * 
 * @param supabase - Supabase admin client
 * @param profileId - Profile ID of the user to notify
 * @param type - Notification type
 * @param context - Additional context (programId, missionId, etc.)
 */
export async function createNotification(
  supabase: SupabaseClient,
  profileId: string,
  type: NotificationType,
  context?: NotificationContext
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({
        profile_id: profileId,
        type,
        context: context || null,
        is_read: false,
      });

    if (error) {
      console.error('[Notifications] Error creating notification:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('[Notifications] Error:', error);
    return { success: false, error: error.message || 'Failed to create notification' };
  }
}

/**
 * Get all project team members (owners, admins, moderators) for a project
 * 
 * @param supabase - Supabase admin client
 * @param projectId - Project ID
 * @returns Array of profile IDs
 */
export async function getProjectTeamMemberProfileIds(
  supabase: SupabaseClient,
  projectId: string
): Promise<string[]> {
  try {
    // Get project owner
    const { data: project } = await supabase
      .from('projects')
      .select('claimed_by')
      .eq('id', projectId)
      .single();

    const profileIds: string[] = [];

    // Get owner's profile ID if exists
    if (project?.claimed_by) {
      const { data: ownerIdentity } = await supabase
        .from('akari_user_identities')
        .select('username')
        .eq('user_id', project.claimed_by)
        .eq('provider', 'x')
        .single();

      if (ownerIdentity?.username) {
        const { data: ownerProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', ownerIdentity.username.toLowerCase().replace('@', ''))
          .single();

        if (ownerProfile?.id) {
          profileIds.push(ownerProfile.id);
        }
      }
    }

    // Get team members (admins and moderators)
    const { data: teamMembers } = await supabase
      .from('project_team_members')
      .select('profile_id')
      .eq('project_id', projectId)
      .in('role', ['admin', 'moderator']);

    if (teamMembers) {
      const memberProfileIds = teamMembers.map((m: any) => m.profile_id);
      profileIds.push(...memberProfileIds);
    }

    // Remove duplicates
    return [...new Set(profileIds)];
  } catch (error: any) {
    console.error('[Notifications] Error getting team members:', error);
    return [];
  }
}

/**
 * Notify all project team members (owners, admins, moderators)
 * 
 * @param supabase - Supabase admin client
 * @param projectId - Project ID
 * @param type - Notification type
 * @param context - Additional context
 */
export async function notifyProjectTeamMembers(
  supabase: SupabaseClient,
  projectId: string,
  type: NotificationType,
  context?: NotificationContext
): Promise<void> {
  const profileIds = await getProjectTeamMemberProfileIds(supabase, projectId);

  // Create notification for each team member
  for (const profileId of profileIds) {
    await createNotification(supabase, profileId, type, {
      ...context,
      projectId,
    });
  }
}

