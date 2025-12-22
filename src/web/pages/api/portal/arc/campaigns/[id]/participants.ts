/**
 * API Route: POST /api/portal/arc/campaigns/[id]/participants
 * 
 * Add a participant to a campaign (invite by twitter_username or profile_id).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { getProfileIdFromUserId } from '@/lib/arc-permissions';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface AddParticipantPayload {
  twitter_username?: string;
  profile_id?: string;
  status?: 'invited' | 'tracked';
}

interface Participant {
  id: string;
  campaign_id: string;
  profile_id: string | null;
  twitter_username: string;
  status: string;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
}

type ParticipantsResponse =
  | { ok: true; participant: Participant }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSessionToken(req: NextApiRequest): string | null {
  const cookies = req.headers.cookie?.split(';').map(c => c.trim()) || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('akari_session=')) {
      return cookie.substring('akari_session='.length);
    }
  }
  return null;
}

const DEV_MODE = process.env.NODE_ENV === 'development' && process.env.DEV_MODE === 'true';

// =============================================================================
// HANDLER
// =============================================================================

interface UpdateParticipantPayload {
  status?: 'invited' | 'accepted' | 'declined' | 'tracked';
}

type ParticipantUpdateResponse =
  | { ok: true; participant: Participant }
  | { ok: false; error: string };

type ParticipantsListResponse =
  | { ok: true; participants: Participant[] }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ParticipantsResponse | ParticipantUpdateResponse | ParticipantsListResponse>
) {
  if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { id: campaignId } = req.query;

    if (!campaignId || typeof campaignId !== 'string') {
      return res.status(400).json({ ok: false, error: 'Campaign ID is required' });
    }

    // Authentication
    let userId: string;
    if (!DEV_MODE) {
      const sessionToken = getSessionToken(req);
      if (!sessionToken) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      const { data: session, error: sessionError } = await supabase
        .from('akari_user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .single();

      if (sessionError || !session) {
        return res.status(401).json({ ok: false, error: 'Invalid session' });
      }

      if (new Date(session.expires_at) < new Date()) {
        await supabase
          .from('akari_user_sessions')
          .delete()
          .eq('session_token', sessionToken);
        return res.status(401).json({ ok: false, error: 'Session expired' });
      }

      userId = session.user_id;
    } else {
      userId = 'dev-user-id';
    }

    // Get campaign to check project_id
    const { data: campaign, error: campaignError } = await supabase
      .from('arc_campaigns')
      .select('project_id')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    // Runtime guard: ensure projectId is a non-empty string
    const projectId = campaign.project_id;
    if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
      return res.status(400).json({ ok: false, error: 'Missing projectId' });
    }

    // TypeScript narrowing: assign to const with explicit string type
    const pid: string = projectId;

    // Handle GET - list participants
    if (req.method === 'GET') {
      const { data: participants, error: fetchError } = await supabase
        .from('arc_campaign_participants')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('[ARC Participants API] Fetch error:', fetchError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch participants' });
      }

      return res.status(200).json({
        ok: true,
        participants: (participants || []) as Participant[],
      });
    }

    // Handle POST - add participant (invite)
    if (req.method === 'POST') {
      // Check ARC access (Option 1 = CRM) and project permissions
      if (!DEV_MODE && userId) {
        const accessCheck = await requireArcAccess(supabase, pid, 1);
        if (!accessCheck.ok) {
          return res.status(403).json({
            ok: false,
            error: accessCheck.error || 'ARC access not approved for this project',
          });
        }

        const permissions = await checkProjectPermissions(supabase, userId, pid);
        const canManage = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
        if (!canManage) {
          return res.status(403).json({
            ok: false,
            error: 'You do not have permission to add participants to this campaign',
          });
        }
      }

      // Parse body
      const body = req.body as AddParticipantPayload;
    let twitterUsername: string;
    let profileId: string | null = null;

    if (body.profile_id) {
      // Get profile to find twitter_username
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', body.profile_id)
        .single();

      if (!profile) {
        return res.status(404).json({ ok: false, error: 'Profile not found' });
      }

      twitterUsername = profile.username;
      profileId = body.profile_id;
    } else if (body.twitter_username) {
      twitterUsername = body.twitter_username.toLowerCase().replace('@', '').trim();
      
      // Try to find profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', twitterUsername)
        .maybeSingle();

      if (profile) {
        profileId = profile.id;
      }
    } else {
      return res.status(400).json({
        ok: false,
        error: 'Either twitter_username or profile_id is required',
      });
    }

    // Check if participant already exists
    const { data: existing } = await supabase
      .from('arc_campaign_participants')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('twitter_username', twitterUsername)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({
        ok: false,
        error: 'Participant already exists in this campaign',
      });
    }

    // Create participant
    const participantData = {
      campaign_id: campaignId,
      profile_id: profileId,
      twitter_username: twitterUsername,
      status: body.status || 'invited',
      joined_at: null,
    };

    const { data: participant, error: insertError } = await supabase
      .from('arc_campaign_participants')
      .insert(participantData)
      .select()
      .single();

      if (insertError) {
        console.error('[ARC Participants API] Insert error:', insertError);
        return res.status(500).json({ ok: false, error: 'Failed to add participant' });
      }

      return res.status(200).json({
        ok: true,
        participant: participant as Participant,
      });
    }

    // Handle PATCH - update participant (approve/reject)
    if (req.method === 'PATCH') {
      // Check ARC access (Option 1 = CRM) and project permissions
      if (!DEV_MODE && userId) {
        const accessCheck = await requireArcAccess(supabase, pid, 1);
        if (!accessCheck.ok) {
          return res.status(403).json({
            ok: false,
            error: accessCheck.error || 'ARC access not approved for this project',
          });
        }

        const permissions = await checkProjectPermissions(supabase, userId, pid);
        const canManage = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
        if (!canManage) {
          return res.status(403).json({
            ok: false,
            error: 'You do not have permission to update participants for this campaign',
          });
        }
      }
      const body = req.body as UpdateParticipantPayload & { participant_id?: string };
      const participantId = body.participant_id || (req.query.participant_id as string);

      if (!participantId) {
        return res.status(400).json({ ok: false, error: 'participant_id is required' });
      }

      // Get participant
      const { data: participant, error: participantError } = await supabase
        .from('arc_campaign_participants')
        .select('*')
        .eq('id', participantId)
        .eq('campaign_id', campaignId)
        .single();

      if (participantError || !participant) {
        return res.status(404).json({ ok: false, error: 'Participant not found' });
      }

      // Update participant status
      const updateData: any = {};
      if (body.status !== undefined) {
        updateData.status = body.status;
        if (body.status === 'accepted' && !participant.joined_at) {
          updateData.joined_at = new Date().toISOString();
        }
      }

      const { data: updatedParticipant, error: updateError } = await supabase
        .from('arc_campaign_participants')
        .update(updateData)
        .eq('id', participantId)
        .select()
        .single();

      if (updateError) {
        console.error('[ARC Participants API] Update error:', updateError);
        return res.status(500).json({ ok: false, error: 'Failed to update participant' });
      }

      return res.status(200).json({
        ok: true,
        participant: updatedParticipant as Participant,
      });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[ARC Participants API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}



