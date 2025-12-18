/**
 * API Route: POST /api/portal/arc/campaigns/[id]/participants
 * 
 * Add a participant to a campaign (invite by twitter_username or profile_id).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getProfileIdFromUserId } from '@/lib/arc-permissions';
import { canManageProject } from '@/lib/project-permissions';

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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ParticipantsResponse>
) {
  if (req.method !== 'POST') {
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

    // Check permissions
    if (!DEV_MODE) {
      const canManage = await canManageProject(supabase, userId, campaign.project_id);
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
  } catch (error: any) {
    console.error('[ARC Participants API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}


