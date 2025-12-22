/**
 * API Route: POST / PATCH / DELETE /api/portal/arc/arena-creators-admin
 * 
 * Admin operations for arena_creators (Super Admin only).
 * - POST: Add a new creator to an arena
 * - PATCH: Update an existing creator
 * - DELETE: Remove a creator from an arena
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { hasAnyArcAccess } from '@/lib/arc-access';

// =============================================================================
// TYPES
// =============================================================================

interface AddCreatorBody {
  arenaId: string;
  twitter_username: string;
  arc_points: number;
  ring: 'core' | 'momentum' | 'discovery';
  style?: string;
  profile_id?: string | null;
}

interface EditCreatorBody {
  id: string;
  arc_points?: number;
  ring?: 'core' | 'momentum' | 'discovery';
  style?: string | null;
}

type AdminResponse<T = any> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// =============================================================================
// DEV MODE BYPASS
// =============================================================================

const DEV_MODE = process.env.NODE_ENV === 'development';

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error('[getSupabaseAdmin] Missing SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
    throw new Error('Missing Supabase URL configuration. Please check your environment variables.');
  }

  if (!supabaseServiceKey) {
    console.error('[getSupabaseAdmin] Missing SUPABASE_SERVICE_ROLE_KEY');
    throw new Error('Missing Supabase service role key. Please check your environment variables.');
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

async function checkSuperAdmin(supabase: ReturnType<typeof getSupabaseAdmin>, userId: string): Promise<boolean> {
  const { data: roles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  return (roles?.length ?? 0) > 0;
}

async function getProjectIdFromArenaId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  arenaId: string
): Promise<string | null> {
  const { data: arena, error } = await supabase
    .from('arenas')
    .select('project_id')
    .eq('id', arenaId)
    .single();

  if (error || !arena) {
    return null;
  }

  return arena.project_id;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AdminResponse>
) {
  try {
    const supabase = getSupabaseAdmin();

    // ==========================================================================
    // AUTHENTICATION: Check project permissions (with DEV MODE bypass)
    // ==========================================================================
    let userId: string | null = null;
    let projectId: string | null = null;

    if (!DEV_MODE) {
      const sessionToken = getSessionToken(req);
      if (!sessionToken) {
        return res.status(401).json({ ok: false, error: 'Not authenticated' });
      }

      // Validate session and get user ID
      const { data: session, error: sessionError } = await supabase
        .from('akari_user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .single();

      if (sessionError || !session) {
        return res.status(401).json({ ok: false, error: 'Invalid session' });
      }

      // Check if session is expired
      if (new Date(session.expires_at) < new Date()) {
        await supabase
          .from('akari_user_sessions')
          .delete()
          .eq('session_token', sessionToken);
        return res.status(401).json({ ok: false, error: 'Session expired' });
      }

      userId = session.user_id;

      // Get projectId from request (either from body or query)
      let arenaId: string | null = null;
      if (req.method === 'POST') {
        arenaId = (req.body as AddCreatorBody)?.arenaId || null;
      } else if (req.method === 'PATCH') {
        // For PATCH, we need to get arenaId from the creator record
        const creatorId = (req.body as EditCreatorBody)?.id;
        if (creatorId) {
          const { data: creator } = await supabase
            .from('arena_creators')
            .select('arena_id')
            .eq('id', creatorId)
            .single();
          arenaId = creator?.arena_id || null;
        }
      } else if (req.method === 'DELETE') {
        const id = (req.query.id as string) || (req.body?.id as string);
        if (id) {
          const { data: creator } = await supabase
            .from('arena_creators')
            .select('arena_id')
            .eq('id', id)
            .single();
          arenaId = creator?.arena_id || null;
        }
      }

      if (!arenaId) {
        return res.status(400).json({ ok: false, error: 'Could not determine arena' });
      }

      // Get projectId from arenaId
      projectId = await getProjectIdFromArenaId(supabase, arenaId);
      if (!projectId) {
        return res.status(404).json({ ok: false, error: 'Arena not found' });
      }

      // At this point, projectId is guaranteed to be non-null
      // Check project permissions
      const permissions = await checkProjectPermissions(supabase, userId, projectId as string);
      
      // Creator CRUD requires: isSuperAdmin OR isOwner OR isAdmin OR isModerator
      const canWrite = permissions.isSuperAdmin || permissions.isOwner || permissions.isAdmin || permissions.isModerator;
      
      if (!canWrite) {
        return res.status(403).json({ ok: false, error: 'You do not have permission to manage creators for this project' });
      }

      // Check ARC access (any option approved)
      const hasArcAccess = await hasAnyArcAccess(supabase, projectId as string);
      if (!hasArcAccess) {
        return res.status(403).json({ ok: false, error: 'ARC access not approved for this project' });
      }
    } else {
      console.log('[API /portal/arc/arena-creators-admin] DEV MODE - skipping auth');
    }

    // ==========================================================================
    // POST: Add Creator
    // ==========================================================================
    if (req.method === 'POST') {
    try {
      const body = req.body as AddCreatorBody;

      // Validate required fields
      if (!body.arenaId || typeof body.arenaId !== 'string') {
        return res.status(400).json({ ok: false, error: 'arenaId is required' });
      }
      if (!body.twitter_username || typeof body.twitter_username !== 'string' || !body.twitter_username.trim()) {
        return res.status(400).json({ ok: false, error: 'twitter_username is required' });
      }
      if (typeof body.arc_points !== 'number' || body.arc_points < 0) {
        return res.status(400).json({ ok: false, error: 'arc_points must be a non-negative number' });
      }
      if (!body.ring || !['core', 'momentum', 'discovery'].includes(body.ring)) {
        return res.status(400).json({ ok: false, error: 'ring must be one of: core, momentum, discovery' });
      }

      // Insert creator
      const { data, error } = await supabase
        .from('arena_creators')
        .insert({
          arena_id: body.arenaId,
          twitter_username: body.twitter_username.trim(),
          arc_points: body.arc_points,
          ring: body.ring,
          style: body.style?.trim() || null,
          profile_id: body.profile_id || null,
        })
        .select()
        .single();

      if (error) {
        console.error('[API /portal/arc/arena-creators-admin] Error inserting creator:', error);
        return res.status(500).json({ ok: false, error: error.message || 'Failed to add creator' });
      }

      return res.status(200).json({ ok: true, data });
    } catch (err: any) {
      console.error('[API /portal/arc/arena-creators-admin] Error:', err);
      return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
    }
  }

    // ==========================================================================
    // PATCH: Edit Creator
    // ==========================================================================
    if (req.method === 'PATCH') {
    try {
      const body = req.body as EditCreatorBody;

      // Validate required fields
      if (!body.id || typeof body.id !== 'string') {
        return res.status(400).json({ ok: false, error: 'id is required' });
      }

      // Build update object (only include provided fields)
      const updateData: {
        arc_points?: number;
        ring?: 'core' | 'momentum' | 'discovery';
        style?: string | null;
      } = {};

      if (body.arc_points !== undefined) {
        if (typeof body.arc_points !== 'number' || body.arc_points < 0) {
          return res.status(400).json({ ok: false, error: 'arc_points must be a non-negative number' });
        }
        updateData.arc_points = body.arc_points;
      }

      if (body.ring !== undefined) {
        if (!['core', 'momentum', 'discovery'].includes(body.ring)) {
          return res.status(400).json({ ok: false, error: 'ring must be one of: core, momentum, discovery' });
        }
        updateData.ring = body.ring;
      }

      if (body.style !== undefined) {
        updateData.style = body.style?.trim() || null;
      }

      // Check if there's anything to update
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ ok: false, error: 'No fields to update' });
      }

      // Update creator
      const { data, error } = await supabase
        .from('arena_creators')
        .update(updateData)
        .eq('id', body.id)
        .select()
        .single();

      if (error) {
        console.error('[API /portal/arc/arena-creators-admin] Error updating creator:', error);
        return res.status(500).json({ ok: false, error: error.message || 'Failed to update creator' });
      }

      if (!data) {
        return res.status(404).json({ ok: false, error: 'Creator not found' });
      }

      return res.status(200).json({ ok: true, data });
    } catch (err: any) {
      console.error('[API /portal/arc/arena-creators-admin] Error:', err);
      return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
    }
  }

    // ==========================================================================
    // DELETE: Remove Creator
    // ==========================================================================
    if (req.method === 'DELETE') {
    try {
      // Get ID from query string or body
      const id = (req.query.id as string) || (req.body?.id as string);

      if (!id || typeof id !== 'string') {
        return res.status(400).json({ ok: false, error: 'id is required' });
      }

      // Delete creator
      const { error } = await supabase
        .from('arena_creators')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('[API /portal/arc/arena-creators-admin] Error deleting creator:', error);
        return res.status(500).json({ ok: false, error: error.message || 'Failed to remove creator' });
      }

      return res.status(200).json({ ok: true, data: { success: true } });
    } catch (err: any) {
      console.error('[API /portal/arc/arena-creators-admin] Error:', err);
      return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
    }
  }

    // ==========================================================================
    // Method not allowed
    // ==========================================================================
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err: any) {
    // Catch any errors that occur before method handlers (e.g., Supabase config)
    console.error('[API /portal/arc/arena-creators-admin] Unexpected error:', err);
    return res.status(500).json({ 
      ok: false, 
      error: err.message || 'Internal server error' 
    });
  }
}
