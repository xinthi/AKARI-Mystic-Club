/**
 * API Route: /api/portal/creator-manager/programs
 * 
 * GET: List Creator Manager programs for a project
 * POST: Create a new Creator Manager program
 * 
 * Permissions:
 * - GET: Anyone can view (filtered by visibility)
 * - POST: Must be project owner/admin/moderator
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { checkProjectPermissions } from '@/lib/project-permissions';
import { verifyArcOptionAccess, checkArcProjectApproval } from '@/lib/arc-permissions';

// =============================================================================
// TYPES
// =============================================================================

interface CreateProgramRequest {
  projectId: string;
  title: string;
  description?: string;
  objective?: string;
  visibility: 'private' | 'public' | 'hybrid';
  startAt?: string;
  endAt?: string;
  spotlightLinks?: string[]; // Up to 5 spotlight URLs
}

interface Program {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  visibility: 'private' | 'public' | 'hybrid';
  status: 'active' | 'paused' | 'ended';
  start_at: string | null;
  end_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  stats?: {
    totalCreators: number;
    approvedCreators: number;
    totalArcPoints: number;
  };
}

type ProgramsResponse =
  | { ok: true; programs: Program[] }
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

async function getCurrentUser(supabase: ReturnType<typeof getSupabaseAdmin>, sessionToken: string): Promise<{ userId: string; profileId: string | null } | null> {
  const { data: session, error: sessionError } = await supabase
    .from('akari_user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single();

  if (sessionError || !session) {
    return null;
  }

  if (new Date(session.expires_at) < new Date()) {
    await supabase
      .from('akari_user_sessions')
      .delete()
      .eq('session_token', sessionToken);
    return null;
  }

  // Get user's Twitter username to find profile
  const { data: xIdentity } = await supabase
    .from('akari_user_identities')
    .select('username')
    .eq('user_id', session.user_id)
    .eq('provider', 'x')
    .single();

  let profileId: string | null = null;
  if (xIdentity?.username) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', xIdentity.username.toLowerCase().replace('@', ''))
      .single();
    profileId = profile?.id || null;
  }

  return {
    userId: session.user_id,
    profileId,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProgramsResponse>
) {
  try {
    const supabase = getSupabaseAdmin();

    // GET: List programs
    if (req.method === 'GET') {
    const projectId = req.query.projectId as string | undefined;

    if (!projectId) {
      return res.status(400).json({ ok: false, error: 'projectId is required' });
    }

    try {
      // Check ARC approval for the project
      const approval = await checkArcProjectApproval(supabase, projectId);
      if (!approval.isApproved) {
        return res.status(403).json({
          ok: false,
          error: approval.isPending
            ? 'ARC access is pending approval'
            : approval.isRejected
            ? 'ARC access was rejected'
            : 'ARC access has not been approved for this project',
        });
      }

      // Get programs for the project
      const { data: programs, error: programsError } = await supabase
        .from('creator_manager_programs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (programsError) {
        console.error('[Creator Manager Programs] Error fetching programs:', programsError);
        return res.status(500).json({ ok: false, error: 'Failed to fetch programs' });
      }

      // Get stats for each program
      const programsWithStats: Program[] = await Promise.all(
        (programs || []).map(async (program) => {
          // Get creator counts
          const { count: totalCreators } = await supabase
            .from('creator_manager_creators')
            .select('*', { count: 'exact', head: true })
            .eq('program_id', program.id);

          const { count: approvedCreators } = await supabase
            .from('creator_manager_creators')
            .select('*', { count: 'exact', head: true })
            .eq('program_id', program.id)
            .eq('status', 'approved');

          // Get total ARC points
          const { data: creators } = await supabase
            .from('creator_manager_creators')
            .select('arc_points')
            .eq('program_id', program.id);

          const totalArcPoints = creators?.reduce((sum, c) => sum + (c.arc_points || 0), 0) || 0;

          return {
            ...program,
            stats: {
              totalCreators: totalCreators || 0,
              approvedCreators: approvedCreators || 0,
              totalArcPoints,
            },
          };
        })
      );

      return res.status(200).json({ ok: true, programs: programsWithStats });
    } catch (error: any) {
      console.error('[Creator Manager Programs] Error:', error);
      return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
    }
  }

  // POST: Create program
  if (req.method === 'POST') {
    const body: CreateProgramRequest = req.body;

    // Validate required fields
    if (!body.projectId || !body.title) {
      return res.status(400).json({ ok: false, error: 'projectId and title are required' });
    }

    if (body.visibility && !['private', 'public', 'hybrid'].includes(body.visibility)) {
      return res.status(400).json({ ok: false, error: 'visibility must be private, public, or hybrid' });
    }

    // Get current user
    const sessionToken = getSessionToken(req);
    if (!sessionToken) {
      return res.status(401).json({ ok: false, error: 'Not authenticated' });
    }

    const currentUser = await getCurrentUser(supabase, sessionToken);
    if (!currentUser) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired session. Please log in again.' });
    }

    // Check ARC approval and unlock status for option1_crm (Creator Manager)
    const accessCheck = await verifyArcOptionAccess(supabase, body.projectId, 'option1_crm');
    if (!accessCheck.allowed) {
      return res.status(403).json({
        ok: false,
        error: accessCheck.reason || 'ARC Option 1 (Creator Manager) is not available for this project',
      });
    }

    // Check permissions - must be project owner/admin/moderator
    // Note: checkProjectPermissions will find profileId via Twitter username if needed
    const permissions = await checkProjectPermissions(supabase, currentUser.userId, body.projectId);
    
    if (!permissions.canManage) {
      if (!currentUser.profileId) {
        return res.status(401).json({ 
          ok: false, 
          error: 'Your Twitter account is not linked to a profile. Please ensure your account is properly connected.' 
        });
      }
      return res.status(403).json({ ok: false, error: 'You do not have permission to create programs for this project. You must be the project owner, admin, or moderator.' });
    }

    try {
      // Validate spotlight links (max 5)
      if (body.spotlightLinks && body.spotlightLinks.length > 5) {
        return res.status(400).json({ ok: false, error: 'Maximum 5 spotlight links allowed' });
      }

      // Validate spotlight link URLs
      if (body.spotlightLinks) {
        for (const link of body.spotlightLinks) {
          if (link.trim() && !link.match(/^https?:\/\/.+/)) {
            return res.status(400).json({ ok: false, error: 'Invalid URL format. URLs must start with http:// or https://' });
          }
        }
      }

      // Create program - try with objective field first, fallback to without if column doesn't exist
      let program: any;
      let createError: any;
      
      // Build insert data
      const insertData: any = {
        project_id: body.projectId,
        title: body.title,
        description: body.description || null,
        visibility: body.visibility || 'private',
        status: 'active',
        start_at: body.startAt || null,
        end_at: body.endAt || null,
        created_by: currentUser.profileId,
      };

      // Try to include objective field (may not exist if migration hasn't been run)
      if (body.objective) {
        insertData.objective = body.objective;
      }

      const { data: programData, error: programError } = await supabase
        .from('creator_manager_programs')
        .insert(insertData)
        .select()
        .single();

      program = programData;
      createError = programError;

      // If error is "column does not exist", retry without objective field
      if (createError && createError.message?.includes('column') && createError.message?.includes('does not exist')) {
        console.warn('[Creator Manager Programs] Objective column not found, creating program without it');
        delete insertData.objective;
        
        const { data: retryData, error: retryError } = await supabase
          .from('creator_manager_programs')
          .insert(insertData)
          .select()
          .single();

        program = retryData;
        createError = retryError;
      }

      if (createError) {
        console.error('[Creator Manager Programs] Error creating program:', createError);
        return res.status(500).json({ ok: false, error: `Failed to create program: ${createError.message || 'Unknown error'}` });
      }

      if (!program) {
        return res.status(500).json({ ok: false, error: 'Program created but data not returned' });
      }

      // Insert spotlight links if provided (may fail if table doesn't exist - migration not run)
      if (body.spotlightLinks && body.spotlightLinks.filter(link => link.trim()).length > 0) {
        const validLinks = body.spotlightLinks
          .filter(link => link.trim() !== '')
          .map((url, index) => ({
            program_id: program.id,
            url: url.trim(),
            label: null, // Can be enhanced later
            display_order: index,
          }));

        const { error: linksError } = await supabase
          .from('creator_manager_spotlight_links')
          .insert(validLinks);

        if (linksError) {
          console.warn('[Creator Manager Programs] Spotlight links table may not exist (migration not run):', linksError.message);
          // Don't fail the whole request, just log the warning
          // The program is created successfully, spotlight links can be added later after migration
        }
      }

      return res.status(201).json({
        ok: true,
        programs: [{
          ...program,
          stats: {
            totalCreators: 0,
            approvedCreators: 0,
            totalArcPoints: 0,
          },
        }],
      });
    } catch (error: any) {
      console.error('[Creator Manager Programs] Error:', error);
      return res.status(500).json({ ok: false, error: error.message || 'Internal server error' });
    }
  }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error: any) {
    console.error('[Creator Manager Programs] Configuration error:', error);

    // Check for Supabase configuration errors
    if (error.message?.includes('Missing Supabase') || error.message?.includes('configuration')) {
      return res.status(503).json({
        ok: false,
        error: 'Service configuration error. Please contact support.',
      });
    }

    return res.status(500).json({
      ok: false,
      error: error.message || 'Internal server error',
    });
  }
}

