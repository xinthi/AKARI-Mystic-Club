/**
 * API Route: POST / PATCH /api/portal/arc/arenas-admin
 * 
 * Admin operations for arenas (Super Admin only).
 * - POST: Create a new arena
 * - PATCH: Update an existing arena
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface CreateArenaBody {
  projectId: string;
  name: string;
  slug: string;
  description?: string;
  starts_at?: string | null;
  ends_at?: string | null;
  reward_depth?: number | null;
  status?: string;
}

interface UpdateArenaBody {
  id: string;
  name?: string;
  slug?: string;
  description?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  reward_depth?: number | null;
  status?: string;
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
    // AUTHENTICATION: Check Super Admin (with DEV MODE bypass)
    // ==========================================================================
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

      const userId = session.user_id;

      // Check if user is super admin
      const isSuperAdmin = await checkSuperAdmin(supabase, userId);
      if (!isSuperAdmin) {
        return res.status(403).json({ ok: false, error: 'Forbidden' });
      }
    } else {
      console.log('[API /portal/arc/arenas-admin] DEV MODE - skipping auth');
    }

    // ==========================================================================
    // POST: Create Arena
    // ==========================================================================
    if (req.method === 'POST') {
      try {
        const body = req.body as CreateArenaBody;

        // Validate required fields
        if (!body.projectId || typeof body.projectId !== 'string') {
          return res.status(400).json({ ok: false, error: 'projectId is required' });
        }
        if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
          return res.status(400).json({ ok: false, error: 'name is required' });
        }
        if (!body.slug || typeof body.slug !== 'string' || !body.slug.trim()) {
          return res.status(400).json({ ok: false, error: 'slug is required' });
        }

        // Check if slug is unique for this project
        const { data: existingArena } = await supabase
          .from('arenas')
          .select('id')
          .eq('project_id', body.projectId)
          .eq('slug', body.slug.trim())
          .single();

        if (existingArena) {
          return res.status(400).json({ ok: false, error: 'An arena with this slug already exists for this project' });
        }

        // Insert arena
        const { data, error } = await supabase
          .from('arenas')
          .insert({
            project_id: body.projectId,
            name: body.name.trim(),
            slug: body.slug.trim(),
            description: body.description?.trim() || null,
            starts_at: body.starts_at || null,
            ends_at: body.ends_at || null,
            reward_depth: body.reward_depth || 0,
            status: body.status || 'draft',
          })
          .select()
          .single();

        if (error) {
          console.error('[API /portal/arc/arenas-admin] Error inserting arena:', error);
          return res.status(500).json({ ok: false, error: error.message || 'Failed to create arena' });
        }

        return res.status(200).json({ ok: true, data });
      } catch (err: any) {
        console.error('[API /portal/arc/arenas-admin] Error:', err);
        return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
      }
    }

    // ==========================================================================
    // PATCH: Update Arena
    // ==========================================================================
    if (req.method === 'PATCH') {
      try {
        const body = req.body as UpdateArenaBody;

        // Validate required fields
        if (!body.id || typeof body.id !== 'string') {
          return res.status(400).json({ ok: false, error: 'id is required' });
        }

        // Build update object (only include provided fields)
        const updateData: {
          name?: string;
          slug?: string;
          description?: string | null;
          starts_at?: string | null;
          ends_at?: string | null;
          reward_depth?: number | null;
          status?: string;
        } = {};

        if (body.name !== undefined) {
          updateData.name = body.name.trim();
        }
        if (body.slug !== undefined) {
          updateData.slug = body.slug.trim();
        }
        if (body.description !== undefined) {
          updateData.description = body.description?.trim() || null;
        }
        if (body.starts_at !== undefined) {
          updateData.starts_at = body.starts_at || null;
        }
        if (body.ends_at !== undefined) {
          updateData.ends_at = body.ends_at || null;
        }
        if (body.reward_depth !== undefined) {
          updateData.reward_depth = body.reward_depth || null;
        }
        if (body.status !== undefined) {
          updateData.status = body.status;
        }

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
          return res.status(400).json({ ok: false, error: 'No fields to update' });
        }

        // If slug is being updated, check uniqueness
        if (updateData.slug) {
          const { data: existingArena } = await supabase
            .from('arenas')
            .select('id, project_id')
            .eq('slug', updateData.slug)
            .neq('id', body.id)
            .single();

          if (existingArena) {
            return res.status(400).json({ ok: false, error: 'An arena with this slug already exists' });
          }
        }

        // Update arena
        const { data, error } = await supabase
          .from('arenas')
          .update(updateData)
          .eq('id', body.id)
          .select()
          .single();

        if (error) {
          console.error('[API /portal/arc/arenas-admin] Error updating arena:', error);
          return res.status(500).json({ ok: false, error: error.message || 'Failed to update arena' });
        }

        if (!data) {
          return res.status(404).json({ ok: false, error: 'Arena not found' });
        }

        return res.status(200).json({ ok: true, data });
      } catch (err: any) {
        console.error('[API /portal/arc/arenas-admin] Error:', err);
        return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
      }
    }

    // ==========================================================================
    // Method not allowed
    // ==========================================================================
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err: any) {
    // Catch any errors that occur before method handlers (e.g., Supabase config)
    console.error('[API /portal/arc/arenas-admin] Unexpected error:', err);
    return res.status(500).json({ 
      ok: false, 
      error: err.message || 'Internal server error' 
    });
  }
}
