/**
 * API Route: GET /api/portal/arc/campaigns/[id]
 * 
 * Get a single ARC campaign by ID.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkArcProjectApproval, getProfileIdFromUserId } from '@/lib/arc-permissions';
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

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CampaignResponse>
) {
  if (req.method !== 'GET') {
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

    // Check ARC approval for the project
    const approval = await checkArcProjectApproval(supabase, campaign.project_id);
    if (!approval.isApproved && !DEV_MODE) {
      return res.status(403).json({
        ok: false,
        error: approval.isPending
          ? 'ARC access is pending approval'
          : approval.isRejected
          ? 'ARC access was rejected'
          : 'ARC access has not been approved for this project',
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

    return res.status(200).json({
      ok: true,
      campaign: campaign as Campaign,
    });
  } catch (error: any) {
    console.error('[ARC Campaign API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}



