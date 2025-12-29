/**
 * API Route: GET /api/portal/arc/quests/[id]
 * PATCH /api/portal/arc/quests/[id]
 * DELETE /api/portal/arc/quests/[id]
 * 
 * Get, update, or delete a single ARC quest.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireArcAccess } from '@/lib/arc-access';
import { checkProjectPermissions } from '@/lib/project-permissions';

// =============================================================================
// TYPES
// =============================================================================

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

type QuestResponse =
  | { ok: true; quest: Quest }
  | { ok: false; error: string };

type QuestUpdatePayload = {
  name?: string;
  narrative_focus?: string | null;
  starts_at?: string;
  ends_at?: string;
  reward_desc?: string | null;
  status?: 'draft' | 'active' | 'paused' | 'ended';
};

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
  res: NextApiResponse<QuestResponse | { ok: true } | { ok: false; error: string }>
) {
  try {
    const supabase = getSupabaseAdmin();
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ ok: false, error: 'Quest ID is required' });
    }

    // Get quest
    const { data: quest, error: fetchError } = await supabase
      .from('arc_quests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !quest) {
      return res.status(404).json({ ok: false, error: 'Quest not found' });
    }

    // Check ARC access (Option 3 = Gamified)
    const accessCheck = await requireArcAccess(supabase, quest.project_id, 3);
    if (!accessCheck.ok && !DEV_MODE) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error || 'ARC Option 3 (Gamified) is not available for this project',
      });
    }

    // Handle GET
    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        quest: quest as Quest,
      });
    }

    // Handle PATCH
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
        const permissions = await checkProjectPermissions(supabase, userId, quest.project_id);
        const canManage = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
        if (!canManage) {
          return res.status(403).json({
            ok: false,
            error: 'You do not have permission to update this quest',
          });
        }
      }

      // Parse body
      const body = req.body as QuestUpdatePayload;
      const updateData: any = {};

      if (body.name !== undefined) updateData.name = body.name;
      if (body.narrative_focus !== undefined) updateData.narrative_focus = body.narrative_focus;
      if (body.starts_at !== undefined) updateData.starts_at = body.starts_at;
      if (body.ends_at !== undefined) updateData.ends_at = body.ends_at;
      if (body.reward_desc !== undefined) updateData.reward_desc = body.reward_desc;
      if (body.status !== undefined) updateData.status = body.status;

      // Validate dates if provided
      if (updateData.starts_at || updateData.ends_at) {
        const startAt = new Date(updateData.starts_at || quest.starts_at);
        const endAt = new Date(updateData.ends_at || quest.ends_at);
        if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
          return res.status(400).json({ ok: false, error: 'Invalid date format' });
        }
        if (endAt <= startAt) {
          return res.status(400).json({ ok: false, error: 'ends_at must be after starts_at' });
        }
      }

      // Update quest
      const { data: updatedQuest, error: updateError } = await supabase
        .from('arc_quests')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) {
        console.error('[ARC Quest API] Update error:', updateError);
        return res.status(500).json({ ok: false, error: 'Failed to update quest' });
      }

      return res.status(200).json({
        ok: true,
        quest: updatedQuest as Quest,
      });
    }

    // Handle DELETE
    if (req.method === 'DELETE') {
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
        const permissions = await checkProjectPermissions(supabase, userId, quest.project_id);
        const canManage = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
        if (!canManage) {
          return res.status(403).json({
            ok: false,
            error: 'You do not have permission to delete this quest',
          });
        }
      }

      // Delete quest
      const { error: deleteError } = await supabase
        .from('arc_quests')
        .delete()
        .eq('id', id);

      if (deleteError) {
        console.error('[ARC Quest API] Delete error:', deleteError);
        return res.status(500).json({ ok: false, error: 'Failed to delete quest' });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[ARC Quest API] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}


