/**
 * API Route: POST /api/portal/creator-manager/programs/[programId]/creators/invite
 * 
 * Invite creators to a Creator Manager program.
 * 
 * Input: { twitterUsernames?: string[], profileIds?: string[] }
 * 
 * Permissions: Only project admins and moderators can invite
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { createNotification } from '@/lib/notifications';

// =============================================================================
// TYPES
// =============================================================================

interface InviteRequest {
  twitterUsernames?: string[];
  profileIds?: string[];
}

type InviteResponse =
  | { ok: true; invited: number; message: string }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

async function getCurrentUser(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ userId: string; profileId: string | null } | null> {
  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) {
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  const { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .eq('provider', 'x')
    .single();

  let profileId: string | null = null;
  if (xIdentity?.username) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
      .single();
    profileId = profile?.id || null;
  }

  return {
    userId: session.user_id,
    profileId,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<InviteResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabase = getSupabaseAdmin();

  // Get current user
  const sessionToken = getSessionToken(req);
  if (!sessionToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated' });
  }

  const currentUser = await getCurrentUser(supabase, sessionToken);
  if (!currentUser) {
    return res.status(401).json({ ok: false, error: 'Invalid session' });
  }

  const programId = req.query.programId as string;
  if (!programId) {
    return res.status(400).json({ ok: false, error: 'programId is required' });
  }

  const body: InviteRequest = req.body;
  if ((!body.twitterUsernames || body.twitterUsernames.length === 0) &&
      (!body.profileIds || body.profileIds.length === 0)) {
    return res.status(400).json({ ok: false, error: 'Either twitterUsernames or profileIds must be provided' });
  }

  try {
    // Get program to find project_id
    const { data: program, error: programError } = await supabase
      .from('creator_manager_programs')
      .select('project_id')
      .eq('id', programId)
      .single();

    if (programError || !program) {
      return res.status(404).json({ ok: false, error: 'Program not found' });
    }

    // Check permissions - must be admin or moderator (not just owner)
    const permissions = await checkProjectPermissions(supabase, currentUser.userId, program.project_id);
    if (!permissions.isAdmin && !permissions.isModerator && !permissions.isOwner && !permissions.isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'Only project admins and moderators can invite creators' });
    }

    // Collect profile IDs to invite
    const profileIdsToInvite: string[] = [];

    // Process twitterUsernames
    if (body.twitterUsernames && body.twitterUsernames.length > 0) {
      for (const username of body.twitterUsernames) {
        const normalizedUsername = username.toLowerCase().replace('@', '').trim();
        
        // Check if profile exists
        let { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', normalizedUsername)
          .single();

        // If profile doesn't exist, create a basic one
        if (!profile) {
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              username: normalizedUsername,
              name: normalizedUsername,
              real_roles: ['user'], // Will be updated to include 'creator' when they accept
            })
            .select()
            .single();

          if (createError) {
            console.warn(`[Invite Creators] Failed to create profile for ${normalizedUsername}:`, createError);
            continue;
          }
          profile = newProfile;
        }

        if (profile?.id) {
          profileIdsToInvite.push(profile.id);
        }
      }
    }

    // Process profileIds
    if (body.profileIds && body.profileIds.length > 0) {
      profileIdsToInvite.push(...body.profileIds);
    }

    // Remove duplicates
    const uniqueProfileIds = [...new Set(profileIdsToInvite)];

    if (uniqueProfileIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'No valid profiles found to invite' });
    }

    // Check which creators are already in the program
    const { data: existingCreators } = await supabase
      .from('creator_manager_creators')
      .select('creator_profile_id')
      .eq('program_id', programId)
      .in('creator_profile_id', uniqueProfileIds);

    const existingProfileIds = new Set((existingCreators || []).map((c: any) => c.creator_profile_id));

    // Filter out existing creators
    const newProfileIds = uniqueProfileIds.filter(id => !existingProfileIds.has(id));

    if (newProfileIds.length === 0) {
      return res.status(200).json({
        ok: true,
        invited: 0,
        message: 'All specified creators are already in the program',
      });
    }

    // Create creator_manager_creators entries with status = 'pending'
    const creatorRows = newProfileIds.map(profileId => ({
      program_id: programId,
      creator_profile_id: profileId,
      status: 'pending',
    }));

    const { error: insertError } = await supabase
      .from('creator_manager_creators')
      .insert(creatorRows);

    if (insertError) {
      console.error('[Invite Creators] Error inserting creators:', insertError);
      return res.status(500).json({ ok: false, error: 'Failed to invite creators' });
    }

    // Create notifications for invited creators
    for (const profileId of newProfileIds) {
      await createNotification(supabase, profileId, 'creator_invited', {
        programId,
        projectId: program.project_id,
      });
    }

    return res.status(200).json({
      ok: true,
      invited: newProfileIds.length,
      message: `Successfully invited ${newProfileIds.length} creator(s)`,
    });
  } catch (error: any) {
    console.error('[Invite Creators] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

