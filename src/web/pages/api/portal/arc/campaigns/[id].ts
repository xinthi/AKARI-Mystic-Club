/**
 * API Route: GET /api/portal/arc/campaigns/[id]
 * 
 * Get a single ARC campaign by ID.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { getProfileIdFromUserId } from '@/lib/arc-permissions';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface Campaign {
  id: string;
  project_id: string;
  type: string;
  participation_mode: string;
  leaderboard_visibility: string;
  name: string;
  brief_objective: string | null;
  start_at: string;
  end_at: string;
  website_url: string | null;
  docs_url: string | null;
  reward_pool_text: string | null;
  winners_count: number;
  status: string;
  created_by_profile_id: string | null;
  created_at: string;
  updated_at: string;
}

type CampaignResponse =
  | { ok: true; campaign: Campaign }
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

type UpdateCampaignPayload = {
  name?: string;
  brief_objective?: string | null;
  participation_mode?: 'invite_only' | 'public' | 'hybrid';
  leaderboard_visibility?: 'public' | 'private';
  start_at?: string;
  end_at?: string;
  website_url?: string | null;
  docs_url?: string | null;
  reward_pool_text?: string | null;
  winners_count?: number;
  status?: 'draft' | 'live' | 'paused' | 'ended';
};

type CampaignUpdateResponse =
  | { ok: true; campaign: Campaign }
  | { ok: false; error: string };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CampaignResponse | CampaignUpdateResponse>
) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Campaign ID is required' });
    }

    const { data: campaign, error: fetchError } = await supabase
      .from('arc_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !campaign) {
      return res.status(404).json({ ok: false, error: 'Campaign not found' });
    }

    // Check ARC access (Option 1 = CRM)
    const accessCheck = await requireArcAccess(supabase, campaign.project_id, 1);
    if (!accessCheck.ok && !DEV_MODE) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error || 'ARC access not approved for this project',
      });
    }

    // Check visibility rules: public campaigns are visible to all, private campaigns require admin/participant
    if (campaign.leaderboard_visibility === 'private' && !DEV_MODE) {
      const sessionToken = getSessionToken(req);
      if (sessionToken) {
        const { data: session } = await supabase
          .from('akari_user_sessions')
          .select('user_id, expires_at')
          .eq('session_token', sessionToken)
          .single();

        if (session && new Date(session.expires_at) >= new Date()) {
          const userId = session.user_id;
          
          // Check if user is project admin/moderator or super admin
          const permissions = await checkProjectPermissions(supabase, userId, campaign.project_id);
          if (permissions.canManage || permissions.isSuperAdmin) {
            // Allow access
          } else {
            // Check if user is a participant
            const profileId = await getProfileIdFromUserId(supabase, userId);
            if (profileId) {
              const { data: participant } = await supabase
                .from('arc_campaign_participants')
                .select('id')
                .eq('campaign_id', id)
                .eq('profile_id', profileId)
                .maybeSingle();
              
              if (!participant) {
                return res.status(403).json({
                  ok: false,
                  error: 'This campaign is private. Only participants and project admins can view it.',
                });
              }
            } else {
              return res.status(403).json({
                ok: false,
                error: 'This campaign is private. Only participants and project admins can view it.',
              });
            }
          }
        } else {
          return res.status(403).json({
            ok: false,
            error: 'This campaign is private. Authentication required.',
          });
        }
      } else {
        return res.status(403).json({
          ok: false,
          error: 'This campaign is private. Authentication required.',
        });
      }
    }

    // Handle GET
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        campaign: campaign as Campaign,
      });
    }

    // Handle PATCH - update campaign
    if (req.method === 'PATCH') {
      // Authentication
      let userId: string | null = null;
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
        // DEV MODE: Find a super admin user
        const { data: superAdmin } = await supabase
          .from('akari_user_roles')
          .select('user_id')
          .eq('role', 'super_admin')
          .limit(1)
          .maybeSingle();
        userId = superAdmin?.user_id || null;
      }

      // Check project permissions
      if (!DEV_MODE && userId) {
        const permissions = await checkProjectPermissions(supabase, userId, campaign.project_id);
        const canManage = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
        if (!canManage) {
          return res.status(403).json({
            ok: false,
            error: 'You do not have permission to update this campaign',
          });
        }
      }

      // Parse body
      const body = req.body as UpdateCampaignPayload;
      const updateData: any = {};

      if (body.name !== undefined) updateData.name = body.name;
      if (body.brief_objective !== undefined) updateData.brief_objective = body.brief_objective;
      if (body.participation_mode !== undefined) updateData.participation_mode = body.participation_mode;
      if (body.leaderboard_visibility !== undefined) updateData.leaderboard_visibility = body.leaderboard_visibility;
      if (body.start_at !== undefined) updateData.start_at = body.start_at;
      if (body.end_at !== undefined) updateData.end_at = body.end_at;
      if (body.website_url !== undefined) updateData.website_url = body.website_url;
      if (body.docs_url !== undefined) updateData.docs_url = body.docs_url;
      if (body.reward_pool_text !== undefined) updateData.reward_pool_text = body.reward_pool_text;
      if (body.winners_count !== undefined) updateData.winners_count = body.winners_count;
      if (body.status !== undefined) updateData.status = body.status;

      // Validate dates if provided
      if (updateData.start_at || updateData.end_at) {
        const startAt = new Date(updateData.start_at || campaign.start_at);
        const endAt = new Date(updateData.end_at || campaign.end_at);
        if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
          return res.status(400).json({ ok: false, error: 'Invalid date format' });
        }
        if (endAt <= startAt) {
          return res.status(400).json({ ok: false, error: 'end_at must be after start_at' });
        }
      }

      // Update campaign
      const { data: updatedCampaign, error: updateError } = await supabase
        .from('arc_campaigns')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        console.error('[ARC Campaign API] Update error:', updateError);
        return res.status(500).json({ ok: false, error: 'Failed to update campaign' });
      }

      return res.status(200).json({
        ok: true,
        campaign: updatedCampaign as Campaign,
      });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[ARC Campaign API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}



