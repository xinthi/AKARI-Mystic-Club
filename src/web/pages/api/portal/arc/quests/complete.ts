/**
 * API Route: POST /api/portal/arc/quests/complete
 * 
 * Marks a mission as completed for the current user.
 * Requires authentication and validates arenaId + missionId.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requirePortalUser } from '@/lib/server/require-portal-user';
import { requireArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

interface CompleteMissionBody {
  arenaId: string;
  missionId: string;
}

type CompleteMissionResponse =
  | { ok: true }
  | { ok: false; error: string };

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<CompleteMissionResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Authentication
    const portalUser = await requirePortalUser(req, res);
    if (!portalUser) {
      return; // requirePortalUser already sent 401 response
    }

    // Get profile ID
    if (!portalUser.profileId) {
      return res.status(400).json({ ok: false, error: 'User profile not found' });
    }

    const profileId = portalUser.profileId;

    // Parse and validate request body
    const body = req.body as CompleteMissionBody;
    if (!body.arenaId || typeof body.arenaId !== 'string') {
      return res.status(400).json({ ok: false, error: 'arenaId is required' });
    }

    if (!body.missionId || typeof body.missionId !== 'string') {
      return res.status(400).json({ ok: false, error: 'missionId is required' });
    }

    // Validate missionId is one of the expected mission IDs
    const validMissionIds = ['intro-thread', 'meme-drop', 'signal-boost', 'deep-dive'];
    if (!validMissionIds.includes(body.missionId)) {
      return res.status(400).json({ ok: false, error: 'Invalid missionId' });
    }

    // Verify arena exists and get project_id
    const { data: arena, error: arenaError } = await supabase
      .from('arenas')
      .select('id, project_id')
      .eq('id', body.arenaId)
      .single();

    if (arenaError || !arena) {
      return res.status(404).json({ ok: false, error: 'Arena not found' });
    }

    if (!arena.project_id) {
      return res.status(400).json({ ok: false, error: 'Arena missing project_id' });
    }

    // Check ARC Option 3 access
    const accessCheck = await requireArcAccess(supabase, arena.project_id, 3);
    if (!accessCheck.ok) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.error || 'ARC Option 3 (Gamified) is not available for this project',
      });
    }

    // Verify user is a creator in this arena (arena_creators table)
    const { data: creatorCheck, error: creatorError } = await supabase
      .from('arena_creators')
      .select('id')
      .eq('arena_id', body.arenaId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (creatorError) {
      console.error('[ARC Quest Complete] Error checking arena membership:', creatorError);
      return res.status(500).json({ ok: false, error: 'Failed to verify arena membership' });
    }

    if (!creatorCheck) {
      return res.status(403).json({ ok: false, error: 'Not allowed' });
    }

    // Insert or upsert completion (respects unique constraint)
    const { error: insertError } = await supabase
      .from('arc_quest_completions')
      .upsert(
        {
          profile_id: profileId,
          arena_id: body.arenaId,
          mission_id: body.missionId,
          completed_at: new Date().toISOString(),
        },
        {
          onConflict: 'profile_id,mission_id,arena_id',
        }
      );

    if (insertError) {
      console.error('[ARC Quest Complete] Error inserting completion:', insertError);
      return res.status(500).json({ ok: false, error: 'Failed to mark mission as completed' });
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error('[ARC Quest Complete] Error:', error);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
}

