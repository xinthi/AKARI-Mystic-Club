/**
 * API Route: PATCH /api/portal/arc/project-settings-admin
 * 
 * Admin operations for project_arc_settings meta (Super Admin only).
 * - PATCH: Update project ARC settings meta (banner_url, accent_color, tagline)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface UpdateProjectSettingsBody {
  projectId: string;
  meta: {
    banner_url?: string | null;
    accent_color?: string | null;
    tagline?: string | null;
  };
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

// Helper to validate hex color
function isValidHexColor(color: string | null | undefined): boolean {
  if (!color) return false;
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
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
      console.log('[API /portal/arc/project-settings-admin] DEV MODE - skipping auth');
    }

    // ==========================================================================
    // PATCH: Update Project Settings Meta
    // ==========================================================================
    if (req.method === 'PATCH') {
      try {
        const body = req.body as UpdateProjectSettingsBody;

        // Validate required fields
        if (!body.projectId || typeof body.projectId !== 'string') {
          return res.status(400).json({ ok: false, error: 'projectId is required' });
        }

        if (!body.meta || typeof body.meta !== 'object') {
          return res.status(400).json({ ok: false, error: 'meta object is required' });
        }

        // Validate accent_color if provided
        if (body.meta.accent_color !== undefined && body.meta.accent_color !== null) {
          if (typeof body.meta.accent_color !== 'string' || !isValidHexColor(body.meta.accent_color)) {
            return res.status(400).json({ ok: false, error: 'accent_color must be a valid hex color (e.g., #FF5733)' });
          }
        }

        // Get current meta to merge
        const { data: currentSettings, error: fetchError } = await supabase
          .from('project_arc_settings')
          .select('meta')
          .eq('project_id', body.projectId)
          .single();

        if (fetchError || !currentSettings) {
          return res.status(404).json({ ok: false, error: 'Project ARC settings not found' });
        }

        // Merge with existing meta
        const currentMeta = (currentSettings.meta as Record<string, any>) || {};
        const updatedMeta = {
          ...currentMeta,
          ...(body.meta.banner_url !== undefined && { banner_url: body.meta.banner_url?.trim() || null }),
          ...(body.meta.accent_color !== undefined && { accent_color: body.meta.accent_color?.trim() || null }),
          ...(body.meta.tagline !== undefined && { tagline: body.meta.tagline?.trim() || null }),
        };

        // Update meta
        const { data, error } = await supabase
          .from('project_arc_settings')
          .update({ meta: updatedMeta })
          .eq('project_id', body.projectId)
          .select()
          .single();

        if (error) {
          console.error('[API /portal/arc/project-settings-admin] Error updating settings:', error);
          return res.status(500).json({ ok: false, error: error.message || 'Failed to update project settings' });
        }

        return res.status(200).json({ ok: true, data });
      } catch (err: any) {
        console.error('[API /portal/arc/project-settings-admin] Error:', err);
        return res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
      }
    }

    // ==========================================================================
    // Method not allowed
    // ==========================================================================
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err: any) {
    // Catch any errors that occur before method handlers (e.g., Supabase config)
    console.error('[API /portal/arc/project-settings-admin] Unexpected error:', err);
    return res.status(500).json({ 
      ok: false, 
      error: err.message || 'Internal server error' 
    });
  }
}
