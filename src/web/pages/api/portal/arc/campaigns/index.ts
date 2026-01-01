/**
 * API Route: POST /api/portal/arc/campaigns
 * GET /api/portal/arc/campaigns
 * 
 * Create or list ARC CRM campaigns.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { getProfileIdFromUserId } from '@/lib/arc-permissions';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { getRequestId, writeArcAudit } from '@/lib/server/arc-audit';

// =============================================================================
// TYPES
// =============================================================================

interface CreateCampaignPayload {
  project_id: string;
  type?: 'crm' | 'normal' | 'gamified';
  participation_mode: 'invite_only' | 'public' | 'hybrid';
  leaderboard_visibility: 'public' | 'private';
  name: string;
  brief_objective?: string;
  start_at: string;
  end_at: string;
  website_url?: string;
  docs_url?: string;
  reward_pool_text?: string;
  winners_count?: number;
}

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

type CampaignsResponse =
  | { ok: true; campaign?: Campaign; campaigns?: Campaign[] }
  | { ok: false; error: string };

const DEV_MODE = process.env.NODE_ENV === 'development' && process.env.DEV_MODE === 'true';

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CampaignsResponse>
) {
  try {
    const supabase = getSupabaseAdmin();

    // Handle GET - list campaigns
    if (req.method === 'GET') {
      const projectId = req.query.projectId as string | undefined;

      // If filtering by project, check ARC access (Option 1 = CRM)
      if (projectId) {
        // Runtime guard: ensure projectId is a non-empty string
        if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
          return res.status(400).json({ ok: false, error: 'Invalid projectId' });
        }

        // TypeScript narrowing: assign to const with explicit string type
        const pid: string = projectId;

        const accessCheck = await requireArcAccess(supabase, pid, 1);
        if (!accessCheck.ok) {
          return res.status(403).json({
            ok: false,
            error: accessCheck.error || 'ARC access not approved for this project',
          });
        }
      }

      let query = supabase
        .from('arc_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data: campaigns, error: fetchError } = await query;

      if (fetchError) {
        console.error('[ARC Campaigns API] Fetch error:', fetchError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch campaigns' });
      }

      return res.status(200).json({
        ok: true,
        campaigns: (campaigns || []) as Campaign[],
      });
    }

    // Handle POST - create campaign
    if (req.method === 'POST') {
      // Authentication using shared helper
      let userId: string | null = null;
      if (!DEV_MODE) {
        const portalUser = await requirePortalUser(req, res);
        if (!portalUser) {
          return; // requirePortalUser already sent 401 response
        }
        userId = portalUser.userId;
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

      // Parse body
      const body = req.body as CreateCampaignPayload;

      // Validate required fields
      if (!body.project_id || !body.name || !body.start_at || !body.end_at) {
        return res.status(400).json({
          ok: false,
          error: 'Missing required fields: project_id, name, start_at, end_at',
        });
      }

      // Validate dates
      const startAt = new Date(body.start_at);
      const endAt = new Date(body.end_at);
      if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
        return res.status(400).json({ ok: false, error: 'Invalid date format' });
      }
      if (endAt <= startAt) {
        return res.status(400).json({ ok: false, error: 'end_at must be after start_at' });
      }

      // Check ARC access (Option 1 = CRM) and project permissions
      if (!DEV_MODE && userId) {
        // Runtime guard: ensure project_id is a non-empty string
        if (!body.project_id || typeof body.project_id !== 'string' || body.project_id.trim().length === 0) {
          return res.status(400).json({ ok: false, error: 'Missing projectId' });
        }

        // TypeScript narrowing: assign to const with explicit string type
        const pid: string = body.project_id;

        // Runtime guard: ensure userId is a non-empty string
        if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
          return res.status(400).json({ ok: false, error: 'Missing userId' });
        }

        // TypeScript narrowing: assign to const with explicit string type
        const uid: string = userId;

        const accessCheck = await requireArcAccess(supabase, pid, 1);
        if (!accessCheck.ok) {
          return res.status(403).json({
            ok: false,
            error: accessCheck.error || 'ARC Option 1 (CRM) is not available for this project',
          });
        }

        // Check project management permissions
        const permissions = await checkProjectPermissions(supabase, uid, pid);
        const canManage = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
        if (!canManage) {
          return res.status(403).json({
            ok: false,
            error: 'You do not have permission to create campaigns for this project',
          });
        }
      }

      // Get profile ID
      const profileId = userId ? await getProfileIdFromUserId(supabase, userId) : null;

      // Create campaign
      const campaignData = {
        project_id: body.project_id,
        type: body.type || 'crm',
        participation_mode: body.participation_mode,
        leaderboard_visibility: body.leaderboard_visibility,
        name: body.name,
        brief_objective: body.brief_objective || null,
        start_at: body.start_at,
        end_at: body.end_at,
        website_url: body.website_url || null,
        docs_url: body.docs_url || null,
        reward_pool_text: body.reward_pool_text || null,
        winners_count: body.winners_count || 100,
        status: 'draft',
        created_by_profile_id: profileId || null,
      };

      const { data: campaign, error: insertError } = await supabase
        .from('arc_campaigns')
        .insert(campaignData)
        .select()
        .single();

      if (insertError) {
        console.error('[ARC Campaigns API] Insert error:', insertError);
        return res.status(500).json({ ok: false, error: 'Failed to create campaign' });
      }

      // Log audit
      const requestId = getRequestId(req);
      await writeArcAudit(supabase, {
        actorProfileId: profileId,
        projectId: body.project_id,
        entityType: 'campaign',
        entityId: campaign.id,
        action: 'campaign_created',
        success: true,
        message: `Campaign "${body.name}" created`,
        requestId,
        metadata: {
          campaignName: body.name,
          startAt: body.start_at,
          endAt: body.end_at,
          visibility: body.leaderboard_visibility,
        },
      });

      return res.status(200).json({
        ok: true,
        campaign: campaign as Campaign,
      });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[ARC Campaigns API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}



