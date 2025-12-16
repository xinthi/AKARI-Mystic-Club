/**
 * API Route: POST /api/portal/admin/projects/classify
 * 
 * SuperAdmin-only endpoint to classify a tracked Twitter profile as:
 * - profile_type: 'project' or 'personal'
 * - is_company: true/false (for project/company profiles)
 * 
 * This helps determine if a profile should be treated as an ARC project.
 * 
 * Request body:
 *   - projectId: UUID of the project (required)
 *   - profileType: 'project' | 'personal' (required)
 *   - isCompany: boolean (optional, defaults to false)
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
      return res.status(403).json({ ok: false, error: 'Forbidden: SuperAdmin access required' });
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

    // Update classification
    const updateData: Record<string, any> = {
      profile_type: body.profileType,
    };

    // Set is_company based on profileType and provided value
    if (body.profileType === 'project') {
      updateData.is_company = body.isCompany ?? false;
    } else {
      // Personal profiles are never companies
      updateData.is_company = false;
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

