/**
 * API Route: POST /api/portal/arc/campaigns/[id]/join
 * 
 * Public/hybrid join endpoint for creators to join campaigns.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { getProfileIdFromUserId } from '@/lib/arc-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface JoinPayload {
  twitter_username?: string;
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

type JoinResponse =
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
  res: NextApiResponse<JoinResponse>
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

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('arc_campaigns')
      .select('participation_mode, status, project_id')
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

    // Check ARC access (Option 1 = CRM)
    const accessCheck = await requireArcAccess(supabase, pid, 1);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error || 'ARC access not approved for this project',
      });
    }

    // Check if campaign allows public/hybrid join
    if (campaign.participation_mode === 'invite_only') {
      return res.status(403).json({
        ok: false,
        error: 'This campaign is invite-only',
      });
    }

    // Check campaign status
    if (campaign.status !== 'live') {
      return res.status(403).json({
        ok: false,
        error: 'Campaign is not currently accepting participants',
      });
    }

    // Authentication (optional for public join, but preferred)
    let profileId: string | null = null;
    let twitterUsername: string | null = null;

    const sessionToken = getSessionToken(req);
    if (sessionToken) {
      const { data: session } = await supabase
        .from('akari_user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .single();

      if (session && new Date(session.expires_at) >= new Date()) {
        profileId = await getProfileIdFromUserId(supabase, session.user_id);
        
        if (profileId) {
          // Get twitter username from profile
          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', profileId)
            .single();
          
          if (profile) {
            twitterUsername = profile.username;
          }
        }
      }
    }

    // Fallback to body if not authenticated
    const body = req.body as JoinPayload;
    if (!twitterUsername && body.twitter_username) {
      twitterUsername = body.twitter_username.toLowerCase().replace('@', '').trim();
    }

    if (!twitterUsername) {
      return res.status(400).json({
        ok: false,
        error: 'twitter_username is required',
      });
    }

    // Check if participant already exists
    const { data: existing } = await supabase
      .from('arc_campaign_participants')
      .select('id, status')
      .eq('campaign_id', campaignId)
      .eq('twitter_username', twitterUsername)
      .maybeSingle();

    if (existing) {
      // Update status to 'accepted' if it was 'invited'
      if (existing.status === 'invited') {
        const { data: updated } = await supabase
          .from('arc_campaign_participants')
          .update({
            status: 'accepted',
            joined_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (updated) {
          return res.status(200).json({
            ok: true,
            participant: updated as Participant,
          });
        }
      }

      return res.status(409).json({
        ok: false,
        error: 'You are already participating in this campaign',
      });
    }

    // Create participant
    const participantData = {
      campaign_id: campaignId,
      profile_id: profileId,
      twitter_username: twitterUsername,
      status: 'accepted',
      joined_at: new Date().toISOString(),
    };

    const { data: participant, error: insertError } = await supabase
      .from('arc_campaign_participants')
      .insert(participantData)
      .select()
      .single();

    if (insertError) {
      console.error('[ARC Join API] Insert error:', insertError);
      return res.status(500).json({ ok: false, error: 'Failed to join campaign' });
    }

    return res.status(200).json({
      ok: true,
      participant: participant as Participant,
    });
  } catch (error: any) {
    console.error('[ARC Join API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}



