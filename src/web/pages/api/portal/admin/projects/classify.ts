/**
 * API Route: POST /api/portal/admin/projects/classify
 * 
 * SuperAdmin-only endpoint to classify a tracked Twitter profile's Ecosystem Type.
 * 
 * IMPORTANT: This is the ONLY way to control ARC Top Projects visibility.
 * 
 * Classification Logic:
 * - Ecosystem Type (projects.profile_type): SuperAdmin controlled via this endpoint
 *   - Values: 'personal' | 'project'
 *   - Controls: ARC Top Projects visibility (only 'project' appears)
 *   - Default: 'personal' (set when user tracks a profile)
 * 
 * - Identity (akari_users.persona_type): User self-declared via /portal/me
 *   - Values: 'individual' | 'company'
 *   - Does NOT affect: ARC Top Projects visibility
 *   - This endpoint does NOT update identity
 * 
 * Request body:
 *   - projectId: UUID of the project (required)
 *   - profileType: 'project' | 'personal' (required) - ONLY field that controls ARC visibility
 *   - isCompany: boolean (optional, defaults to false) - Display metadata only
 * 
 * Returns updated project data.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// TYPES
// =============================================================================

interface ClassifyRequest {
  projectId: string;
  profileType: 'project' | 'personal';
  isCompany?: boolean;
  arcAccessLevel?: 'none' | 'creator_manager' | 'leaderboard' | 'gamified';
  arcActive?: boolean;
  arcActiveUntil?: string | null; // ISO date string
}

type ClassifyResponse =
  | { ok: true; project: any }
  | { ok: false; error: string };

// =============================================================================
// HELPERS
// =============================================================================

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase configuration');
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
  // Check akari_user_roles table
  const { data: userRoles } = await supabase
    .from('akari_user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'super_admin');

  if (userRoles && userRoles.length > 0) {
    return true;
  }

  // Also check profiles.real_roles via Twitter username
  const { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', userId)
    .eq('provider', 'x')
    .single();

  if (xIdentity?.username) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('real_roles')
      .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
      .single();

    if (profile?.real_roles?.includes('super_admin')) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ClassifyResponse>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body: ClassifyRequest = req.body;

    // Validate required fields
    if (!body.projectId || typeof body.projectId !== 'string') {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    if (!body.profileType || !['project', 'personal'].includes(body.profileType)) {
      return res.status(400).json({ ok: false, error: 'profileType must be "project" or "personal"' });
    }

    const supabase = getSupabaseAdmin();

    // Check authentication and super admin
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

    const isSuperAdmin = await checkSuperAdmin(supabase, session.user_id);
    if (!isSuperAdmin) {
      return res.status(403).json({ ok: false, error: 'SuperAdmin only' });
    }

    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', body.projectId)
      .single();

    if (projectError || !project) {
      return res.status(404).json({ ok: false, error: 'Project not found' });
    }

    // Update classification (Ecosystem Type)
    // CRITICAL: profile_type='project' is the ONLY requirement for ARC Top Projects visibility
    // This does NOT update user identity (akari_users.persona_type)
    const updateData: Record<string, any> = {
      profile_type: body.profileType, // 'personal' or 'project' - controls ARC visibility
    };

    // Set is_company based on profileType and provided value
    if (body.profileType === 'project') {
      updateData.is_company = body.isCompany ?? false;
    } else {
      // Personal profiles are never companies
      updateData.is_company = false;
    }

    // Set ARC access level fields if provided
    if (body.arcAccessLevel !== undefined) {
      if (!['none', 'creator_manager', 'leaderboard', 'gamified'].includes(body.arcAccessLevel)) {
        return res.status(400).json({ ok: false, error: 'arcAccessLevel must be "none", "creator_manager", "leaderboard", or "gamified"' });
      }
      updateData.arc_access_level = body.arcAccessLevel;
    }

    if (body.arcActive !== undefined) {
      updateData.arc_active = body.arcActive;
    }

    if (body.arcActiveUntil !== undefined) {
      updateData.arc_active_until = body.arcActiveUntil || null;
    }

    const { error: updateError } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', body.projectId);

    if (updateError) {
      console.error('[Classify Project] Update error:', updateError);
      return res.status(500).json({ ok: false, error: 'Failed to update project classification' });
    }

    // Get updated project
    const { data: updatedProject } = await supabase
      .from('projects')
      .select('*')
      .eq('id', body.projectId)
      .single();

    return res.status(200).json({
      ok: true,
      project: updatedProject,
    });
  } catch (error: any) {
    console.error('[Classify Project] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
  }
}

