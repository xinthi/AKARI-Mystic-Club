/**
 * API Route: GET /api/portal/arc/quests
 * POST /api/portal/arc/quests
 * 
 * List or create ARC quests (Option 3: Gamified Leaderboard).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { requirePortalUser } from '@/lib/server/require-portal-user';

// =============================================================================
// TYPES
// =============================================================================

interface CreateQuestPayload {
  project_id: string;
  arena_id?: string;
  name: string;
  narrative_focus?: string;
  starts_at: string;
  ends_at: string;
  reward_desc?: string;
  status?: 'draft' | 'active' | 'paused' | 'ended';
  quest_type?: 'normal' | 'crm';
  crm_program_id?: string;
}

interface Quest {
  id: string;
  project_id: string;
  arena_id: string | null;
  name: string;
  narrative_focus: string | null;
  starts_at: string;
  ends_at: string;
  reward_desc: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

type QuestsResponse =
  | { ok: true; quest?: Quest; quests?: Quest[] }
  | { ok: false; error: string };

const DEV_MODE = process.env.NODE_ENV === 'development' && process.env.DEV_MODE === 'true';

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<QuestsResponse>
) {
  try {
    const supabase = getSupabaseAdmin();

    // Handle GET - list quests
    if (req.method === 'GET') {
      const projectId = req.query.projectId as string | undefined;
      const arenaId = req.query.arenaId as string | undefined;

      // If filtering by project, check ARC access
      if (projectId) {
        // Runtime guard: ensure projectId is a non-empty string
        if (!projectId || typeof projectId !== 'string' || projectId.trim().length === 0) {
          return res.status(400).json({ ok: false, error: 'Invalid projectId' });
        }

        // TypeScript narrowing: assign to const with explicit string type
        const pid: string = projectId;

        const accessCheck = await requireArcAccess(supabase, pid, 3);
        if (!accessCheck.ok) {
          return res.status(403).json({
            ok: false,
            error: accessCheck.error || 'ARC Option 3 (Gamified) is not available for this project',
          });
        }
      }

      let query = supabase
        .from('arc_quests')
        .select('*')
        .order('created_at', { ascending: false });

      if (projectId) {
        query = query.eq('project_id', projectId);
      }
      if (arenaId) {
        query = query.eq('arena_id', arenaId);
      }

      const { data: quests, error: fetchError } = await query;

      if (fetchError) {
        console.error('[ARC Quests API] Fetch error:', fetchError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch quests' });
      }

      return res.status(200).json({
        ok: true,
        quests: (quests || []) as Quest[],
      });
    }

    // Handle POST - create quest
    if (req.method === 'POST') {
      // Authentication using shared helper
      let userId: string | null = null;
      let profileId: string | null = null;
      if (!DEV_MODE) {
        const portalUser = await requirePortalUser(req, res);
        if (!portalUser) {
          return; // requirePortalUser already sent 401 response
        }
        userId = portalUser.userId;
        profileId = portalUser.profileId || null;
      } else {
        // DEV MODE: Find a super admin user
        const { data: superAdmin } = await supabase
          .from('akari_user_roles')
          .select('user_id')
          .eq('role', 'super_admin')
          .limit(1)
          .maybeSingle();
        userId = superAdmin?.user_id || null;
        if (userId) {
          // Get profile_id for dev mode
          const { data: identity } = await supabase
            .from('akari_user_identities')
            .select('username')
            .eq('user_id', userId)
            .eq('provider', 'x')
            .maybeSingle();
          if (identity?.username) {
            const cleanUsername = identity.username.toLowerCase().replace('@', '').trim();
            const { data: profile } = await supabase
              .from('profiles')
              .select('id')
              .eq('username', cleanUsername)
              .maybeSingle();
            profileId = profile?.id || null;
          }
        }
      }

      // Parse body
      const body = req.body as CreateQuestPayload;

      // Validate required fields
      if (!body.project_id || !body.name || !body.starts_at || !body.ends_at) {
        return res.status(400).json({
          ok: false,
          error: 'Missing required fields: project_id, name, starts_at, ends_at',
        });
      }

      // Validate dates
      const startAt = new Date(body.starts_at);
      const endAt = new Date(body.ends_at);
      if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
        return res.status(400).json({ ok: false, error: 'Invalid date format' });
      }
      if (endAt <= startAt) {
        return res.status(400).json({ ok: false, error: 'ends_at must be after starts_at' });
      }

      // Check ARC access (Option 3 = Gamified) and project permissions
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

        const accessCheck = await requireArcAccess(supabase, pid, 3);
        if (!accessCheck.ok) {
          return res.status(403).json({
            ok: false,
            error: accessCheck.error || 'ARC Option 3 (Gamified) is not available for this project',
          });
        }

        const permissions = await checkProjectPermissions(supabase, uid, pid);
        const canManage = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
        if (!canManage) {
          return res.status(403).json({
            ok: false,
            error: 'You do not have permission to create quests for this project',
          });
        }
      }

      // Create quest
      const questData = {
        project_id: body.project_id,
        arena_id: body.arena_id || null,
        name: body.name,
        narrative_focus: body.narrative_focus || null,
        starts_at: body.starts_at,
        ends_at: body.ends_at,
        reward_desc: body.reward_desc || null,
        status: body.status || 'draft',
      };

      const { data: quest, error: insertError } = await supabase
        .from('arc_quests')
        .insert(questData)
        .select()
        .single();

      if (insertError) {
        console.error('[ARC Quests API] Insert error:', insertError);
        return res.status(500).json({ ok: false, error: 'Failed to create quest' });
      }

      // If this is a CRM quest, create/link creator_manager_program
      if (body.quest_type === 'crm') {
        if (body.crm_program_id) {
          // Link to existing program (could store this relationship in a metadata field or separate table)
          // For now, we'll just log it
          console.log('[ARC Quests API] CRM quest linked to program:', body.crm_program_id);
        } else if (profileId) {
          // Create new creator_manager_program for this CRM quest
          const { data: program, error: programError } = await supabase
            .from('creator_manager_programs')
            .insert({
              project_id: body.project_id,
              title: body.name,
              description: body.narrative_focus || null,
              visibility: 'public',
              status: 'active',
              start_at: body.starts_at,
              end_at: body.ends_at,
              created_by: profileId,
            })
            .select('id')
            .single();

          if (programError) {
            console.error('[ARC Quests API] Error creating CRM program:', programError);
            // Don't fail the quest creation, just log the error
          } else {
            console.log('[ARC Quests API] Created CRM program for quest:', program.id);
          }
        } else {
          console.warn('[ARC Quests API] Could not find profile_id for user, skipping CRM program creation');
        }
      }

      return res.status(200).json({
        ok: true,
        quest: quest as Quest,
      });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[ARC Quests API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}


